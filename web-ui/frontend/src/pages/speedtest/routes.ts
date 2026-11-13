import type { PageModule } from "../../app/pages";

export const routes: Record<string, () => Promise<PageModule>> = {
  "speedtest/index": () => import("./Speedtest"),
  "speedtest/result": () => import("./Result"),
};
