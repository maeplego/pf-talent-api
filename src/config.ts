export type Config = {
  port: number;
  databaseUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.TALENT_HTTP_PORT ?? "8090", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("TALENT_HTTP_PORT must be a positive integer");
  }
  return {
    port,
    databaseUrl: env.TALENT_DATABASE_URL?.trim() ?? "",
  };
}
