import type { PageModule } from "../../app/pages";

const support = () => import("./Support");

export const routes: Record<string, () => Promise<PageModule>> = {
  "support/form": support,
  "support/success": support,
};
