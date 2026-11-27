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
