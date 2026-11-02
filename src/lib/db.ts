import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { getServerEnv } from "@/lib/env";

const state = globalThis as typeof globalThis & {
  yetiPool?: Pool;
  yetiDb?: NodePgDatabase<typeof schema>;
};

export function getPool(): Pool {
  if (!state.yetiPool) {
    state.yetiPool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
    });
    state.yetiPool.on("error", () => {
      console.error("database_connection_error");
    });
  }
  return state.yetiPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  state.yetiDb ??= drizzle(getPool(), { schema });
  return state.yetiDb;
}
