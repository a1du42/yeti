import "server-only";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { z } from "zod";
import * as schema from "@/db/schema";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { scheduleAuthMail } from "@/lib/mail";
import { emailError, isTimezone, nameError, passwordError } from "@/lib/validation";
import { genericOAuth, yandex } from "better-auth/plugins/generic-oauth";
import { getOAuthState } from "better-auth/api";
import { googleOidcValidation } from "@/lib/google";

const nameSchema = z.string().superRefine((value, context) => {
  const error = nameError(value);
  if (error) context.addIssue({ code: "custom", message: error });
}).transform((value) => value.trim());

const timezoneSchema = z.string().refine(isTimezone, "Выберите часовой пояс");

function invalid(message: string): never {
  throw new APIError("BAD_REQUEST", { code: "VALIDATION_ERROR", message });
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // OWASP's scrypt N=2^17, r=8, p=1 profile; node:crypto performs the work off the main thread.
    // Better Auth's default normalizes NFKC, so use its supported custom hashing hook to preserve the input.
    scrypt(password, salt, 64, { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const passwordStorage = {
  hash: async (password: string): Promise<string> => {
    const salt = randomBytes(16).toString("hex");
    const key = await derivePassword(password, salt);
    return `scrypt-v1$${salt}$${key.toString("hex")}`;
  },
  verify: async ({ hash, password }: { hash: string; password: string }): Promise<boolean> => {
    const parts = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash);
    if (!parts) return false;
    const actual = await derivePassword(password, parts[1]);
    return timingSafeEqual(actual, Buffer.from(parts[2], "hex"));
  },
};

function verificationId(token: string): string {
  return `email-verification:${createHash("sha256").update(token).digest("hex")}`;
}

function createAuth() {
  const env = getServerEnv();
  return betterAuth({
    appName: "YETI STREAM",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    plugins: [
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? [googleOidcValidation(env.GOOGLE_CLIENT_ID)] : []),
      ...(env.YANDEX_CLIENT_ID && env.YANDEX_CLIENT_SECRET ? [genericOAuth({ config: [{
        ...yandex({ clientId: env.YANDEX_CLIENT_ID, clientSecret: env.YANDEX_CLIENT_SECRET, scopes: ["login:info", "login:email"], pkce: true }),
        authorizationUrl: "https://oauth.yandex.ru/authorize",
        tokenUrl: "https://oauth.yandex.ru/token",
        requireEmailVerification: true,
        mapProfileToUser: async () => {
          const state = await getOAuthState();
          return { timezone: typeof state?.timezone === "string" && isTimezone(state.timezone) ? state.timezone : "" };
        },
      }] })] : []),
    ],
    onAPIError: { errorURL: env.BETTER_AUTH_URL + "/app/auth?oauthError=1" },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
        accessType: "online",
        includeGrantedScopes: false,
      },
    } : {},
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(getDb(), { provider: "pg", schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      // Better Auth uses UTF-16 lengths. The hook enforces Unicode code points before these broad limits.
      minPasswordLength: 15,
      maxPasswordLength: 256,
      password: passwordStorage,
      resetPasswordTokenExpiresIn: 3_600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        scheduleAuthMail("password-reset", user.email, url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3_600,
      sendVerificationEmail: async ({ user, url, token }) => {
        await getDb().insert(schema.verification).values({
          id: randomUUID(),
          identifier: verificationId(token),
          value: user.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        });
        scheduleAuthMail("verification", user.email, url);
      },
    },
    user: {
      additionalFields: {
        timezone: { type: "string", required: true, input: true },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      deferSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      // Explicit linking uses the signed-in user; implicit linking still matches verified emails.
      accountLinking: { enabled: true, disableImplicitLinking: false, requireLocalEmailVerified: true, trustedProviders: ["yandex"], allowDifferentEmails: true, updateUserInfoOnLink: false },
    },
    verification: { storeIdentifier: "hashed", storeInDatabase: true },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "yeti",
      useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: ["x-yeti-client-ip"] },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const body = context.body as Record<string, unknown> | undefined;
        if (!body) return;
        if (context.path === "/sign-up/email") {
          const name = nameSchema.safeParse(body.name);
          if (!name.success) invalid(name.error.issues[0]?.message ?? "Введите имя");
          const timezone = timezoneSchema.safeParse(body.timezone);
          if (!timezone.success) invalid("Выберите часовой пояс");
          if (typeof body.email !== "string") invalid("Введите email");
          const badEmail = emailError(body.email);
          if (badEmail) invalid(badEmail);
          if (typeof body.password !== "string") invalid("Введите пароль");
          const badPassword = passwordError(body.password);
          if (badPassword) invalid(badPassword);
          return { context: { ...context, body: { ...body, name: name.data, email: body.email.trim(), timezone: timezone.data } } };
        }
        if (context.path === "/update-user") {
          if (Object.keys(body).some((field) => field !== "name" && field !== "timezone")) invalid("Можно изменить только имя и часовой пояс");
          const update = z.object({ name: nameSchema.optional(), timezone: timezoneSchema.optional() }).safeParse(body);
          if (!update.success) invalid(update.error.issues[0]?.message ?? "Проверьте настройки");
          return { context: { ...context, body: update.data } };
        }
        if (context.path === "/reset-password" || context.path === "/change-password") {
          if (typeof body.newPassword !== "string") invalid("Введите новый пароль");
          const badPassword = passwordError(body.newPassword);
          if (badPassword) invalid(badPassword);
        }
      }),
    },
    logger: {
      level: "warn",
      log: (level) => console.error("auth_event", { level }),
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
