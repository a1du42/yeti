import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { readPricing } from "@/lib/pricing";
import { readLaunchCatalog, streamSkillLiveEnabled } from "@/lib/streamskill";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user.emailVerified) return NextResponse.json({ error: "Войдите снова." }, { status: 401, headers });
    const [entries, pricing] = await Promise.all([readLaunchCatalog(), readPricing()]);
    return NextResponse.json({ entries, priceFactor: pricing.factor, live: streamSkillLiveEnabled() }, { headers });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить каталог услуг." }, { status: 503, headers });
  }
}
