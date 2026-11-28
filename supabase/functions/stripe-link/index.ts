// Stripe ödeme bağlantısı (iyzico bağlantısının eşi)
//  action "create" (oturum): { customer_id, amount, currency (USD|EUR|TRY), product_ids?, description? }
//     → Stripe Price + tek kullanımlık Payment Link (completed_sessions limit 1)
//  action "cancel" (oturum): { id } → bağlantıyı pasifleştirir
//  action "check"  (x-sync-token, 5 dk'da bir): ödenmiş mi bakar; ödendiyse satışı TL olarak girer
//     (döviz ise ödeme günü TCMB döviz satış kuru ile çevrilir)
// Gerekli gizli anahtar: STRIPE_SECRET_KEY (kısıtlı anahtar önerilir)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SK = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const CURRENCIES = ["USD", "EUR", "TRY"];

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...h, Prefer: "return=representation", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}

function form(obj: Record<string, unknown>, prefix = "", out: string[] = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}
async function stripe(method: string, path: string, body?: Record<string, unknown>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: body ? form(body) : undefined,
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error?.message ?? `Stripe HTTP ${r.status}`);
  return b as Record<string, any>;
}

async function caller(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const ur = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
  if (!ur.ok) return null;
  const u = await ur.json();
  const [p] = await db(`profiles?id=eq.${u.id}&select=id,company_id,role,is_active,full_name`);
  return p?.is_active ? { ...p, jwt } : null;
}

// TCMB döviz satış kuru (bugün; tatilde son iş günü yayımlananı döner)
async function tcmbRate(cur: string): Promise<number> {
  if (cur === "TRY") return 1;
  const r = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml");
  const x = await r.text();
  const m = x.match(new RegExp(`CurrencyCode="${cur}"[\\s\\S]*?<ForexSelling>([0-9.]+)</ForexSelling>`));
  if (!m) throw new Error("TCMB kuru alınamadı");
  return Number(m[1]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!SK) return json({ error: "Stripe anahtarı (STRIPE_SECRET_KEY) tanımlı değil." }, 500);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "create";

    if (action === "check") {
      const [ctrl] = await db("sync_control?name=eq.stripe_links&select=token");
      if (!ctrl || req.headers.get("x-sync-token") !== ctrl.token) return json({ error: "yetkisiz" }, 401);
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const pending = await db(`payment_links?provider=eq.stripe&status=eq.bekliyor&token=not.is.null&created_at=gt.${since}&select=id,token,currency&order=created_at.asc&limit=100`);
      const paid: number[] = [];
      for (const l of pending) {
        const s = await stripe("GET", `checkout/sessions?payment_link=${l.token}&status=complete&limit=1`);
        await db(`payment_links?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ checked_at: new Date().toISOString() }) });
        const sess = s.data?.[0];
        if (sess && sess.payment_status === "paid") {
          const cur = String(sess.currency ?? l.currency).toUpperCase();
          const fx = await tcmbRate(cur);
          const amountTry = Math.round((Number(sess.amount_total) / 100) * fx * 100) / 100;
          await db("rpc/stripe_link_paid", { method: "POST", body: JSON.stringify({ p_link: l.id, p_amount_try: amountTry, p_fx: fx, p_session: sess.id }) });
          await stripe("POST", `payment_links/${l.token}`, { active: false }).catch(() => null);
          paid.push(l.id);
        }
      }
      return json({ checked: pending.length, paid });
    }

    const me = await caller(req);
    if (!me) return json({ error: "Giriş gerekli." }, 401);

    if (action === "cancel") {
      const [l] = await db(`payment_links?id=eq.${Number(body.id)}&company_id=eq.${me.company_id}&select=id,token,status,seller_id,provider`);
      if (!l || l.provider !== "stripe") return json({ error: "Bağlantı bulunamadı." }, 404);
      if (me.role === "satisci" && l.seller_id !== me.id) return json({ error: "Yetkiniz yok." }, 403);
      if (l.status !== "bekliyor") return json({ error: "Bu bağlantı artık iptal edilemez." }, 400);
      if (l.token) await stripe("POST", `payment_links/${l.token}`, { active: false });
      await db(`payment_links?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ status: "iptal" }) });
      return json({ ok: true });
    }

    // create
    const customerId = Number(body.customer_id);
    const currency = String(body.currency ?? "USD").toUpperCase();
    if (!CURRENCIES.includes(currency)) return json({ error: "Para birimi USD, EUR veya TRY olmalı." }, 400);
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!customerId || !(amount > 0)) return json({ error: "Tutar gerekli." }, 400);
    if (amount > (currency === "TRY" ? 500000 : 20000)) return json({ error: "Tutar çok yüksek." }, 400);

    const cr = await fetch(`${URL_}/rest/v1/customers?id=eq.${customerId}&select=id,full_name,assigned_to,email`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? KEY, Authorization: `Bearer ${me.jwt}` },
    });
    const [cust] = cr.ok ? await cr.json() : [];
    if (!cust) return json({ error: "Data bulunamadı ya da yetkiniz yok." }, 403);

    const productIds: string[] = Array.isArray(body.product_ids) ? body.product_ids.filter((x: unknown) => typeof x === "string").slice(0, 10) : [];
    let productNames: string[] = [];
    if (productIds.length) {
      const ps = await db(`products?id=in.(${productIds.join(",")})&company_id=eq.${me.company_id}&select=id,name`);
      productNames = ps.map((p: { name: string }) => p.name);
    }
    const seller = cust.assigned_to ?? me.id;
    const description = String(body.description ?? "").trim().slice(0, 200) || productNames.join(", ") || "Eğitim ödemesi";

    const [row] = await db("payment_links", {
      method: "POST",
      body: JSON.stringify({ company_id: me.company_id, customer_id: customerId, seller_id: seller, product_ids: productIds,
                             description, amount, currency, provider: "stripe", created_by: me.id }),
    });
    try {
      const price = await stripe("POST", "prices", {
        currency: currency.toLowerCase(), unit_amount: Math.round(amount * 100),
        product_data: { name: `${description} · ${cust.full_name}`.slice(0, 120), metadata: { crm_link: row.id } },
      });
      const link = await stripe("POST", "payment_links", {
        line_items: { 0: { price: price.id, quantity: 1 } },
        restrictions: { completed_sessions: { limit: 1 } },
        metadata: { crm_link: row.id, crm_customer: customerId },
        payment_intent_data: { description: `${description} – ${cust.full_name}`.slice(0, 200), metadata: { crm_link: row.id } },
        after_completion: { type: "hosted_confirmation", hosted_confirmation: { custom_message: "Ödemeniz alındı, teşekkürler! Ekibimiz sizinle iletişime geçecek." } },
      });
      await db(`payment_links?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ token: link.id, url: link.url }) });
      return json({ id: row.id, url: link.url });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      await db(`payment_links?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "hata", error: msg }) });
      return json({ error: `Stripe: ${msg}` }, 502);
    }
  } catch (e) {
    console.error("stripe-link", String(e));
    return json({ error: "Beklenmeyen hata: " + String(e) }, 500);
  }
});
