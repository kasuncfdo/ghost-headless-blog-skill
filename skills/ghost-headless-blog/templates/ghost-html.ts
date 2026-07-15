/**
 * Blur-up for images inside Ghost-rendered HTML: each <img> gets an inline
 * onload that flags it as loaded, and ghost-content.css keeps not-yet-loaded
 * images blurred. Inline handlers in dangerouslySetInnerHTML output are native
 * HTML attributes, so this works without hydration.
 */
export function withBlurUpImages(html: string): string {
    return (
        html
            .replaceAll(
                "<img ",
                `<img onload="this.classList.add('is-loaded')" onerror="this.classList.add('is-loaded');if(this.classList.contains('kg-bookmark-icon'))this.hidden=true" `
            )
            // Ghost lazy-loads every content image; the first one is usually near
            // the fold and often the LCP, so promote it (String.replace: first
            // occurrence only).
            .replace('loading="lazy"', 'loading="eager" fetchpriority="high"')
    );
}
