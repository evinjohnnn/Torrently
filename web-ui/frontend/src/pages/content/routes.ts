import type { PageModule } from "../../app/pages";

const instructions = () => import("./Instructions");
const legal = () => import("./Legal");

export const routes: Record<string, () => Promise<PageModule>> = {
  "about/index": () => import("./About"),
  "instructions/s3": instructions,
  "instructions/stremio": instructions,
  "instructions/stremio_addon": instructions,
  "instructions/torznab": instructions,
  "instructions/vault": instructions,
  "instructions/webdav": instructions,
  "legal/tos": legal,
  "legal/privacy": legal,
  "legal/dmca": legal,
  "legal/refund": legal,
  "error/page": () => import("./ErrorPage"),
};
