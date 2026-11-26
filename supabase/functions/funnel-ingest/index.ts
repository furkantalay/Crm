// Google Sheet "YENİ FUNNEL RANDEVULAR" → CRM. Sayfadaki Apps Script birkaç dakikada bir son satırları yollar.
// Yetki: x-sync-token (sync_control 'funnel').
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST gerekli" }, 405);
  const [ctrl] = await (await fetch(`${URL_}/rest/v1/sync_control?name=eq.funnel&select=token`, { headers: h })).json();
  if (!ctrl || req.headers.get("x-sync-token") !== ctrl.token) return json({ error: "yetkisiz" }, 401);

  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 2000) : null;
  if (!rows) return json({ error: "rows gerekli" }, 400);

  const [co] = await (await fetch(`${URL_}/rest/v1/companies?slug=eq.${encodeURIComponent(body.company ?? "dijitalbiradam")}&select=id`, { headers: h })).json();
  if (!co) return json({ error: "şirket bulunamadı" }, 404);

  const r = await fetch(`${URL_}/rest/v1/rpc/funnel_ingest`, {
    method: "POST", headers: h, body: JSON.stringify({ p_company: co.id, p_rows: rows, p_source: "canli" }),
  });
  const out = await r.json();
  if (!r.ok) { console.error("funnel_ingest", out); return json({ error: out?.message ?? "hata" }, 500); }
  return json(out);
});
