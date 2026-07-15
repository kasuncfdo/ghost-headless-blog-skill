"use client";

import { useEffect } from "react";

/**
 * Makes Ghost toggle cards interactive (Ghost ships this behavior in its
 * card JS; we render the HTML statically, so re-add the click handling).
 * Open/close styling lives in ghost-content.css via data-kg-toggle-state.
 *
 * Mount once on any page that renders .gh-content.
 */
export default function ToggleCards() {
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (!(event.target instanceof Element)) return;
            const heading = event.target.closest(".kg-toggle-heading");
            const card = event.target.closest(".kg-toggle-card");
            if (!heading || !card) return;

            const state = card.getAttribute("data-kg-toggle-state");
            card.setAttribute("data-kg-toggle-state", state === "close" ? "open" : "close");
        };

        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);

    return null;
}
