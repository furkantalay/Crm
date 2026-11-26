// iyzico günlük işlem raporunu çeker, iyzico_transactions'a yazar ve satışlarla eşleştirir.
// Çağrı: { from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }  (varsayılan: son 3 gün)
// Yetki: x-sync-token (zamanlanmış görev) veya admin/yönetici/datacı oturumu.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = (Deno.env.get("IYZICO_API_KEY") ?? "").trim();
const SECRET = (Deno.env.get("IYZICO_SECRET_KEY") ?? "").trim();
const BASE = Deno.env.get("IYZICO_BASE_URL") ?? "https://api.iyzipay.com";
const SLUG = Deno.env.get("IYZICO_COMPANY_SLUG") ?? "dijitalbiradam";
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// iyzico imzasında yolun sorgu kısmının dahil olup olmadığı belgelerde net değil: ikisini de dener, çalışanı hatırlar.
let pathMode: "path" | "full" | null = null;
async function iyzicoGet(path: string, query: string) {
  const modes: ("path" | "full")[] = pathMode ? [pathMode] : ["path", "full"];
  let last: Record<string, unknown> = {};
  for (const mode of modes) {
    const rnd = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
    const signed = mode === "path" ? path : `${path}?${query}`;
    const signature = await hmacHex(SECRET, rnd + signed);
    const auth = btoa(`apiKey:${API_KEY}&randomKey:${rnd}&signature:${signature}`);
    const r = await fetch(`${BASE}${path}?${query}`, {
      headers: { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": rnd, "Content-Type": "application/json" },
    });
    last = await r.json().catch(() => ({ status: "failure", errorMessage: `HTTP ${r.status}` }));
    if (last.status === "success") { pathMode = mode; return last; }
  }
  return last;
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const ist = (s: string) => `${String(s).slice(0, 19).replace(" ", "T")}+03:00`;
function days(from: string, to: string) {
  const out: string[] = [];
  for (let d = new Date(from + "T12:00:00Z"); d <= new Date(to + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!API_KEY || !SECRET) return json({ error: "IYZICO_API_KEY / IYZICO_SECRET_KEY tanımlı değil." }, 500);

    // --- Yetki ---
    const token = req.headers.get("x-sync-token");
    let allowed = false;
    if (token) {
      const r = await fetch(`${URL_}/rest/v1/sync_control?name=eq.iyzico&select=token`, { headers: h });
      const [row] = await r.json();
      allowed = !!row && row.token === token;
    } else {
      const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const ur = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
      if (ur.ok) {
        const u = await ur.json();
        const pr = await fetch(`${URL_}/rest/v1/profiles?id=eq.${u.id}&select=role,is_active`, { headers: h });
        const [p] = await pr.json();
        allowed = !!p?.is_active && ["admin", "yonetici", "dataci"].includes(p.role);
      }
    }
    if (!allowed) return json({ error: "Yetkisiz." }, 401);

    const [co] = await (await fetch(`${URL_}/rest/v1/companies?slug=eq.${SLUG}&select=id`, { headers: h })).json();
    if (!co) return json({ error: "Şirket bulunamadı." }, 500);

    const body = await req.json().catch(() => ({}));
    const to = body.to ?? todayIst();
    const fromDefault = new Date(to + "T12:00:00Z"); fromDefault.setUTCDate(fromDefault.getUTCDate() - 2);
    const from = body.from ?? fromDefault.toISOString().slice(0, 10);
    const list = days(from, to);
    if (list.length > 31) return json({ error: "Tek seferde en fazla 31 gün." }, 400);

    let fetched = 0;
    const errors: string[] = [];
    for (const day of list) {
      for (let page = 1; page <= 50; page++) {
        let res = await iyzicoGet("/v2/reporting/payment/transactions", `page=${page}&transactionDate=${day}`);
        // İstek sınırı: bekle ve iki kez daha dene
        for (let retry = 0; retry < 2 && res.status !== "success" && /limit/i.test(String(res.errorMessage ?? "")); retry++) {
          await new Promise((r) => setTimeout(r, 20_000));
          res = await iyzicoGet("/v2/reporting/payment/transactions", `page=${page}&transactionDate=${day}`);
        }
        await new Promise((r) => setTimeout(r, 800)); // iyzico'yu yormamak için
        if (res.status !== "success") { errors.push(`${day}: ${res.errorMessage ?? res.errorCode ?? "hata"}`); break; }
        const tx = (res.transactions ?? []) as Record<string, unknown>[];
        if (tx.length) {
          const rows = tx.map((t) => ({
            company_id: co.id, transaction_id: String(t.transactionId),
            transaction_type: String(t.transactionType), transaction_date: ist(String(t.transactionDate)),
            payment_id: t.paymentId != null ? String(t.paymentId) : null,
            payment_tx_id: t.paymentTxId != null ? String(t.paymentTxId) : null,
            price: num(t.price), paid_price: num(t.paidPrice), merchant_payout_amount: num(t.merchantPayoutAmount),
            iyzico_commission: num(t.iyzicoCommission), iyzico_fee: num(t.iyzicoFee),
            installment: num(t.installment), transaction_status: num(t.transactionStatus),
            raw: t, synced_at: new Date().toISOString(),
          }));
          const up = await fetch(`${URL_}/rest/v1/iyzico_transactions?on_conflict=company_id,transaction_id`, {
            method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows),
          });
          if (!up.ok) { errors.push(`${day}: kayıt hatası ${await up.text()}`); break; }
          fetched += rows.length;
        }
        if (page >= Number(res.totalPageCount ?? 1)) break;
      }
    }

    const m = await fetch(`${URL_}/rest/v1/rpc/iyzico_auto_match`, { method: "POST", headers: h, body: JSON.stringify({ p_company: co.id }) });
    const matched = m.ok ? await m.json() : 0;
    if (errors.length) console.error("iyzico-sync-errors", errors.slice(0, 5).join(" | "));
    return json({ from, to, fetched, matched, errors: errors.slice(0, 10), signMode: pathMode });
  } catch (e) {
    console.error("iyzico-sync-error", String(e));
    return json({ error: "Beklenmeyen hata: " + String(e) }, 500);
  }
});
