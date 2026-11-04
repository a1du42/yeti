export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.STREAMSKILL_LIVE_ENABLED !== "true" ||
    process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkPendingFollowerStarts } = await import("./lib/streamskill-orders");
  const state = globalThis as typeof globalThis & { yetiFollowerStartWorker?: NodeJS.Timeout };
  if (state.yetiFollowerStartWorker) return;

  let running = false;
  state.yetiFollowerStartWorker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await checkPendingFollowerStarts();
    } catch {
      console.error("streamskill_follower_worker_failed");
    } finally {
      running = false;
    }
  }, 5_000).unref();
}
