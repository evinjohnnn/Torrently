import type { PageModule } from "../../app/pages";

const process = () => import("./Process");

export const routes: Record<string, () => Promise<PageModule>> = {
  "auth/login": () => import("./Login"),
  "auth/password": () => import("./Password"),
  "auth/verify": () => process().then((m) => ({ ...m, default: m.Verify })),
  "auth/callback": () => process().then((m) => ({ ...m, default: m.Verify })),
  "auth/logout": () => process().then((m) => ({ ...m, default: m.Logout })),
  "auth/refresh": () => process().then((m) => ({ ...m, default: m.Refresh })),
};
