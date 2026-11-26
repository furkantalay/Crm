"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formNum, formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function addProduct(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const name = formStr(f, "name");
  if (!name) return { error: "Ad yazın." };
  const kind = formStr(f, "kind") === "package" ? "package" : "program";
  const { data: last } = await supabase.from("products").select("sort_order").eq("kind", kind)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const includes = f.getAll("includes").map(String).filter(Boolean);
  const { error } = await supabase.from("products").insert({
    company_id: me.company_id, name, kind, list_price: formNum(f, "list_price"),
    includes: kind === "package" ? includes : null, sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) return { error: error.code === "23505" ? "Bu ad zaten var." : "Eklenemedi: " + error.message };
  revalidatePath("/egitimler");
  return { ok: "Eklendi." };
}

export async function updateProduct(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const includes = f.getAll("includes").map(String).filter(Boolean);
  const patch: Record<string, unknown> = {
    name: formStr(f, "name") ?? undefined, list_price: formNum(f, "list_price"),
    sort_order: formNum(f, "sort_order") ?? 0, is_active: f.get("is_active") === "1",
  };
  if (f.has("includes") || includes.length) patch.includes = includes;
  const { error } = await supabase.from("products").update(patch).eq("id", String(f.get("id")));
  if (error) return { error: "Kaydedilemedi: " + error.message };
  revalidatePath("/egitimler");
  return { ok: "Kaydedildi." };
}
