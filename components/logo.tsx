import Image from "next/image";

import logoMark from "@/public/images/logo-mark.png";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** Rendered edge in CSS pixels. Drives both the intrinsic size and the box. */
  size?: number;
  /** Preload it — only worth setting on a mark that is above the fold. */
  priority?: boolean;
  className?: string;
};

/**
 * The Magic Forms mark. Single source of truth for the brand square — every
 * header, sidebar and "powered by" footer renders this rather than an icon font.
 *
 * No `sizes` prop on purpose: that would switch next/image to a width-descriptor
 * srcset sized off the viewport, which serves a 1x file into a fixed 28px box and
 * looks soft on retina. Without it we get the 1x/2x pair the mark actually needs.
 */
export function Logo({ size = 28, priority = false, className }: LogoProps) {
  return (
    <Image
      src={logoMark}
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
