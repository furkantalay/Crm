// Tek kullanımlık bağlantıyla yeni şifre belirleme. Şifre hiçbir yere loglanmaz.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token, password, check } = await req.json();
    if (!token || typeof token !== "string") return json({ error: "Bağlantı geçersiz." }, 400);
    const hash = await sha256(token);
    const r = await fetch(`${URL_}/rest/v1/password_setup_tokens?token_hash=eq.${hash}&select=id,user_id,expires_at,used_at`, { headers: h });
    const [t] = r.ok ? await r.json() : [];
    if (!t || t.used_at || new Date(t.expires_at) < new Date()) {
      return json({ error: "Bu bağlantının süresi dolmuş ya da daha önce kullanılmış. Yöneticinizden yeni bağlantı isteyin." }, 410);
    }
    const pr = await fetch(`${URL_}/rest/v1/profiles?id=eq.${t.user_id}&select=username,full_name`, { headers: h });
    const [profile] = pr.ok ? await pr.json() : [];

    // Sadece bağlantıyı kontrol et (sayfa açılınca kullanıcı adını göstermek için)
    if (check) return json({ username: profile?.username, full_name: profile?.full_name });

    if (typeof password !== "string" || password.length < 8) return json({ error: "Şifre en az 8 karakter olmalı." }, 400);

    const up = await fetch(`${URL_}/auth/v1/admin/users/${t.user_id}`, { method: "PUT", headers: h, body: JSON.stringify({ password }) });
    if (!up.ok) return json({ error: "Şifre kaydedilemedi. Daha güçlü bir şifre deneyin." }, 400);
    const user = await up.json();

    await fetch(`${URL_}/rest/v1/password_setup_tokens?id=eq.${t.id}`, {
      method: "PATCH", headers: h, body: JSON.stringify({ used_at: new Date().toISOString() }),
    });
    // Eski sistem şifresi artık geçersiz
    await fetch(`${URL_}/rest/v1/legacy_credentials?user_id=eq.${t.user_id}`, { method: "DELETE", headers: h });

    return json({ email: user.email, username: profile?.username });
  } catch (e) {
    console.error("set-password-error", String(e));
    return json({ error: "Beklenmeyen bir hata oldu." }, 500);
  }
});
