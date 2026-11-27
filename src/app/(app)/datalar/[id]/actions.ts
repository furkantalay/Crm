"use server";

import { revalidatePath } from "next/cache";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

export type ActionState = { ok?: string; error?: string } | null;

const str = formStr;
const numOf = formNum;

export async function addInteraction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getMe();
  const supabase = await createClient();
  const customerId = Number(form.get("customer_id"));
  const note = str(form, "note");
  const statusId = str(form, "status_id");
  if (!note && !statusId) return { error: "Not yazın veya durum seçin." };
  const followup = str(form, "next_followup_at");
  const { error } = await supabase.from("interactions").insert({
    company_id: me.company_id, customer_id: customerId, user_id: me.id,
    note, status_id: statusId, channel: str(form, "channel") ?? "Telefon",
    next_followup_at: followup ? `${followup}:00+03:00` : null,
  });
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath(`/datalar/${customerId}`);
  return { ok: "Görüşme kaydedildi." };
}

export async function addSale(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getMe();
  const supabase = await createClient();
  const customerId = Number(form.get("customer_id"));
  const amount = numOf(form, "amount");
  if (!amount || amount <= 0) return { error: "Tutar girin." };
  const sellerId = isStaff(me.role) ? (str(form, "seller_id") ?? me.id) : me.id;
  const productIds = form.getAll("product_ids").map(String).filter(Boolean);

  const { data: sale, error } = await supabase.from("sales").insert({
    company_id: me.company_id, customer_id: customerId, seller_id: sellerId, created_by: me.id,
    order_date: str(form, "order_date") ?? undefined, amount, net_amount: numOf(form, "net_amount") ?? amount,
    payer_name: str(form, "payer_name"), bank_id: str(form, "bank_id"),
    sale_source_id: str(form, "sale_source_id"), payment_method_id: str(form, "payment_method_id"),
    installments: numOf(form, "installments"), data_type_id: str(form, "data_type_id"), note: str(form, "note"),
  }).select("id").single();
  if (error || !sale) return { error: "Satış kaydedilemedi: " + (error?.message ?? "") };

  if (productIds.length) {
    const { error: pe } = await supabase.from("sale_products").insert(productIds.map((p) => ({ sale_id: sale.id, product_id: p })));
    if (pe) return { error: "Satış kaydedildi ama eğitimler eklenemedi: " + pe.message };
  }
  // Müşteri durumunu "Satış" yap ve geçmişe yaz
  const { data: won } = await supabase.from("lookups").select("id").eq("category", "contact_status").eq("is_won", true).limit(1).maybeSingle();
  await supabase.from("interactions").insert({
    company_id: me.company_id, customer_id: customerId, user_id: me.id, status_id: won?.id ?? null,
    channel: "Satış", note: `Satış eklendi: ${amount.toLocaleString("tr-TR")} ₺`,
  });
  revalidatePath(`/datalar/${customerId}`);
  revalidatePath("/satislar");
  revalidatePath("/");
  return { ok: "Satış kaydedildi." };
}

export async function updateAssignment(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getMe();
  if (!isStaff(me.role)) return { error: "Yetkiniz yok." };
  const supabase = await createClient();
  const customerId = Number(form.get("customer_id"));
  const sellerId = str(form, "seller_id");
  const { error } = await supabase.from("customers")
    .update({ assigned_to: sellerId, assigned_by: me.id }).eq("id", customerId);
  if (error) return { error: "Atama yapılamadı: " + error.message };
  revalidatePath(`/datalar/${customerId}`);
  return { ok: "Satışçı atandı." };
}

export async function setActive(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getMe();
  if (!isStaff(me.role)) return { error: "Yetkiniz yok." };
  const supabase = await createClient();
  const customerId = Number(form.get("customer_id"));
  const active = form.get("active") === "1";
  const { error } = await supabase.from("customers").update({
    is_active: active,
    deactivated_at: active ? null : new Date().toISOString(),
    deactivated_by: active ? null : me.id,
  }).eq("id", customerId);
  if (error) return { error: "Güncellenemedi: " + error.message };
  revalidatePath(`/datalar/${customerId}`);
  return { ok: active ? "Data tekrar aktif." : "Data pasife alındı." };
}

type LinkState = { ok?: string; error?: string; link?: string } | null;

async function fnError(error: unknown, fallback: string) {
  try { const b = await (error as { context?: Response })?.context?.json(); if (b?.error) return b.error as string; } catch {}
  return fallback;
}

export async function createPaymentLink(_: LinkState, form: FormData): Promise<LinkState> {
  await getMe();
  const supabase = await createClient();
  const customerId = Number(form.get("customer_id"));
  const amount = numOf(form, "amount");
  if (!amount || amount <= 0) return { error: "Tutar girin." };
  const { data, error } = await supabase.functions.invoke("iyzico-link", {
    body: { action: "create", customer_id: customerId, amount, product_ids: form.getAll("product_ids").map(String).filter(Boolean),
            description: str(form, "description") },
  });
  if (error || !data?.url) return { error: await fnError(error, "Bağlantı oluşturulamadı.") };
  revalidatePath(`/datalar/${customerId}`);
  return { ok: "Bağlantı hazır. Kopyalayıp müşteriye gönderin; ödeme gelince satış kendiliğinden girilir.", link: data.url };
}

export async function cancelPaymentLink(_: LinkState, form: FormData): Promise<LinkState> {
  await getMe();
  const supabase = await createClient();
  const { error } = await supabase.functions.invoke("iyzico-link", { body: { action: "cancel", id: Number(form.get("id")) } });
  if (error) return { error: await fnError(error, "İptal edilemedi.") };
  revalidatePath(`/datalar/${Number(form.get("customer_id"))}`);
  return { ok: "İptal edildi." };
}

export async function aiSummarize(_: ActionState, form: FormData): Promise<ActionState> {
  await getMe();
  const supabase = await createClient();
  const customerId = Number(form.get("customer_id"));
  const { data, error } = await supabase.functions.invoke("ai", { body: { action: "summary", customer_id: customerId } });
  if (error || !data?.ok) return { error: await fnError(error, "Yapay zekâ şu an yanıt vermedi, biraz sonra tekrar deneyin.") };
  revalidatePath(`/datalar/${customerId}`);
  return { ok: "Özet güncellendi." };
}
