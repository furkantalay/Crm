// Admin/yönetici: yeni kullanıcı oluşturur ve şifre belirleme bağlantısı jetonu döndürür.
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
const ROLES = ["admin", "yonetici", "dataci", "satisci", "teknik"];

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const tr = (s: string) => s.toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
  .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/[^a-z0-9._-]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Çağıranı doğrula
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const ur = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
    if (!ur.ok) return json({ error: "Oturum geçersiz." }, 401);
    const caller = await ur.json();
    const cr = await fetch(`${URL_}/rest/v1/profiles?id=eq.${caller.id}&select=id,company_id,role,is_active,company:companies(slug)`, { headers: h });
    const [me] = await cr.json();
    if (!me?.is_active || !["admin", "yonetici"].includes(me.role)) return json({ error: "Yetkiniz yok." }, 403);

    const { full_name, username, role, auto_logout_enabled, auto_logout_minutes } = await req.json();
    const uname = String(username ?? "").trim();
    if (!full_name || !uname) return json({ error: "Ad ve kullanıcı adı gerekli." }, 400);
    if (!ROLES.includes(role)) return json({ error: "Geçersiz rol." }, 400);
    if (role === "admin" && me.role !== "admin") return json({ error: "Admin kullanıcıyı yalnız admin oluşturabilir." }, 403);

    const dup = await fetch(`${URL_}/rest/v1/profiles?company_id=eq.${me.company_id}&username=ilike.${encodeURIComponent(uname.replace(/[%_*]/g, ""))}&select=id`, { headers: h });
    if ((await dup.json()).length) return json({ error: "Bu kullanıcı adı zaten var." }, 409);

    const slug = me.company?.slug ?? "crm";
    const email = `${tr(uname) || "user"}.${Date.now().toString(36)}@${tr(slug)}.crm`;
    const au = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST", headers: h,
      body: JSON.stringify({ email, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID(),
        app_metadata: { company_id: me.company_id }, user_metadata: { username: uname, full_name } }),
    });
    const user = await au.json();
    if (!au.ok) return json({ error: "Kullanıcı oluşturulamadı: " + (user.msg ?? user.message ?? "") }, 400);

    const pr = await fetch(`${URL_}/rest/v1/profiles`, {
      method: "POST", headers: h,
      body: JSON.stringify({ id: user.id, company_id: me.company_id, full_name, username: uname, role,
        auto_logout_enabled: !!auto_logout_enabled, auto_logout_minutes: auto_logout_minutes || null, created_by: me.id }),
    });
    if (!pr.ok) {
      await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: h });
      return json({ error: "Profil oluşturulamadı: " + (await pr.text()) }, 400);
    }

    const raw = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await fetch(`${URL_}/rest/v1/password_setup_tokens`, {
      method: "POST", headers: h,
      body: JSON.stringify({ user_id: user.id, token_hash: await sha256(raw), created_by: me.id,
        expires_at: new Date(Date.now() + 72 * 3600_000).toISOString() }),
    });
    return json({ ok: true, token: raw, username: uname });
  } catch (e) {
    console.error("admin-users-error", String(e));
    return json({ error: "Beklenmeyen bir hata oldu." }, 500);
  }
});
