/** Typed access to the environment, with the demo fallback made explicit. */
export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL?.trim() || '';
  },
  /** True when no Neon connection string is configured. */
  get isDemo() {
    return !this.databaseUrl;
  },
  get masterKey() {
    return process.env.KEY_ENC_MASTER?.trim() || '';
  },
  get routerKey() {
    return process.env.ROUTER_KEY?.trim() || '';
  },
  get dashboardPassword() {
    return process.env.DASHBOARD_PASSWORD?.trim() || '';
  },
  get sessionSecret() {
    return process.env.SESSION_SECRET?.trim() || '';
  },
} as const;
