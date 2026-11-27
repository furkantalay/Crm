import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, num, todayIst } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { saveSpeed, setFunnelAuto, setReceivesLeads } from "./actions";

type Speed = { user_id: string; full_name: string; assigned: number; touched: number; open_now: number; avg_min: number | null; median_min: number | null; within_seller_min: number; late: number };
const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const fmtMin = (m: number | null) => (m == null ? "—" : m < 60 ? `${Math.round(m)} dk` : `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`);
type Row = { user_id: string; full_name: string; receives_leads: boolean; online: boolean; leads_180: number; sales_180: number; conv: number | null; weight: number; today_count: number };

export default async function DistributionPage() {
  const me = await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const todayStart = new Date(`${todayIst()}T00:00:00+03:00`).toISOString();
  const weekAgo = new Date(Date.now() - 6 * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const [{ data: state, error }, { data: co }, { data: lastRow }, { data: recent }, { data: speedRows }] = await Promise.all([
    supabase.rpc("lead_distribution_view"),
    supabase.from("companies").select("settings").eq("id", me.company_id).single(),
    supabase.from("funnel_rows").select("first_seen_at").eq("source", "canli").order("first_seen_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("customers").select("id, full_name, sector, created_at, assigned_to, extra, profiles:assigned_to(full_name)")
      .not("extra->funnel_row", "is", null).gte("created_at", todayStart).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("speed_stats", { p_from: weekAgo, p_to: todayIst() }),
  ]);
  const speed = (speedRows ?? []) as Speed[];
  const sp = ((co?.settings as Record<string, unknown> | null)?.speed ?? {}) as { seller_min?: number; manager_min?: number; start?: string; end?: string; days?: number[] };
  const rows = (state ?? []) as Row[];
  const active = rows.filter((r) => r.receives_leads);
  const others = rows.filter((r) => !r.receives_leads);
  const auto = !!(co?.settings as Record<string, unknown> | null)?.funnel_auto_create;
  const anyOnline = active.some((r) => r.online);
  const totalW = active.reduce((a, r) => a + Number(r.weight), 0) || 1;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Data Dağıtımı</h1>
      <p className="text-sm text-slate-600">
        Web sitesindeki formu dolduran kişi Google Sheet&apos;e, oradan birkaç dakika içinde CRM&apos;e düşer ve aşağıdaki kurala göre bir satışçıya atanır.
        Satışçıya bildirim gider. Sayfada A sütununa satışçı adı yazılmışsa data o kişiye gider. Numara CRM&apos;de zaten varsa yeni data açılmaz, mevcut datanın sahibine &quot;tekrar başvurdu&quot; bildirimi gider.
      </p>

      <div className={`card flex flex-wrap items-center justify-between gap-3 border-l-4 ${auto ? "border-green-500" : "border-amber-500"}`}>
        <div>
          <div className="font-semibold">{auto ? "✅ Otomatik data açma AÇIK" : "⏸ Otomatik data açma KAPALI"}</div>
          <div className="text-sm text-slate-600">
            {auto ? "Formdan gelen yeni kişiler CRM'de data olarak açılıp dağıtılıyor." : "Gelen satırlar kaydediliyor ama CRM'de data açılmıyor. Eski CRM'den geçiş günü açılacak."}
            {" "}Son gelen satır: {lastRow?.first_seen_at ? dateTime(lastRow.first_seen_at) : "henüz yok (Google Sheet bağlantısı kurulmamış)"}
          </div>
        </div>
        {me.role === "admin" && (
          <ActionForm action={setFunnelAuto} resetOnSuccess={false} submitLabel={auto ? "Kapat" : "Aç"}>
            <input type="hidden" name="on" value={auto ? "0" : "1"} />
          </ActionForm>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Dağıtıma açık satışçılar</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Satışçı</th><th className="th">Şu an</th><th className="th">Son 6 ay satış oranı</th>
            <th className="th">Ağırlık</th><th className="th">Beklenen pay</th><th className="th">Bugün aldığı</th><th className="th"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((r) => (
              <tr key={r.user_id}>
                <td className="td font-medium">{r.full_name}</td>
                <td className="td">{r.online ? <span className="pill bg-green-100 text-green-800">CRM&apos;de</span> : <span className="pill">çevrimdışı</span>}</td>
                <td className="td">{r.conv != null ? `%${r.conv}` : "—"} <span className="text-xs text-slate-500">({num(r.sales_180)}/{num(r.leads_180)})</span></td>
                <td className="td">{Number(r.weight).toFixed(2)}</td>
                <td className="td">%{Math.round((Number(r.weight) / totalW) * 100)}</td>
                <td className="td font-semibold">{r.today_count}</td>
                <td className="td">
                  <ActionForm action={setReceivesLeads} resetOnSuccess={false} submitLabel="Dağıtımdan çıkar">
                    <input type="hidden" name="id" value={r.user_id} /><input type="hidden" name="on" value="0" />
                  </ActionForm>
                </td>
              </tr>
            ))}
            {!active.length && <tr><td className="td py-6 text-center text-amber-700" colSpan={7}>Dağıtıma açık satışçı yok; yeni datalar atanmadan bekler.</td></tr>}
          </tbody>
        </table>
        <div className="space-y-1 p-4 text-xs text-slate-500">
          <p><b>Kural:</b> Yeni data, o an CRM&apos;de olan satışçılar arasında dağıtılır{anyOnline ? "" : " (şu an kimse CRM'de değil; o yüzden hepsi sırada)"}. Kimse CRM&apos;de değilse (gece, hafta sonu) hepsi sıraya girer.</p>
          <p><b>Ağırlık:</b> son 6 ayın satış oranının ekip ortalamasına oranı; en az 0,70, en fazla 1,30. Satış oranı yüksek olan biraz daha fazla alır ama kimse payının çok altına düşmez. Sıradaki data, &quot;bugün aldığı ÷ ağırlık&quot; en düşük olana gider.</p>
        </div>
      </div>

      {!!others.length && (
        <div className="card">
          <h2 className="mb-2 text-lg font-semibold">Dağıtıma kapalı</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((r) => (
              <ActionForm key={r.user_id} action={setReceivesLeads} resetOnSuccess={false} submitLabel={`${r.full_name} → dağıtıma ekle`}>
                <input type="hidden" name="id" value={r.user_id} /><input type="hidden" name="on" value="1" />
              </ActionForm>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">⏱ İlk temas hızı · son 7 gün</h2>
        <p className="px-4 pb-2 text-sm text-slate-600">Data satışçıya atandıktan sonra ilk aramaya (ya da görüşme notuna) kadar geçen süre. {sp.seller_min ?? 5} dk içinde aranmazsa satışçıya, {sp.manager_min ?? 15} dk içinde aranmazsa yöneticilere bildirim gider (yalnız mesai içinde: {sp.start ?? "09:00"}–{sp.end ?? "19:00"}).</p>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Satışçı</th><th className="th">Atanan</th><th className="th">Arandı</th><th className="th">Hâlâ aranmadı</th>
            <th className="th">Ortalama</th><th className="th">Ortanca</th><th className="th">{sp.seller_min ?? 5} dk içinde</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {speed.map((r) => (
              <tr key={r.user_id}>
                <td className="td font-medium">{r.full_name}</td>
                <td className="td">{r.assigned}</td>
                <td className="td">{r.touched}</td>
                <td className={`td ${r.open_now ? "font-semibold text-red-700" : ""}`}>{r.open_now}</td>
                <td className="td">{fmtMin(r.avg_min)}</td>
                <td className="td">{fmtMin(r.median_min)}</td>
                <td className="td">{r.assigned ? `%${Math.round((r.within_seller_min / r.assigned) * 100)}` : "—"}</td>
              </tr>
            ))}
            {!speed.length && <tr><td className="td py-6 text-center text-slate-500" colSpan={7}>Son 7 günde atanan data yok. Ölçüm, yeni CRM&apos;de atanan datalarla başlar.</td></tr>}
          </tbody>
        </table>
        {me.role === "admin" && (
          <div className="border-t border-slate-100 p-4">
            <ActionForm action={saveSpeed} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-wrap items-end gap-3 text-sm">
              <div><label className="label">Satışçıya uyarı (dk)</label><input name="seller_min" defaultValue={sp.seller_min ?? 5} inputMode="numeric" className="input w-24" /></div>
              <div><label className="label">Yöneticiye uyarı (dk)</label><input name="manager_min" defaultValue={sp.manager_min ?? 15} inputMode="numeric" className="input w-24" /></div>
              <div><label className="label">Mesai başı</label><input type="time" name="start" defaultValue={sp.start ?? "09:00"} className="input" /></div>
              <div><label className="label">Mesai sonu</label><input type="time" name="end" defaultValue={sp.end ?? "19:00"} className="input" /></div>
              <div className="flex gap-2 pb-2">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1"><input type="checkbox" name={`d${i + 1}`} value="1" defaultChecked={(sp.days ?? [1, 2, 3, 4, 5, 6]).includes(i + 1)} />{d}</label>
                ))}
              </div>
            </ActionForm>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Bugün formdan gelenler ({recent?.length ?? 0})</h2>
        <table className="w-full">
          <tbody className="divide-y divide-slate-100">
            {(recent ?? []).map((c) => {
              const owner = (c.profiles as unknown as { full_name: string } | null)?.full_name;
              const autoAssigned = (c.extra as Record<string, unknown> | null)?.auto_assigned === true;
              return (
                <tr key={c.id}>
                  <td className="td whitespace-nowrap">{dateTime(c.created_at)}</td>
                  <td className="td"><Link href={`/datalar/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.full_name}</Link><div className="text-xs text-slate-500">{c.sector}</div></td>
                  <td className="td whitespace-nowrap">{owner ?? <span className="text-amber-700">atanmadı</span>} {owner && <span className="text-xs text-slate-500">{autoAssigned ? "(otomatik)" : "(sayfadan)"}</span>}</td>
                </tr>
              );
            })}
            {!recent?.length && <tr><td className="td py-6 text-center text-slate-500">Bugün formdan gelen data yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
