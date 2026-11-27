import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthStartIst, todayIst, tl } from "@/lib/format";
import AutoRefresh from "@/components/AutoRefresh";

export const metadata = { title: "Ofis ekranı" };

type Sale = { id: number; order_date: string; amount: number; seller_id: string | null; seller_name: string | null; customer_name: string; created_at: string; products: string | null };

export default async function OfficeScreen() {
  const me = await getMe();
  if (me.role === "satisci") redirect("/");
  const supabase = await createClient();
  const month = monthStartIst();
  const today = todayIst();
  const target = Number((me.company?.settings as Record<string, unknown> | null)?.monthly_target ?? 0);

  const [{ data: salesRaw }, { data: sellers }, { data: calls }] = await Promise.all([
    supabase.from("v_sale_list").select("id, order_date, amount, seller_id, seller_name, customer_name, created_at, products")
      .eq("is_active", true).gte("order_date", month).order("created_at", { ascending: false }).limit(2000),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).eq("receives_leads", true),
    supabase.from("v_call_list").select("user_id, duration_sec").gte("started_at", new Date(`${today}T00:00:00+03:00`).toISOString()).limit(5000),
  ]);
  const sales = (salesRaw ?? []) as Sale[];
  const todaySales = sales.filter((s) => s.order_date === today);
  const monthSum = sales.reduce((t, s) => t + Number(s.amount), 0);
  const todaySum = todaySales.reduce((t, s) => t + Number(s.amount), 0);

  const board = (sellers ?? []).map((p) => {
    const mine = sales.filter((s) => s.seller_id === p.id);
    const mineToday = todaySales.filter((s) => s.seller_id === p.id);
    const talk = (calls ?? []).filter((c) => c.user_id === p.id).reduce((t, c) => t + Number(c.duration_sec), 0);
    return { id: p.id, name: p.full_name, count: mine.length, sum: mine.reduce((t, s) => t + Number(s.amount), 0),
             todayCount: mineToday.length, todaySum: mineToday.reduce((t, s) => t + Number(s.amount), 0), talk };
  }).sort((a, b) => b.sum - a.sum);
  const maxSum = Math.max(1, ...board.map((b) => b.sum));
  const medals = ["🥇", "🥈", "🥉"];
  const now = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const dayNo = Number(today.slice(8, 10));

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white">
      <AutoRefresh seconds={60} />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-4xl font-black tracking-tight">Dijital Bir Adam · Satış</div>
          <div className="text-lg capitalize text-slate-400">{now}</div>
        </div>
        <div className="text-right text-slate-400">her dakika güncellenir</div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-6">
        <div className="rounded-3xl bg-green-600 p-6">
          <div className="text-xl text-green-100">Bugün</div>
          <div className="text-6xl font-black">{tl(todaySum)}</div>
          <div className="text-2xl text-green-100">{todaySales.length} satış</div>
        </div>
        <div className="rounded-3xl bg-slate-800 p-6">
          <div className="text-xl text-slate-400">Bu ay</div>
          <div className="text-6xl font-black">{tl(monthSum)}</div>
          <div className="text-2xl text-slate-400">{sales.length} satış · günlük ort. {tl(monthSum / dayNo)}</div>
        </div>
        <div className="rounded-3xl bg-slate-800 p-6">
          <div className="text-xl text-slate-400">Aylık hedef</div>
          {target > 0 ? (
            <>
              <div className="text-6xl font-black">%{Math.round((monthSum / target) * 100)}</div>
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full bg-green-500" style={{ width: `${Math.min(100, (monthSum / target) * 100)}%` }} />
              </div>
              <div className="mt-2 text-xl text-slate-400">Hedef {tl(target)} · kalan {tl(Math.max(0, target - monthSum))} · {daysInMonth - dayNo} gün</div>
            </>
          ) : <div className="mt-4 text-xl text-slate-500">Hedef girilmemiş (Ayarlar)</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 rounded-3xl bg-slate-900 p-6">
          <div className="mb-4 text-2xl font-bold">🏆 Ayın sıralaması</div>
          <div className="space-y-4">
            {board.map((b, i) => (
              <div key={b.id}>
                <div className="flex items-baseline justify-between text-2xl">
                  <span className="font-bold">{medals[i] ?? `${i + 1}.`} {b.name}</span>
                  <span className="font-black">{tl(b.sum)} <span className="text-lg font-normal text-slate-400">· {b.count} satış</span></span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${(b.sum / maxSum) * 100}%` }} />
                </div>
                <div className="mt-1 text-base text-slate-400">Bugün: {b.todayCount} satış · {tl(b.todaySum)}{b.talk ? ` · ${Math.round(b.talk / 60)} dk konuşma` : ""}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-slate-900 p-6">
          <div className="mb-4 text-2xl font-bold">🔔 Son satışlar</div>
          <ul className="space-y-3">
            {sales.slice(0, 8).map((s) => (
              <li key={s.id} className="border-b border-slate-800 pb-2">
                <div className="flex justify-between text-xl"><span className="font-semibold">{s.seller_name ?? "—"}</span><span className="font-black text-green-400">{tl(s.amount)}</span></div>
                <div className="truncate text-sm text-slate-400">{s.products ?? ""} · {new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(s.created_at))}</div>
              </li>
            ))}
            {!sales.length && <li className="text-slate-500">Bu ay henüz satış yok.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
