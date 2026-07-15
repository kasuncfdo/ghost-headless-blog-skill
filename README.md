# ghost-headless-blog — Claude Code skill

A [Claude Code](https://claude.com/claude-code) skill (packaged as a plugin + marketplace)
for implementing a **headless [Ghost](https://ghost.org) CMS blog in a Next.js App Router
site** — extracted from a production implementation (Next.js 16 / React 19 / Tailwind v4,
Ghost Content API v6.0).

Once installed, Claude loads it automatically whenever you ask things like _"add a
Ghost-powered blog to this site"_ or when debugging an existing headless Ghost
integration (empty blog, stale pages, broken images/cards).

## What's inside

```
skills/ghost-headless-blog/
├── SKILL.md                      # Architecture, 11 non-negotiable decisions, pitfalls
├── references/
│   ├── setup.md                  # Ghost Admin, env vars, next.config images, webhook, verification
│   └── pages.md                  # Routes, ISR, metadata, JSON-LD, sitemap patterns
└── templates/                    # Portable copy-paste code (no project-specific deps)
    ├── ghost.ts                  # Typed Content API client (fetch + retry, graceful degradation)
    ├── ghost-html.ts             # Blur-up images + LCP fix for Ghost-rendered HTML
    ├── revalidate-route.ts       # Ghost webhook → instant ISR purge
    ├── ghost-content.css         # Full .gh-content prose + koenig card styles (--ghost-accent)
    └── components/               # BlurImage, ToggleCards, ReadingProgress
```

Highlights baked into the skill:

- **Direct Content API calls** (`Accept-Version: v6.0`) — no `@tryghost/content-api` dependency
- **Server-only credentials** (no `NEXT_PUBLIC_`), all fetching in server components
- **ISR (`revalidate = 3600`) + Ghost webhook** for instant purges on publish/update/unpublish/delete
- **Three-tier failure handling**: missing env → empty blog (build succeeds), rejected key → warn once + empty state, transient 5xx → throw so ISR keeps the last good page
- **SEO**: Ghost meta/og/twitter fields with fallbacks, `canonical_url`, BlogPosting / Blog / CollectionPage JSON-LD, honest sitemap `lastModified`
- **Rendering**: `dangerouslySetInnerHTML` + dedicated koenig-card CSS, blur-up images via inline `onload`, first-image LCP promotion, toggle-card JS re-implementation
- **Operational pitfalls** learned in production (env wipes, domain moves, webhook secret placement, redirecting canonical URLs)

## Install

### Option A — as a plugin (recommended)

In any Claude Code session:

```
/plugin marketplace add kasuncfdo/ghost-headless-blog-skill
/plugin install ghost-headless-blog@kasuncfdo-skills
```

> **Private repo note:** marketplace add clones over git, so the machine needs access to
> this repo (e.g. `gh auth login` or an SSH key on this GitHub account). If HTTPS
> prompts fail, add via SSH URL instead:
> `/plugin marketplace add git@github.com:kasuncfdo/ghost-headless-blog-skill.git`

Update later with:

```
/plugin marketplace update kasuncfdo-skills
```

### Option B — personal skill (no plugin system)

Copy the skill folder into your user skills directory:

```bash
git clone git@github.com:kasuncfdo/ghost-headless-blog-skill.git
mkdir -p ~/.claude/skills
cp -R ghost-headless-blog-skill/skills/ghost-headless-blog ~/.claude/skills/
```

### Option C — per-project skill

Ship it with one repo only (teammates get it too):

```bash
mkdir -p .claude/skills
cp -R ghost-headless-blog-skill/skills/ghost-headless-blog .claude/skills/
```

## Use

The skill triggers automatically on matching requests, or invoke it explicitly:

```
/ghost-headless-blog
```

Typical prompts:

- "Add a headless Ghost blog at /blog to this Next.js site"
- "My Ghost blog builds with 0 posts — debug it"
- "Ghost toggle cards / bookmarks render broken in my Next.js blog"

## Requirements (for the generated implementation)

- Next.js 15+ (App Router; templates assume `params` is a Promise)
- A Ghost site (managed or self-hosted) with a Custom Integration (Content API key)
- Hosting that supports ISR + `revalidatePath` (e.g. Vercel) for the webhook flow

## License

MIT
