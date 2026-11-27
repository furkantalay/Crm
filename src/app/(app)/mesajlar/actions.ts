"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMe, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formStr } from "@/lib/data";

type S = { ok?: string; error?: string } | null;

export async function openDm(f: FormData) {
  await getMe();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_dm", { p_other: String(f.get("user_id")) });
  if (error || !data) redirect("/mesajlar");
  redirect(`/mesajlar?oda=${data}`);
}

export async function createGroup(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const name = formStr(f, "name");
  if (!name) return { error: "Grup adı yazın." };
  const { data, error } = await supabase.rpc("chat_group", {
    p_name: name, p_members: f.getAll("members").map(String), p_kind: f.get("kind") === "announce" ? "announce" : "group",
  });
  if (error) return { error: error.message };
  revalidatePath("/mesajlar");
  redirect(`/mesajlar?oda=${data}`);
}

export async function setMember(_: S, f: FormData): Promise<S> {
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("chat_set_member", {
    p_room: Number(f.get("room_id")), p_user: String(f.get("user_id")), p_on: f.get("on") === "1",
  });
  if (error) return { error: error.message };
  revalidatePath("/mesajlar");
  return { ok: "Güncellendi." };
}

/** Data kartından bir sohbete data paylaş */
export async function shareCustomer(_: S, f: FormData): Promise<S> {
  const me = await getMe();
  const supabase = await createClient();
  const room = Number(f.get("room_id"));
  const customerId = Number(f.get("customer_id"));
  const body = formStr(f, "body") ?? "Bu dataya bakar mısın?";
  if (!room) return { error: "Kime gönderileceğini seçin." };
  const { error } = await supabase.from("chat_messages").insert({ room_id: room, company_id: me.company_id, user_id: me.id, body, customer_id: customerId });
  if (error) return { error: "Gönderilemedi: " + error.message };
  return { ok: "Gönderildi." };
}
