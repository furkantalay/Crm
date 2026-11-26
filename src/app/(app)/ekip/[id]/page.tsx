import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, roleLabel, tl, todayIst } from "@/lib/format";
import AutoRefresh from "@/components/AutoRefresh";
import { ago, appState, duration, gapCls, statusOf, timeIst, type TeamRow } from "@/lib/team";
import { callDur } from "@/lib/calls";

type Params = Promise<{ id: string }>;
type SP = Promise<Record<string, string | undefined>>;
type Bucket = { slot: string; events: number; active_pings: number; open_pings: number };
type Ev = { at: string; kind: string; detail: string | null };

const START_H = 7, END_H = 23; // çizelgede gösterilen saatler

function shiftDay(d: string, n: number) {
  const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const hourIst = (v: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(new Date(v)));

function cellCls(b: Bucket) {
  if (b.events >= 3) return "bg-green-600";
  if (b.events > 0) return "bg-green-400";
  if (b.active_pings >= 5) return "bg-blue-400";
  if (b.active_pings > 0) return "bg-blue-200";
  if (b.open_pings > 0) return "bg-amber-200";
  return "bg-slate-100";
}

export default async function TeamMemberPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const today = todayIst();
  const day = sp.gun && /^\d{4}-\d{2}-\d{2}$/.test(sp.gun) ? sp.gun : today;
  const isToday = day === today;

  const { data: person } = await supabase.from("profiles").select("id, full_name, role").eq("id", id).maybeSingle();
  if (!person) notFound();

  const week = Array.from({ length: 7 }, (_, i) => shiftDay(day, -i));
  const [{ data: buckets }, { data: events }, ...weekRes] = await Promise.all([
    supabase.rpc("user_day_buckets", { p_user: id, p_day: day }),
    supabase.rpc("user_day_events", { p_user: id, p_day: day }),
    ...week.map((d) => supabase.rpc("team_activity", { p_day: d })),
  ]);
  const weekRows = week.map((d, i) => ({ d, r: ((weekRes[i].data ?? []) as TeamRow[]).find((x) => x.user_id === id) }));
  const todayRow = weekRows[0].r;
  const now = Date.now();
  const st = todayRow && isToday ? statusOf(todayRow, now) : null;

  const bs = ((buckets ?? []) as Bucket[]).filter((b) => { const h = hourIst(b.slot); return h >= START_H && h < END_H; });
  const evs = (events ?? []) as Ev[];

  // Kayıtlar arasındaki 45 dk üstü boşlukları listeye ara satır olarak ekle
  const list: ({ t: "ev"; e: Ev } | { t: "gap"; from: string; min: number })[] = [];
  evs.forEach((e, i) => {
    if (i > 0) {
      const m = Math.round((new Date(e.at).getTime() - new Date(evs[i - 1].at).getTime()) / 60_000);
      if (m >= 45) list.push({ t: "gap", from: evs[i - 1].at, min: m });
    }
    list.push({ t: "ev", e });
  });

  return (
    <div className="space-y-4">
      {isToday && <AutoRefresh seconds={60} />}
      <Link href={`/ekip?gun=${day}`} className="text-sm text-blue-700 hover:underline">← Ekip Durumu</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{person.full_name}</h1>
          <div className="text-sm text-slate-500">{roleLabel[person.role]} · {date(day)}{isToday && " (bugün)"}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/ekip/${id}?gun=${shiftDay(day, -1)}`} className="btn-light">← Önceki gün</Link>
          {!isToday && <Link href={`/ekip/${id}?gun=${shiftDay(day, 1)}`} className="btn-light">Sonraki gün →</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {st && <div className="card"><div className="text-sm text-slate-500">Şu an</div><span className={`pill mt-1 ${st.cls}`}>{st.label}</span><div className="mt-1 text-xs text-slate-500">son kayıt: {ago(todayRow!.last_event_at, now)}</div></div>}
        <div className="card"><div className="text-sm text-slate-500">Başlama / son kayıt</div><div className="text-xl font-bold">{timeIst(todayRow?.first_at ?? null)} – {timeIst(todayRow?.last_event_at ?? null)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Arama · Konuşma</div><div className="text-xl font-bold">{todayRow?.call_out ?? 0} giden · {callDur(todayRow?.talk_seconds ?? 0)}</div><div className="text-xs text-slate-500">{todayRow?.call_answered ?? 0} açıldı · {todayRow?.call_in ?? 0} gelen · {todayRow?.call_missed ?? 0} cevapsız</div>{todayRow && isToday && (() => { const a = appState(todayRow, now); return <div className={`text-xs ${a.cls}`}>{a.label}</div>; })()}</div>
        <div className="card"><div className="text-sm text-slate-500">Not · Satış · Diğer</div><div className="text-xl font-bold">{todayRow?.note_count ?? 0} · {todayRow?.sale_count ?? 0} · {todayRow?.other_count ?? 0}</div>{!!todayRow?.sale_amount && <div className="text-xs text-green-700">{tl(todayRow.sale_amount)}</div>}</div>
        <div className="card"><div className="text-sm text-slate-500">Ekranda aktif</div><div className="text-xl font-bold">{duration(todayRow?.active_minutes ?? 0)}</div><div className="text-xs text-slate-500">açık: {duration(todayRow?.open_minutes ?? 0)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">En uzun boşluk</div><div className={`text-xl font-bold ${gapCls(todayRow?.longest_gap_minutes ?? null)}`}>{duration(todayRow?.longest_gap_minutes)}</div>{todayRow?.longest_gap_from && <div className="text-xs text-slate-500">{timeIst(todayRow.longest_gap_from)}&apos;dan sonra</div>}</div>
      </div>

      <div className="card space-y-2">
        <h2 className="text-lg font-semibold">Gün içi zaman çizelgesi</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="flex">
              {bs.map((b) => (
                <div key={b.slot} className={`h-10 flex-1 border-r border-white ${cellCls(b)}`}
                  title={`${timeIst(b.slot)} · ${b.events} kayıt · ${b.active_pings} dk aktif · ${b.open_pings} dk açık`} />
              ))}
            </div>
            <div className="flex text-[10px] text-slate-500">
              {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="flex-1 border-l border-slate-200 pl-0.5">{String(START_H + i).padStart(2, "0")}</div>)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-green-600 align-middle" />3+ kayıt</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-green-400 align-middle" />kayıt girdi</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-blue-400 align-middle" />CRM&apos;de aktif, kayıt yok</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-amber-200 align-middle" />açık ama boşta</span>
          <span><i className="mr-1 inline-block h-3 w-3 rounded-sm bg-slate-100 ring-1 ring-slate-200 align-middle" />CRM kapalı</span>
          <span className="text-slate-400">Her kutu 15 dakika · üzerine gelince ayrıntı</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <h2 className="p-4 pb-2 text-lg font-semibold">Kayıtlar ({evs.length})</h2>
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {list.map((x, i) => x.t === "gap" ? (
                <tr key={`g${i}`} className={x.min >= 90 ? "bg-red-50" : "bg-amber-50"}>
                  <td className="td" colSpan={3}><span className={gapCls(x.min)}>⏸ {duration(x.min)} kayıt yok</span> <span className="text-xs text-slate-500">({timeIst(x.from)} sonrası)</span></td>
                </tr>
              ) : (
                <tr key={`e${i}`}>
                  <td className="td w-16 whitespace-nowrap font-mono">{timeIst(x.e.at)}</td>
                  <td className="td w-40 whitespace-nowrap"><span className={`pill ${x.e.kind === "Satış" ? "bg-green-100 text-green-800" : x.e.kind.startsWith("Arama") ? "bg-blue-100 text-blue-800" : ""}`}>{x.e.kind}</span></td>
                  <td className="td text-slate-600">{x.e.detail}</td>
                </tr>
              ))}
              {!evs.length && <tr><td className="td py-8 text-center text-slate-500">Bu gün kayıt yok.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto p-0">
          <h2 className="p-4 pb-2 text-lg font-semibold">Son 7 gün</h2>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className="th">Gün</th><th className="th">Saat</th><th className="th">Not</th><th className="th">Arama</th><th className="th">Satış</th><th className="th">Aktif</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {weekRows.map(({ d, r }) => (
                <tr key={d} className={d === day ? "bg-blue-50" : ""}>
                  <td className="td whitespace-nowrap"><Link href={`/ekip/${id}?gun=${d}`} className="text-blue-700 hover:underline">{date(d)}</Link></td>
                  <td className="td whitespace-nowrap text-xs">{r?.first_at ? `${timeIst(r.first_at)}–${timeIst(r.last_event_at)}` : "—"}</td>
                  <td className="td">{r?.note_count ?? 0}</td>
                  <td className="td whitespace-nowrap">{r?.call_out ?? 0}{r?.talk_seconds ? <span className="text-xs text-slate-500"> · {callDur(r.talk_seconds)}</span> : null}</td>
                  <td className="td">{r?.sale_count ?? 0}</td>
                  <td className="td whitespace-nowrap">{duration(r?.active_minutes ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
