"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ImportRow = Record<string, string>;
export type ImportResult = { ok?: string; error?: string; created?: number; duplicates?: number; skipped?: number };

const norm = (p: string) => (p ?? "").replace(/\D/g, "").slice(-10);

/** "26.11.2026 15:18", "2026-11-26", Excel tarih nesnesinden gelen ISO metni… → İstanbul saatli ISO */
function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "12").padStart(2, "0")}:${m[5] ?? "00"}:00+03:00`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "12"}:${m[5] ?? "00"}:00+03:00`;
  return null;
}

export async function importCustomers(input: {
  rows: ImportRow[]; sellerIds: string[]; dataTypeId: string | null; note: string | null; offset: number;
}): Promise<ImportResult> {
  const me = await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  const rows = input.rows.filter((r) => norm(r.phone).length >= 10);
  const skipped = input.rows.length - rows.length;
  if (!rows.length) return { created: 0, duplicates: 0, skipped };

  const { data: newStatus } = await supabase.from("lookups").select("id").eq("category", "contact_status").eq("label", "Yeni").maybeSingle();

  // Var olan telefonlar → mükerrer
  const phones = [...new Set(rows.map((r) => norm(r.phone)))];
  const existing = new Map<string, { id: number; assigned_to: string | null }>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase.from("customers").select("id, phone_norm, assigned_to").in("phone_norm", phones.slice(i, i + 200));
    (data ?? []).forEach((c) => existing.set(c.phone_norm, { id: c.id, assigned_to: c.assigned_to }));
  }

  let created = 0, duplicates = 0;
  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const dupNotes: Record<string, unknown>[] = [];
  rows.forEach((r, i) => {
    const pn = norm(r.phone);
    const when = parseDate(r.date) ?? new Date().toISOString();
    const ex = existing.get(pn);
    if (ex || seen.has(pn)) {
      if (ex) dupNotes.push({ company_id: me.company_id, customer_id: ex.id, user_id: me.id, channel: "Mükerrer Data",
        note: `Tekrar başvuru (toplu aktarım)${r.note ? ": " + r.note : ""}`, created_at: when });
      duplicates++;
      return;
    }
    seen.add(pn);
    const seller = input.sellerIds.length ? input.sellerIds[(input.offset + created) % input.sellerIds.length] : null;
    toInsert.push({
      company_id: me.company_id, full_name: r.name?.trim() || "İsimsiz", phone: r.phone.trim(),
      email: r.email || null, city: r.city || null, sector: r.sector || null,
      data_type_id: input.dataTypeId, status_id: newStatus?.id ?? null,
      assigned_to: seller, assigned_by: seller ? me.id : null,
      last_note: r.note || input.note || null, applied_at: when, last_action_at: when,
      extra: { problem: r.problem || undefined, import_row: input.offset + i + 2 },
    });
    created++;
  });

  if (toInsert.length) {
    const { data: ins, error } = await supabase.from("customers").insert(toInsert).select("id");
    if (error) return { error: "Datalar eklenemedi: " + error.message };
    // Geçmişe "Excel ile eklendi" notu (müşterinin son not/işlemini değiştirmeden)
    await supabase.from("interactions").insert((ins ?? []).map((c) => ({
      company_id: me.company_id, customer_id: c.id, user_id: me.id, channel: "Excel", note: input.note ?? "Toplu aktarım ile eklendi",
    })));
  }
  if (dupNotes.length) await supabase.from("interactions").insert(dupNotes);
  revalidatePath("/datalar");
  return { created, duplicates, skipped };
}

export async function importSatisfaction(input: { rows: ImportRow[] }): Promise<ImportResult> {
  const me = await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  const { data: people } = await supabase.from("profiles").select("id, full_name, username");
  const byName = new Map<string, string>();
  (people ?? []).forEach((p) => {
    byName.set(p.full_name.toLocaleLowerCase("tr"), p.id);
    byName.set(p.username.toLocaleLowerCase("tr"), p.id);
  });

  let created = 0, duplicates = 0, skipped = 0;
  for (const r of input.rows) {
    const pn = norm(r.phone);
    if (pn.length < 10) { skipped++; continue; }
    const { data: c } = await supabase.from("customers").select("id").eq("phone_norm", pn).limit(1).maybeSingle();
    if (!c) { skipped++; continue; }
    const { data: sale } = await supabase.from("sales").select("id, seller_id").eq("customer_id", c.id).eq("is_active", true)
      .order("order_date", { ascending: false }).limit(1).maybeSingle();
    const { count } = await supabase.from("satisfaction_calls").select("id", { count: "exact", head: true })
      .eq("customer_id", c.id).match(sale ? { sale_id: sale.id } : {});
    if (count) { duplicates++; continue; }
    const resp = r.responsible ? byName.get(r.responsible.trim().toLocaleLowerCase("tr")) : undefined;
    const { error } = await supabase.from("satisfaction_calls").insert({
      company_id: me.company_id, customer_id: c.id, sale_id: sale?.id ?? null, sold_by: sale?.seller_id ?? null,
      responsible_id: resp ?? sale?.seller_id ?? null, note: r.note || null,
    });
    if (error) return { error: "Aktarım yarıda kaldı: " + error.message, created, duplicates, skipped };
    created++;
  }
  revalidatePath("/memnuniyet");
  return { created, duplicates, skipped };
}
