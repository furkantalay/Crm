import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "yonetici" | "dataci" | "satisci" | "teknik";

export type Me = {
  id: string;
  company_id: string;
  full_name: string;
  username: string;
  role: Role;
  auto_logout_enabled: boolean;
  auto_logout_minutes: number | null;
  company: { name: string; default_logout_minutes: number };
};

/** Giriş yapan kullanıcı + şirketi. Giriş yoksa /giris'e yönlendirir. */
export const getMe = cache(async (): Promise<Me> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/giris");
  const { data } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, username, role, auto_logout_enabled, auto_logout_minutes, company:companies(name, default_logout_minutes)")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/cikis");
  return data as unknown as Me;
});

export const isStaff = (role: Role) => role !== "satisci";
export const canManage = (role: Role) => role === "admin" || role === "yonetici";
