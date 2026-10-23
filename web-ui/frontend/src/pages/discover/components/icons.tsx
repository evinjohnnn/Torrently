import type { SVGProps } from "react";

// The few glyphs Discover needs beyond src/ui/Icon, drawn in the same
// 24px Lucide idiom.
const paths = {
  calendar: "M8 3v3M16 3v3M4 7h16v13H4zM4 11h16",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  columns: "M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z",
  chevronLeft: "m15 6-6 6 6 6",
} as const;

export function DIcon({
  name,
  size = 20,
  ...rest
}: { name: keyof typeof paths; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
