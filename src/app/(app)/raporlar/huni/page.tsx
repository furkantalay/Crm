import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, num, tl, todayIst } from "@/lib/format";

type SP = Promise<Record<string, string | undefined>>;
type Row = { user_id: string; full_name: string; leads: number; touched: number; talked: number; warm: number; sold: number; revenue: number; avg_days_to_sale: number | null };
const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const fmtPct = (a: number, b: number) => (b ? `%${pct(a, b).toFixed(pct(a, b) < 10 ? 1 : 0)}` : "—");
const STAGES = [
  { key: "leads", label: "Data", hint: "Dönemde başvuran ve bir satışçıya atanan" },
  { key: "touched", label: "Temas", hint: "Mesaj atıldı, not girildi ya da arandı" },
  { key: "talked", label: "Görüşüldü", hint: "Gerçekten konuşuldu (Arandı/Olumlu/Olumsuz/Toplantı ya da konuşulan arama)" },
  { key: "warm", label: "Sıcak", hint: "Olumlu, toplantı ya da beklenen satış kaydı var" },
  { key: "sold", label: "Satış", hint: "En az bir aktif satış" },
] as const;

export default async function FunnelPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const today = todayIst();
  const from = isDay(sp.baslangic) ? sp.baslangic! : `${today.slice(0, 8)}01`;
  const to = isDay(sp.bitis) ? sp.bitis! : today;
  const { data, error } = await supabase.rpc("funnel_stages", { p_from: from, p_to: to });
  const rows = ((data ?? []) as Row[]).filter((r) => r.leads > 0);
  const total = STAGES.reduce((acc, s) => ({ ...acc, [s.key]: rows.reduce((t, r) => t + r[s.key], 0) }), {} as Record<string, number>);
  const revenue = rows.reduce((t, r) => t + Number(r.revenue), 0);
  const prevMonth = (() => { const d = new Date(today + "T12:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); const s = d.toISOString().slice(0, 10); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); return [s, e]; })();

  return (
    <div className="space-y-4">
      <Link href="/raporlar" className="text-sm text-blue-700 hover:underline">← Raporlar</Link>
      <h1 className="text-3xl font-bold">Satış Hunisi</h1>
      <p className="text-sm text-slate-600">{date(from)} – {date(to)} arasında başvuran datalar bugüne kadar hangi aşamaya ilerledi. Satış, başvurudan sonra hangi tarihte olursa olsun sayılır.</p>

      <form className="card flex flex-wrap items-end gap-3" action="/raporlar/huni">
        <div><label className="label">Başvuru başlangıç</label><input type="date" name="baslangic" defaultValue={from} max={today} className="input" /></div>
        <div><label className="label">Başvuru bitiş</label><input type="date" name="bitis" defaultValue={to} max={today} className="input" /></div>
        <button className="btn">Göster</button>
        <Link href="/raporlar/huni" className="btn-light">Bu ay</Link>
        <Link href={`/raporlar/huni?baslangic=${prevMonth[0]}&bitis=${prevMonth[1]}`} className="btn-light">Geçen ay</Link>
      </form>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="card space-y-2">
        <h2 className="text-lg font-semibold">Ekip toplamı</h2>
        {STAGES.map((s, i) => {
          const v = total[s.key] ?? 0;
          const prev = i ? total[STAGES[i - 1].key] ?? 0 : 0;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-sm"><b>{s.label}</b><div className="text-xs text-slate-500">{fmtPct(v, total.leads)} toplam</div></div>
              <div className="flex-1">
                <div className="flex h-8 items-center rounded bg-blue-600 px-2 text-sm font-semibold text-white" style={{ width: `${Math.max(3, pct(v, total.leads || 1))}%` }}>{num(v)}</div>
              </div>
              <div className="w-36 shrink-0 text-right text-xs text-slate-500">{i ? <>önceki aşamadan <b className="text-slate-800">{fmtPct(v, prev)}</b></> : s.hint}</div>
            </div>
          );
        })}
        <p className="pt-1 text-sm">Ciro: <b>{tl(revenue)}</b> · data başına ciro: <b>{tl(total.leads ? revenue / total.leads : 0)}</b></p>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Satışçı bazında</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Satışçı</th>
            {STAGES.map((s) => <th key={s.key} className="th" title={s.hint}>{s.label}</th>)}
            <th className="th">Data → satış</th><th className="th">Görüşülen → satış</th><th className="th">Ciro</th><th className="th">Ort. satış süresi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td className="td font-medium">{r.full_name}</td>
                {STAGES.map((s, i) => (
                  <td key={s.key} className="td">{num(r[s.key])}{i > 0 && <div className="text-xs text-slate-500">{fmtPct(r[s.key], r[STAGES[i - 1].key])}</div>}</td>
                ))}
                <td className="td font-semibold">{fmtPct(r.sold, r.leads)}</td>
                <td className="td">{fmtPct(r.sold, r.talked)}</td>
                <td className="td whitespace-nowrap">{tl(r.revenue)}</td>
                <td className="td">{r.avg_days_to_sale != null ? `${r.avg_days_to_sale} gün` : "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={10}>Bu aralıkta data yok.</td></tr>}
          </tbody>
        </table>
        <p className="p-4 pt-2 text-xs text-slate-500">Yüzdelerin altındaki küçük oranlar bir önceki aşamaya göre. &quot;Görüşüldü&quot; aşaması eski kayıtlarda eksik görünebilir: eski CRM&apos;de çoğu data &quot;Mesaj Atıldı&quot; durumunda kalmış. Telefon uygulamasıyla konuşulan aramalar artık kendiliğinden sayılıyor.</p>
      </div>
    </div>
  );
}
