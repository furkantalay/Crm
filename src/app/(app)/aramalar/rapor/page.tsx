import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, todayIst } from "@/lib/format";
import { callDur } from "@/lib/calls";
import { timeIst } from "@/lib/team";

type SP = Promise<Record<string, string | undefined>>;
type Row = { day: string; user_id: string; full_name: string; out_calls: number; answered: number; in_calls: number; missed: number;
  talk_seconds: number; avg_seconds: number; first_call: string; last_call: string; customers: number };

function shiftDay(d: string, n: number) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pct = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

export default async function CallReportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const today = todayIst();
  const to = isDay(sp.bitis) ? sp.bitis! : today;
  const from = isDay(sp.baslangic) ? sp.baslangic! : shiftDay(to, -13);
  const { data, error } = await supabase.rpc("call_report", { p_from: from, p_to: to });
  const rows = (data ?? []) as Row[];

  // kişi bazlı toplam
  const people = new Map<string, { name: string; out: number; ans: number; inc: number; miss: number; talk: number; days: number }>();
  for (const r of rows) {
    const p = people.get(r.user_id) ?? { name: r.full_name, out: 0, ans: 0, inc: 0, miss: 0, talk: 0, days: 0 };
    p.out += r.out_calls; p.ans += r.answered; p.inc += r.in_calls; p.miss += r.missed; p.talk += r.talk_seconds; p.days += 1;
    people.set(r.user_id, p);
  }
  const totals = [...people.entries()].sort((a, b) => b[1].talk - a[1].talk);
  const days = [...new Set(rows.map((r) => r.day))];
  const maxTalk = Math.max(1, ...rows.map((r) => r.talk_seconds));

  return (
    <div className="space-y-4">
      <Link href="/aramalar" className="text-sm text-blue-700 hover:underline">← Aramalar</Link>
      <h1 className="text-3xl font-bold">Arama Raporu</h1>
      <p className="text-sm text-slate-600">Telefon uygulamasından gelen aramalar, gün gün ve satışçı satışçı. Konuşma süresi, açılan giden ve gelen aramaların toplamıdır.</p>

      <form className="card flex flex-wrap items-end gap-3" action="/aramalar/rapor">
        <div><label className="label">Başlangıç</label><input type="date" name="baslangic" defaultValue={from} max={today} className="input" /></div>
        <div><label className="label">Bitiş</label><input type="date" name="bitis" defaultValue={to} max={today} className="input" /></div>
        <button className="btn">Göster</button>
        <Link href={`/aramalar/rapor?baslangic=${today}&bitis=${today}`} className="btn-light">Bugün</Link>
        <Link href={`/aramalar/rapor?baslangic=${shiftDay(today, -6)}&bitis=${today}`} className="btn-light">Son 7 gün</Link>
        <Link href={`/aramalar/rapor?baslangic=${today.slice(0, 8)}01&bitis=${today}`} className="btn-light">Bu ay</Link>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Dönem toplamı · {date(from)} – {date(to)}</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Satışçı</th><th className="th">Toplam konuşma</th><th className="th">Günlük ort.</th>
            <th className="th">Giden</th><th className="th">Açılan</th><th className="th">Gelen</th><th className="th">Cevapsız</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {totals.map(([id, p]) => (
              <tr key={id}>
                <td className="td font-medium"><Link href={`/ekip/${id}`} className="text-blue-700 hover:underline">{p.name}</Link></td>
                <td className="td font-semibold">{callDur(p.talk)}</td>
                <td className="td">{callDur(Math.round(p.talk / Math.max(1, p.days)))} <span className="text-xs text-slate-500">({p.days} gün)</span></td>
                <td className="td">{p.out}</td>
                <td className="td">{p.ans} <span className="text-xs text-slate-500">{pct(p.ans, p.out)}</span></td>
                <td className="td">{p.inc}</td>
                <td className="td">{p.miss}</td>
              </tr>
            ))}
            {!totals.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={7}>Bu aralıkta arama yok. Telefon uygulaması kurulu satışçıların aramaları burada görünür.</td></tr>}
          </tbody>
        </table>
      </div>

      {days.map((d) => {
        const list = rows.filter((r) => r.day === d).sort((a, b) => b.talk_seconds - a.talk_seconds);
        const dayTalk = list.reduce((s, r) => s + r.talk_seconds, 0);
        return (
          <div key={d} className="card overflow-x-auto p-0">
            <h2 className="p-4 pb-2 text-lg font-semibold">{date(d)} <span className="text-sm font-normal text-slate-500">· ekip toplamı {callDur(dayTalk)}</span></h2>
            <table className="w-full">
              <thead className="bg-slate-50"><tr>
                <th className="th">Satışçı</th><th className="th w-1/3">Konuşma</th><th className="th">Giden / açılan</th><th className="th">Gelen</th>
                <th className="th">Cevapsız</th><th className="th">Ort. görüşme</th><th className="th">İlk – son arama</th><th className="th">Farklı müşteri</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r) => (
                  <tr key={r.user_id}>
                    <td className="td font-medium"><Link href={`/ekip/${r.user_id}?gun=${d}`} className="text-blue-700 hover:underline">{r.full_name}</Link></td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded bg-blue-500" style={{ width: `${Math.max(2, (r.talk_seconds / maxTalk) * 100)}%` }} />
                        <span className="whitespace-nowrap text-sm font-semibold">{callDur(r.talk_seconds)}</span>
                      </div>
                    </td>
                    <td className="td whitespace-nowrap">{r.out_calls} / {r.answered} <span className="text-xs text-slate-500">{pct(r.answered, r.out_calls)}</span></td>
                    <td className="td">{r.in_calls}</td>
                    <td className="td">{r.missed}</td>
                    <td className="td whitespace-nowrap">{callDur(r.avg_seconds)}</td>
                    <td className="td whitespace-nowrap">{timeIst(r.first_call)} – {timeIst(r.last_call)}</td>
                    <td className="td">{r.customers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
