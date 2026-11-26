import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { linker } from "@/lib/data";
import { dateTime, num, tl } from "@/lib/format";

type SP = Promise<Record<string, string | undefined>>;
const PAGE = 100;

export default async function TechPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "teknik", "yonetici"]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);

  const { data: summary } = await supabase.from("v_seller_summary").select("*").order("active_data", { ascending: false });

  let q = supabase.from("v_customer_list").select("id, full_name, phone, seller_name, assigner_name, status, status_is_won, data_type, created_at, last_action_at, is_active, last_note", { count: "exact" })
    .order("last_action_at", { ascending: false, nullsFirst: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.satisci) q = q.eq("assigned_to", sp.satisci);
  if (sp.kapsam === "aktif") q = q.eq("is_active", true);
  if (sp.kapsam === "pasif") q = q.eq("is_active", false);
  if (sp.kapsam === "satis") q = q.eq("status_is_won", true);
  if (sp.q) {
    const t = sp.q.replace(/[,()*%]/g, " ").trim();
    if (t) q = q.or(`full_name.ilike.*${t}*,phone.ilike.*${t}*`);
  }
  const { data: rows, count } = await q;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = linker("/teknik-kontrol", sp);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Teknik Kontrol</h1>
      <p className="text-sm text-slate-600">“Satışçıya atanan data eksildi”, “kayıt pasife mi alındı”, “satışa mı döndü” gibi durumları kontrol etmek içindir. Kayıtlar fiziksel olarak silinmez; pasife alınanlar burada Pasif olarak görünür. Bir kaydın tüm geçmişi için <Link href="/loglar" className="underline">Loglar</Link>.</p>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Satışçı Bazlı Özet</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Satışçı</th><th className="th">Aktif Data</th><th className="th">Pasif Data</th><th className="th">Satış Kaydı</th><th className="th">Toplam Ciro</th><th className="th">Kullanıcı</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(summary ?? []).map((s) => (
              <tr key={s.seller_id}>
                <td className="td"><Link href={link({ satisci: s.seller_id, page: undefined })} className="font-medium text-blue-700 hover:underline">{s.seller_name}</Link></td>
                <td className="td">{num(s.active_data)}</td><td className="td">{num(s.passive_data)}</td>
                <td className="td">{num(s.total_sales)}</td><td className="td">{tl(s.total_revenue)}</td>
                <td className="td">{s.user_active ? <span className="pill bg-green-100 text-green-800">Aktif</span> : <span className="pill bg-red-100 text-red-800">Pasif</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card flex flex-wrap items-end gap-3" action="/teknik-kontrol">
        {sp.satisci && <input type="hidden" name="satisci" value={sp.satisci} />}
        <div><label className="label">Kapsam</label>
          <select name="kapsam" defaultValue={sp.kapsam ?? ""} className="input">
            <option value="">Tüm kayıtlar</option><option value="aktif">Aktif datalar</option>
            <option value="pasif">Pasife alınanlar</option><option value="satis">Satışa dönenler</option></select></div>
        <div className="flex-1"><label className="label">İsim / telefon</label><input name="q" defaultValue={sp.q} className="input" /></div>
        <button className="btn">Kontrol Et</button><Link href="/teknik-kontrol" className="btn-light">Temizle</Link>
      </form>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Data Kayıt Kontrolü ({num(count)} kayıt)</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">No</th><th className="th">Müşteri</th><th className="th">Satışçı</th><th className="th">Atayan</th><th className="th">Durum</th><th className="th">Tip</th><th className="th">Oluşturma</th><th className="th">Son İşlem</th><th className="th">Kayıt</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="td"><Link href={`/loglar?tablo=customers&kayit=${r.id}`} className="text-blue-700 hover:underline" title="Bu kaydın logları">#{r.id}</Link></td>
                <td className="td"><Link href={`/datalar/${r.id}`} className="hover:underline">{r.full_name}</Link><div className="text-xs text-slate-500">{r.phone}</div></td>
                <td className="td">{r.seller_name ?? "-"}</td><td className="td">{r.assigner_name ?? "-"}</td>
                <td className="td"><span className={`pill ${r.status_is_won ? "bg-green-100 text-green-800" : ""}`}>{r.status ?? "-"}</span></td>
                <td className="td">{r.data_type ?? "-"}</td>
                <td className="td whitespace-nowrap">{dateTime(r.created_at)}</td><td className="td whitespace-nowrap">{dateTime(r.last_action_at)}</td>
                <td className="td">{r.is_active ? "Aktif" : <span className="text-red-700">Pasif</span>}</td>
              </tr>
            ))}
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
