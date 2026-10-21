import type { CSSProperties } from "react";
export type IconName =
  | "plus"
  | "library"
  | "star"
  | "download"
  | "settings"
  | "arrow"
  | "file"
  | "video"
  | "audio"
  | "folder"
  | "close"
  | "search"
  | "check"
  | "logout"
  | "upload"
  | "server"
  | "play";
const paths: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14",
  library: "M5 4v16M10 4v16M15 5l4 14",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  download: "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  file: "M14 3H5v18h14V8Zm0 0v5h5M8 13h8m-8 4h5",
  video: "M3 5h18v14H3ZM3 9h18M7 5v4m10-4v4m-6 3 4 2-4 2Z",
  audio:
    "M9 17V5l10-2v12M9 8l10-2M9 17c0 3-6 4-6 1s6-4 6-1Zm10-2c0 3-6 4-6 1s6-4 6-1Z",
  folder: "M3 6h7l2 3h9v11H3Z",
  close: "m6 6 12 12M6 18 18 6",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M16 16l5 5",
  check: "m5 12 4 4L19 6",
  logout: "M9 3H4v18h5m5-15 6 6-6 6M8 12h12",
  upload: "M12 17V3m-5 5 5-5 5 5M4 16v5h16v-5",
  server: "M3 3h18v7H3Zm0 11h18v7H3ZM7 6.5h.1M7 17.5h.1",
  play: "m8 4 12 8-12 8Z",
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
