// Eski CRM (Tokyo projesi, crm_* tabloları) → yeni CRM (Frankfurt) veri taşıma.
// Her adım ayrı çağrılır: { "step": "users" | "customers" | ... , "from": 0, "limit": 5000 }
// Tekrar çalıştırılabilir: kayıtlar id üzerinden upsert edilir.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OLD_URL = "https://vvukjfdfdjxyjrxwutez.supabase.co";
const OLD_KEY = Deno.env.get("OLD_SERVICE_ROLE_KEY") ?? "";
const NEW_URL = Deno.env.get("SUPABASE_URL")!;
const NEW_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLUG = "dijitalbiradam";
const EMAIL_DOMAIN = "dijitalbiradam.crm";

type Row = Record<string, any>;

const hdr = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra,
});

async function oldRows(table: string, from = 0, limit = 100000): Promise<Row[]> {
  const out: Row[] = [];
  const page = 1000;
  for (let i = from; i < from + limit; i += page) {
    const end = Math.min(i + page, from + limit) - 1;
    const r = await fetch(`${OLD_URL}/rest/v1/${table}?select=*&order=id.asc`, {
      headers: hdr(OLD_KEY, { Range: `${i}-${end}`, "Range-Unit": "items" }),
    });
    if (!r.ok) throw new Error(`${table} okunamadı: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < end - i + 1) break;
  }
  return out;
}

async function newGet(path: string): Promise<Row[]> {
  const r = await fetch(`${NEW_URL}/rest/v1/${path}`, { headers: hdr(NEW_KEY) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function upsert(table: string, rows: Row[], onConflict = "id") {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${NEW_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: hdr(NEW_KEY, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`${table} yazılamadı (${i}): ${r.status} ${await r.text()}`);
  }
  return rows.length;
}

// Eski sistem tarihleri metin ve İstanbul saati: "2026-11-26 15:18:54"
function ts(v: any): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim().replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.length <= 10 ? `${s}T00:00:00+03:00` : `${s.slice(0, 19).replace(" ", "T")}+03:00`;
}
const day = (v: any) => (ts(v) ? ts(v)!.slice(0, 10) : null);
const tr = (s: string) => s.toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
  .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/[^a-z0-9._-]/g, "");

async function context() {
  const [company] = await newGet(`companies?slug=eq.${SLUG}&select=id`);
  const lookups = await newGet(`lookups?company_id=eq.${company.id}&select=id,category,label`);
  const products = await newGet(`products?company_id=eq.${company.id}&select=id,name,kind`);
  const profiles = await newGet(`profiles?company_id=eq.${company.id}&select=id,legacy_id`);
  const lk = (cat: string, label: any) =>
    label ? lookups.find((l) => l.category === cat && l.label === String(label).trim())?.id ?? null : null;
  const user = new Map<number, string>(profiles.map((p) => [p.legacy_id, p.id]));
  const u = (legacy: any) => (legacy == null ? null : user.get(Number(legacy)) ?? null);
  return { companyId: company.id as string, lk, u, products };
}

// ---------------------------------------------------------------------------
const steps: Record<string, (from: number, limit: number) => Promise<unknown>> = {
  async users() {
    const { companyId } = await context();
    const roleMap = (role: string, group: string): string =>
      role === "satici" ? "satisci" : role === "dataci" ? "dataci"
      : group === "yonetici" ? "yonetici" : group === "teknik" ? "teknik" : "admin";
    const olds = await oldRows("crm_users");
    const existing = await newGet(`profiles?company_id=eq.${companyId}&select=legacy_id`);
    const done = new Set(existing.map((p) => p.legacy_id));
    let created = 0;
    for (const o of olds) {
      if (done.has(o.id)) continue;
      const email = `${tr(o.username || `user${o.id}`)}.${o.id}@${EMAIL_DOMAIN}`;
      const res = await fetch(`${NEW_URL}/auth/v1/admin/users`, {
        method: "POST", headers: hdr(NEW_KEY),
        body: JSON.stringify({
          email, email_confirm: true,
          password: crypto.randomUUID() + crypto.randomUUID(), // geçici; ilk girişte eski şifreyle değişir
          app_metadata: { company_id: companyId },
          user_metadata: { username: o.username, full_name: o.name },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`kullanıcı ${o.username}: ${JSON.stringify(body)}`);
      await upsert("profiles", [{
        id: body.id, company_id: companyId, legacy_id: o.id,
        full_name: o.name || o.username, username: o.username,
        role: roleMap(o.role, o.user_group), is_active: o.active === 1,
        auto_logout_enabled: o.timeout_enabled === 1, auto_logout_minutes: o.session_timeout_minutes,
        last_seen_at: ts(o.last_seen), created_at: ts(o.created_at) ?? new Date().toISOString(),
      }]);
      if (o.password_hash) await upsert("legacy_credentials", [{ user_id: body.id, password_hash: o.password_hash }], "user_id");
      created++;
    }
    // created_by eşlemesi (ikinci tur)
    const { u } = await context();
    const links = olds.filter((o) => o.created_by && u(o.created_by)).map((o) => ({ id: u(o.id), created_by: u(o.created_by) }));
    for (const l of links) {
      await fetch(`${NEW_URL}/rest/v1/profiles?id=eq.${l.id}`, {
        method: "PATCH", headers: hdr(NEW_KEY), body: JSON.stringify({ created_by: l.created_by }),
      });
    }
    return { created, total: olds.length };
  },

  async customers(from, limit) {
    const { companyId, lk, u } = await context();
    const rows = (await oldRows("crm_customers", from, limit)).map((o) => ({
      id: o.id, legacy_id: o.id, company_id: companyId,
      full_name: (o.full_name || "").trim() || "İsimsiz", phone: (o.phone || "").trim(),
      email: o.email || null, city: o.city || null, sector: o.sector || null,
      data_type_id: lk("data_type", o.data_type), status_id: lk("contact_status", o.status),
      assigned_to: u(o.assigned_to), assigned_by: u(o.assigned_by),
      last_note: o.notes || null, applied_at: ts(o.data_date), last_action_at: ts(o.last_action_at),
      extra: {
        problem: o.problem || undefined, assignment_note: o.assignment_note || undefined,
        wp_ai_start: o.wp_ai_start || undefined, wp_ai_end: o.wp_ai_end || undefined,
        wp_ai_started_by: o.wp_ai_started_by || undefined,
        interest_training: o.training_name || undefined, interest_package: o.training_package_name || undefined,
        created_by_legacy: o.created_by || undefined, updated_at_legacy: o.updated_at || undefined,
      },
      is_active: !o.deleted_at, deactivated_at: ts(o.deleted_at),
      created_at: ts(o.created_at) ?? ts(o.data_date) ?? new Date().toISOString(),
    }));
    return upsert("customers", rows);
  },

  async interactions(from, limit) {
    const { companyId, u } = await context();
    const rows = (await oldRows("crm_interactions", from, limit)).filter((o) => o.customer_id).map((o) => ({
      id: o.id, company_id: companyId, customer_id: o.customer_id, user_id: u(o.user_id),
      channel: o.channel || null, note: o.note || null, next_followup_at: ts(o.next_followup_date),
      created_at: ts(o.interaction_date) ?? ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("interactions", rows);
  },

  async sales(from, limit) {
    const { companyId, lk, u, products } = await context();
    const olds = await oldRows("crm_sales", from, limit);
    const rows = olds.filter((o) => o.customer_id).map((o) => ({
      id: o.id, legacy_id: o.id, company_id: companyId, customer_id: o.customer_id, seller_id: u(o.salesperson_id),
      order_date: day(o.order_date) ?? day(o.created_at) ?? new Date().toISOString().slice(0, 10),
      amount: o.amount ?? 0, net_amount: o.received_amount, payer_name: o.payer_name || null,
      bank_id: lk("bank", o.bank_name), sale_source_id: lk("sale_source", o.sale_source),
      payment_method_id: lk("payment_method", o.payment_type), installments: o.installments,
      data_type_id: lk("data_type", o.data_type), sector: o.sector || null, call_date: day(o.call_date),
      note: o.sale_note || null, is_active: !o.deleted_at,
      extra: { training_name: o.training_name || undefined, training_package_name: o.training_package_name || undefined,
               meeting_added: o.meeting_added || undefined, wp_ai_start: o.wp_ai_start || undefined, wp_ai_end: o.wp_ai_end || undefined },
      created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    await upsert("sales", rows);
    // Eğitim/paket bağlantıları: isim eşleşmesi
    const links: Row[] = [];
    for (const o of olds) {
      const names = new Set<string>();
      if (o.training_package_name) names.add(String(o.training_package_name).trim());
      for (const n of String(o.training_name || "").split(/\s*(?:,|\+|\n)\s*/)) if (n) names.add(n.trim());
      for (const n of names) {
        const p = products.find((p: Row) => p.name === n);
        if (p) links.push({ sale_id: o.id, product_id: p.id });
      }
    }
    await upsert("sale_products", links, "sale_id,product_id");
    return { sales: rows.length, product_links: links.length };
  },

  async expected(from, limit) {
    const { companyId, u } = await context();
    const st = (s: string) => ({ Bekleniyor: "bekliyor", Kazanıldı: "kazanildi", Ertelendi: "ertelendi" } as Row)[s] ?? "vazgecti";
    const rows = (await oldRows("crm_expected_sales", from, limit)).filter((o) => o.customer_id).map((o) => ({
      id: o.id, company_id: companyId, customer_id: o.customer_id, seller_id: u(o.salesperson_id),
      expected_at: ts(o.expected_date), amount: o.expected_amount, status: o.deleted_at ? "vazgecti" : st(o.status),
      note: o.note || null, created_at: ts(o.created_at) ?? new Date().toISOString(),
      updated_at: ts(o.updated_at) ?? ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("expected_sales", rows);
  },

  async meetings(from, limit) {
    const { companyId, u } = await context();
    const rows = (await oldRows("crm_appointments", from, limit)).filter((o) => o.customer_id && ts(o.appointment_date)).map((o) => ({
      id: o.id, company_id: companyId, customer_id: o.customer_id, seller_id: u(o.salesperson_id),
      title: o.title || null, scheduled_at: ts(o.appointment_date),
      status: o.deleted_at ? "iptal" : o.status === "Görüşüldü" ? "yapildi" : "planlandi",
      note: o.note || null, created_by: u(o.created_by), created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("meetings", rows);
  },

  async satisfaction(from, limit) {
    const { companyId, u } = await context();
    const st = (s: string) => ({ Bekliyor: "bekliyor", Arandı: "arandi", Memnun: "memnun", "Şikayet Var": "sikayet_var" } as Row)[s] ?? "bekliyor";
    const rows = (await oldRows("crm_satisfaction", from, limit)).filter((o) => o.customer_id).map((o) => ({
      id: o.id, company_id: companyId, customer_id: o.customer_id, sold_by: u(o.salesperson_id),
      responsible_id: u(o.assigned_to) ?? u(o.salesperson_id), called_at: ts(o.call_date),
      status: st(o.status), note: o.satisfaction_note || null, created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("satisfaction_calls", rows);
  },

  async ads(from, limit) {
    const { companyId } = await context();
    const rows = (await oldRows("crm_ad_management", from, limit)).map((o) => ({
      id: o.id, company_id: companyId, brand: o.brand_name || "-", started_at: day(o.start_date),
      monthly_fee: o.monthly_fee ?? 0, status: o.status === "Devam Ediyor" ? "devam" : "bitti",
      ended_at: day(o.end_date), notes: o.notes || null, is_admin_private: o.private_admin === 1,
      is_active: !o.deleted_at, created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("ad_clients", rows);
  },

  async announcements(from, limit) {
    const { companyId, u } = await context();
    const rows = (await oldRows("crm_announcements", from, limit)).filter((o) => o.note).map((o) => ({
      id: o.id, company_id: companyId, body: o.note, created_by: u(o.created_by),
      is_active: o.active === 1, created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("announcements", rows);
  },

  async notifications(from, limit) {
    const { companyId, u } = await context();
    const rows = (await oldRows("crm_notifications", from, limit)).filter((o) => u(o.user_id)).map((o) => ({
      id: o.id, company_id: companyId, user_id: u(o.user_id), customer_id: o.customer_id || null,
      title: (o.message || "Bildirim").slice(0, 300), body: o.message || null,
      read_at: o.is_read === 1 ? (ts(o.created_at) ?? new Date().toISOString()) : null,
      created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("notifications", rows);
  },

  async audit(from, limit) {
    const { companyId, u } = await context();
    const rows = (await oldRows("crm_audit_log", from, limit)).map((o) => ({
      id: o.id, company_id: companyId, user_id: u(o.user_id), action: o.action || "legacy",
      table_name: o.entity || "legacy", row_id: o.entity_id != null ? String(o.entity_id) : null,
      new_data: { details: o.details, legacy: true }, created_at: ts(o.created_at) ?? new Date().toISOString(),
    }));
    return upsert("audit_logs", rows);
  },
};

Deno.serve(async (req) => {
  try {
    // Tek kullanımlık jeton kontrolü (migration_control tablosu; istemciden okunamaz)
    const [ctrl] = await newGet("migration_control?select=token");
    if (!ctrl || req.headers.get("x-migration-token") !== ctrl.token) {
      return new Response(JSON.stringify({ error: "yetkisiz" }), { status: 401 });
    }
    if (!OLD_KEY) return new Response(JSON.stringify({ error: "OLD_SERVICE_ROLE_KEY tanımlı değil" }), { status: 500 });
    const { step, from = 0, limit = 100000 } = await req.json();
    if (!steps[step]) return new Response(JSON.stringify({ error: `bilinmeyen adım: ${step}` }), { status: 400 });
    const t0 = Date.now();
    const result = await steps[step](from, limit);
    return new Response(JSON.stringify({ step, from, limit, result, ms: Date.now() - t0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
