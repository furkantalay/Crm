import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthStartIst, num, tl, todayIst } from "@/lib/format";

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`card ${accent ? "border-l-4 border-amber-500" : ""}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default async function PanelPage() {
  const me = await getMe();
  const supabase = await createClient();
  const monthStart = monthStartIst();

  const [total, active, monthSales, ads, summary] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("v_customer_list").select("id", { count: "exact", head: true })
      .eq("is_active", true).or("status_is_won.is.null,status_is_won.eq.false"),
    supabase.from("sales").select("amount, net_amount").eq("is_active", true).gte("order_date", monthStart),
    supabase.from("ad_clients").select("monthly_fee, is_admin_private, started_at, ended_at").eq("is_active", true).eq("status", "devam"),
    supabase.from("v_seller_summary").select("*").eq("user_active", true).order("month_revenue", { ascending: false }),
  ]);

  const salesCount = monthSales.data?.length ?? 0;
  const salesSum = (monthSales.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const netSum = (monthSales.data ?? []).reduce((s, r) => s + Number(r.net_amount ?? r.amount), 0);
  // Bu ay içinde aktif olan reklam kayıtları (eski paneldeki hesapla aynı)
  const today = todayIst();
  const adRows = (ads.data ?? []).filter((a) =>
    (!a.started_at || a.started_at <= today) && (!a.ended_at || a.ended_at >= monthStart));
  const adPublic = adRows.filter((a) => !a.is_admin_private);
  const adPrivate = adRows.filter((a) => a.is_admin_private);
  const adSum = adPublic.reduce((s, r) => s + Number(r.monthly_fee), 0);
  const adPrivSum = adPrivate.reduce((s, r) => s + Number(r.monthly_fee), 0);
  const sellers = (summary.data ?? []).filter((s) => isStaff(me.role) || s.seller_id === me.id);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{isStaff(me.role) ? "Genel Panel" : "Panelim"}</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Toplam Data" value={num(total.count)} sub="Pasife alınanlar hariç" />
        <Stat label="Aktif Data" value={num(active.count)} sub="Satışa dönmemiş" />
        <Stat label="Bu Ay Satış" value={num(salesCount)} />
        <Stat label="Bu Ay Satış Cirosu" value={tl(salesSum)} />
        <Stat label="Bu Ay Bize Kalan" value={tl(netSum)} sub={salesSum ? `Kesinti: ${tl(salesSum - netSum)}` : undefined} />
        {me.role !== "satisci" && (
          <>
            <Stat label="Bu Ay Reklam Yönetimi" value={tl(adSum)} sub={`${adPublic.length} kayıt`} />
            <Stat label="Bize Kalan + Reklam" value={tl(netSum + adSum)} sub={`Brüt satış + reklam: ${tl(salesSum + adSum)}`} />
          </>
        )}
        {me.role === "admin" && (
          <Stat label="Admin Özel Reklam" value={tl(adPrivSum)} sub={`${adPrivate.length} kayıt / genel toplama dahil değil`} accent />
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">{isStaff(me.role) ? "Satışçı Genel Özeti" : "Özetim"}</h2>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Satışçı</th><th className="th">Elindeki Data</th>
              <th className="th">Bu Ay Satış</th><th className="th">Bu Ay Ciro</th>
              <th className="th">Toplam Satış</th><th className="th">Toplam Ciro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sellers.map((s) => (
              <tr key={s.seller_id}>
                <td className="td font-medium">{s.seller_name}</td>
                <td className="td">{num(s.active_data)}</td>
                <td className="td">{num(s.month_sales)}</td>
                <td className="td">{tl(s.month_revenue)}</td>
                <td className="td">{num(s.total_sales)}</td>
                <td className="td">{tl(s.total_revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
