// Yapay zekâ (Claude)
//  action "ping"    (x-sync-token): anahtar çalışıyor mu
//  action "score"   (x-sync-token, cron 2 dk): sıradaki dataları toplu puanlar (1-100, sıcak/ılık/soğuk, sektör grubu, gerekçe, sonraki adım)
//  action "summary" (oturum): { customer_id } → not geçmişi özeti + puan + sonraki adım (yalnızca datayı görebilen kullanıcı)
// Modele ad, telefon, e-posta GÖNDERİLMEZ.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
const MODEL = Deno.env.get("AI_MODEL") ?? "claude-haiku-5-5";
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...h, ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: unknown) => db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

async function caller(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const ur = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt}` } });
  if (!ur.ok) return null;
  const u = await ur.json();
  const [p] = await db(`profiles?id=eq.${u.id}&select=id,company_id,role,is_active`);
  return p?.is_active ? { ...p, jwt } : null;
}

async function claude(system: string, user: string, maxTokens: number, tool?: { name: string; schema: unknown }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }],
      ...(tool ? { tools: [{ name: tool.name, description: "Sonucu kaydet", input_schema: tool.schema }], tool_choice: { type: "tool", name: tool.name } } : {}),
    }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude ${r.status}: ${b?.error?.message ?? "hata"}`);
  const blocks = (b.content ?? []) as any[];
  return { text: blocks.map((c) => c.text ?? "").join(""), input: blocks.find((c) => c.type === "tool_use")?.input, model: b.model };
}

const ITEM = {
  type: "object",
  properties: {
    id: { type: "integer" }, score: { type: "integer", minimum: 1, maximum: 100 },
    label: { type: "string", enum: ["sıcak", "ılık", "soğuk"] }, group: { type: "string" },
    reason: { type: "string" }, next: { type: "string" },
  },
  required: ["id", "score", "label", "group", "reason", "next"],
};

const CONTEXT = `Dijital Bir Adam; işletme sahiplerine Meta (Instagram/Facebook) reklamcılığı ve sosyal medyadan satış eğitimleri satan bir şirket.
Datalar reklam formlarından gelen başvurulardır; satışçılar telefonla arayıp eğitim satar. Genel dönüşüm oranı her datada "genel_donusum_yuzde" olarak verilir.
Puan = bu kişinin önümüzdeki 30 günde eğitim satın alma olasılığı (1-100). Ölçüt:
- Satın almış ya da durumu "kazanıldı" ise puan yine yüksek olabilir ama "next" alanı ek satış/teşekkür olmalı.
- Notlarda bütçe, istek, "düşüneceğim", "eşime danışayım", "ödeme günü", "fiyat sordu" gibi sıcak işaretler puanı artırır.
- "İstemiyor", "yanlış numara", "ilgilenmiyor", "ulaşılamadı" (tekrar tekrar), "aramayın" puanı düşürür.
- Yeni ve hiç aranmamış başvuru: başvuru tazeliği önemlidir (bugün/dün = ortanın üstü). Birden çok başvuru (basvuru_sayisi>1) ilgiyi gösterir.
- Sektör: işletmesi olan, reklamla müşteri bulabilecek sektörler (güzellik, klinik, diyetisyen, emlak, e-ticaret, eğitim, restoran vb.) daha olumlu; öğrenci/çalışan/işletmesi yok gibi işaretler olumsuz.
- sektor_gecmisi: aynı sektörden son 1 yılda gelen data ve satış sayısı (az sayıda veride fazla önemseme).
label: 70+ "sıcak", 40-69 "ılık", altı "soğuk".
group: sektörü kısa standart bir gruba indir (ör. "Güzellik & Estetik", "Sağlık & Klinik", "Diyet & Spor", "Emlak", "E-ticaret", "Eğitim & Danışmanlık", "Yeme-İçme", "Hizmet", "Perakende", "Diğer").
reason: tek cümle, satışçıya hitap eden sade Türkçe. next: satışçının yapacağı tek somut adım (en fazla 15 kelime).`;

async function score(ids: number[]) {
  if (!ids.length) return 0;
  const feats = await rpc("ai_features", { p_ids: ids });
  const { input } = await claude(`${CONTEXT}\nHer data için bir kayıt üret ve save_scores aracıyla kaydet.`, JSON.stringify(feats), 6000,
    { name: "save_scores", schema: { type: "object", properties: { items: { type: "array", items: ITEM } }, required: ["items"] } });
  const rows = ((input?.items ?? []) as any[]).filter((r) => ids.includes(Number(r.id)) && Number.isFinite(Number(r.score)));
  if (rows.length) await rpc("ai_save", { p_rows: rows });
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!AI_KEY) return json({ error: "ANTHROPIC_API_KEY tanımlı değil." }, 500);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "summary";

    if (action === "ping" || action === "score") {
      const [ctrl] = await db("sync_control?name=eq.ai&select=token");
      if (!ctrl || req.headers.get("x-sync-token") !== ctrl.token) return json({ error: "yetkisiz" }, 401);
      if (action === "ping") {
        const r = await claude("Sadece 'tamam' yaz.", "test", 10);
        return json({ ok: true, model: r.model, reply: r.text });
      }
      const ids: number[] = await rpc("ai_score_queue", { p_limit: Math.min(Number(body.limit) || 20, 40) });
      const n = await score(ids);
      return json({ ok: true, queued: ids.length, scored: n });
    }

    if (action === "summary") {
      const me = await caller(req);
      if (!me) return json({ error: "Oturum gerekli." }, 401);
      const id = Number(body.customer_id);
      // Erişim kontrolü: kullanıcının kendi yetkisiyle datayı görebiliyor mu (RLS)
      const cr = await fetch(`${URL_}/rest/v1/customers?id=eq.${id}&select=id`, {
        headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? KEY, Authorization: `Bearer ${me.jwt}` },
      });
      const vis = cr.ok ? await cr.json() : [];
      if (!vis.length) return json({ error: "Bu dataya erişiminiz yok." }, 403);
      const [f] = await rpc("ai_features", { p_ids: [id] });
      const sys = `${CONTEXT}\nAyrıca "summary": satışçının aramadan önce 10 saniyede okuyacağı 2-4 cümlelik özet (ne istedi, ne konuşuldu, itirazı ne, nerede kalındı). Not yoksa bunu söyle. save_summary aracıyla kaydet.`;
      const props = { ...ITEM.properties, summary: { type: "string" } } as Record<string, unknown>;
      delete props.id;
      const { input: r } = await claude(sys, JSON.stringify(f), 1500,
        { name: "save_summary", schema: { type: "object", properties: props, required: ["score", "label", "group", "reason", "next", "summary"] } });
      if (!r) throw new Error("Yapay zekâ yanıtı okunamadı");
      const row = { id, score: r.score, label: r.label, group: r.group, reason: r.reason, next: r.next, summary: r.summary, by: me.id };
      await rpc("ai_save", { p_rows: [row] });
      return json({ ok: true, ...row });
    }
    return json({ error: "bilinmeyen işlem" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
