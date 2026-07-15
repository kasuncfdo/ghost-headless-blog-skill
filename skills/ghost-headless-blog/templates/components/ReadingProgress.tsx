"use client";

import { useEffect, useRef } from "react";

/**
 * Reading progress bar: a native <progress> element pinned to the top of the
 * viewport, filled with the brand color as the reader scrolls (fill color
 * styled in ghost-content.css via [data-progress-bar]).
 */
export default function ReadingProgress() {
    const barRef = useRef<HTMLProgressElement>(null);

    useEffect(() => {
        let frame = 0;

        const update = () => {
            const doc = document.documentElement;
            const scrollable = doc.scrollHeight - doc.clientHeight;
            const percent = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
            barRef.current?.setAttribute("value", String(percent));
        };

        const onScroll = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
        };
    }, []);

    return (
        <progress
            ref={barRef}
            value={0}
            max={100}
            aria-hidden
            data-progress-bar
            className="fixed top-0 left-0 z-[1100] h-[3px] w-full appearance-none bg-transparent"
        />
    );
}
