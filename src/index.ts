import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { MemoryStore } from "./memory.js";
import { seedDemoJobs } from "./seed.js";

const port = Number.parseInt(process.env.TALENT_HTTP_PORT ?? "8090", 10);
const store = new MemoryStore();
await seedDemoJobs(store);
const app = createApp(store);

serve({ fetch: app.fetch, port });
console.log(`talent-api listening on :${port}`);
