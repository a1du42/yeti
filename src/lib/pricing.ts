import "server-only";
import { eq } from "drizzle-orm";
import { pricingSettings } from "@/db/schema";
import { getDb } from "./db";

export async function readPricing() {
  const [settings] = await getDb().select({ factor: pricingSettings.factor, revision: pricingSettings.revision })
    .from(pricingSettings).where(eq(pricingSettings.id, 1));
  if (!settings) throw new Error("Pricing settings are missing");
  return settings;
}
