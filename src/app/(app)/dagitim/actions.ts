"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type S = { ok?: string; error?: string } | null;

export async function setReceivesLeads(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ receives_leads: f.get("on") === "1" }).eq("id", String(f.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/dagitim");
  return { ok: "Kaydedildi." };
}

export async function setFunnelAuto(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("settings").eq("id", me.company_id).single();
  const settings = { ...(co?.settings ?? {}), funnel_auto_create: f.get("on") === "1" };
  const { error } = await supabase.from("companies").update({ settings }).eq("id", me.company_id);
  if (error) return { error: error.message };
  revalidatePath("/dagitim");
  return { ok: "Kaydedildi." };
}

export async function saveSpeed(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const n = (k: string, d: number) => { const v = Number(f.get(k)); return Number.isFinite(v) && v > 0 ? Math.round(v) : d; };
  const t = (k: string, d: string) => { const v = String(f.get(k) ?? ""); return /^\d{2}:\d{2}$/.test(v) ? v : d; };
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => f.get(`d${d}`) === "1");
  const seller_min = n("seller_min", 5), manager_min = Math.max(n("manager_min", 15), seller_min + 1);
  const { data: co } = await supabase.from("companies").select("settings").eq("id", me.company_id).single();
  const settings = { ...(co?.settings ?? {}), speed: { seller_min, manager_min, start: t("start", "09:00"), end: t("end", "19:00"), days: days.length ? days : [1, 2, 3, 4, 5, 6] } };
  const { error } = await supabase.from("companies").update({ settings }).eq("id", me.company_id);
  if (error) return { error: error.message };
  revalidatePath("/dagitim");
  return { ok: "Kaydedildi." };
}
