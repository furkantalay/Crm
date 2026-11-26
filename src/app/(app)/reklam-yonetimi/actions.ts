"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;
const ALLOWED = ["admin", "yonetici", "dataci"];

function fields(f: FormData) {
  return {
    brand: formStr(f, "brand") ?? "-",
    started_at: formStr(f, "started_at"),
    monthly_fee: formNum(f, "monthly_fee") ?? 0,
    status: formStr(f, "status") ?? "devam",
    ended_at: formStr(f, "ended_at"),
    notes: formStr(f, "notes"),
  };
}

export async function addAdClient(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  if (!ALLOWED.includes(me.role)) return { error: "Yetkiniz yok." };
  const supabase = await createClient();
  const priv = me.role === "admin" && f.get("is_admin_private") === "1";
  const { error } = await supabase.from("ad_clients").insert({ company_id: me.company_id, ...fields(f), is_admin_private: priv });
  if (error) return { error: "Eklenemedi: " + error.message };
  revalidatePath("/reklam-yonetimi");
  revalidatePath("/");
  return { ok: "Kayıt eklendi." };
}

export async function updateAdClient(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  if (!ALLOWED.includes(me.role)) return { error: "Yetkiniz yok." };
  const supabase = await createClient();
  const { error } = await supabase.from("ad_clients").update(fields(f)).eq("id", Number(f.get("id")));
  if (error) return { error: "Güncellenemedi: " + error.message };
  revalidatePath("/reklam-yonetimi");
  revalidatePath("/");
  return { ok: "Güncellendi." };
}

export async function deactivateAdClient(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  if (!ALLOWED.includes(me.role)) return { error: "Yetkiniz yok." };
  const supabase = await createClient();
  const { error } = await supabase.from("ad_clients").update({ is_active: false }).eq("id", Number(f.get("id")));
  if (error) return { error: "Pasife alınamadı: " + error.message };
  revalidatePath("/reklam-yonetimi");
  revalidatePath("/");
  return { ok: "Pasife alındı." };
}
