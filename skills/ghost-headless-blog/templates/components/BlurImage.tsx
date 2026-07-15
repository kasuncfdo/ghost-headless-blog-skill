"use client";

import Image, { type ImageProps } from "next/image";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils"; // clsx + tailwind-merge; inline if absent

/**
 * next/image with a blur-up loading effect: images render blurred and the
 * blur transitions away once the file has loaded.
 */
export default function BlurImage({ className, ...props }: ImageProps) {
    const [loaded, setLoaded] = useState(false);

    // Images can finish loading before hydration attaches the onLoad handler —
    // check `complete` on mount so cached images don't stay blurred.
    const handleRef = useCallback((img: HTMLImageElement | null) => {
        if (img?.complete) setLoaded(true);
    }, []);

    return (
        // eslint-disable-next-line jsx-a11y/alt-text -- alt is part of ImageProps and supplied by every caller
        <Image
            {...props}
            ref={handleRef}
            onLoad={() => setLoaded(true)}
            className={cn(
                "transition-[filter] duration-500 will-change-[filter]",
                !loaded && "blur-sm",
                className
            )}
        />
    );
}
