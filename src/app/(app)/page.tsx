import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthStartIst, num, tl, todayIst } from "@/lib/format";
import { loadCommissions } from "@/lib/commission";

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
  const manager = me.role === "admin" || me.role === "yonetici";
  const prim = manager ? new Map((await loadCommissions(todayIst().slice(0, 7))).rows.map((r) => [r.seller_id, r])) : null;
  type Mine = { total: number | null; sale_count: number | null; tier_kind: string | null; tier_value: number | null; monthly_commission: number | null;
    daily_commission: number | null; daily_bonus_days: number | null; next_tier_min: number | null; to_next_tier: number | null;
    today_total: number | null; today_commission: number | null; next_daily_min: number | null };
  const mine = me.role === "satisci" ? ((await supabase.rpc("my_commission", { p_month: monthStart })).data as Mine[] | null)?.[0] ?? null : null;

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

      {mine && (
        <div className="card border-l-4 border-green-600">
          <h2 className="mb-2 text-lg font-semibold">Bu Ay Tahmini Primim</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div><div className="text-sm text-slate-500">Aylık satışım</div><div className="text-xl font-bold">{tl(mine.total ?? 0)}</div></div>
            <div><div className="text-sm text-slate-500">Aylık prim</div><div className="text-xl font-bold">{tl(mine.monthly_commission ?? 0)}</div>
              <div className="text-xs text-slate-500">{mine.tier_kind ? (mine.tier_kind === "percent" ? `%${Number(mine.tier_value)} kademesi` : "sabit kademe") : "henüz kademe yok"}</div></div>
            <div><div className="text-sm text-slate-500">Günlük primler</div><div className="text-xl font-bold">{tl(mine.daily_commission ?? 0)}</div>
              <div className="text-xs text-slate-500">{mine.daily_bonus_days ?? 0} gün</div></div>
            <div><div className="text-sm text-slate-500">Toplam</div><div className="text-xl font-bold text-green-700">{tl(Number(mine.monthly_commission ?? 0) + Number(mine.daily_commission ?? 0))}</div></div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {mine.to_next_tier != null && <p>🎯 Sonraki aylık kademeye <b>{tl(mine.to_next_tier)}</b> kaldı ({tl(mine.next_tier_min)}).</p>}
            <p>📅 Bugün: {tl(mine.today_total ?? 0)} satış{Number(mine.today_commission) > 0 ? <> · <b>{tl(mine.today_commission)}</b> günlük prim kazandın</> : ""}
              {mine.next_daily_min != null && <> · sonraki günlük prime <b>{tl(Number(mine.next_daily_min) - Number(mine.today_total ?? 0))}</b> kaldı</>}</p>
            <p className="text-xs text-slate-500">Tahminidir; iade, iptal ve düzeltmelerle ay sonunda değişebilir.</p>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">{isStaff(me.role) ? "Satışçı Genel Özeti" : "Özetim"}</h2>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Satışçı</th><th className="th">Elindeki Data</th>
              <th className="th">Bu Ay Satış</th><th className="th">Bu Ay Ciro</th>
              <th className="th">Toplam Satış</th><th className="th">Toplam Ciro</th>
              {prim && <th className="th">Bu Ay Prim</th>}
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
                {prim && (() => { const c = prim.get(s.seller_id); return (
                  <td className="td whitespace-nowrap font-semibold text-green-700">
                    {c ? <Link href={`/primler?satisci=${s.seller_id}`} className="hover:underline">{tl(Number(c.monthly_commission) + Number(c.daily_commission))}</Link> : "-"}
                  </td>); })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
