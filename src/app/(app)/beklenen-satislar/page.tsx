import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSellers } from "@/lib/data";
import { dateTime, num, tl } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { updateExpected } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
const STATUS: Record<string, string> = { bekliyor: "Bekleniyor", ertelendi: "Ertelendi", vazgecti: "Vazgeçti", kazanildi: "Kazanıldı" };

/** datetime-local girişine uygun İstanbul saati */
function toLocalInput(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }).format(d);
  return s.replace(" ", "T");
}

export default async function ExpectedPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const supabase = await createClient();
  const staff = isStaff(me.role);
  const sellers = await getSellers();

  let q = supabase.from("expected_sales")
    .select("id, customer_id, seller_id, expected_at, amount, status, note, created_at, customer:customers(full_name, phone, data_type:lookups!customers_data_type_id_fkey(label)), seller:profiles(full_name)")
    .order("expected_at", { ascending: true, nullsFirst: false }).limit(1000);
  if (sp.durum) q = q.eq("status", sp.durum);
  if (sp.satisci) q = q.eq("seller_id", sp.satisci);
  if (sp.bas) q = q.gte("expected_at", `${sp.bas}T00:00:00+03:00`);
  if (sp.bit) q = q.lte("expected_at", `${sp.bit}T23:59:59+03:00`);
  const { data, error } = await q;

  type Row = { id: number; customer_id: number; seller_id: string | null; expected_at: string | null; amount: number | null; status: string; note: string | null;
    customer: { full_name: string; phone: string; data_type: { label: string } | null } | null; seller: { full_name: string } | null };
  let rows = (data ?? []) as unknown as Row[];
  if (sp.q) {
    const t = sp.q.toLocaleLowerCase("tr");
    rows = rows.filter((r) => [r.customer?.full_name, r.customer?.phone, r.note].some((x) => x?.toLocaleLowerCase("tr").includes(t)));
  }
  const active = rows.filter((r) => r.status !== "kazanildi");
  const won = rows.filter((r) => r.status === "kazanildi");
  const sum = (a: Row[]) => a.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Beklenen Satışlar</h1>
        <Link href="/datalar" className="btn-light">Datalardan Beklenen Satış Ekle</Link>
      </div>

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-6" action="/beklenen-satislar">
        <div className="col-span-2"><label className="label">Ara</label><input name="q" defaultValue={sp.q} placeholder="İsim / telefon / not" className="input" /></div>
        <div><label className="label">Başlangıç</label><input type="date" name="bas" defaultValue={sp.bas} className="input" /></div>
        <div><label className="label">Bitiş</label><input type="date" name="bit" defaultValue={sp.bit} className="input" /></div>
        <div><label className="label">Durum</label>
          <select name="durum" defaultValue={sp.durum ?? ""} className="input"><option value="">Tümü</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {staff ? (
          <div><label className="label">Satışçı</label>
            <select name="satisci" defaultValue={sp.satisci ?? ""} className="input"><option value="">Tümü</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        ) : <div />}
        <div className="col-span-2 flex gap-2 md:col-span-6"><button className="btn">Filtrele</button><Link href="/beklenen-satislar" className="btn-light">Temizle</Link></div>
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card"><div className="text-sm text-slate-500">Aktif Beklenen Satış</div><div className="text-2xl font-bold">{num(active.length)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Aktif Beklenen Tutar</div><div className="text-2xl font-bold">{tl(sum(active))}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Kazanılan Satış</div><div className="text-2xl font-bold">{num(won.length)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Kazanılan Tutar</div><div className="text-2xl font-bold">{tl(sum(won))}</div></div>
      </div>
      <p className="text-sm text-slate-600">Durumu <b>Kazanıldı</b> yapılan kayıtlar aşağıdaki Kazanılan Satışlar listesine geçer. Gerçek satış/ciro kaydı için müşteri detayından ayrıca satış girilmelidir.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <h2 className="text-xl font-semibold">Aktif Beklenen Satışlar</h2>
      <div className="space-y-3">
        {active.map((r) => (
          <div key={r.id} className={`card border-l-4 ${r.status === "vazgecti" ? "border-slate-300" : r.status === "ertelendi" ? "border-amber-400" : "border-blue-500"}`}>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/datalar/${r.customer_id}`} className="font-semibold text-blue-700 hover:underline">{r.customer?.full_name}</Link>
                <div className="text-xs text-slate-500">{r.customer?.phone} · {r.customer?.data_type?.label ?? "-"}</div>
              </div>
              <div className="text-lg font-bold text-green-700">{tl(r.amount)}</div>
            </div>
            <ActionForm action={updateExpected} submitLabel="Kaydet" resetOnSuccess={false} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div><label className="label">Beklenen tarih/saat</label><input type="datetime-local" name="expected_at" defaultValue={toLocalInput(r.expected_at)} className="input" /></div>
                <div><label className="label">Satışçı</label>
                  {staff ? (
                    <select name="seller_id" defaultValue={r.seller_id ?? ""} className="input">
                      {sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
                  ) : <div className="input bg-slate-50">{r.seller?.full_name ?? "-"}</div>}</div>
                <div><label className="label">Tutar (₺)</label><input name="amount" defaultValue={r.amount ?? ""} inputMode="decimal" className="input" /></div>
                <div><label className="label">Durum</label>
                  <select name="status" defaultValue={r.status} className="input">
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <textarea name="note" defaultValue={r.note ?? ""} rows={2} className="input" placeholder="Not" />
            </ActionForm>
          </div>
        ))}
        {!active.length && <p className="text-sm text-slate-500">Aktif beklenen satış yok.</p>}
      </div>

      <h2 className="text-xl font-semibold">Kazanılan Satışlar</h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Müşteri</th><th className="th">Satışçı</th><th className="th">Tarih</th><th className="th">Tutar</th><th className="th">Not</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {won.map((r) => (
              <tr key={r.id}>
                <td className="td"><Link href={`/datalar/${r.customer_id}`} className="text-blue-700 hover:underline">{r.customer?.full_name}</Link></td>
                <td className="td">{r.seller?.full_name ?? "-"}</td><td className="td">{dateTime(r.expected_at)}</td>
                <td className="td">{tl(r.amount)}</td><td className="td text-xs">{r.note ?? "-"}</td>
              </tr>
            ))}
            {!won.length && <tr><td className="td text-slate-500" colSpan={5}>Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
