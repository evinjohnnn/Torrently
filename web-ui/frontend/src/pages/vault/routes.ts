import type { PageModule } from "../../app/pages";

export const routes: Record<string, () => Promise<PageModule>> = {
  "vault/index": () => import("./Vault"),
};
