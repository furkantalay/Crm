"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePerm, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

type S = { ok?: string; error?: string; link?: string } | null;

async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

/** Yönetici, admin hesabına dokunamaz. */
async function guardTarget(targetId: string) {
  const me = await requireRole(["admin", "yonetici"]); await requirePerm("users");
  const supabase = await createClient();
  const { data: t } = await supabase.from("profiles").select("id, role").eq("id", targetId).single();
  if (!t) return { me, supabase, error: "Kullanıcı bulunamadı." };
  if (me.role !== "admin" && t.role === "admin") return { me, supabase, error: "Admin hesabını yalnız admin değiştirebilir." };
  return { me, supabase, error: null as string | null };
}

export async function createUser(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici"]); await requirePerm("users");
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: {
      full_name: formStr(f, "full_name"), username: formStr(f, "username"), role: formStr(f, "role"),
      auto_logout_enabled: f.get("auto_logout_enabled") === "1", auto_logout_minutes: formNum(f, "auto_logout_minutes"),
    },
  });
  if (error || !data?.token) {
    let msg = "Kullanıcı oluşturulamadı.";
    try { const b = await (error as { context?: Response })?.context?.json(); if (b?.error) msg = b.error; } catch {}
    return { error: msg };
  }
  revalidatePath("/kullanicilar");
  return { ok: `${data.username} oluşturuldu. Aşağıdaki bağlantıyı kişiye gönderin; şifresini kendisi belirleyecek (72 saat geçerli).`,
           link: `${await siteUrl()}/sifre-belirle?t=${data.token}` };
}

export async function passwordLink(_: S, f: FormData): Promise<S> {
  const id = String(f.get("id"));
  const { supabase, error: ge } = await guardTarget(id);
  if (ge) return { error: ge };
  const { data, error } = await supabase.rpc("create_password_setup_token", { target_user: id, valid_hours: 48 });
  if (error || !data) return { error: "Bağlantı oluşturulamadı: " + (error?.message ?? "") };
  return { ok: "Şifre belirleme bağlantısı (48 saat geçerli, tek kullanımlık):", link: `${await siteUrl()}/sifre-belirle?t=${data}` };
}

export async function updateUser(_: S, f: FormData): Promise<S> {
  const id = String(f.get("id"));
  const { me, supabase, error: ge } = await guardTarget(id);
  if (ge) return { error: ge };
  const role = formStr(f, "role");
  if (role === "admin" && me.role !== "admin") return { error: "Admin rolünü yalnız admin verebilir." };
  if (id === me.id && role && role !== me.role) return { error: "Kendi rolünüzü değiştiremezsiniz." };
  const { error } = await supabase.from("profiles").update({
    full_name: formStr(f, "full_name") ?? undefined,
    ...(role ? { role } : {}),
    auto_logout_enabled: f.get("auto_logout_enabled") === "1",
    auto_logout_minutes: formNum(f, "auto_logout_minutes"),
  }).eq("id", id);
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/kullanicilar");
  revalidatePath("/ayarlar");
  return { ok: "Kaydedildi." };
}

export async function setUserActive(_: S, f: FormData): Promise<S> {
  const id = String(f.get("id"));
  const { me, supabase, error: ge } = await guardTarget(id);
  if (ge) return { error: ge };
  if (id === me.id) return { error: "Kendinizi pasife alamazsınız." };
  const active = f.get("active") === "1";
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return { error: "Güncellenemedi: " + error.message };
  revalidatePath("/kullanicilar");
  return { ok: active ? "Kullanıcı aktif." : "Kullanıcı pasife alındı; artık giriş yapamaz." };
}
