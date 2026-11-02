import "server-only";
import { z } from "zod";

const noNewlines = (value: string) => !/[\r\n]/.test(value);

const schema = z.object({
  DATABASE_URL: z.url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
  BETTER_AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  }),
  BETTER_AUTH_SECRET: z.string().min(32),
  YANDEX_CLIENT_ID: z.string().optional(),
  YANDEX_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().min(1).refine(noNewlines),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_FROM: z.string().min(1).refine(noNewlines),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
}).superRefine((values, context) => {
  if (Boolean(values.SMTP_USER) !== Boolean(values.SMTP_PASSWORD)) {
    context.addIssue({ code: "custom", path: ["SMTP_USER"], message: "SMTP credentials must be provided together" });
  }
  if (process.env.NODE_ENV === "production" && new URL(values.BETTER_AUTH_URL).protocol !== "https:") {
    // A local production build can be previewed over loopback HTTP. Other hosts require HTTPS.
    const host = new URL(values.BETTER_AUTH_URL).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      context.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "HTTPS is required" });
    }
  }
});

export type ServerEnv = z.infer<typeof schema>;
let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    // Only configuration names are logged, never supplied values or Zod's raw input.
    throw new Error(`Не заполнены или неверны серверные настройки: ${fields.join(", ")}`);
  }
  cached = result.data;
  return cached;
}
