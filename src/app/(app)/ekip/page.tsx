import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { roleLabel, tl, todayIst } from "@/lib/format";
import AutoRefresh from "@/components/AutoRefresh";
import { ago, appState, duration, gapCls, statusOf, timeIst, type TeamRow } from "@/lib/team";
import { callDur } from "@/lib/calls";

type SP = Promise<Record<string, string | undefined>>;

export default async function TeamPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const today = todayIst();
  const day = sp.gun && /^\d{4}-\d{2}-\d{2}$/.test(sp.gun) ? sp.gun : today;
  const isToday = day === today;
  const roleFilter = sp.rol ?? "satisci";

  const { data, error } = await supabase.rpc("team_activity", { p_day: day });
  const now = Date.now();
  let rows = ((data ?? []) as TeamRow[]).filter((r) => roleFilter === "hepsi" || r.role === roleFilter);
  const withStatus = rows.map((r) => ({ r, s: statusOf(r, now) }));
  if (isToday) withStatus.sort((a, b) => a.s.order - b.s.order || a.r.full_name.localeCompare(b.r.full_name, "tr"));
  else withStatus.sort((a, b) => (b.r.note_count + b.r.sale_count + b.r.other_count) - (a.r.note_count + a.r.sale_count + a.r.other_count));
  rows = withStatus.map((x) => x.r);

  const count = (k: string) => withStatus.filter((x) => x.s.key === k).length;

  return (
    <div className="space-y-4">
      {isToday && <AutoRefresh seconds={60} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Ekip Durumu</h1>
        <span className="text-xs text-slate-500">{isToday ? `Her dakika kendini yeniler · son güncelleme ${timeIst(new Date(now).toISOString())}` : "Geçmiş gün"}</span>
      </div>
      <p className="text-sm text-slate-600">
        &quot;Son işlem&quot; ve sayılar CRM&apos;e girilen gerçek kayıtlardan ve telefon uygulamasından gelen aramalardan gelir (not, arama, satış, data, toplantı…). &quot;Ekranda aktif&quot;, CRM sekmesi önde
        ve klavye/fare kullanılırken geçen süredir. Telefon uygulaması kurulu olmayan kişinin aramaları burada görünmez.
      </p>

      <form className="card flex flex-wrap items-end gap-3" action="/ekip">
        <div><label className="label">Gün</label><input type="date" name="gun" defaultValue={day} max={today} className="input" /></div>
        <div><label className="label">Kimler</label>
          <select name="rol" defaultValue={roleFilter} className="input">
            <option value="satisci">Satışçılar</option><option value="dataci">Datacılar</option>
            <option value="yonetici">Yöneticiler</option><option value="hepsi">Herkes</option>
          </select></div>
        <button className="btn">Göster</button>
        {!isToday && <Link href={`/ekip?rol=${roleFilter}`} className="btn-light">Bugün</Link>}
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      {isToday && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="card border-l-4 border-green-500"><div className="text-sm text-slate-500">Çalışıyor</div><div className="text-2xl font-bold">{count("working")}</div><div className="text-xs text-slate-500">son 15 dk&apos;da kayıt girdi</div></div>
          <div className="card border-l-4 border-blue-500"><div className="text-sm text-slate-500">CRM&apos;de, kayıt girmiyor</div><div className="text-2xl font-bold">{count("browsing")}</div><div className="text-xs text-slate-500">geziniyor ama 15 dk&apos;dır kayıt yok</div></div>
          <div className="card border-l-4 border-amber-500"><div className="text-sm text-slate-500">Açık ama boşta</div><div className="text-2xl font-bold">{count("idle")}</div><div className="text-xs text-slate-500">sekme açık, klavye/fare yok</div></div>
          <div className="card border-l-4 border-slate-400"><div className="text-sm text-slate-500">Çevrimdışı</div><div className="text-2xl font-bold">{count("offline")}</div><div className="text-xs text-slate-500">CRM kapalı</div></div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Kişi</th>
            {isToday && <th className="th">Durum</th>}
            <th className="th">Başlama</th>
            <th className="th">Son işlem</th>
            <th className="th">Not</th>
            <th className="th">Satış</th>
            <th className="th">Arama</th>
            <th className="th">Konuşma</th>
            <th className="th">Diğer</th>
            <th className="th">Ekranda aktif</th>
            <th className="th">En uzun boşluk</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {withStatus.map(({ r, s }) => (
              <tr key={r.user_id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/ekip/${r.user_id}?gun=${day}`} className="font-medium text-blue-700 hover:underline">{r.full_name}</Link>
                  {roleFilter === "hepsi" && <div className="text-xs text-slate-500">{roleLabel[r.role]}</div>}
                  {isToday && (() => { const a = appState(r, now); return <div className={`text-xs ${a.cls}`}>{a.label}</div>; })()}
                </td>
                {isToday && (
                  <td className="td whitespace-nowrap">
                    <span className={`pill ${s.cls}`}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${s.dot}`} />{s.label}</span>
                    {s.key === "offline" && <div className="text-xs text-slate-500">görülme: {ago(r.last_ping_at ?? r.last_seen_at, now)}</div>}
                  </td>
                )}
                <td className="td whitespace-nowrap">{timeIst(r.first_at)}</td>
                <td className="td min-w-56">
                  {r.last_event_at ? (
                    <>
                      <div className="whitespace-nowrap"><b>{isToday ? ago(r.last_event_at, now) : timeIst(r.last_event_at)}</b> · {r.last_event_kind}</div>
                      <div className="max-w-xs truncate text-xs text-slate-500" title={r.last_event_detail ?? ""}>{r.last_event_detail}</div>
                    </>
                  ) : <span className="text-slate-400">Bugün kayıt yok</span>}
                </td>
                <td className="td">{r.note_count || <span className="text-slate-400">0</span>}</td>
                <td className="td whitespace-nowrap">{r.sale_count ? <>{r.sale_count} · {tl(r.sale_amount)}</> : <span className="text-slate-400">0</span>}</td>
                <td className="td whitespace-nowrap">
                  {r.call_out || r.call_in ? <>{r.call_out} giden <span className="text-xs text-slate-500">({r.call_answered} açıldı)</span>{r.call_in > 0 && <div className="text-xs text-slate-500">{r.call_in} gelen</div>}</> : <span className="text-slate-400">0</span>}
                  {r.call_missed > 0 && <div className="text-xs text-amber-700">{r.call_missed} cevapsız</div>}
                </td>
                <td className="td whitespace-nowrap">{r.talk_seconds ? callDur(r.talk_seconds) : <span className="text-slate-400">—</span>}</td>
                <td className="td">{r.other_count || <span className="text-slate-400">0</span>}</td>
                <td className="td whitespace-nowrap">{duration(r.active_minutes)}{r.open_minutes > r.active_minutes && <div className="text-xs text-slate-500">açık: {duration(r.open_minutes)}</div>}</td>
                <td className={`td whitespace-nowrap ${gapCls(r.longest_gap_minutes)}`}>
                  {duration(r.longest_gap_minutes)}
                  {r.longest_gap_from && <div className="text-xs font-normal text-slate-500">{timeIst(r.longest_gap_from)}&apos;dan sonra</div>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={11}>Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">En uzun boşluk: iki kayıt arasında geçen en uzun süre (kişi hâlâ CRM&apos;deyse son kayıttan şimdiye kadar geçen süre de sayılır). 45 dk üstü turuncu, 90 dk üstü kırmızı. Kişiye tıklayınca gün içi zaman çizelgesi açılır.</p>
    </div>
  );
}
