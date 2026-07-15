# Official Ghost documentation (fetch on demand)

This skill covers the headless-blog integration patterns, but Ghost's own docs are the
source of truth for API shapes, new fields, and behavior changes. When something here
seems out of date, or a question falls outside the skill (Admin API, members, themes,
self-hosting), check the official docs before guessing.

## LLM-friendly docs feed

Ghost publishes its entire documentation as a single plain-text file built for LLMs:

```
https://docs.ghost.org/llms-full.txt
```

It is large (~700 KB, roughly 175k tokens), so never read it whole. Fetch it once, then
extract only the section you need. Each section starts with a `Source:` line naming the
docs page it came from:

```bash
curl -sL https://docs.ghost.org/llms-full.txt -o /tmp/ghost-docs.txt
grep -n '^Source: ' /tmp/ghost-docs.txt          # list sections with line numbers
sed -n '3993,4038p' /tmp/ghost-docs.txt          # print one section by line range
```

There is also a short index at `https://docs.ghost.org/llms.txt`.

## Content API pages this skill relies on

| Page | What it defines |
|---|---|
| https://docs.ghost.org/content-api | Auth, endpoints, key concepts |
| https://docs.ghost.org/content-api/posts | Full post object (all fields) |
| https://docs.ghost.org/content-api/authors | Author object: bio, socials, count.posts |
| https://docs.ghost.org/content-api/tags | Tag object, visibility, count.posts |
| https://docs.ghost.org/content-api/filtering | NQL filter syntax (`tag:x`, `author:x`, `slug:x`) |
| https://docs.ghost.org/content-api/pagination | `meta.pagination`, `next`/`prev` |
| https://docs.ghost.org/content-api/parameters | `include`, `fields`, `limit`, `order` |
| https://docs.ghost.org/content-api/errors | Error JSON shape and status codes |
| https://docs.ghost.org/content-api/versioning | `Accept-Version` header behavior |

## Facts worth pinning (verified against the docs)

- Authors are the subset of staff users with published posts; post-less authors are
  never returned by `/content/authors/`.
- Author social fields as of Ghost 6.x: `twitter`, `facebook`, `threads`, `bluesky`,
  `mastodon`, `tiktok`, `youtube`, `instagram`, `linkedin`, plus `website` and
  `location`. Most are stored as bare handles, not URLs.
- Tags: internal tags (`visibility: "internal"`, `#`-prefixed in Admin) are included by
  default; filter with `visibility:public` for anything user-facing.
- The Content API is read-only and only ever exposes published, public content.
  Anything involving drafts, members, or writes needs the Admin API (different auth,
  never expose in a browser).
