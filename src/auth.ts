import { createRemoteJWKSet, jwtVerify } from "jose";

export type UserAuthConfig = {
  devAuth: boolean;
  oidcIssuer: string;
  oidcInternalBase: string;
  oidcAudience: string;
};

export type AuthUser = {
  sub: string;
  orgId: string;
};

export type UserAuth = {
  resolveUser(headers: Headers): Promise<AuthUser | null>;
  /** Job scoping. DEV_AUTH defaults to org-demo-a; OIDC requires an authenticated org_id. */
  resolveOrgId(headers: Headers): Promise<string | null>;
};

const DEFAULT_ORG = "org-demo-a";

export function createUserAuth(cfg: UserAuthConfig): UserAuth {
  const issuer = cfg.oidcIssuer.replace(/\/$/, "");
  const internalBase = (cfg.oidcInternalBase || issuer).replace(/\/$/, "");
  const oidcOn = !!issuer;
  let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  function jwksUrl(): URL {
    return new URL(`${internalBase}/jwks.json`);
  }

  async function fromBearer(token: string): Promise<AuthUser | null> {
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
        const orgId = typeof payload.org_id === "string" ? payload.org_id.trim() : "";
        if (!orgId) {
          return null;
        }
        return { sub: payload.sub, orgId };
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
      const ui = (await res.json()) as { sub?: string; org_id?: string };
      const sub = ui.sub?.trim() || "";
      const orgId = ui.org_id?.trim() || "";
      if (!sub || !orgId) {
        return null;
      }
      return { sub, orgId };
    } catch {
      return null;
    }
  }

  return {
    async resolveUser(headers): Promise<AuthUser | null> {
      const devSub = headers.get("X-Dev-User-Sub")?.trim();
      if (devSub && cfg.devAuth) {
        const orgId = headers.get("X-Dev-User-Org")?.trim() || DEFAULT_ORG;
        return { sub: devSub, orgId };
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

    async resolveOrgId(headers): Promise<string | null> {
      const user = await this.resolveUser(headers);
      if (user) {
        return user.orgId;
      }
      if (cfg.devAuth) {
        return headers.get("X-Dev-User-Org")?.trim() || DEFAULT_ORG;
      }
      return null;
    },
  };
}
