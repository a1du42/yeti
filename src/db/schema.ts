import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { FollowerEstimate, LaunchOrder, LaunchService } from "../lib/launch-orders";
import { launchCatalog, launchQuantityMax } from "../lib/launch-catalog";
import type { RecentLink } from "../lib/launch-recent";

const date = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").notNull(),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const launchRecent = pgTable("launch_recent", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  entries: jsonb("entries").$type<RecentLink[]>().notNull(),
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

const launchServiceIds = sql.raw(["viewers", "views", "followers", ...launchCatalog.map(service => service.id)].map(id => `'${id}'`).join(", "));

export const launchOrder = pgTable("launch_order", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  requestKey: text("request_key").notNull(),
  service: text("service").$type<LaunchService>().notNull(),
  platform: text("platform").$type<LaunchOrder["platform"]>().notNull(),
  kind: text("kind").$type<LaunchOrder["kind"]>().notNull(),
  url: text("url").notNull(),
  title: text("title"),
  thumbnail: text("thumbnail"),
  quantity: integer("quantity").notNull(),
  hours: integer("hours"),
  amountCents: integer("amount_cents").notNull(),
  createdAt: date("created_at").notNull(),
  endsAt: date("ends_at").notNull(),
  pausedAt: date("paused_at"),
  region: text("region").$type<LaunchOrder["region"]>().notNull().default("auto"),
  providerId: bigint("provider_id", { mode: "number" }),
  providerStatus: text("provider_status").$type<NonNullable<LaunchOrder["providerStatus"]>>(),
  followerIntervalSeconds: integer("follower_interval_seconds"),
  followerFloatingInterval: boolean("follower_floating_interval"),
  followerEstimate: jsonb("follower_estimate").$type<FollowerEstimate>(),
  followerStartCheckAt: date("follower_start_check_at"),
}, (table) => [
  uniqueIndex("launch_order_user_request_idx").on(table.userId, table.requestKey),
  index("launch_order_user_created_idx").on(table.userId, table.createdAt, table.id),
  uniqueIndex("launch_order_provider_idx").on(table.providerId),
  index("launch_order_follower_start_check_idx").on(table.followerStartCheckAt)
    .where(sql`${table.followerStartCheckAt} is not null`),
  check("launch_order_provider_state", sql`(${table.providerId} is null and (${table.providerStatus} is null or ${table.providerStatus} in ('submitting', 'unknown', 'rejected'))) or
    (${table.providerId} is not null and ${table.providerStatus} is not null and ${table.providerStatus} in ('created', 'awaiting', 'working', 'stopped', 'completed', 'failed', 'deleted', 'refunded'))`),
  check("launch_order_quantity", sql`${table.quantity} between 1 and ${sql.raw(String(launchQuantityMax))}`),
  check("launch_order_follower_settings", sql`(${table.followerIntervalSeconds} is null and ${table.followerFloatingInterval} is null) or
    (${table.service} = 'twitch-followers' and ${table.providerStatus} is not null and ${table.followerIntervalSeconds} is not null
      and ${table.followerIntervalSeconds} between 1 and 86400)`),
  check("launch_order_hours", sql`${table.hours} is null or ${table.hours} between 1 and 720`),
  check("launch_order_service", sql`${table.service} in (${launchServiceIds})`),
  check("launch_order_amount", sql`${table.amountCents} > 0 or (${table.amountCents} = 0 and ${table.service} = 'twitch-viewers-test')`),
  check("launch_order_end", sql`${table.endsAt} > ${table.createdAt}`),
]);

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
export const balanceAdjustment = pgTable("balance_adjustment", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  adminId: text("admin_id").notNull(),
  deltaCents: integer("delta_cents").notNull(),
  reason: text("reason").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
}, table => [
  index("balance_adjustment_user_created_idx").on(table.userId, table.createdAt),
  check("balance_adjustment_nonzero", sql`${table.deltaCents} <> 0`),
  check("balance_adjustment_reason_length", sql`char_length(${table.reason}) between 1 and 300`),
]);

export const pricingSettings = pgTable("pricing_settings", {
  id: integer("id").primaryKey().default(1),
  factor: integer("factor").notNull().default(100),
  revision: integer("revision").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: date("updated_at").notNull().defaultNow(),
}, table => [
  check("pricing_settings_singleton", sql`${table.id} = 1`),
  check("pricing_settings_factor_range", sql`${table.factor} between 1 and 10000`),
]);

export const userAdminEvent = pgTable("user_admin_event", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  adminId: text("admin_id").notNull(),
  action: text("action").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
}, table => [
  index("user_admin_event_user_idx").on(table.userId, table.createdAt),
  check("user_admin_event_action", sql`${table.action} in ('edit', 'block', 'unblock', 'delete')`),
]);
