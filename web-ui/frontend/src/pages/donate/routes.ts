import type { PageModule } from "../../app/pages";

export const routes: Record<string, () => Promise<PageModule>> = {
  "donate/index": () => import("./Donate"),
  "donate/crypto_success": () => import("./CryptoSuccess"),
};
