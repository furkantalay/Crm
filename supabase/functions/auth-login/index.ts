// Kullanıcı adı → giriş e-postası. Eski CRM şifresi (werkzeug scrypt) varsa doğrular,
// Supabase şifresine çevirir ve eski hash'i siler. Asıl giriş istemcide signInWithPassword ile yapılır.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

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

// werkzeug: "scrypt:32768:8:1$<salt>$<hex>"
function verifyWerkzeug(password: string, stored: string): boolean {
  try {
    const [method, salt, hex] = stored.split("$");
    const [algo, n, r, p] = method.split(":");
    if (algo !== "scrypt") return false;
    const N = Number(n), R = Number(r), P = Number(p);
    const expected = Buffer.from(hex, "hex");
    const got = scryptSync(password, salt, expected.length, { N, r: R, p: P, maxmem: 132 * N * R * P });
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch (e) {
    console.error("legacy-verify-error", String(e)); // şifre loglanmaz
    return false;
  }
}

async function get(path: string) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: h });
  return r.ok ? r.json() : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { username, password, company = "dijitalbiradam" } = await req.json();
    if (!username || !password) return json({ error: "Kullanıcı adı ve şifre gerekli." }, 400);

    const [co] = await get(`companies?slug=eq.${encodeURIComponent(company)}&select=id`);
    if (!co) return json({ error: "Kullanıcı adı veya şifre hatalı." }, 401);

    const uname = String(username).trim();
    const profiles = await get(
      `profiles?company_id=eq.${co.id}&username=ilike.${encodeURIComponent(uname.replace(/[%_*]/g, ""))}&select=id,username,is_active`,
    );
    const p = profiles.find((x: any) => x.username.toLocaleLowerCase("tr") === uname.toLocaleLowerCase("tr")) ?? profiles[0];
    if (!p) return json({ error: "Kullanıcı adı veya şifre hatalı." }, 401);
    if (!p.is_active) return json({ error: "Bu kullanıcı pasif. Yöneticinize başvurun." }, 403);

    const ur = await fetch(`${URL_}/auth/v1/admin/users/${p.id}`, { headers: h });
    const user = await ur.json();
    if (!ur.ok || !user.email) return json({ error: "Kullanıcı bulunamadı." }, 401);

    // Eski şifre hâlâ duruyorsa: doğrula ve taşı
    const [legacy] = await get(`legacy_credentials?user_id=eq.${p.id}&select=password_hash`);
    if (legacy) {
      if (!verifyWerkzeug(password, legacy.password_hash)) {
        console.warn("legacy-password-mismatch", p.username); // şifre loglanmaz
        return json({ error: "Kullanıcı adı veya şifre hatalı." }, 401);
      }
      const up = await fetch(`${URL_}/auth/v1/admin/users/${p.id}`, {
        method: "PUT", headers: h, body: JSON.stringify({ password }),
      });
      if (!up.ok) return json({ error: "Şifre taşınamadı: " + (await up.text()) }, 500);
      await fetch(`${URL_}/rest/v1/legacy_credentials?user_id=eq.${p.id}`, { method: "DELETE", headers: h });
    }
    return json({ email: user.email });
  } catch (e) {
    return json({ error: "Giriş sırasında hata: " + String(e) }, 500);
  }
});
