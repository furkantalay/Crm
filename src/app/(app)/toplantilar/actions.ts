"use server";

import { revalidatePath } from "next/cache";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function addMeeting(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  const supabase = await createClient();
  const customerId = Number(f.get("customer_id"));
  const at = formStr(f, "scheduled_at");
  if (!customerId) return { error: "Müşteri seçin." };
  if (!at) return { error: "Tarih ve saat seçin." };
  let sellerId = isStaff(me.role) ? formStr(f, "seller_id") : me.id;
  if (!sellerId) {
    // Satışçı seçilmediyse: müşterinin son satışını yapan kişi
    const { data: s } = await supabase.from("sales").select("seller_id").eq("customer_id", customerId)
      .eq("is_active", true).order("order_date", { ascending: false }).limit(1).maybeSingle();
    sellerId = s?.seller_id ?? me.id;
  }
  const { error } = await supabase.from("meetings").insert({
    company_id: me.company_id, customer_id: customerId, created_by: me.id,
    seller_id: sellerId,
    scheduled_at: `${at}:00+03:00`, status: formStr(f, "status") ?? "planlandi",
    title: formStr(f, "title"), note: formStr(f, "note"),
  });
  if (error) return { error: "Eklenemedi: " + error.message };
  revalidatePath("/toplantilar");
  revalidatePath(`/datalar/${customerId}`);
  return { ok: "Toplantı plana eklendi." };
}

export async function updateMeeting(_: S, f: FormData): Promise<S> {
  const supabase = await createClient();
  const at = formStr(f, "scheduled_at");
  const { error } = await supabase.from("meetings").update({
    status: formStr(f, "status") ?? "planlandi", note: formStr(f, "note"),
    ...(at ? { scheduled_at: `${at}:00+03:00` } : {}),
  }).eq("id", Number(f.get("id")));
  if (error) return { error: "Güncellenemedi: " + error.message };
  revalidatePath("/toplantilar");
  return { ok: "Kaydedildi." };
}
