# Blog routes: ISR, metadata, JSON-LD, rendering

All Ghost-backed routes share the same two exports:

```ts
// Revalidate hourly; the Ghost webhook (/api/revalidate) purges instantly on publish.
export const revalidate = 3600;
// Posts/tags created after the last build render on demand instead of 404ing.
export const dynamicParams = true;
```

Next 15+/16: route `params` is a **Promise** — always `const { slug } = await params;`.

## `/blog` — index

Keep the page component itself synchronous and static; isolate the Ghost fetch in one
async server component behind `<Suspense>` so the hero paints immediately and the feed
streams in:

```tsx
async function PostFeeds() {
    const [posts, tags] = await Promise.all([getAllPosts(), getTags()]);
    if (posts.length === 0) return <EmptyState />;   // friendly "No posts yet"
    // Slim projection before crossing into any client component:
    return <BlogFeed tags={tags} posts={posts.map(toCardPost)} />;
}

export default function BlogPage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Blog",
                name: "SITE Blog",
                url: `${BASE_URL}/blog`,
                publisher: { "@type": "Organization", name: "SITE", url: BASE_URL },
            })}} />
            <main>
                <Suspense fallback={<FeedSkeleton />}>
                    <PostFeeds />
                </Suspense>
            </main>
        </>
    );
}
```

Static `metadata` export with `alternates.canonical: "/blog"`, OG type `website`.

## `/blog/[slug]` — post page

```tsx
import "@/styles/ghost-content.css";

export async function generateStaticParams() {
    const slugs = await getPostSlugs().catch(() => []);
    return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = await getPostBySlug(slug);
    if (!post) return { title: "Post not found | SITE Blog" };

    const title = post.meta_title || `${post.title} | SITE Blog`;
    const description = post.meta_description || postExcerpt(post, 160);
    const ogImage = post.og_image || post.feature_image;

    return {
        title,
        description,
        alternates: { canonical: post.canonical_url || `/blog/${post.slug}` },
        openGraph: {
            title: post.og_title || post.title,
            description: post.og_description || description,
            url: `${BASE_URL}/blog/${post.slug}`,
            siteName: "SITE",
            type: "article",
            publishedTime: post.published_at,
            modifiedTime: post.updated_at,
            authors: post.primary_author ? [post.primary_author.name] : undefined,
            tags: post.tags?.map((tag) => tag.name),
            images: ogImage ? [{ url: ogImage }] : undefined,
        },
        twitter: {
            title: post.twitter_title || post.title,
            description: post.twitter_description || description,
            card: "summary_large_image",
            images: post.twitter_image || ogImage || undefined,
        },
    };
}
```

Body — the critical rendering block:

```tsx
export default async function BlogPostPage({ params }: PageProps) {
    const { slug } = await params;
    const post = await getPostBySlug(slug);
    if (!post) notFound();

    const related = await getRelatedPosts(post).catch(() => []);

    return (
        <>
            <script type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }} />
            <ReadingProgress />
            <ToggleCards />
            <main>
                {/* Hero: breadcrumb (Blog · primary_tag · date · reading_time),
                    title, custom_excerpt, author avatars, 16:9 feature image
                    (BlurImage, priority). */}

                {/* suppressHydrationWarning: the inline img onload handlers
                    (blur-up) mutate classes before React hydrates. */}
                <article
                    suppressHydrationWarning
                    className="gh-content mx-auto max-w-[680px]"
                    dangerouslySetInnerHTML={{ __html: withBlurUpImages(post.html || "") }}
                />

                {/* Related posts grid from getRelatedPosts(post) */}
            </main>
        </>
    );
}
```

BlogPosting JSON-LD:

```ts
function articleJsonLd(post: GhostPost) {
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: postExcerpt(post, 200),
        image: post.feature_image || undefined,
        datePublished: post.published_at,
        dateModified: post.updated_at,
        url: `${BASE_URL}/blog/${post.slug}`,
        mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE_URL}/blog/${post.slug}` },
        author: post.primary_author
            ? { "@type": "Person", name: post.primary_author.name,
                url: post.primary_author.website || undefined }
            : undefined,
        publisher: { "@type": "Organization", name: "SITE", url: BASE_URL,
            logo: { "@type": "ImageObject", url: `${BASE_URL}/logo.png` } },
        keywords: post.tags?.map((t) => t.name).join(", ") || undefined,
    };
}
```

Post-page niceties worth porting: reading-progress bar, share buttons row, image
lightbox (content images get `cursor: zoom-in` in the CSS; a small client component
opens them full-screen on click), "Read next" from `getRelatedPosts` (shared tags,
excluding self).

## `/blog/tag/[slug]` — tag archive

- `generateStaticParams` from `getTags()` (public tags with ≥1 post).
- Metadata: `tag.meta_title || \`${tag.name} | SITE Blog\``, description from
  `tag.meta_description || tag.description || fallback`.
- JSON-LD `CollectionPage` with `isPartOf` → the Blog.
- UI can reuse the index feed component with an `initialSlug` prop so tag switching is a
  client-side swap (pushState), while these static pages still serve direct visits and
  crawlers.

## `/blog/page/[page]` — paged archive

- `generateStaticParams`: fetch page 1 to learn `pagination.pages`, emit params for
  pages 2..N (page 1 lives at `/blog`).
- Guard: non-integer or `< 1` → `notFound()`; `page === 1` → `redirect("/blog")`;
  empty result → `notFound()`.
- Canonical `/blog/page/${page}`; simple Prev/Next pagination component from
  `pagination.prev`/`next`.

## `sitemap.ts`

```ts
export const revalidate = 3600; // webhook purges /sitemap.xml instantly too

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // A Ghost outage must not break the whole sitemap:
    const [posts, tags] = await Promise.all([
        getPostSlugs().catch(() => []),
        getTags().catch(() => []),
    ]);

    return [
        ...staticEntries,
        { url: `${BASE_URL}/blog`,
          ...(posts.length > 0 ? { lastModified: new Date(posts[0].published_at) } : {}) },
        ...posts.map((p) => ({
            url: `${BASE_URL}/blog/${p.slug}`,
            lastModified: new Date(p.updated_at || p.published_at),
        })),
        ...tags.map((t) => ({ url: `${BASE_URL}/blog/tag/${t.slug}` })),
    ];
}
```

Per Google/Ahrefs guidance: omit `priority`/`changeFrequency` (ignored); only set
`lastModified` when it's real — fake dates hurt sitemap credibility.

## Navigation

Any site-chrome link into the blog (navbar tab, footer) must be `next/link` (or
`next-view-transitions` `Link`) — a raw `<a href="/blog">` forces a full page load.
