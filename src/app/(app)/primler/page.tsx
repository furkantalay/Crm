import Link from "next/link";
import { requirePerm, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCommissions, tierLabel } from "@/lib/commission";
import { date, num, tl, todayIst } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { deleteRule, saveRule, setEligible, setSellerVisibility } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`; };
type Rule = { id: number; period: string; min_amount: number; kind: string; value: number; is_active: boolean };

function RuleRow({ r, canEdit }: { r: Rule; canEdit: boolean }) {
  if (!canEdit) return (
    <li className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <span>{tl(r.min_amount)} ve üstü</span><b>{r.kind === "percent" ? `%${Number(r.value)}` : tl(r.value)}</b>
    </li>
  );
  return (
    <li className="flex flex-wrap items-center gap-2">
      <ActionForm action={saveRule} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={r.id} />
        <input name="min_amount" defaultValue={Number(r.min_amount)} inputMode="decimal" className="input w-32" title="Eşik (₺ ve üstü)" />
        <span className="text-xs text-slate-500">₺ ve üstü →</span>
        <select name="kind" defaultValue={r.kind} className="input w-28"><option value="fixed">Sabit ₺</option><option value="percent">Yüzde</option></select>
        <input name="value" defaultValue={Number(r.value)} inputMode="decimal" className="input w-24" />
      </ActionForm>
      <ActionForm action={deleteRule} submitLabel="Sil" resetOnSuccess={false} confirm="Bu kademe silinsin mi?"><input type="hidden" name="id" value={r.id} /></ActionForm>
    </li>
  );
}

export default async function CommissionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireRole(["admin", "yonetici"]); await requirePerm("prim");
  const isAdmin = me.role === "admin";
  const supabase = await createClient();
  const month = sp.ay || todayIst().slice(0, 7);
  const [{ rows, error }, { data: rulesRaw }, { data: people }] = await Promise.all([
    loadCommissions(month),
    supabase.from("commission_rules").select("*").order("min_amount"),
    supabase.from("profiles").select("id, full_name, commission_eligible").eq("role", "satisci").eq("is_active", true).order("full_name"),
  ]);
  const { data: co } = await supabase.from("companies").select("settings").single();
  const showToSellers = (co?.settings as Record<string, unknown> | null)?.show_own_commission === true;
  const rules = (rulesRaw ?? []) as Rule[];
  const totals = rows.reduce((a, r) => ({
    total: a.total + Number(r.total), m: a.m + Number(r.monthly_commission), d: a.d + Number(r.daily_commission),
  }), { total: 0, m: 0, d: 0 });

  // Seçilen satışçının günlük dökümü
  const sel = sp.satisci ? rows.find((r) => r.seller_id === sp.satisci) : undefined;
  const { data: days } = sel
    ? await supabase.from("v_commission_daily").select("day, sale_count, total, commission")
        .eq("seller_id", sel.seller_id).gte("day", `${month}-01`).lt("day", nextMonth(month)).order("day")
    : { data: null };
  const isCurrent = month === todayIst().slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Primler</h1>
        <a href={`/primler/csv?ay=${month}`} className="btn-light">Excel&apos;e aktar (CSV)</a>
      </div>
      <p className="text-sm text-slate-600">Primler satış tutarı üzerinden hesaplanır (iyzico iadeleri düşülür, pasife alınan satışlar sayılmaz).
        {isCurrent ? " Bu ayın rakamları anlık: her yeni satışla güncellenir." : " Seçilen ayın kesin rakamları."}</p>

      <form className="card flex flex-wrap items-end gap-3" action="/primler">
        <div><label className="label">Ay</label><input type="month" name="ay" defaultValue={month} className="input" /></div>
        <button className="btn">Göster</button>
        {!isCurrent && <Link href="/primler" className="btn-light">Bu ay</Link>}
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card"><div className="text-sm text-slate-500">Toplam Satış</div><div className="text-2xl font-bold">{tl(totals.total)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Aylık Primler</div><div className="text-2xl font-bold">{tl(totals.m)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Günlük Primler</div><div className="text-2xl font-bold">{tl(totals.d)}</div></div>
        <div className="card border-l-4 border-green-600"><div className="text-sm text-slate-500">Toplam Prim</div><div className="text-2xl font-bold text-green-700">{tl(totals.m + totals.d)}</div></div>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Satışçı</th><th className="th">Satış</th><th className="th">Aylık Satış Tutarı</th><th className="th">Kademe</th>
            <th className="th">Aylık Prim</th><th className="th">Günlük Prim</th><th className="th">Toplam Prim</th><th className="th">Sonraki Kademeye</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.seller_id} className={sel?.seller_id === r.seller_id ? "bg-blue-50" : ""}>
                <td className="td"><Link href={`/primler?ay=${month}&satisci=${r.seller_id}`} className="font-medium text-blue-700 hover:underline">{r.seller_name}</Link></td>
                <td className="td">{num(r.sale_count)}</td>
                <td className="td whitespace-nowrap">{tl(r.total)}</td>
                <td className="td whitespace-nowrap">{tierLabel(r)}</td>
                <td className="td whitespace-nowrap">{tl(r.monthly_commission)}</td>
                <td className="td whitespace-nowrap">{tl(r.daily_commission)} <span className="text-xs text-slate-500">({r.daily_bonus_days} gün)</span></td>
                <td className="td whitespace-nowrap font-bold text-green-700">{tl(Number(r.monthly_commission) + Number(r.daily_commission))}</td>
                <td className="td whitespace-nowrap text-xs">{r.to_next_tier != null ? <>{tl(r.to_next_tier)} kaldı <span className="text-slate-500">({tl(r.next_tier_min)})</span></> : <span className="text-green-700">En üst kademe</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={8}>Bu ay satış yok.</td></tr>}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="card overflow-x-auto p-0">
          <h2 className="p-4 pb-2 text-lg font-semibold">{sel.seller_name} · günlük döküm</h2>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className="th">Gün</th><th className="th">Satış</th><th className="th">Günlük Tutar</th><th className="th">Günlük Prim</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(days ?? []).map((d) => (
                <tr key={d.day}><td className="td">{date(d.day)}</td><td className="td">{d.sale_count}</td><td className="td">{tl(d.total)}</td>
                  <td className={`td ${Number(d.commission) > 0 ? "font-semibold text-green-700" : "text-slate-400"}`}>{tl(d.commission)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["monthly", "daily"] as const).map((p) => (
          <div key={p} className="card space-y-2">
            <h2 className="text-lg font-semibold">{p === "monthly" ? "Aylık Prim Kademeleri" : "Günlük Prim Kademeleri"}</h2>
            <p className="text-xs text-slate-500">{p === "monthly" ? "Ay içindeki toplam satış tutarına göre; ulaşılan en yüksek kademe uygulanır. Yüzde, tutarın tamamına uygulanır." : "O günkü toplam satış tutarına göre; ulaşılan en yüksek kademe uygulanır (kademeler toplanmaz)."}</p>
            <ul className="space-y-2">{rules.filter((r) => r.period === p).map((r) => <RuleRow key={r.id} r={r} canEdit={isAdmin} />)}</ul>
            {isAdmin && (
              <ActionForm action={saveRule} submitLabel="Kademe ekle" className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <input type="hidden" name="period" value={p} />
                <input name="min_amount" placeholder="Eşik ₺" inputMode="decimal" className="input w-32" />
                <select name="kind" defaultValue="fixed" className="input w-28"><option value="fixed">Sabit ₺</option><option value="percent">Yüzde</option></select>
                <input name="value" placeholder="Prim" inputMode="decimal" className="input w-24" />
              </ActionForm>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <div className="text-sm"><b>Satışçılar kendi primini görsün:</b> {showToSellers ? "Açık — her satışçı panelinde yalnız kendi primini ve sonraki kademeye kalan tutarı görür." : "Kapalı — primleri yalnız admin ve yöneticiler görür."}</div>
            <ActionForm action={setSellerVisibility} resetOnSuccess={false} submitLabel={showToSellers ? "Kapat" : "Aç"}>
              <input type="hidden" name="show" value={showToSellers ? "0" : "1"} />
            </ActionForm>
          </div>
          <h2 className="mb-2 text-lg font-semibold">Prim Hakkı</h2>
          <p className="mb-3 text-xs text-slate-500">Prim hakkı kapalı olanlar (ör. web sitesi satışları) prim tablosunda görünmez.</p>
          <div className="flex flex-wrap gap-2">
            {(people ?? []).map((p) => (
              <ActionForm key={p.id} action={setEligible} resetOnSuccess={false}
                          submitLabel={`${p.full_name}: ${p.commission_eligible ? "prim var" : "prim yok"}`} className="flex items-center gap-1">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="eligible" value={p.commission_eligible ? "0" : "1"} />
              </ActionForm>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
