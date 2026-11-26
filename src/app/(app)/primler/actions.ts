"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function saveRule(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const min = formNum(f, "min_amount");
  const value = formNum(f, "value");
  const kind = formStr(f, "kind") === "percent" ? "percent" : "fixed";
  const period = formStr(f, "period") === "daily" ? "daily" : "monthly";
  if (min == null || min < 0 || value == null || value < 0) return { error: "Tutar ve prim değerini girin." };
  if (kind === "percent" && value > 100) return { error: "Yüzde 100'den büyük olamaz." };
  const id = formStr(f, "id");
  const row = { min_amount: min, value, kind, is_active: f.get("is_active") !== "0" };
  const { error } = id
    ? await supabase.from("commission_rules").update(row).eq("id", Number(id))
    : await supabase.from("commission_rules").insert({ ...row, period, company_id: me.company_id });
  if (error) return { error: error.code === "23505" ? "Bu eşik tutarı zaten var." : error.message };
  revalidatePath("/primler");
  revalidatePath("/");
  return { ok: "Kaydedildi." };
}

export async function deleteRule(_: S, f: FormData): Promise<S> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("commission_rules").delete().eq("id", Number(f.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/primler");
  revalidatePath("/");
  return { ok: "Silindi." };
}

export async function setEligible(_: S, f: FormData): Promise<S> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ commission_eligible: f.get("eligible") === "1" }).eq("id", String(f.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/primler");
  return { ok: "Kaydedildi." };
}

export async function setSellerVisibility(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data: co } = await supabase.from("companies").select("settings").eq("id", me.company_id).single();
  const settings = { ...(co?.settings ?? {}), show_own_commission: f.get("show") === "1" };
  const { error } = await supabase.from("companies").update({ settings }).eq("id", me.company_id);
  if (error) return { error: error.message };
  revalidatePath("/primler");
  revalidatePath("/");
  return { ok: "Kaydedildi." };
}
