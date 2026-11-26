"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead(): Promise<{ ok?: string; error?: string }> {
  const me = await getMe();
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", me.id).is("read_at", null);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: "Okundu." };
}
