import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSellers, linker } from "@/lib/data";
import { date, dateTime, num } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { redistribute, updateSatisfaction } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
const STATUS: Record<string, string> = { bekliyor: "Bekliyor", arandi: "Arandı", ulasilamadi: "Ulaşılamadı", memnun: "Memnun", sikayet_var: "Şikayet Var" };
const PAGE = 50;

export default async function SatisfactionPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const staff = isStaff(me.role);
  const supabase = await createClient();
  const sellers = await getSellers();
  const allPeople = await getSellers(true);
  const page = Math.max(1, Number(sp.page) || 1);

  let q = supabase.from("satisfaction_calls")
    .select("id, customer_id, status, note, called_at, created_at, sale:sales(order_date, amount), customer:customers(full_name, phone, sector), sold:profiles!satisfaction_calls_sold_by_fkey(full_name), resp:profiles!satisfaction_calls_responsible_id_fkey(full_name)", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.sorumlu) q = q.eq("responsible_id", sp.sorumlu);
  if (sp.durum) q = q.eq("status", sp.durum);
  if (sp.bas) q = q.gte("created_at", `${sp.bas}T00:00:00+03:00`);
  if (sp.bit) q = q.lte("created_at", `${sp.bit}T23:59:59+03:00`);
  if (sp.q) q = q.ilike("note", `%${sp.q.replace(/[%_]/g, "")}%`);
  const { data, count, error } = await q;

  type Row = { id: number; customer_id: number; status: string; note: string | null; called_at: string | null; created_at: string;
    sale: { order_date: string; amount: number } | null; customer: { full_name: string; phone: string; sector: string | null } | null;
    sold: { full_name: string } | null; resp: { full_name: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = linker("/memnuniyet", sp);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Memnuniyet Araması Listesi</h1>

      {staff && me.role !== "teknik" && (
        <div className="card border-l-4 border-blue-500">
          <h2 className="mb-1 text-lg font-semibold">Memnuniyet Datalarını Yeniden Dağıt</h2>
          <p className="mb-3 text-sm text-slate-600">İşten ayrılan veya iş yükü değişen satışçının memnuniyet aramalarını aktif satışçılara eşit dağıtabilirsiniz. <b>Satışı yapan kişi bilgisi değişmez</b>; yalnızca aramayı yapacak sorumlu değişir.</p>
          <ActionForm action={redistribute} submitLabel="Memnuniyet Datalarını Dağıt" className="space-y-3"
                      confirm="Seçilen kayıtların sorumlusu değişecek. Devam edilsin mi?">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><label className="label">Mevcut sorumlu</label>
                <select name="from_id" className="input" defaultValue="" required><option value="" disabled>Seçiniz</option>
                  {allPeople.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.is_active ? "" : " (pasif)"}</option>)}</select></div>
              <div><label className="label">Dağıtılacak aktif satışçılar</label>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
                  {sellers.map((s) => (
                    <label key={s.id} className="flex items-center gap-2"><input type="checkbox" name="to_ids" value={s.id} />{s.full_name}</label>
                  ))}
                </div></div>
              <div><label className="label">Kapsam</label>
                <select name="scope" className="input" defaultValue="bekliyor">
                  <option value="bekliyor">Sadece bekleyenler</option><option value="hepsi">Tüm kayıtlar</option></select></div>
            </div>
          </ActionForm>
        </div>
      )}

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-6" action="/memnuniyet">
        {staff && (
          <div><label className="label">Sorumlu</label>
            <select name="sorumlu" defaultValue={sp.sorumlu ?? ""} className="input"><option value="">Tümü</option>
              {allPeople.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        )}
        <div><label className="label">Durum</label>
          <select name="durum" defaultValue={sp.durum ?? ""} className="input"><option value="">Tümü</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Başlangıç</label><input type="date" name="bas" defaultValue={sp.bas} className="input" /></div>
        <div><label className="label">Bitiş</label><input type="date" name="bit" defaultValue={sp.bit} className="input" /></div>
        <div><label className="label">Notta ara</label><input name="q" defaultValue={sp.q} className="input" /></div>
        <div className="flex items-end gap-2"><button className="btn flex-1">Filtrele</button><Link href="/memnuniyet" className="btn-light">Temizle</Link></div>
      </form>

      <p className="text-sm text-slate-600"><b>{num(count)}</b> kayıt</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Müşteri</th><th className="th">Sektör</th><th className="th">Satışı Yapan</th>
            {staff && <th className="th">Sorumlu</th>}<th className="th">Satış Tarihi</th><th className="th">Arama</th><th className="th min-w-96">Durum / Not</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="td"><Link href={`/datalar/${r.customer_id}`} className="font-medium text-blue-700 hover:underline">{r.customer?.full_name}</Link>
                  <div className="text-xs text-slate-500">{r.customer?.phone}</div></td>
                <td className="td max-w-40 truncate">{r.customer?.sector ?? "-"}</td>
                <td className="td">{r.sold?.full_name ?? "-"}</td>
                {staff && <td className="td">{r.resp?.full_name ?? "-"}</td>}
                <td className="td whitespace-nowrap">{date(r.sale?.order_date)}</td>
                <td className="td whitespace-nowrap">{dateTime(r.called_at)}</td>
                <td className="td">
                  <ActionForm action={updateSatisfaction} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className="input w-36">
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <input name="note" defaultValue={r.note ?? ""} placeholder="Memnuniyet notu" className="input min-w-48 flex-1" />
                  </ActionForm>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={7}>Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-2 text-sm">
        {page > 1 && <Link className="btn-light" href={link({ page: String(page - 1) })}>← Önceki</Link>}
        <span>Sayfa {page} / {pages}</span>
        {page < pages && <Link className="btn-light" href={link({ page: String(page + 1) })}>Sonraki →</Link>}
      </div>
    </div>
  );
}
