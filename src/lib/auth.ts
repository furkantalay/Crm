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
  company: { name: string; default_logout_minutes: number; settings: Record<string, unknown> | null };
};

/** Giriş yapan kullanıcı + şirketi. Giriş yoksa /giris'e yönlendirir. */
export const getMe = cache(async (): Promise<Me> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/giris");
  const { data } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, username, role, auto_logout_enabled, auto_logout_minutes, company:companies(name, default_logout_minutes, settings)")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/cikis");
  return data as unknown as Me;
});

/** Sayfayı yalnız verilen rollere aç; diğerlerini panele gönder. */
export async function requireRole(roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!roles.includes(me.role)) redirect("/");
  return me;
}

/** Yöneticiye açılıp kapatılabilen alanlar (Ayarlar → Yönetici yetkileri). */
export type Perm = "net" | "ads" | "prim" | "users";
export const PERMS: { key: Perm; label: string; hint: string; def: boolean }[] = [
  { key: "net", label: "Bize kalan ve iyzico", hint: "Bize kalan / bize gelen tutarlar, iyzico komisyonları ve iyzico ekranı", def: false },
  { key: "ads", label: "Reklam yönetimi gelirleri", hint: "Reklam Yönetimi ekranı ve paneldeki/rapordaki reklam tutarları", def: false },
  { key: "prim", label: "Herkesin primi", hint: "Primler ekranı ve paneldeki prim sütunu", def: true },
  { key: "users", label: "Kullanıcı yönetimi", hint: "Kullanıcılar ekranı: ekleme, pasife alma, şifre bağlantısı", def: true },
];

/** Bu kullanıcı bu alanı görebilir mi? Admin her şeyi görür; yönetici şirket ayarına göre. */
export function can(me: Me, perm: Perm): boolean {
  if (me.role === "admin") return true;
  if (me.role === "yonetici") {
    const v = (me.company?.settings?.manager_can as Record<string, unknown> | undefined)?.[perm];
    return typeof v === "boolean" ? v : PERMS.find((p) => p.key === perm)!.def;
  }
  // diğer roller: eskisi gibi (datacı/teknik net ve reklamı görür, satışçı görmez)
  if (perm === "net") return me.role === "dataci" || me.role === "teknik";
  if (perm === "ads") return me.role === "dataci";
  return false;
}

export async function requirePerm(perm: Perm): Promise<Me> {
  const me = await getMe();
  if (!can(me, perm)) redirect("/");
  return me;
}

export const isStaff = (role: Role) => role !== "satisci";
export const canManage = (role: Role) => role === "admin" || role === "yonetici";
