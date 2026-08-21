import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to memory, port 8090, and dev auth", () => {
    expect(loadConfig({})).toEqual({
      env: "development",
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
    expect(cfg.env).toBe("development");
  });

  it("rejects staging with DEV_AUTH", () => {
    expect(() =>
      loadConfig({
        TALENT_ENV: "staging",
        TALENT_DEV_AUTH: "true",
        OIDC_ISSUER: "http://idp.localhost",
      }),
    ).toThrow(/TALENT_DEV_AUTH must be false/);
  });

  it("requires OIDC on staging", () => {
    expect(() =>
      loadConfig({
        TALENT_ENV: "staging",
        TALENT_DEV_AUTH: "false",
      }),
    ).toThrow(/OIDC_ISSUER is required/);
  });

  it("accepts staging with OIDC and DEV_AUTH off", () => {
    const cfg = loadConfig({
      TALENT_ENV: "staging",
      TALENT_DEV_AUTH: "false",
      OIDC_ISSUER: "http://idp.localhost",
    });
    expect(cfg.env).toBe("staging");
    expect(cfg.devAuth).toBe(false);
  });
});
