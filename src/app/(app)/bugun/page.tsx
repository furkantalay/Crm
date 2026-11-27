import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tl } from "@/lib/format";
import { ago, timeIst } from "@/lib/team";

type SP = Promise<Record<string, string | undefined>>;
type Item = { kind: string; customer_id: number; customer_name: string; phone: string; at: string | null; detail: string; amount: number | null };

const GROUPS: { kind: string; title: string; hint: string; cls: string }[] = [
  { kind: "yeni", title: "🆕 Yeni gelen, henüz aranmadı", hint: "Önce bunları arayın: ilk dakikalar satışı en çok etkiler.", cls: "border-red-500" },
  { kind: "cevapsiz", title: "❗ Seni aradı, geri dönülmedi", hint: "Son 3 günde datanızdan gelen ve kimsenin geri aramadığı aramalar.", cls: "border-red-400" },
  { kind: "toplanti", title: "📅 Bugünkü toplantılar", hint: "", cls: "border-blue-500" },
  { kind: "beklenen", title: "💰 Beklenen satışlar", hint: "Ödeme sözü bugün ya da geçmiş olanlar.", cls: "border-green-500" },
  { kind: "gecikmis", title: "⏳ Gecikmiş takipler", hint: "\"Sonraki arama\" tarihi geçmiş ve sonra görüşme girilmemiş datalar.", cls: "border-amber-500" },
  { kind: "takip", title: "📞 Bugün aranacaklar", hint: "Görüşme notunda \"sonraki arama\" bugüne yazılanlar.", cls: "border-slate-400" },
];

const dayTime = (v: string | null) =>
  v ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "";

export default async function TodayPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const manager = me.role === "admin" || me.role === "yonetici";
  const supabase = await createClient();
  const who = manager && sp.kisi ? sp.kisi : me.id;

  const [{ data, error }, { data: sellers }] = await Promise.all([
    supabase.rpc("my_day", { p_user: who }),
    manager ? supabase.from("profiles").select("id, full_name").eq("is_active", true).eq("role", "satisci").order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const items = (data ?? []) as Item[];
  const whoName = who === me.id ? null : (sellers ?? []).find((s: { id: string }) => s.id === who)?.full_name;
  const total = items.length;
  const ids = [...new Set(items.map((i) => i.customer_id))];
  const { data: aiRows } = ids.length
    ? await supabase.from("customer_ai").select("customer_id, score, label, next_step").in("customer_id", ids)
    : { data: [] as { customer_id: number; score: number; label: string; next_step: string }[] };
  const ai = new Map((aiRows ?? []).map((a) => [a.customer_id, a]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{whoName ? `${whoName} · Bugün` : "Bugünüm"}</h1>
        {manager && (
          <form action="/bugun" className="flex items-center gap-2">
            <select name="kisi" defaultValue={who} className="input">
              <option value={me.id}>Ben</option>
              {(sellers ?? []).map((s: { id: string; full_name: string }) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <button className="btn">Göster</button>
          </form>
        )}
      </div>
      <p className="text-sm text-slate-600">{total ? `Bugün yapılacak ${total} iş var. Yukarıdan aşağıya öncelik sırasıyla.` : "Bugün için bekleyen iş yok. 👏"}</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      {GROUPS.map((g) => {
        const list = items.filter((i) => i.kind === g.kind).sort((a, b) => g.kind === "yeni"
          ? (ai.get(b.customer_id)?.score ?? 0) - (ai.get(a.customer_id)?.score ?? 0)
          : (a.at ?? "").localeCompare(b.at ?? ""));
        if (!list.length) return null;
        return (
          <div key={g.kind} className={`card border-l-4 p-0 ${g.cls}`}>
            <div className="p-4 pb-2">
              <h2 className="text-lg font-semibold">{g.title} <span className="text-slate-500">({list.length})</span></h2>
              {g.hint && <p className="text-xs text-slate-500">{g.hint}</p>}
            </div>
            <ul className="divide-y divide-slate-100">
              {list.map((i) => (
                <li key={`${g.kind}-${i.customer_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <ScoreBadge score={ai.get(i.customer_id)?.score} label={ai.get(i.customer_id)?.label} />
                  <Link href={`/datalar/${i.customer_id}`} className="font-medium text-blue-700 hover:underline">{i.customer_name}</Link>
                  {ai.get(i.customer_id)?.next_step && <span className="text-xs text-violet-700">💡 {ai.get(i.customer_id)?.next_step}</span>}
                  <a href={`tel:${i.phone}`} className="rounded-md bg-green-50 px-2 py-0.5 text-sm font-medium text-green-800 hover:bg-green-100">📞 {i.phone}</a>
                  {i.amount != null && <span className="text-sm font-semibold">{tl(i.amount)}</span>}
                  {i.detail && <span className="text-sm text-slate-600">{i.detail}</span>}
                  <span className="ml-auto text-xs text-slate-500">
                    {g.kind === "yeni" ? `atandı ${ago(i.at)}` : g.kind === "toplanti" ? timeIst(i.at) : dayTime(i.at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
