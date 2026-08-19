import { createRemoteJWKSet, jwtVerify } from "jose";

export type UserAuthConfig = {
  devAuth: boolean;
  oidcIssuer: string;
  oidcInternalBase: string;
  oidcAudience: string;
};

export type UserAuth = {
  resolveSub(headers: Headers): Promise<string | null>;
};

export function createUserAuth(cfg: UserAuthConfig): UserAuth {
  const issuer = cfg.oidcIssuer.replace(/\/$/, "");
  const internalBase = (cfg.oidcInternalBase || issuer).replace(/\/$/, "");
  const oidcOn = !!issuer;
  let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  function jwksUrl(): URL {
    return new URL(`${internalBase}/jwks.json`);
  }

  async function fromBearer(token: string): Promise<string | null> {
    if (!oidcOn) {
      return null;
    }
    if (!jwks) {
      jwks = createRemoteJWKSet(jwksUrl());
    }
    try {
      const opts: Parameters<typeof jwtVerify>[2] = { issuer };
      if (cfg.oidcAudience) {
        opts.audience = cfg.oidcAudience;
      }
      const { payload } = await jwtVerify(token, jwks, opts);
      if (typeof payload.sub === "string" && payload.sub) {
        return payload.sub;
      }
    } catch {
      // access_token は JWT でないことがある。userinfo へ。
    }
    try {
      const res = await fetch(`${internalBase}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return null;
      }
      const ui = (await res.json()) as { sub?: string };
      return ui.sub?.trim() || null;
    } catch {
      return null;
    }
  }

  return {
    async resolveSub(headers): Promise<string | null> {
      const devSub = headers.get("X-Dev-User-Sub")?.trim();
      if (devSub && cfg.devAuth) {
        return devSub;
      }
      const authz = headers.get("Authorization")?.trim() ?? "";
      if (!authz.startsWith("Bearer ")) {
        return null;
      }
      const token = authz.slice("Bearer ".length).trim();
      if (!token) {
        return null;
      }
      return fromBearer(token);
    },
  };
}
