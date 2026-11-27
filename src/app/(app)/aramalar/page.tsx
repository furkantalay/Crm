import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, todayIst } from "@/lib/format";
import { callDur, callIcon, callLabel } from "@/lib/calls";

type SP = Promise<Record<string, string | undefined>>;
type Row = {
  id: number; user_id: string; user_name: string; phone: string; direction: string; started_at: string;
  duration_sec: number; customer_id: number | null; customer_name: string | null; followed_up: boolean;
};

const istStart = (d: string) => new Date(`${d}T00:00:00+03:00`).toISOString();
function shiftDay(d: string, n: number) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

export default async function CallsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const staff = isStaff(me.role);
  const supabase = await createClient();
  const tab = sp.sekme === "tum" ? "tum" : "geri";
  const today = todayIst();
  const day = sp.gun && /^\d{4}-\d{2}-\d{2}$/.test(sp.gun) ? sp.gun : today;
  const who = staff ? sp.kisi ?? "" : me.id;

  let q = supabase.from("v_call_list").select("*").order("started_at", { ascending: false });
  if (tab === "geri") {
    q = q.in("direction", ["missed", "rejected"]).eq("followed_up", false).gte("started_at", istStart(shiftDay(today, -14))).limit(300);
  } else {
    q = q.gte("started_at", istStart(day)).lt("started_at", istStart(shiftDay(day, 1))).limit(1000);
  }
  if (who) q = q.eq("user_id", who);

  const [{ data, error }, { data: people }, { data: devices }] = await Promise.all([
    q,
    staff ? supabase.from("profiles").select("id, full_name").eq("is_active", true).in("role", ["satisci", "dataci", "yonetici"]).order("full_name") : Promise.resolve({ data: [] }),
    staff ? supabase.from("call_devices").select("user_id") : Promise.resolve({ data: [] }),
  ]);
  let rows = (data ?? []) as Row[];
  // aynı numaradan gelen birden fazla cevapsız aramayı tek satırda göster
  const repeat = new Map<string, number>();
  if (tab === "geri") {
    const seen = new Set<string>();
    rows.forEach((r) => repeat.set(r.phone, (repeat.get(r.phone) ?? 0) + 1));
    rows = rows.filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)));
  }
  const totals = tab === "tum" ? {
    out: rows.filter((r) => r.direction === "out").length,
    answered: rows.filter((r) => r.direction === "out" && r.duration_sec > 0).length,
    inc: rows.filter((r) => r.direction === "in").length,
    missed: rows.filter((r) => r.direction === "missed" || r.direction === "rejected").length,
    talk: rows.reduce((a, r) => a + r.duration_sec, 0),
  } : null;
  const withApp = new Set((devices ?? []).map((d: { user_id: string }) => d.user_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Aramalar</h1>
        <div className="flex gap-2">
          {(me.role === "admin" || me.role === "yonetici") && <Link href="/aramalar/rapor" className="btn">📊 Arama raporu</Link>}
          <Link href="/uygulama" className="btn-light">📱 Telefon uygulaması</Link>
        </div>
      </div>
      <p className="text-sm text-slate-600">Telefonlardaki &quot;CRM Arama&quot; uygulamasından otomatik gelir. Yalnız CRM&apos;de kayıtlı numaralarla yapılan görüşmeler ve gelen aramalar kaydedilir; kişisel aramalar telefondan çıkmaz.</p>

      <div className="flex gap-2">
        <Link href={`/aramalar?sekme=geri${who && staff ? `&kisi=${who}` : ""}`} className={tab === "geri" ? "btn" : "btn-light"}>Geri dönülecekler</Link>
        <Link href={`/aramalar?sekme=tum${who && staff ? `&kisi=${who}` : ""}`} className={tab === "tum" ? "btn" : "btn-light"}>Tüm aramalar</Link>
      </div>

      {(staff || tab === "tum") && (
        <form className="card flex flex-wrap items-end gap-3" action="/aramalar">
          <input type="hidden" name="sekme" value={tab} />
          {tab === "tum" && <div><label className="label">Gün</label><input type="date" name="gun" defaultValue={day} max={today} className="input" /></div>}
          {staff && (
            <div><label className="label">Kişi</label>
              <select name="kisi" defaultValue={who} className="input">
                <option value="">Herkes</option>
                {(people ?? []).map((p: { id: string; full_name: string }) => <option key={p.id} value={p.id}>{p.full_name}{withApp.has(p.id) ? "" : " (uygulama yok)"}</option>)}
              </select></div>
          )}
          <button className="btn">Göster</button>
        </form>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      {totals && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="card"><div className="text-sm text-slate-500">Giden arama</div><div className="text-2xl font-bold">{totals.out}</div></div>
          <div className="card"><div className="text-sm text-slate-500">Açılan</div><div className="text-2xl font-bold">{totals.answered}</div><div className="text-xs text-slate-500">{totals.out ? Math.round((totals.answered / totals.out) * 100) : 0}%</div></div>
          <div className="card"><div className="text-sm text-slate-500">Gelen</div><div className="text-2xl font-bold">{totals.inc}</div></div>
          <div className="card"><div className="text-sm text-slate-500">Cevapsız</div><div className="text-2xl font-bold">{totals.missed}</div></div>
          <div className="card"><div className="text-sm text-slate-500">Toplam konuşma</div><div className="text-2xl font-bold">{callDur(totals.talk)}</div></div>
        </div>
      )}

      {tab === "geri" && <p className="text-sm text-slate-600">Son 14 günde cevaplanmamış ve sonrasında <b>hiç kimsenin</b> geri aramadığı numaralar. Biri geri arayınca listeden kendiliğinden düşer.</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Zaman</th><th className="th">Tür</th><th className="th">Kişi / numara</th><th className="th">Süre</th>{staff && <th className="th">Satışçı</th>}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap">{dateTime(r.started_at)}</td>
                <td className="td whitespace-nowrap">{callIcon(r.direction, r.duration_sec)} {callLabel(r.direction, r.duration_sec)}
                  {tab === "geri" && (repeat.get(r.phone) ?? 0) > 1 && <span className="pill ml-1 bg-red-100 text-red-800">{repeat.get(r.phone)} kez aradı</span>}</td>
                <td className="td">
                  {r.customer_id
                    ? <Link href={`/datalar/${r.customer_id}`} className="font-medium text-blue-700 hover:underline">{r.customer_name}</Link>
                    : <span className="text-slate-500">CRM&apos;de kayıtlı değil</span>}
                  <div><a href={`tel:${r.phone}`} className="text-xs text-blue-700 hover:underline">📞 {r.phone}</a></div>
                </td>
                <td className="td whitespace-nowrap">{callDur(r.duration_sec)}</td>
                {staff && <td className="td whitespace-nowrap">{r.user_name}</td>}
              </tr>
            ))}
            {!rows.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={5}>{tab === "geri" ? "Geri dönülmemiş arama yok. 👏" : "Bu gün arama yok."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
