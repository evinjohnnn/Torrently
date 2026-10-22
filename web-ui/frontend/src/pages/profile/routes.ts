import type { PageModule } from "../../app/pages";

export const routes: Record<string, () => Promise<PageModule>> = {
  "profile/get": () => import("./Profile"),
  "profile/payments": () => import("./Payments"),
  "profile/email_verified": () => import("./EmailVerified"),
};
