# Setup: Ghost Admin, env, next.config, webhook

## 1. Ghost side (Ghost Admin)

1. Ghost Admin → **Settings → Integrations → Add custom integration** (name it after the
   site, e.g. "Next.js frontend"). Copy the **Content API Key** (and the Admin API key
   only if you actually need admin operations — usually you don't).
2. Note the **API URL** — the Ghost admin domain (e.g. `https://your-site.ghost.io` or a
   custom domain like `https://blog.example.com`). This is `GHOST_URL`.
3. In the same custom integration, add **4 webhooks**, all pointing at the same target:

   | Event | Target URL |
   |---|---|
   | Post published | `https://<prod-domain>/api/revalidate?secret=<GHOST_REVALIDATE_SECRET>` |
   | Post updated | same |
   | Post unpublished | same |
   | Post deleted | same |

   **Leave Ghost's "Secret" field empty** — that field sets an `X-Ghost-Signature` header
   which the simple endpoint doesn't verify; the shared secret travels in the query param.

## 2. Environment variables

```bash
# .env.local (and hosting-provider envs — Production + Preview)
GHOST_URL=https://blog.example.com          # admin/API domain, no trailing slash
GHOST_CONTENT_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxx
GHOST_REVALIDATE_SECRET=<long random string>   # openssl rand -hex 32
```

- **No `NEXT_PUBLIC_` prefix** — all Ghost access is server-side.
- `GHOST_URL` is read **at build time** by `next.config.mjs` (image host) and at request
  time by the client. Changing the Ghost domain ⇒ update envs everywhere **and rebuild**.
- If the blog suddenly builds with far fewer pages / renders empty: check
  `GHOST_CONTENT_API_KEY` first (stale editor buffers have wiped `.env.local` before).

## 3. next.config.mjs — images

```js
// Ghost serves feature images from its own domain; GHOST_URL must be set at
// build time for next/image to allow it.
const ghostHostname = process.env.GHOST_URL ? new URL(process.env.GHOST_URL).hostname : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        // AVIF where supported; long cache — Ghost upload URLs never mutate.
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 2678400, // 31 days
        remotePatterns: [
            ...(ghostHostname ? [{ protocol: "https", hostname: ghostHostname }] : []),
            { protocol: "https", hostname: "static.ghost.org" },
            // Managed Ghost hosts (e.g. DigitalPress) serve uploads from DO Spaces CDN:
            { protocol: "https", hostname: "**.digitaloceanspaces.com" },
            // + any external hosts used for feature images (unsplash, partner sites…)
            { protocol: "https", hostname: "images.unsplash.com" },
        ],
    },
};
export default nextConfig;
```

## 4. Files to add

```
src/lib/ghost.ts                     # templates/ghost.ts
src/lib/ghost-html.ts                # templates/ghost-html.ts
src/styles/ghost-content.css         # templates/ghost-content.css
src/app/api/revalidate/route.ts      # templates/revalidate-route.ts
src/app/blog/page.tsx                # index (see references/pages.md)
src/app/blog/[slug]/page.tsx         # post page
src/app/blog/tag/[slug]/page.tsx     # tag archive
src/app/blog/page/[page]/page.tsx    # paged archive
src/components/blog/BlurImage.tsx    # templates/components/BlurImage.tsx
src/components/blog/ToggleCards.tsx  # templates/components/ToggleCards.tsx
src/components/blog/ReadingProgress.tsx
src/components/blog/PostCard.tsx     # site-specific card design
```

Adapt `templates/ghost.ts` if the project has its own HTTP wrapper (retry/timeout) — the
template ships a self-contained fetch helper so it works anywhere.

## 5. BASE_URL

Define one canonical base URL used for OG urls, canonicals, JSON-LD, sitemap:

```ts
// src/lib/site.ts
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.example.com";
```

Point it at the **final, non-redirecting** host (if apex 307s to `www`, use `www`) —
scrapers like Telegram reject og:image URLs behind redirects.

## 6. Verify

1. `pnpm build` (or npm/yarn) — should log the number of `/blog/[slug]` pages matching
   the number of published posts. A drop to ~0 means env/key problems.
2. Publish or update a test post in Ghost → the webhook fires → the page updates within
   seconds without a redeploy. Check webhook delivery status in Ghost Admin →
   integration → webhook row.
3. `curl -X POST "https://<domain>/api/revalidate?secret=WRONG"` → 401.
4. Validate a post URL in an OG debugger (feature image, title, description) and check
   `/sitemap.xml` contains posts + tag pages.
