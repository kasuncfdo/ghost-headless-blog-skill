/**
 * Ghost Content API client (headless CMS for /blog).
 *
 * Calls the Content API directly — no @tryghost/content-api dependency.
 * Content API keys only expose public data, but keep them server-side anyway
 * (no NEXT_PUBLIC_ prefix); all fetching happens in server components /
 * route handlers.
 *
 * Env:
 * - GHOST_URL              e.g. https://your-site.ghost.io (admin domain)
 * - GHOST_CONTENT_API_KEY  from a Custom Integration in Ghost Admin
 *
 * When env is missing (e.g. local dev before credentials are set) the client
 * degrades gracefully: browse helpers return empty results so builds succeed.
 *
 * Portable template: uses a self-contained fetch helper (timeout + retry).
 * If the project has its own HTTP wrapper, swap ghostFetch's internals.
 */

const GHOST_URL = (process.env.GHOST_URL || "").trim().replace(/\/+$/, "");
const GHOST_KEY = (process.env.GHOST_CONTENT_API_KEY || "").trim();
const GHOST_API_VERSION = "v6.0";

export interface GhostTag {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    visibility?: "public" | "internal";
    feature_image?: string | null;
    accent_color?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    count?: { posts: number };
}

export interface GhostAuthor {
    id: string;
    name: string;
    slug: string;
    profile_image?: string | null;
    cover_image?: string | null;
    bio?: string | null;
    website?: string | null;
    location?: string | null;
    // Social handles as stored by Ghost Admin: twitter/threads as "@handle",
    // facebook/instagram/tiktok as page/handle, others as handle or full URL.
    twitter?: string | null;
    facebook?: string | null;
    threads?: string | null;
    bluesky?: string | null;
    mastodon?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
    instagram?: string | null;
    linkedin?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    count?: { posts: number };
}

export interface GhostPost {
    id: string;
    slug: string;
    title: string;
    html?: string;
    excerpt?: string | null;
    custom_excerpt?: string | null;
    featured?: boolean;
    feature_image?: string | null;
    feature_image_alt?: string | null;
    feature_image_caption?: string | null;
    published_at: string;
    updated_at: string;
    reading_time?: number;
    tags?: GhostTag[];
    primary_tag?: GhostTag | null;
    authors?: GhostAuthor[];
    primary_author?: GhostAuthor | null;
    meta_title?: string | null;
    meta_description?: string | null;
    og_image?: string | null;
    og_title?: string | null;
    og_description?: string | null;
    twitter_image?: string | null;
    twitter_title?: string | null;
    twitter_description?: string | null;
    canonical_url?: string | null;
}

export interface GhostPagination {
    page: number;
    limit: number;
    pages: number;
    total: number;
    next: number | null;
    prev: number | null;
}

interface PostsResponse {
    posts: GhostPost[];
    meta: { pagination: GhostPagination };
}

interface TagsResponse {
    tags: GhostTag[];
    meta: { pagination: GhostPagination };
}

interface AuthorsResponse {
    authors: GhostAuthor[];
    meta: { pagination: GhostPagination };
}

export const isGhostConfigured = Boolean(GHOST_URL && GHOST_KEY);

// Operator hint stays in the server log — the UI shows a friendly empty state.
if (!isGhostConfigured && typeof window === "undefined") {
    console.warn(
        "[blog] Ghost is not configured — set GHOST_URL and GHOST_CONTENT_API_KEY. The blog will render empty until then."
    );
}

let warnedRejectedKey = false;

class GhostHttpError extends Error {
    constructor(public readonly status: number, url: string) {
        super(`Ghost Content API responded ${status} for ${url}`);
    }
}

/** GET with timeout + retry (exponential backoff) on network errors and 5xx. */
async function getWithRetry<T>(url: string, retries = 2, timeoutMs = 10000): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { "Accept-Version": GHOST_API_VERSION },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) {
                const error = new GhostHttpError(response.status, url);
                // 4xx won't heal on retry — surface immediately.
                if (response.status < 500) throw error;
                throw Object.assign(error, { retryable: true });
            }
            return (await response.json()) as T;
        } catch (error) {
            lastError = error;
            const retryable =
                !(error instanceof GhostHttpError) ||
                (error as { retryable?: boolean }).retryable === true;
            if (!retryable || attempt === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
        }
    }
    throw lastError;
}

/**
 * Fetch from the Content API. Resolves to null when Ghost rejects the key
 * (401/403 — a configuration problem, e.g. an invalid or revoked key), so a
 * misconfigured deploy renders the blog's friendly empty state instead of
 * crashing. Transient failures (network, 5xx) still throw: during ISR
 * revalidation that keeps the previously rendered page rather than baking an
 * empty one over good content.
 */
async function ghostFetch<T>(
    resource: string,
    params: Record<string, string> = {}
): Promise<T | null> {
    const url = new URL(`${GHOST_URL}/ghost/api/content/${resource}/`);
    url.searchParams.set("key", GHOST_KEY);
    for (const [name, value] of Object.entries(params)) {
        url.searchParams.set(name, value);
    }

    try {
        return await getWithRetry<T>(url.toString());
    } catch (error) {
        const status = error instanceof GhostHttpError ? error.status : undefined;
        if (status === 401 || status === 403) {
            if (!warnedRejectedKey) {
                warnedRejectedKey = true;
                console.warn(
                    `[blog] Ghost rejected the Content API key (HTTP ${status}) — check GHOST_CONTENT_API_KEY. The blog will render empty until it's fixed.`
                );
            }
            return null;
        }
        throw error;
    }
}

/** Fetch a single page of published posts (newest first), tags + authors included. */
export async function getPosts(
    page = 1,
    limit = 25
): Promise<{ posts: GhostPost[]; pagination: GhostPagination | null }> {
    if (!isGhostConfigured) return { posts: [], pagination: null };

    const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
        include: "tags,authors",
        limit: String(limit),
        page: String(page),
        order: "published_at DESC",
    });
    if (!data) return { posts: [], pagination: null };

    return { posts: data.posts, pagination: data.meta.pagination };
}

/** Fetch every published post, following pagination (100 per request max). */
export async function getAllPosts(): Promise<GhostPost[]> {
    if (!isGhostConfigured) return [];

    const posts: GhostPost[] = [];
    let page: number | null = 1;

    while (page) {
        const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
            include: "tags,authors",
            limit: "100",
            page: String(page),
            order: "published_at DESC",
        });
        if (!data) break;
        posts.push(...data.posts);
        page = data.meta.pagination.next;
    }

    return posts;
}

/**
 * Fetch a single post by slug, or null when it doesn't exist.
 * Uses browse + filter instead of the read endpoint so a missing post is an
 * empty 200 response rather than a 404 that gets retried and rethrown.
 */
export async function getPostBySlug(slug: string): Promise<GhostPost | null> {
    if (!isGhostConfigured) return null;

    const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
        include: "tags,authors",
        filter: `slug:${slug}`,
        limit: "1",
    });

    return data?.posts[0] ?? null;
}

/** Lightweight slug list for generateStaticParams / sitemap. */
export async function getPostSlugs(): Promise<
    Array<Pick<GhostPost, "slug" | "published_at" | "updated_at">>
> {
    if (!isGhostConfigured) return [];

    const slugs: Array<Pick<GhostPost, "slug" | "published_at" | "updated_at">> = [];
    let page: number | null = 1;

    while (page) {
        const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
            fields: "slug,published_at,updated_at",
            limit: "100",
            page: String(page),
            order: "published_at DESC",
        });
        if (!data) break;
        slugs.push(...data.posts);
        page = data.meta.pagination.next;
    }

    return slugs;
}

/** Human-readable date for post bylines, rendered server-side. */
export function formatPostDate(date: string): string {
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(date));
}

/** Best-available excerpt for cards and meta descriptions. */
export function postExcerpt(post: GhostPost, maxLength = 200): string {
    const text = (post.custom_excerpt || post.excerpt || "").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** Word-limited excerpt, matching Ghost's `{{excerpt words="N"}}` helper. */
export function postExcerptWords(post: GhostPost, words = 20): string {
    const text = (post.custom_excerpt || post.excerpt || "").trim();
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length <= words) return text;
    return `${parts.slice(0, words).join(" ")}…`;
}

/** Posts sharing any tag with the given post, excluding itself — "Read next". */
export async function getRelatedPosts(post: GhostPost, limit = 3): Promise<GhostPost[]> {
    if (!isGhostConfigured) return [];

    const tagSlugs = (post.tags ?? []).map((tag) => tag.slug).filter(Boolean);
    if (tagSlugs.length === 0) return [];

    const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
        include: "tags,authors",
        filter: `tags:[${tagSlugs.join(",")}]+id:-${post.id}`,
        limit: String(limit),
        order: "published_at DESC",
    });

    return data?.posts ?? [];
}

/** Featured posts (featured toggle in Ghost editor) for hero sections. */
export async function getFeaturedPosts(limit = 5): Promise<GhostPost[]> {
    if (!isGhostConfigured) return [];

    const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
        include: "tags,authors",
        filter: "featured:true",
        limit: String(limit),
        order: "published_at DESC",
    });

    return data?.posts ?? [];
}

/** Posts per feed page for /blog/page/[N]. */
export const POSTS_PER_PAGE = 6;

/** Public tags that have at least one post, busiest first — powers the tag
 *  nav and /blog/tag/[slug] archives. */
export async function getTags(): Promise<GhostTag[]> {
    if (!isGhostConfigured) return [];

    const data: TagsResponse | null = await ghostFetch<TagsResponse>("tags", {
        include: "count.posts",
        filter: "visibility:public",
        limit: "all",
        order: "count.posts DESC",
    });

    return data?.tags.filter((tag) => (tag.count?.posts ?? 0) > 0) ?? [];
}

/** Published posts for one tag (newest first), with pagination meta. */
export async function getPostsByTag(
    slug: string,
    page = 1,
    limit = POSTS_PER_PAGE
): Promise<{ posts: GhostPost[]; pagination: GhostPagination | null }> {
    if (!isGhostConfigured) return { posts: [], pagination: null };

    const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
        include: "tags,authors",
        filter: `tag:${slug}`,
        limit: String(limit),
        page: String(page),
        order: "published_at DESC",
    });
    if (!data) return { posts: [], pagination: null };

    return { posts: data.posts, pagination: data.meta.pagination };
}

/** Authors with at least one published post — powers /blog/author/[slug]
 *  archives and the sitemap. Ghost never returns post-less authors. */
export async function getAuthors(): Promise<GhostAuthor[]> {
    if (!isGhostConfigured) return [];

    const data: AuthorsResponse | null = await ghostFetch<AuthorsResponse>("authors", {
        include: "count.posts",
        limit: "all",
        order: "count.posts DESC",
    });

    return data?.authors ?? [];
}

/**
 * Fetch a single author by slug, or null when they don't exist.
 * Browse + filter for the same reason as getPostBySlug: a missing author is an
 * empty 200 instead of a 404 that gets retried and rethrown.
 */
export async function getAuthorBySlug(slug: string): Promise<GhostAuthor | null> {
    if (!isGhostConfigured) return null;

    const data: AuthorsResponse | null = await ghostFetch<AuthorsResponse>("authors", {
        include: "count.posts",
        filter: `slug:${slug}`,
        limit: "1",
    });

    return data?.authors[0] ?? null;
}

/** Published posts by one author (newest first), with pagination meta. */
export async function getPostsByAuthor(
    slug: string,
    page = 1,
    limit = POSTS_PER_PAGE
): Promise<{ posts: GhostPost[]; pagination: GhostPagination | null }> {
    if (!isGhostConfigured) return { posts: [], pagination: null };

    const data: PostsResponse | null = await ghostFetch<PostsResponse>("posts", {
        include: "tags,authors",
        filter: `author:${slug}`,
        limit: String(limit),
        page: String(page),
        order: "published_at DESC",
    });
    if (!data) return { posts: [], pagination: null };

    return { posts: data.posts, pagination: data.meta.pagination };
}

/**
 * Author social profiles as labeled URLs, for byline/bio rows and the
 * Person JSON-LD `sameAs` array. Ghost stores most networks as bare handles;
 * values that are already URLs pass through untouched. Mastodon is skipped
 * unless it is a full URL (instances make handles ambiguous).
 */
export function authorSocialLinks(
    author: GhostAuthor
): Array<{ label: string; url: string }> {
    const links: Array<{ label: string; url: string }> = [];

    const add = (label: string, value: string | null | undefined, base?: string) => {
        const raw = (value || "").trim();
        if (!raw) return;
        if (/^https?:\/\//.test(raw)) {
            links.push({ label, url: raw });
        } else if (base) {
            links.push({ label, url: `${base}${raw.replace(/^@/, "")}` });
        }
    };

    add("Website", author.website);
    add("X", author.twitter, "https://x.com/");
    add("Facebook", author.facebook, "https://www.facebook.com/");
    add("Threads", author.threads, "https://www.threads.net/@");
    add("Bluesky", author.bluesky, "https://bsky.app/profile/");
    add("Mastodon", author.mastodon);
    add("TikTok", author.tiktok, "https://www.tiktok.com/@");
    add("YouTube", author.youtube, "https://www.youtube.com/");
    add("Instagram", author.instagram, "https://www.instagram.com/");
    add("LinkedIn", author.linkedin, "https://www.linkedin.com/in/");

    return links;
}

/**
 * Slim projection of a post carrying only what post cards and client-side tag
 * filtering need. Use it whenever many posts are passed to a client component
 * so the serialized RSC payload stays small — full posts include html,
 * meta/og/twitter fields, and author bios that cards never read.
 */
export function toCardPost(post: GhostPost): GhostPost {
    return {
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: postExcerptWords(post, 20),
        featured: post.featured,
        feature_image: post.feature_image,
        feature_image_alt: post.feature_image_alt,
        published_at: post.published_at,
        updated_at: post.updated_at,
        tags: post.tags?.map(({ id, name, slug }) => ({ id, name, slug })),
        primary_tag: post.primary_tag
            ? {
                  id: post.primary_tag.id,
                  name: post.primary_tag.name,
                  slug: post.primary_tag.slug,
              }
            : null,
        authors: post.authors?.map(({ id, name, slug, profile_image }) => ({
            id,
            name,
            slug,
            profile_image,
        })),
    };
}
