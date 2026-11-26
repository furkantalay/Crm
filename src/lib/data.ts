import { createClient } from "@/lib/supabase/server";

export type Lookup = { id: string; category: string; label: string; is_won?: boolean };
export type Person = { id: string; full_name: string; role?: string; is_active?: boolean };

/** Şirketin aktif liste değerleri, kategoriye göre ayrılmış. */
export async function getLookups() {
  const supabase = await createClient();
  const { data } = await supabase.from("lookups").select("id, category, label, is_won")
    .eq("is_active", true).order("sort_order");
  const all = (data ?? []) as Lookup[];
  return { all, by: (cat: string) => all.filter((l) => l.category === cat) };
}

/** Satışçılar (varsayılan: sadece aktifler). */
export async function getSellers(includeInactive = false) {
  const supabase = await createClient();
  let q = supabase.from("profiles").select("id, full_name, is_active").eq("role", "satisci").order("full_name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Person[];
}

export async function getProducts() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, name, kind").eq("is_active", true)
    .order("kind", { ascending: false }).order("sort_order");
  return (data ?? []) as { id: string; name: string; kind: string }[];
}

/** URL arama parametrelerinden link üretici. */
export function linker(base: string, sp: Record<string, string | undefined>) {
  return (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
}

export const formStr = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
export const formNum = (f: FormData, k: string) => {
  const v = formStr(f, k);
  if (v == null) return null;
  // "1.234,50" ve "1234.50" ikisini de kabul et
  const norm = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};
