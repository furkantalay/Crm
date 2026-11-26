import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, monthStartIst, num, tl, todayIst } from "@/lib/format";

type SP = Promise<Record<string, string | undefined>>;

export default async function SatislarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const supabase = await createClient();
  const from = sp.bas || monthStartIst();
  const to = sp.bit || todayIst();

  const [{ data: sellers }, { data: lookups }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "satisci").order("full_name"),
    supabase.from("lookups").select("id, category, label").in("category", ["sale_source", "data_type"]).order("sort_order"),
  ]);

  let q = supabase.from("v_sale_list").select("*").eq("is_active", sp.pasif !== "1")
    .gte("order_date", from).lte("order_date", to);
  if (sp.satisci) q = q.eq("seller_id", sp.satisci);
  if (sp.kaynak) q = q.eq("sale_source_id", sp.kaynak);
  if (sp.tip) q = q.eq("data_type_id", sp.tip);
  const { data: rows, error } = await q.order("order_date", { ascending: false }).order("id", { ascending: false }).limit(2000);

  const list = rows ?? [];
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const net = list.reduce((s, r) => s + Number(r.net_amount ?? r.amount), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Satışlar</h1>

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-6" action="/satislar">
        <div><label className="label">Başlangıç</label><input type="date" name="bas" defaultValue={from} className="input" /></div>
        <div><label className="label">Bitiş</label><input type="date" name="bit" defaultValue={to} className="input" /></div>
        {isStaff(me.role) && (
          <div><label className="label">Satışçı</label>
            <select name="satisci" defaultValue={sp.satisci ?? ""} className="input"><option value="">Tümü</option>
              {(sellers ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        )}
        <div><label className="label">Satış kaynağı</label>
          <select name="kaynak" defaultValue={sp.kaynak ?? ""} className="input"><option value="">Tümü</option>
            {(lookups ?? []).filter((l) => l.category === "sale_source").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label">Data tipi</label>
          <select name="tip" defaultValue={sp.tip ?? ""} className="input"><option value="">Tümü</option>
            {(lookups ?? []).filter((l) => l.category === "data_type").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div className="flex items-end gap-2"><button className="btn flex-1">Göster</button><Link href="/satislar" className="btn-light">Temizle</Link></div>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-sm text-slate-500">Satış Adedi</div><div className="text-2xl font-bold">{num(list.length)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Ciro</div><div className="text-2xl font-bold">{tl(total)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Bize Gelen</div><div className="text-2xl font-bold text-green-700">{tl(net)}</div><div className="text-xs text-slate-500">Kesinti: {tl(total - net)}</div></div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Liste yüklenemedi: {error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className="th">Tarih</th><th className="th">Müşteri</th>{isStaff(me.role) && <th className="th">Satışçı</th>}
            <th className="th">Tutar</th><th className="th">Bize Gelen</th><th className="th">Kaynak</th>
            <th className="th">Ödeme</th><th className="th">Eğitim</th><th className="th">Data Tipi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td whitespace-nowrap">{date(s.order_date)}</td>
                <td className="td"><Link href={`/datalar/${s.customer_id}`} className="font-medium text-blue-700 hover:underline">{s.customer_name}</Link>
                  <div className="text-xs text-slate-500">{s.customer_phone}</div></td>
                {isStaff(me.role) && <td className="td whitespace-nowrap">{s.seller_name ?? "-"}</td>}
                <td className="td whitespace-nowrap">{tl(s.amount)}</td>
                <td className="td whitespace-nowrap">{tl(s.net_amount)}
                  {s.net_source === "iyzico" && <span className="ml-1 text-xs text-green-700" title="iyzico'dan otomatik">✓ iyzico</span>}
                  {Number(s.iyzico_refunded) > 0 && <div className="text-xs text-red-700">İade: {tl(s.iyzico_refunded)}</div>}</td>
                <td className="td">{s.sale_source ?? "-"}</td>
                <td className="td whitespace-nowrap">{s.payment_method ?? "-"}{s.installments ? ` / ${s.installments}` : ""}</td>
                <td className="td max-w-60 text-xs">{s.products ?? "-"}</td>
                <td className="td"><span className="pill">{s.data_type ?? "-"}</span></td>
              </tr>
            ))}
            {!list.length && <tr><td className="td py-8 text-center text-slate-500" colSpan={9}>Bu aralıkta satış yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
