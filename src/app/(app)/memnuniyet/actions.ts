"use server";

import { revalidatePath } from "next/cache";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function updateSatisfaction(_: S, f: FormData): Promise<S> {
  const supabase = await createClient();
  const status = formStr(f, "status") ?? "bekliyor";
  const { error } = await supabase.from("satisfaction_calls").update({
    status, note: formStr(f, "note"),
    called_at: status === "bekliyor" ? null : new Date().toISOString(),
  }).eq("id", Number(f.get("id")));
  if (error) return { error: "Güncellenemedi: " + error.message };
  revalidatePath("/memnuniyet");
  return { ok: "Kaydedildi." };
}

/** Bir sorumlunun memnuniyet aramalarını seçilen aktif satışçılara eşit dağıtır. Satışı yapan değişmez. */
export async function redistribute(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  if (!isStaff(me.role) || me.role === "teknik") return { error: "Yetkiniz yok." };
  const supabase = await createClient();
  const from = formStr(f, "from_id");
  const targets = f.getAll("to_ids").map(String).filter((x) => x && x !== from);
  const scope = formStr(f, "scope") ?? "bekliyor";
  if (!from) return { error: "Mevcut sorumluyu seçin." };
  if (!targets.length) return { error: "En az bir satışçı seçin." };

  let q = supabase.from("satisfaction_calls").select("id").eq("responsible_id", from).order("id");
  if (scope === "bekliyor") q = q.eq("status", "bekliyor");
  const { data, error } = await q;
  if (error) return { error: error.message };
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return { error: "Dağıtılacak kayıt yok." };

  // Sırayla eşit dağıt (A, B, C, A, B, C …)
  const buckets = new Map<string, number[]>(targets.map((t) => [t, []]));
  ids.forEach((id, i) => buckets.get(targets[i % targets.length])!.push(id));
  for (const [to, list] of buckets) {
    if (!list.length) continue;
    const { error: e } = await supabase.from("satisfaction_calls").update({ responsible_id: to }).in("id", list);
    if (e) return { error: "Dağıtım yarıda kaldı: " + e.message };
  }
  revalidatePath("/memnuniyet");
  return { ok: `${ids.length} kayıt ${targets.length} satışçıya dağıtıldı.` };
}
