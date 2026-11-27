// iyzico ödeme bağlantısı
//  action "create" (oturum): { customer_id, amount, product_ids?, description? } → iyzico Link (stok 1 = tek kullanımlık)
//  action "cancel" (oturum): { id } → bağlantıyı iyzico'da siler
//  action "check"  (x-sync-token, 5 dk'da bir): bekleyen bağlantıların satılıp satılmadığına bakar; satıldıysa satışı girer
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { LOGO_JPEG_BASE64 } from "./logo.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = (Deno.env.get("IYZICO_API_KEY") ?? "").trim();
const SECRET = (Deno.env.get("IYZICO_SECRET_KEY") ?? "").trim();
const BASE = Deno.env.get("IYZICO_BASE_URL") ?? "https://api.iyzipay.com";
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

// IYZWSv2: imza = HMAC-SHA256(secret, randomKey + uri yolu + istek gövdesi)
async function iyzico(method: string, path: string, body?: unknown) {
  const rnd = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  const payload = body === undefined ? "" : JSON.stringify(body);
  const signature = await hmacHex(SECRET, rnd + path + payload);
  const auth = btoa(`apiKey:${API_KEY}&randomKey:${rnd}&signature:${signature}`);
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": rnd, "Content-Type": "application/json" },
    body: body === undefined ? undefined : payload,
  });
  return await r.json().catch(() => ({ status: "failure", errorMessage: `HTTP ${r.status}` })) as Record<string, any>;
}

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...h, Prefer: "return=representation", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function caller(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const ur = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
  if (!ur.ok) return null;
  const u = await ur.json();
  const [p] = await db(`profiles?id=eq.${u.id}&select=id,company_id,role,is_active,full_name`);
  return p?.is_active ? { ...p, jwt } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!API_KEY || !SECRET) return json({ error: "iyzico anahtarları tanımlı değil." }, 500);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "create";

    // ---------------- Zamanlanmış kontrol ----------------
    if (action === "check") {
      const [ctrl] = await db("sync_control?name=eq.iyzico_links&select=token");
      if (!ctrl || req.headers.get("x-sync-token") !== ctrl.token) return json({ error: "yetkisiz" }, 401);
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const pending = await db(`payment_links?status=eq.bekliyor&token=not.is.null&created_at=gt.${since}&select=id,token,company_id&order=created_at.asc&limit=100`);
      const paid: number[] = [];
      for (const l of pending) {
        const r = await iyzico("GET", `/v2/iyzilink/products/${l.token}`);
        await db(`payment_links?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ checked_at: new Date().toISOString() }) });
        const sold = Number(r?.data?.soldCount ?? 0);
        if (r.status === "success" && sold >= 1) {
          await db("rpc/payment_link_paid", { method: "POST", body: JSON.stringify({ p_link: l.id }) });
          paid.push(l.id);
          await iyzico("DELETE", `/v2/iyzilink/products/${l.token}`).catch(() => null); // tekrar kullanılmasın
        }
        await new Promise((res) => setTimeout(res, 400));
      }
      // Ödenenler için iyzico işlemlerini çek ve eşleştir
      const unmatched = await db(`payment_links?status=eq.odendi&paid_at=gt.${since}&select=id,sale_id,sales!inner(iyzico_payment_id)&sales.iyzico_payment_id=is.null&limit=50`).catch(() => []);
      if (paid.length || unmatched.length) {
        const [s] = await db("sync_control?name=eq.iyzico&select=token");
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
        const yday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() - 864e5));
        if (s) await fetch(`${URL_}/functions/v1/iyzico-sync`, { method: "POST", headers: { "Content-Type": "application/json", "x-sync-token": s.token }, body: JSON.stringify({ from: yday, to: today }) });
        for (const l of unmatched) await db("rpc/payment_link_match", { method: "POST", body: JSON.stringify({ p_link: l.id }) });
        for (const id of paid) await db("rpc/payment_link_match", { method: "POST", body: JSON.stringify({ p_link: id }) });
      }
      return json({ checked: pending.length, paid });
    }

    // ---------------- Oturumlu işlemler ----------------
    const me = await caller(req);
    if (!me) return json({ error: "Giriş gerekli." }, 401);

    if (action === "cancel") {
      const [l] = await db(`payment_links?id=eq.${Number(body.id)}&company_id=eq.${me.company_id}&select=id,token,status,seller_id`);
      if (!l) return json({ error: "Bağlantı bulunamadı." }, 404);
      if (me.role === "satisci" && l.seller_id !== me.id) return json({ error: "Yetkiniz yok." }, 403);
      if (l.status !== "bekliyor") return json({ error: "Bu bağlantı artık iptal edilemez." }, 400);
      if (l.token) await iyzico("DELETE", `/v2/iyzilink/products/${l.token}`);
      await db(`payment_links?id=eq.${l.id}`, { method: "PATCH", body: JSON.stringify({ status: "iptal" }) });
      return json({ ok: true });
    }

    // create
    const customerId = Number(body.customer_id);
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!customerId || !(amount > 0)) return json({ error: "Tutar gerekli." }, 400);
    if (amount > 500000) return json({ error: "Tutar çok yüksek." }, 400);

    // Kullanıcının bu dataya erişimi var mı? (satışçı yalnız kendi datası) — kullanıcının kendi oturumuyla sorgulanır
    const cr = await fetch(`${URL_}/rest/v1/customers?id=eq.${customerId}&select=id,full_name,assigned_to`, {
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
                             description, amount, created_by: me.id }),
    });

    const res = await iyzico("POST", "/v2/iyzilink/products", {
      locale: "tr",
      conversationId: `crm-link-${row.id}`,
      name: `${description} · ${cust.full_name}`.slice(0, 100),
      description: `${description} – ${cust.full_name}`.slice(0, 250),
      price: amount.toFixed(2),
      currencyCode: "TRY",
      encodedImageFile: LOGO_JPEG_BASE64,
      addressIgnorable: true,
      installmentRequested: true,
      stockEnabled: true,
      stockCount: 1,
    });
    if (res.status !== "success" || !res.data?.url) {
      const msg = res.errorMessage ?? "iyzico bağlantı oluşturamadı.";
      await db(`payment_links?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "hata", error: msg }) });
      console.error("iyzilink", JSON.stringify(res));
      return json({ error: `iyzico: ${msg}` }, 502);
    }
    await db(`payment_links?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ token: res.data.token, url: res.data.url }) });
    return json({ id: row.id, url: res.data.url });
  } catch (e) {
    console.error("iyzico-link", String(e));
    return json({ error: "Beklenmeyen hata: " + String(e) }, 500);
  }
});
