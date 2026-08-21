export type Config = {
  env: "development" | "staging" | "production";
  port: number;
  databaseUrl: string;
  devAuth: boolean;
  oidcIssuer: string;
  oidcInternalBase: string;
  oidcAudience: string;
};

function normalizeEnv(v: string | undefined): Config["env"] {
  switch ((v ?? "").trim().toLowerCase()) {
    case "":
    case "dev":
    case "development":
    case "local":
    case "demo":
      return "development";
    case "staging":
    case "stage":
      return "staging";
    case "production":
    case "prod":
      return "production";
    default:
      throw new Error(
        `unsupported TALENT_ENV ${JSON.stringify(v)} (use development, staging, or production)`,
      );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.TALENT_HTTP_PORT ?? "8090", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("TALENT_HTTP_PORT must be a positive integer");
  }
  const profile = normalizeEnv(env.TALENT_ENV);
  const oidcIssuer = env.OIDC_ISSUER?.trim() ?? "";
  const devAuth = env.TALENT_DEV_AUTH !== "false";
  if ((profile === "staging" || profile === "production") && devAuth) {
    throw new Error(`TALENT_DEV_AUTH must be false when TALENT_ENV=${profile}`);
  }
  if ((profile === "staging" || profile === "production") && !oidcIssuer) {
    throw new Error(`OIDC_ISSUER is required when TALENT_ENV=${profile}`);
  }
  return {
    env: profile,
    port,
    databaseUrl: env.TALENT_DATABASE_URL?.trim() ?? "",
    devAuth,
    oidcIssuer,
    oidcInternalBase: env.OIDC_INTERNAL_BASE?.trim() ?? oidcIssuer,
    oidcAudience: env.OIDC_AUDIENCE?.trim() ?? "",
  };
}
