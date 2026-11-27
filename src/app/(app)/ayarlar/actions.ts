"use server";

import { revalidatePath } from "next/cache";
import { PERMS, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function saveCompany(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const minutes = formNum(f, "default_logout_minutes");
  const { error } = await supabase.from("companies").update({
    name: formStr(f, "name") ?? undefined,
    default_logout_minutes: minutes && minutes > 0 ? Math.round(minutes) : 30,
  }).eq("id", me.company_id);
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/ayarlar");
  return { ok: "Kaydedildi." };
}

export async function addLookup(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const label = formStr(f, "label");
  const category = formStr(f, "category");
  if (!label || !category) return { error: "Değer yazın." };
  const { data: last } = await supabase.from("lookups").select("sort_order").eq("category", category)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("lookups").insert({
    company_id: me.company_id, category, label, sort_order: (last?.sort_order ?? 0) + 1,
    is_won: category === "contact_status" && f.get("is_won") === "1",
  });
  if (error) return { error: error.code === "23505" ? "Bu değer zaten var." : "Eklenemedi: " + error.message };
  revalidatePath("/ayarlar");
  return { ok: "Eklendi." };
}

export async function updateLookup(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const { error } = await supabase.from("lookups").update({
    label: formStr(f, "label") ?? undefined,
    sort_order: formNum(f, "sort_order") ?? 0,
    is_active: f.get("is_active") === "1",
  }).eq("id", String(f.get("id")));
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/ayarlar");
  return { ok: "Kaydedildi." };
}

export async function saveManagerPerms(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("settings").eq("id", me.company_id).single();
  const manager_can = Object.fromEntries(PERMS.map((p) => [p.key, f.get(p.key) === "1"]));
  const settings = { ...(co?.settings ?? {}), manager_can };
  const { error } = await supabase.from("companies").update({ settings }).eq("id", me.company_id);
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/", "layout");
  return { ok: "Kaydedildi. Yöneticinin ekranı bir sonraki sayfa açılışında güncellenir." };
}
