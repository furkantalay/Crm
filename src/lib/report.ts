import { createClient } from "@/lib/supabase/server";
import { todayIst } from "@/lib/format";

export type ReportFilters = Record<string, string | undefined>;

/** Dönem seçimini [başlangıç, bitiş] tarihine çevirir (İstanbul). */
export function periodRange(f: ReportFilters): [string, string, string] {
  const today = todayIst();
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (f.donem) {
    case "gecen_ay": {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${lastDay(py, pm)}`, "Geçen Ay"];
    }
    case "son_7": {
      const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 6);
      return [d.toISOString().slice(0, 10), today, "Son 7 Gün"];
    }
    case "bu_yil": return [`${y}-01-01`, today, "Bu Yıl"];
    case "ozel": return [f.bas || `${y}-${pad(m)}-01`, f.bit || today, "Özel Aralık"];
    default: return [`${y}-${pad(m)}-01`, today, "Bu Ay"];
  }
}

export type SaleRow = {
  id: number; order_date: string; customer_id: number; customer_name: string; customer_phone: string;
  seller_id: string | null; seller_name: string | null; amount: number; net_amount: number | null;
  payment_method: string | null; installments: number | null; sale_source: string | null; bank: string | null;
  payer_name: string | null; data_type: string | null; products: string | null;
};

export async function loadReport(f: ReportFilters) {
  const supabase = await createClient();
  const [from, to, label] = periodRange(f);
  let q = supabase.from("v_sale_list").select("*").eq("is_active", true).gte("order_date", from).lte("order_date", to);
  if (f.satisci) q = q.eq("seller_id", f.satisci);
  if (f.odeme) q = q.eq("payment_method_id", f.odeme);
  if (f.kaynak) q = q.eq("sale_source_id", f.kaynak);
  if (f.tip) q = q.eq("data_type_id", f.tip);
  const { data, error } = await q.order("seller_name").order("order_date", { ascending: false }).limit(5000);
  let rows = (data ?? []) as SaleRow[];
  if (f.egitim) rows = rows.filter((r) => (r.products ?? "").includes(f.egitim!));

  // Dönem içinde aktif reklam yönetimi kayıtları (admin özel hariç)
  const { data: ads } = await supabase.from("ad_clients").select("monthly_fee, started_at, ended_at, is_admin_private, status")
    .eq("is_active", true).eq("status", "devam").eq("is_admin_private", false);
  const adRows = (ads ?? []).filter((a) => (!a.started_at || a.started_at <= to) && (!a.ended_at || a.ended_at >= from));

  const revenue = rows.reduce((s, r) => s + Number(r.amount), 0);
  const net = rows.reduce((s, r) => s + Number(r.net_amount ?? r.amount), 0);
  const adSum = adRows.reduce((s, r) => s + Number(r.monthly_fee), 0);
  return { from, to, label, rows, error, revenue, net, adCount: adRows.length, adSum };
}
