import { describe, expect, it } from "vitest";
import { createUserAuth } from "./auth.js";

describe("createUserAuth", () => {
  it("accepts X-Dev-User-Sub when TALENT_DEV_AUTH is on", async () => {
    const auth = createUserAuth({ devAuth: true, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
    const headers = new Headers({ "X-Dev-User-Sub": "candidate-1" });
    expect(await auth.resolveSub(headers)).toBe("candidate-1");
  });

  it("ignores X-Dev-User-Sub when TALENT_DEV_AUTH is off", async () => {
    const auth = createUserAuth({ devAuth: false, oidcIssuer: "", oidcInternalBase: "", oidcAudience: "" });
    const headers = new Headers({ "X-Dev-User-Sub": "candidate-1" });
    expect(await auth.resolveSub(headers)).toBeNull();
  });
});
