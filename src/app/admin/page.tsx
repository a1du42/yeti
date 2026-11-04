import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminSession } from "@/lib/admin";
import { readPricing } from "@/lib/pricing";
import { searchUsers } from "./actions";
import { AdminShell } from "./admin-shell";
import { BalanceAdmin } from "./balance-admin";
import { PricingForm } from "./pricing-form";
import styles from "./admin.module.css";

type PageProps = { searchParams: Promise<{ section?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return { title: (await searchParams).section === "users" ? "Пользователи · Управление" : "Общие · Управление" };
}

export default async function AdminPage({ searchParams }: PageProps) {
  if (!(await adminSession())) notFound();
  if ((await searchParams).section === "users") {
    return <AdminShell section="users"><BalanceAdmin initial={await searchUsers({}, undefined)} /></AdminShell>;
  }
  const settings = await readPricing().catch(() => null);
  return <AdminShell section="general">
    {settings ? <PricingForm initial={settings} /> : <section className={styles.panel}>
      <p className="error" role="alert">Не удалось загрузить коэффициент цен.</p>
      <a href="/admin">Обновить страницу</a>
    </section>}
  </AdminShell>;
}
