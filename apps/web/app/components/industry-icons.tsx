import type { ReactNode } from "react";

/* Line icons for the Who It's For industries, drawn on a 24px grid to match
   the site's thin chevrons and checks. */
const paths: Record<string, ReactNode> = {
  apps: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  "wellness-beauty": (
    <>
      <path d="M12 3.5c3.2 3.8 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.3-6.2 5.5-10Z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  apparel: (
    <path d="M9 3.5 4 6l-1.5 4.5 3 1.2V20.5h13v-8.8l3-1.2L20 6l-5-2.5a3 3 0 0 1-6 0Z" />
  ),
  supplements: (
    <>
      <rect
        x="2.6"
        y="8.5"
        width="18.8"
        height="7"
        rx="3.5"
        transform="rotate(-45 12 12)"
      />
      <path d="m9.5 9.5 5 5" />
    </>
  ),
  "food-beverage": (
    <>
      <path d="M4.5 9.5h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z" />
      <path d="M16.5 11h1a2.5 2.5 0 0 1 0 5h-1.2" />
      <path d="M8.5 3.5c-.8 1 .8 2-.1 3.2M12.5 3.5c-.8 1 .8 2-.1 3.2" />
    </>
  ),
  ecommerce: (
    <>
      <path d="M5 7.5h14l-1 13H6Z" />
      <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
    </>
  ),
};

export function IndustryIcon({
  slug,
  size = 20,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const icon = paths[slug];
  if (!icon) return null;
  return (
    <svg
      className={`site-industry-icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
  );
}
