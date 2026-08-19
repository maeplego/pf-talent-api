import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to memory (empty database URL) and port 8090", () => {
    expect(loadConfig({})).toEqual({ port: 8090, databaseUrl: "" });
  });

  it("reads TALENT_DATABASE_URL", () => {
    expect(loadConfig({ TALENT_DATABASE_URL: " postgres://talent:talent@localhost:5436/talent " }).databaseUrl).toBe(
      "postgres://talent:talent@localhost:5436/talent",
    );
  });
});
