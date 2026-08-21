import { describe, expect, it } from "vitest";
import { createUserAuth } from "./auth.js";

describe("createUserAuth", () => {
  it("accepts X-Dev-User-Sub when TALENT_DEV_AUTH is on", async () => {
    const auth = createUserAuth({ devAuth: true, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
    const headers = new Headers({ "X-Dev-User-Sub": "candidate-1" });
    expect(await auth.resolveUser(headers)).toEqual({ sub: "candidate-1", orgId: "org-demo-a" });
  });

  it("reads X-Dev-User-Org when TALENT_DEV_AUTH is on", async () => {
    const auth = createUserAuth({ devAuth: true, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
    const headers = new Headers({ "X-Dev-User-Sub": "candidate-1", "X-Dev-User-Org": "org-demo-b" });
    expect(await auth.resolveUser(headers)).toEqual({ sub: "candidate-1", orgId: "org-demo-b" });
  });

  it("defaults resolveOrgId to org-demo-a in DEV_AUTH without user", async () => {
    const auth = createUserAuth({ devAuth: true, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
    expect(await auth.resolveOrgId(new Headers())).toBe("org-demo-a");
  });

  it("ignores X-Dev-User-Sub when TALENT_DEV_AUTH is off", async () => {
    const auth = createUserAuth({ devAuth: false, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
    const headers = new Headers({ "X-Dev-User-Sub": "candidate-1" });
    expect(await auth.resolveUser(headers)).toBeNull();
    expect(await auth.resolveOrgId(headers)).toBeNull();
  });
});
