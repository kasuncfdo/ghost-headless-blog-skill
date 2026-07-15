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

## `/blog/author/[slug]` — author archive

Author pages carry the byline trust signals (bio, photo, socials) that both readers and
search engines use, so build them even for single-author blogs.

```tsx
export async function generateStaticParams() {
    const authors = await getAuthors().catch(() => []);
    return authors.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const author = await getAuthorBySlug(slug);
    if (!author) return { title: "Author not found | SITE Blog" };

    const title = author.meta_title || `${author.name} | SITE Blog`;
    const description =
        author.meta_description ||
        author.bio ||
        `Posts by ${author.name} on the SITE blog.`;

    return {
        title,
        description,
        alternates: { canonical: `/blog/author/${author.slug}` },
        openGraph: {
            title,
            description,
            url: `${BASE_URL}/blog/author/${author.slug}`,
            siteName: "SITE",
            type: "profile",
            images: author.profile_image ? [{ url: author.profile_image }] : undefined,
        },
    };
}
```

Page body:

```tsx
export default async function AuthorPage({ params }: PageProps) {
    const { slug } = await params;
    const author = await getAuthorBySlug(slug);
    if (!author) notFound();

    const { posts, pagination } = await getPostsByAuthor(slug);
    const socials = authorSocialLinks(author);

    return (
        <>
            <script type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(authorJsonLd(author, socials)) }} />
            <main>
                {/* Author header: cover_image banner (optional), profile_image
                    avatar (BlurImage), name, bio, location, post count
                    (author.count.posts), socials row from authorSocialLinks(). */}

                {/* Posts feed: reuse the card grid with posts.map(toCardPost),
                    Prev/Next from pagination for prolific authors. */}
            </main>
        </>
    );
}
```

ProfilePage + Person JSON-LD (`sameAs` is what links the byline to the author's real
profiles for E-E-A-T):

```ts
function authorJsonLd(author: GhostAuthor, socials: Array<{ label: string; url: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        url: `${BASE_URL}/blog/author/${author.slug}`,
        mainEntity: {
            "@type": "Person",
            name: author.name,
            description: author.bio || undefined,
            image: author.profile_image || undefined,
            url: `${BASE_URL}/blog/author/${author.slug}`,
            sameAs: socials.map((s) => s.url),
        },
        isPartOf: { "@type": "Blog", name: "SITE Blog", url: `${BASE_URL}/blog` },
    };
}
```

Rendering notes:

- `authorSocialLinks()` (in `ghost.ts`) normalizes Ghost's stored handles
  (`@handle`, bare usernames, full URLs) into labeled profile URLs; render them as an
  icon row with `rel="me noopener"` and `target="_blank"`.
- On the **post page**, link every byline (avatar + name) to
  `/blog/author/${author.slug}` with `next/link`, and upgrade the BlogPosting JSON-LD
  author to include `url: ${BASE_URL}/blog/author/${slug}` and the same `sameAs` array.
  That connects Person entities across the site.
- Multi-author posts: `post.authors` is the full list; `primary_author` is the first.
  Render all avatars, link each one.
- `getAuthors()` only returns authors with published posts, so there is no empty-archive
  case to guard beyond the usual `notFound()`.

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
    const [posts, tags, authors] = await Promise.all([
        getPostSlugs().catch(() => []),
        getTags().catch(() => []),
        getAuthors().catch(() => []),
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
        ...authors.map((a) => ({ url: `${BASE_URL}/blog/author/${a.slug}` })),
    ];
}
```

Per Google/Ahrefs guidance: omit `priority`/`changeFrequency` (ignored); only set
`lastModified` when it's real — fake dates hurt sitemap credibility.

## Navigation

Any site-chrome link into the blog (navbar tab, footer) must be `next/link` (or
`next-view-transitions` `Link`) — a raw `<a href="/blog">` forces a full page load.
