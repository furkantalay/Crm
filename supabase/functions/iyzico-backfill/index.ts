// Tek seferlik: veri merkezindeki (eski proje) iyzico_islemler tablosunu iyzico_transactions'a kopyalar.
// Yetki: migration_control jetonu. Geçiş tamamlanınca silinecek.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OLD_URL = "https://vvukjfdfdjxyjrxwutez.supabase.co";
const OLD_KEY = Deno.env.get("OLD_SERVICE_ROLE_KEY") ?? "";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const h = (k: string, x: Record<string, string> = {}) => ({ apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json", ...x });
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const ts = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(0, 19).replace(" ", "T")}+03:00` : null);

Deno.serve(async (req) => {
  const [ctrl] = await (await fetch(`${URL_}/rest/v1/migration_control?select=token`, { headers: h(KEY) })).json();
  if (!ctrl || req.headers.get("x-migration-token") !== ctrl.token) return new Response("yetkisiz", { status: 401 });
  const [co] = await (await fetch(`${URL_}/rest/v1/companies?slug=eq.dijitalbiradam&select=id`, { headers: h(KEY) })).json();
  let total = 0;
  for (let i = 0; ; i += 1000) {
    const r = await fetch(`${OLD_URL}/rest/v1/iyzico_islemler?select=*&order=transaction_id.asc`, { headers: h(OLD_KEY, { Range: `${i}-${i + 999}` }) });
    if (!r.ok) return new Response(`okunamadı: ${await r.text()}`, { status: 500 });
    const rows = (await r.json()) as Record<string, unknown>[];
    const out = rows.map((o) => ({
      company_id: co.id, transaction_id: String(o.transaction_id), transaction_type: o.transaction_type,
      transaction_date: ts(o.transaction_date), payment_id: o.payment_id, payment_tx_id: o.payment_tx_id,
      price: n(o.price), paid_price: n(o.paid_price), merchant_payout_amount: n(o.merchant_payout_amount),
      iyzico_commission: n(o.iyzico_commission), iyzico_fee: n(o.iyzico_fee), installment: n(o.installment),
      transaction_status: n(o.transaction_status), raw: o.veri ?? {},
    })).filter((x) => x.transaction_date);
    if (out.length) {
      const up = await fetch(`${URL_}/rest/v1/iyzico_transactions?on_conflict=company_id,transaction_id`, {
        method: "POST", headers: h(KEY, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(out),
      });
      if (!up.ok) return new Response(`yazılamadı: ${await up.text()}`, { status: 500 });
      total += out.length;
    }
    if (rows.length < 1000) break;
  }
  const m = await fetch(`${URL_}/rest/v1/rpc/iyzico_auto_match`, { method: "POST", headers: h(KEY), body: JSON.stringify({ p_company: co.id }) });
  return new Response(JSON.stringify({ copied: total, matched: m.ok ? await m.json() : null }), { headers: { "Content-Type": "application/json" } });
});
