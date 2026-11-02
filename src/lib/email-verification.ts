import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { user, verification } from "@/db/schema";
import { getDb } from "@/lib/db";

class InvalidEmailVerification extends Error {}

export async function confirmEmail(token: string): Promise<boolean> {
  if (!token || token.length > 4_096) return false;
  // Only exact tokens issued by the server have a matching digest. JWT claims are never trusted here.
  const identifier = `email-verification:${createHash("sha256").update(token).digest("hex")}`;
  try {
    return await getDb().transaction(async (transaction) => {
      const [pending] = await transaction.delete(verification).where(and(
        eq(verification.identifier, identifier),
        gt(verification.expiresAt, new Date()),
      )).returning({ userId: verification.value });
      if (!pending) throw new InvalidEmailVerification();

      const [confirmed] = await transaction.update(user).set({
        emailVerified: true,
        updatedAt: new Date(),
      }).where(and(
        eq(user.id, pending.userId),
        eq(user.emailVerified, false),
      )).returning({ id: user.id });
      if (!confirmed) throw new InvalidEmailVerification();
      return true;
    });
  } catch (error) {
    if (error instanceof InvalidEmailVerification) return false;
    throw error;
  }
}
