import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to memory, port 8090, and dev auth", () => {
    expect(loadConfig({})).toEqual({
      port: 8090,
      databaseUrl: "",
      devAuth: true,
      oidcIssuer: "",
      oidcInternalBase: "",
      oidcAudience: "",
    });
  });

  it("reads TALENT_DATABASE_URL and TALENT_DEV_AUTH", () => {
    const cfg = loadConfig({
      TALENT_DATABASE_URL: " postgres://talent:talent@localhost:5436/talent ",
      TALENT_DEV_AUTH: "false",
      OIDC_ISSUER: "http://idp.localhost",
    });
    expect(cfg.databaseUrl).toBe("postgres://talent:talent@localhost:5436/talent");
    expect(cfg.devAuth).toBe(false);
    expect(cfg.oidcIssuer).toBe("http://idp.localhost");
    expect(cfg.oidcInternalBase).toBe("http://idp.localhost");
  });
});
