export type Config = {
  port: number;
  databaseUrl: string;
  devAuth: boolean;
  oidcIssuer: string;
  oidcInternalBase: string;
  oidcAudience: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.TALENT_HTTP_PORT ?? "8090", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("TALENT_HTTP_PORT must be a positive integer");
  }
  const oidcIssuer = env.OIDC_ISSUER?.trim() ?? "";
  return {
    port,
    databaseUrl: env.TALENT_DATABASE_URL?.trim() ?? "",
    devAuth: env.TALENT_DEV_AUTH !== "false",
    oidcIssuer,
    oidcInternalBase: env.OIDC_INTERNAL_BASE?.trim() ?? oidcIssuer,
    oidcAudience: env.OIDC_AUDIENCE?.trim() ?? "",
  };
}
