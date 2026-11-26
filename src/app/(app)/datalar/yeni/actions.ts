"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function createCustomer(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  const name = formStr(f, "full_name");
  const phone = formStr(f, "phone");
  if (!name || !phone) return { error: "Ad ve telefon gerekli." };
  const pn = phone.replace(/\D/g, "").slice(-10);
  if (pn.length < 10) return { error: "Telefon numarası eksik görünüyor." };

  const { data: dup } = await supabase.from("customers").select("id, full_name").eq("phone_norm", pn).limit(1).maybeSingle();
  if (dup) return { error: `Bu telefon zaten kayıtlı: ${dup.full_name} (#${dup.id}). Mevcut kayda görüşme ekleyin.` };

  const { data: st } = await supabase.from("lookups").select("id").eq("category", "contact_status").eq("label", "Yeni").maybeSingle();
  const seller = formStr(f, "seller_id");
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("customers").insert({
    company_id: me.company_id, full_name: name, phone, email: formStr(f, "email"), city: formStr(f, "city"),
    sector: formStr(f, "sector"), data_type_id: formStr(f, "data_type_id"), status_id: st?.id ?? null,
    assigned_to: seller, assigned_by: seller ? me.id : null, last_note: formStr(f, "note"),
    applied_at: now, last_action_at: now, extra: { problem: formStr(f, "problem") ?? undefined },
  }).select("id").single();
  if (error || !data) return { error: "Kaydedilemedi: " + (error?.message ?? "") };
  redirect(`/datalar/${data.id}`);
}
