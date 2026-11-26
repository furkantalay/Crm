// Tek seferlik: eski veri merkezindeki funnel_yedek tablosunu funnel_rows'a (arşiv olarak) taşır.
// Yetki: migration_control jetonu. ?from=<id> ile kaldığı yerden devam eder. Taşıma bitince silinecek.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OLD_URL = "https://vvukjfdfdjxyjrxwutez.supabase.co";
const OLD_KEY = Deno.env.get("OLD_SERVICE_ROLE_KEY") ?? "";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const h = (k: string, x: Record<string, string> = {}) => ({ apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json", ...x });

Deno.serve(async (req) => {
  const [ctrl] = await (await fetch(`${URL_}/rest/v1/migration_control?select=token`, { headers: h(KEY) })).json();
  if (!ctrl || req.headers.get("x-migration-token") !== ctrl.token) return new Response("yetkisiz", { status: 401 });
  const [co] = await (await fetch(`${URL_}/rest/v1/companies?slug=eq.dijitalbiradam&select=id`, { headers: h(KEY) })).json();

  let from = Number(new URL(req.url).searchParams.get("from") ?? 0);
  const started = Date.now();
  let copied = 0;
  while (Date.now() - started < 100_000) {
    const r = await fetch(`${OLD_URL}/rest/v1/funnel_yedek?select=id,sayfa,satir,veri&id=gt.${from}&order=id.asc&limit=2000`, { headers: h(OLD_KEY) });
    if (!r.ok) return new Response(`okunamadı: ${await r.text()}`, { status: 500 });
    const rows = (await r.json()) as { id: number; sayfa: string; satir: number; veri: unknown }[];
    if (!rows.length) return Response.json({ done: true, copied, next: null });
    const payload = rows.map((x) => ({ sheet: x.sayfa.trim(), row: x.satir, cells: Array.isArray(x.veri) ? x.veri : [] }));
    const up = await fetch(`${URL_}/rest/v1/rpc/funnel_ingest`, {
      method: "POST", headers: h(KEY), body: JSON.stringify({ p_company: co.id, p_rows: payload, p_source: "arsiv" }),
    });
    if (!up.ok) return new Response(`yazılamadı (id>${from}): ${await up.text()}`, { status: 500 });
    copied += rows.length;
    from = rows[rows.length - 1].id;
  }
  return Response.json({ done: false, copied, next: from });
});
