"use server";

import { revalidatePath } from "next/cache";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function addExpected(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  const supabase = await createClient();
  const customerId = Number(f.get("customer_id"));
  if (!customerId) return { error: "Müşteri seçin." };
  const at = formStr(f, "expected_at");
  const { error } = await supabase.from("expected_sales").insert({
    company_id: me.company_id, customer_id: customerId,
    seller_id: isStaff(me.role) ? (formStr(f, "seller_id") ?? me.id) : me.id,
    expected_at: at ? `${at}:00+03:00` : null, amount: formNum(f, "amount"), note: formStr(f, "note"),
  });
  if (error) return { error: "Eklenemedi: " + error.message };
  revalidatePath("/beklenen-satislar");
  revalidatePath(`/datalar/${customerId}`);
  return { ok: "Beklenen satış eklendi." };
}

export async function updateExpected(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  const supabase = await createClient();
  const id = Number(f.get("id"));
  const at = formStr(f, "expected_at");
  const patch: Record<string, unknown> = {
    expected_at: at ? `${at}:00+03:00` : null, amount: formNum(f, "amount"),
    status: formStr(f, "status") ?? "bekliyor", note: formStr(f, "note"), updated_at: new Date().toISOString(),
  };
  if (isStaff(me.role) && formStr(f, "seller_id")) patch.seller_id = formStr(f, "seller_id");
  const { error } = await supabase.from("expected_sales").update(patch).eq("id", id);
  if (error) return { error: "Güncellenemedi: " + error.message };
  revalidatePath("/beklenen-satislar");
  return { ok: "Kaydedildi." };
}
