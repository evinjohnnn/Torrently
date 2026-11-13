import type { PageModule } from "../../app/pages";

export const routes: Record<string, () => Promise<PageModule>> = {
  "subscription/unsubscribe_confirm": () => import("./Unsubscribe"),
  "subscription/unsubscribed": () => import("./Unsubscribe"),
};
