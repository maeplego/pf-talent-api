import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryStore } from "./memory.js";
import { PostgresStore } from "./postgres.js";
import { seedDemoJobs, seedIfEmpty } from "./seed.js";
import type { Store } from "./store.js";

const cfg = loadConfig();
const store: Store = cfg.databaseUrl ? await PostgresStore.connect(cfg.databaseUrl) : new MemoryStore();
if (cfg.databaseUrl) {
  await seedIfEmpty(store);
} else {
  console.warn("TALENT_DATABASE_URL is empty; using in-memory store (unit tests / fallback)");
  await seedDemoJobs(store);
}
const app = createApp(store);

serve({ fetch: app.fetch, port: cfg.port });
console.log(`talent-api listening on :${cfg.port}`);
