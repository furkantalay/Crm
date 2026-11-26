"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function addNote(_: S, f: FormData): Promise<S> {
  const me = await requireRole(["admin", "yonetici", "dataci", "teknik"]);
  const body = formStr(f, "body");
  if (!body) return { error: "Not yazın." };
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({ company_id: me.company_id, body, created_by: me.id });
  if (error) return { error: "Yayınlanamadı: " + error.message };
  revalidatePath("/", "layout");
  return { ok: "Yayınlandı." };
}

export async function toggleNote(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici", "dataci", "teknik"]);
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").update({ is_active: f.get("active") === "1" }).eq("id", Number(f.get("id")));
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Güncellendi." };
}
