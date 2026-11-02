import "server-only";
import { after } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";
import { getServerEnv } from "@/lib/env";

let transport: Transporter | undefined;

function getTransport(): Transporter {
  if (transport) return transport;
  const env = getServerEnv();
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return transport;
}

type Purpose = "verification" | "password-reset";

export function scheduleAuthMail(purpose: Purpose, email: string, url: string): void {
  // Delivery happens after the uniform public response, so account existence is not exposed by SMTP timing.
  after(async () => {
    try {
      const env = getServerEnv();
      const subject = purpose === "verification" ? "Подтвердите email в YETI STREAM" : "Восстановление доступа к YETI STREAM";
      const instruction = purpose === "verification" ? "Чтобы подтвердить email, откройте ссылку:" : "Чтобы установить новый пароль, откройте ссылку:";
      await getTransport().sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject,
        text: `${instruction}\n\n${url}\n\nСсылка действует 1 час. Если вы не запрашивали это письмо, просто закройте его.`,
      });
    } catch {
      // Transport errors may contain recipient addresses and tokens; never log the raw error.
      console.error("auth_mail_delivery_failed", { purpose });
    }
  });
}
