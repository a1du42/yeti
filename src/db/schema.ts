import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const date = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: date("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: date("access_token_expires_at"),
  refreshTokenExpiresAt: date("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("account_user_id_idx").on(table.userId),
  uniqueIndex("account_provider_identity_idx").on(table.providerId, table.accountId),
]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: date("expires_at").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const payment = pgTable("payment", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  requestKey: text("request_key").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  feePayer: text("fee_payer").notNull(),
  providerId: text("provider_id").unique(),
  checkoutUrl: text("checkout_url"),
  status: text("status").notNull().default("creating"),
  creditedAt: date("credited_at"),
  creditCents: integer("credit_cents").notNull().default(0),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("payment_user_request_idx").on(table.userId, table.requestKey),
  index("payment_user_created_idx").on(table.userId, table.createdAt),
  check("payment_amount_positive", sql`${table.amountCents} > 0`),
  check("payment_currency_usd", sql`${table.currency} = 'USD'`),
  check("payment_fee_payer", sql`${table.feePayer} in ('merchant', 'customer')`),
]);

// Неизменяемые зачисления. Каждая подтверждённая общая сумма учитывается один раз.
export const paymentCredit = pgTable("payment_credit", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull().references(() => payment.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  confirmedTotalCents: integer("confirmed_total_cents").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
}, (table) => [
  index("payment_credit_user_idx").on(table.userId),
  uniqueIndex("payment_credit_total_idx").on(table.paymentId, table.confirmedTotalCents),
  check("payment_credit_positive", sql`${table.amountCents} > 0`),
]);
