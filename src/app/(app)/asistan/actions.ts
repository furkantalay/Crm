"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formStr } from "@/lib/data";

export type ActionState = { ok?: string; error?: string } | null;

/** Serbest metni yapay zekâ ile görevlere böler; çalışana verilenler ona bildirim olarak gider. */
export async function assistantAdd(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await getMe();
  if (me.role !== "admin" && me.role !== "yonetici") return { error: "Yetkisiz." };
  const supabase = await createClient();
  const text = formStr(form, "text");
  if (!text) return { error: "Bir şey yazın ya da söyleyin." };
  const { data: people } = await supabase.from("profiles").select("id, full_name, role")
    .eq("is_active", true).neq("id", me.id).order("full_name");
  const { data: ai, error: aiErr } = await supabase.functions.invoke("ai", {
    body: { action: "assistant", text, people: (people ?? []).map((p) => ({ id: p.id, name: p.full_name, role: p.role })) },
  });
  type Item = { title: string; details: string | null; assignee_id: string | null; due_at: string | null };
  const items: Item[] = !aiErr && ai?.ok && ai.items?.length ? ai.items : [{ title: text.slice(0, 200), details: text.length > 200 ? text : null, assignee_id: null, due_at: null }];
  const { error } = await supabase.from("tasks").insert(items.map((i) => ({
    company_id: me.company_id, created_by: me.id, assignee: i.assignee_id, title: i.title, details: i.details,
    due_at: i.due_at ? `${i.due_at}:00+03:00` : null, source: ai?.ok ? "asistan" : "elle",
  })));
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/asistan");
  if (!ai?.ok) return { ok: "Not olduğu gibi kaydedildi (yapay zekâ şu an yanıt vermedi)." };
  return { ok: ai.reply || `${items.length} iş kaydedildi.` };
}

export async function setTaskStatus(_: ActionState, form: FormData): Promise<ActionState> {
  await getMe();
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_set_status", {
    p_id: Number(form.get("id")), p_status: String(form.get("status")), p_note: formStr(form, "note"),
  });
  if (error) return { error: error.message };
  revalidatePath("/asistan"); revalidatePath("/gorevler");
  return { ok: "Güncellendi." };
}
