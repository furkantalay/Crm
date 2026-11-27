import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, num, tl, todayIst } from "@/lib/format";

type SP = Promise<Record<string, string | undefined>>;
type Seller = { name: string; leads: number; notes: number; talk_min: number; calls_out: number; sales_sum: number; active_min: number; sales_count: number };
type S = { day: string; sellers: Seller[]; month_sum: number; new_leads: number; sales_sum: number; links_paid: number; not_called: number;
  late_alerts: number; missed_open: number; sales_count: number };

function shiftDay(d: string, n: number) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`);

export default async function SummaryPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const today = todayIst();
  const day = sp.gun && /^\d{4}-\d{2}-\d{2}$/.test(sp.gun) ? sp.gun : shiftDay(today, -1);
  const { data, error } = await supabase.rpc("daily_summary_view", { p_day: day });
  const s = data as S | null;

  const flags: string[] = [];
  if (s) {
    if (s.not_called) flags.push(`${s.not_called} yeni data hiç aranmadı`);
    if (s.late_alerts) flags.push(`${s.late_alerts} data 15 dakikadan geç arandı ya da hiç aranmadı`);
    if (s.missed_open) flags.push(`${s.missed_open} numaradan gelen cevapsız aramaya geri dönülmedi`);
    s.sellers.forEach((x) => { if (!x.sales_count && !x.notes && !x.calls_out) flags.push(`${x.name}: hiç kayıt yok (not, arama, satış)`); });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">☀️ Günün özeti</h1>
        <div className="flex gap-2">
          <Link href={`/ozet?gun=${shiftDay(day, -1)}`} className="btn-light">← Önceki</Link>
          {day < today && <Link href={`/ozet?gun=${shiftDay(day, 1)}`} className="btn-light">Sonraki →</Link>}
        </div>
      </div>
      <p className="text-slate-600">{date(day)}{day === today ? " (bugün, şu ana kadar)" : ""}. Her sabah 08:30&apos;da dünün özeti size bildirim olarak gelir.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card"><div className="text-sm text-slate-500">Satış</div><div className="text-2xl font-bold">{s.sales_count}</div><div className="text-sm text-green-700">{tl(s.sales_sum)}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Ay toplamı</div><div className="text-2xl font-bold">{tl(s.month_sum)}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Yeni data</div><div className="text-2xl font-bold">{num(s.new_leads)}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Ödeme bağlantısıyla</div><div className="text-2xl font-bold">{s.links_paid}</div><div className="text-xs text-slate-500">ödeme</div></div>
          </div>

          {flags.length > 0 && (
            <div className="card border-l-4 border-amber-500">
              <h2 className="mb-2 text-lg font-semibold">Dikkat</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}

          <div className="card overflow-x-auto p-0">
            <h2 className="p-4 pb-2 text-lg font-semibold">Satışçılar</h2>
            <table className="w-full">
              <thead className="bg-slate-50"><tr>
                <th className="th">Satışçı</th><th className="th">Satış</th><th className="th">Giden arama</th><th className="th">Konuşma</th>
                <th className="th">Not</th><th className="th">CRM&apos;de aktif</th><th className="th">Yeni data</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.sellers.map((x) => (
                  <tr key={x.name}>
                    <td className="td font-medium">{x.name}</td>
                    <td className="td whitespace-nowrap">{x.sales_count}{x.sales_count ? ` · ${tl(x.sales_sum)}` : ""}</td>
                    <td className="td">{x.calls_out}</td>
                    <td className="td">{x.talk_min ? dur(x.talk_min) : "—"}</td>
                    <td className="td">{x.notes}</td>
                    <td className="td">{x.active_min ? dur(x.active_min) : "—"}</td>
                    <td className="td">{x.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={`/ekip?gun=${day}`} className="btn-light">Ekip Durumu</Link>
            <Link href={`/aramalar/rapor?baslangic=${day}&bitis=${day}`} className="btn-light">Arama raporu</Link>
            <Link href="/dagitim" className="btn-light">Data Dağıtımı</Link>
          </div>
        </>
      )}
    </div>
  );
}
