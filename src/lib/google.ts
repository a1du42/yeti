import "server-only";
import type { BetterAuthPlugin } from "better-auth";
import { getOAuthState } from "better-auth/api";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isTimezone } from "./validation";

const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });

export function googleOidcValidation(clientId: string): BetterAuthPlugin {
  return {
    id: "google-oidc-validation",
    init(context) {
      return { context: { socialProviders: context.socialProviders.map(provider => provider.id !== "google" ? provider : {
        ...provider,
        requiresIdTokenNonce: true,
        async createAuthorizationURL(params) {
          if (!params.idTokenNonce) throw new Error("Missing OIDC nonce");
          const url = await provider.createAuthorizationURL(params);
          url.searchParams.set("nonce", params.idTokenNonce);
          return url;
        },
        async getUserInfo(tokens) {
          if (!tokens.idToken || !tokens.expectedIdTokenNonce) return null;
          try {
            const { payload } = await jwtVerify(tokens.idToken, keys, {
              issuer: ["https://accounts.google.com", "accounts.google.com"],
              audience: clientId, algorithms: ["RS256"], maxTokenAge: "1h",
            });
            if (payload.nonce !== tokens.expectedIdTokenNonce || typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.email_verified !== true) return null;
            const state = await getOAuthState();
            const zone = state?.timezone;
            return { user: { name: typeof payload.name === "string" ? payload.name : "Google", email: payload.email, emailVerified: true, timezone: typeof zone === "string" && isTimezone(zone) ? zone : "" }, data: payload };
          } catch { return null; }
        },
      }) } };
    },
  };
}
