"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type S = { ok?: string; error?: string } | null;

export async function syncNow(): Promise<S> {
  await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("iyzico-sync", { body: {} });
  if (error || data?.error) {
    let msg = data?.error ?? "Senkronizasyon başarısız.";
    try { const b = await (error as { context?: Response })?.context?.json(); if (b?.error) msg = b.error; } catch {}
    return { error: msg };
  }
  revalidatePath("/iyzico");
  revalidatePath("/satislar");
  revalidatePath("/");
  const errs = data.errors?.length ? ` · ${data.errors.length} günde hata` : "";
  return { ok: `${data.fetched} işlem çekildi, ${data.matched} satış otomatik eşleşti${errs}.` };
}

export async function matchManually(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  const tx = Number(f.get("transaction_id"));
  const sale = Number(f.get("sale_id"));
  if (!tx) return { error: "Bir iyzico ödemesi seçin." };
  const { error } = await supabase.rpc("iyzico_manual_match", { p_transaction: tx, p_sale: sale });
  if (error) return { error: error.message };
  revalidatePath("/iyzico");
  revalidatePath("/satislar");
  return { ok: "Eşleştirildi; bize gelen tutar güncellendi." };
}

export async function unmatch(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("iyzico_unmatch", { p_sale: Number(f.get("sale_id")) });
  if (error) return { error: error.message };
  revalidatePath("/iyzico");
  return { ok: "Eşleştirme kaldırıldı." };
}
