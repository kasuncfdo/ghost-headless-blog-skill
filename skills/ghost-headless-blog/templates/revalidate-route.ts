// src/app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Ghost webhook → instant ISR purge for the blog.
 *
 * Configure in Ghost Admin → Integrations → (your custom integration) → Webhooks:
 *   Events:     Post published / updated / unpublished / deleted
 *   Target URL: https://<prod-domain>/api/revalidate?secret=<GHOST_REVALIDATE_SECRET>
 *   (Leave Ghost's "Secret" field empty — it sets X-Ghost-Signature, which
 *   this endpoint doesn't check; the secret travels in the query param.)
 *
 * Env: GHOST_REVALIDATE_SECRET — any long random string, shared with Ghost.
 */

interface GhostWebhookPayload {
    post?: {
        current?: { slug?: string };
        previous?: { slug?: string };
    };
}

export async function POST(request: NextRequest) {
    const secret = process.env.GHOST_REVALIDATE_SECRET;

    if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
        return NextResponse.json(
            { revalidated: false, message: "Invalid secret" },
            { status: 401 }
        );
    }

    const payload = (await request.json().catch(() => null)) as GhostWebhookPayload | null;

    // Slug can change on update — revalidate both old and new paths.
    const slugs = [payload?.post?.current?.slug, payload?.post?.previous?.slug].filter(
        (slug): slug is string => Boolean(slug)
    );

    revalidatePath("/blog");
    revalidatePath("/blog/page/[page]", "page");
    revalidatePath("/blog/tag/[slug]", "page");
    revalidatePath("/blog/author/[slug]", "page");
    revalidatePath("/sitemap.xml");
    for (const slug of new Set(slugs)) {
        revalidatePath(`/blog/${slug}`);
    }

    return NextResponse.json({
        revalidated: true,
        paths: ["/blog", "/sitemap.xml", ...[...new Set(slugs)].map((slug) => `/blog/${slug}`)],
    });
}
