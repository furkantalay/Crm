import Link from "next/link";
import { can, requireRole } from "@/lib/auth";
import { getLookups, getProducts, getSellers } from "@/lib/data";
import { date, num, tl } from "@/lib/format";
import { loadReport, type SaleRow } from "@/lib/report";

type SP = Promise<Record<string, string | undefined>>;

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireRole(["admin", "yonetici", "dataci", "teknik"]);
  const seeNet = can(me, "net"), seeAds = can(me, "ads");
  const [lk, sellers, products, r] = await Promise.all([getLookups(), getSellers(true), getProducts(), loadReport(sp)]);

  const bySeller = new Map<string, SaleRow[]>();
  r.rows.forEach((s) => { const k = s.seller_name ?? "Atanmamış"; bySeller.set(k, [...(bySeller.get(k) ?? []), s]); });
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Raporlama Paneli</h1>
        <div className="flex gap-2">
          {(me.role === "admin" || me.role === "yonetici") && <Link href="/raporlar/huni" className="btn">📉 Satış hunisi</Link>}
          {(me.role === "admin" || me.role === "yonetici") && <Link href="/aramalar/rapor" className="btn-light">📊 Arama raporu</Link>}
          <a href={`/raporlar/csv?${qs}`} className="btn-light">Excel&apos;e aktar (CSV)</a>
        </div>
      </div>

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8" action="/raporlar">
        <div><label className="label">Dönem</label>
          <select name="donem" defaultValue={sp.donem ?? ""} className="input">
            <option value="">Bu Ay</option><option value="gecen_ay">Geçen Ay</option><option value="son_7">Son 7 Gün</option>
            <option value="bu_yil">Bu Yıl</option><option value="ozel">Özel aralık</option></select></div>
        <div><label className="label">Başlangıç (özel)</label><input type="date" name="bas" defaultValue={sp.bas} className="input" /></div>
        <div><label className="label">Bitiş (özel)</label><input type="date" name="bit" defaultValue={sp.bit} className="input" /></div>
        <div><label className="label">Satışçı</label>
          <select name="satisci" defaultValue={sp.satisci ?? ""} className="input"><option value="">Tüm Satışçılar</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        <div><label className="label">Ödeme</label>
          <select name="odeme" defaultValue={sp.odeme ?? ""} className="input"><option value="">Tüm Ödemeler</option>
            {lk.by("payment_method").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label">Satış kaynağı</label>
          <select name="kaynak" defaultValue={sp.kaynak ?? ""} className="input"><option value="">Tüm Kaynaklar</option>
            {lk.by("sale_source").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label">Data tipi</label>
          <select name="tip" defaultValue={sp.tip ?? ""} className="input"><option value="">Tüm Data Tipleri</option>
            {lk.by("data_type").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label">Eğitim</label>
          <select name="egitim" defaultValue={sp.egitim ?? ""} className="input"><option value="">Tüm Eğitimler</option>
            {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
        <div className="col-span-2 flex gap-2 md:col-span-4 lg:col-span-8"><button className="btn">Filtrele</button><Link href="/raporlar" className="btn-light">Temizle</Link>
          <span className="self-center text-sm text-slate-500">{r.label}: {date(r.from)} – {date(r.to)}</span></div>
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="card"><div className="text-sm text-slate-500">Satış Adedi</div><div className="text-2xl font-bold">{num(r.rows.length)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Satış Cirosu</div><div className="text-2xl font-bold">{tl(r.revenue)}</div></div>
        {seeNet && <div className="card"><div className="text-sm text-slate-500">Bize Gelen</div><div className="text-2xl font-bold">{tl(r.net)}</div></div>}
        {seeAds && <>
          <div className="card"><div className="text-sm text-slate-500">Reklam Yönetimi Sayısı</div><div className="text-2xl font-bold">{num(r.adCount)}</div></div>
          <div className="card"><div className="text-sm text-slate-500">Reklam Yönetimi Aylık</div><div className="text-2xl font-bold">{tl(r.adSum)}</div></div>
          <div className="card"><div className="text-sm text-slate-500">Toplam Ciro</div><div className="text-2xl font-bold">{tl(r.revenue + r.adSum)}</div></div>
        </>}
      </div>
      {r.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{r.error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Satış Detay Tablosu</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Tarih</th><th className="th">Eğitim Alan</th><th className="th">Eğitim / Paket</th><th className="th">Telefon</th>
            <th className="th">Satış</th><th className="th">Ödeme</th><th className="th">Kaynak</th><th className="th">Banka</th>
            <th className="th">Ödeyen</th>{seeNet && <th className="th">Bize Gelen</th>}<th className="th">Data Tipi</th>
          </tr></thead>
          <tbody>
            {[...bySeller.entries()].map(([seller, list]) => (
              <SellerBlock key={seller} seller={seller} list={list} seeNet={seeNet} />
            ))}
            {!r.rows.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={11}>Bu filtrelerle satış yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SellerBlock({ seller, list, seeNet }: { seller: string; list: SaleRow[]; seeNet: boolean }) {
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const net = list.reduce((s, r) => s + Number(r.net_amount ?? r.amount), 0);
  return (
    <>
      <tr className="bg-blue-50"><td className="td font-semibold text-blue-900" colSpan={11}>Satışçı: {seller} · {list.length} satış · {tl(total)}{seeNet ? ` · bize gelen ${tl(net)}` : ""}</td></tr>
      {list.map((s) => (
        <tr key={s.id} className="border-b border-slate-100">
          <td className="td whitespace-nowrap">{date(s.order_date)}</td>
          <td className="td"><Link href={`/datalar/${s.customer_id}`} className="text-blue-700 hover:underline">{s.customer_name}</Link></td>
          <td className="td max-w-56 text-xs">{s.products ?? "-"}</td>
          <td className="td whitespace-nowrap">{s.customer_phone}</td>
          <td className="td whitespace-nowrap">{tl(s.amount)}</td>
          <td className="td whitespace-nowrap">{s.payment_method ?? "-"}{s.installments ? ` / ${s.installments} taksit` : ""}</td>
          <td className="td">{s.sale_source ?? "-"}</td><td className="td">{s.bank ?? "-"}</td><td className="td">{s.payer_name ?? "-"}</td>
          {seeNet && <td className="td whitespace-nowrap">{tl(s.net_amount)}</td>}
          <td className="td"><span className="pill">{s.data_type ?? "-"}</span></td>
        </tr>
      ))}
    </>
  );
}
