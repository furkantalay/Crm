import Link from "next/link";
import { can, requirePerm, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, monthStartIst, num, tl, todayIst } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { matchManually, syncNow, unmatch } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
type Tx = { id: number; transaction_date: string; price: number; paid_price: number; merchant_payout_amount: number | null;
  installment: number | null; transaction_type: string; sale_id: number | null; transaction_status: number | null; iyzico_commission: number | null };
type Sale = { id: number; order_date: string; amount: number; net_amount: number | null; installments: number | null; customer_id: number;
  customer_name: string; seller_name: string | null; sale_source: string | null; net_source: string; iyzico_refunded: number };

const isIyzico = (s: string | null) => !!s && s.toLocaleLowerCase("tr").includes("iyzico");
const dayDiff = (a: string, b: string) => Math.abs((new Date(a.slice(0, 10)).getTime() - new Date(b.slice(0, 10)).getTime()) / 86400000);

export default async function IyzicoPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireRole(["admin", "yonetici", "dataci"]); await requirePerm("iyzico");
  const seeNet = can(me, "net");
  const supabase = await createClient();
  const from = sp.bas || monthStartIst();
  const to = sp.bit || todayIst();

  const [{ data: salesRaw }, { data: txRaw }, { data: last }] = await Promise.all([
    supabase.from("v_sale_list").select("id, order_date, amount, net_amount, installments, customer_id, customer_name, seller_name, sale_source, net_source, iyzico_refunded")
      .eq("is_active", true).gte("order_date", from).lte("order_date", to).order("order_date", { ascending: false }).limit(3000),
    supabase.from("iyzico_transactions").select("id, transaction_date, price, paid_price, merchant_payout_amount, installment, transaction_type, sale_id, transaction_status, iyzico_commission")
      .gte("transaction_date", `${from}T00:00:00+03:00`).lte("transaction_date", `${to}T23:59:59+03:00`).order("transaction_date", { ascending: false }).limit(5000),
    supabase.from("iyzico_transactions").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => isIyzico(s.sale_source));
  const tx = (txRaw ?? []) as Tx[];
  const payments = tx.filter((t) => t.transaction_type === "PAYMENT");
  const freeTx = payments.filter((t) => !t.sale_id);
  const matched = sales.filter((s) => s.net_source === "iyzico");
  const unmatched = sales.filter((s) => s.net_source !== "iyzico");
  const refunds = tx.filter((t) => t.transaction_type !== "PAYMENT");

  const gross = payments.reduce((s, t) => s + Number(t.price), 0);
  const payout = payments.reduce((s, t) => s + Number(t.merchant_payout_amount ?? 0), 0);
  const refundSum = refunds.reduce((s, t) => s + Number(t.price), 0);

  // Her eşleşmemiş satış için aday ödemeler: aynı tutar, ±5 gün; en yakın tarih ve aynı taksit önce
  const candidates = (s: Sale) => freeTx
    .filter((t) => (Number(t.price) === Number(s.amount) || Number(t.paid_price) === Number(s.amount)) && dayDiff(t.transaction_date, s.order_date) <= 5)
    .sort((a, b) => (Number((b.installment ?? 1) === (s.installments ?? 1)) - Number((a.installment ?? 1) === (s.installments ?? 1)))
      || dayDiff(a.transaction_date, s.order_date) - dayDiff(b.transaction_date, s.order_date));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">iyzico</h1>
        <ActionForm action={syncNow} submitLabel="Şimdi senkronize et" resetOnSuccess={false}><span className="text-xs text-slate-500">Son: {dateTime(last?.synced_at)} · her saat otomatik</span></ActionForm>
      </div>
      <p className="text-sm text-slate-600">iyzico işlemleri her saat otomatik çekilir. Satışla tutar, tarih ve taksit üzerinden <b>tek</b> eşleşen ödemelerde &quot;bize gelen&quot; tutar iyzico&apos;nun yatıracağı tutarla otomatik doldurulur. Aynı gün aynı tutarda birden fazla ödeme varsa aşağıdan doğru ödemeyi seçin.</p>

      <form className="card flex flex-wrap items-end gap-3" action="/iyzico">
        <div><label className="label">Başlangıç</label><input type="date" name="bas" defaultValue={from} className="input" /></div>
        <div><label className="label">Bitiş</label><input type="date" name="bit" defaultValue={to} className="input" /></div>
        <button className="btn">Göster</button><Link href="/iyzico" className="btn-light">Bu ay</Link>
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="card"><div className="text-sm text-slate-500">iyzico Ödemesi</div><div className="text-2xl font-bold">{num(payments.length)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Brüt</div><div className="text-2xl font-bold">{tl(gross)}</div></div>
        {seeNet && <div className="card"><div className="text-sm text-slate-500">Bize Kalan</div><div className="text-2xl font-bold text-green-700">{tl(payout)}</div></div>}
        {seeNet && <div className="card"><div className="text-sm text-slate-500">Kesinti</div><div className="text-2xl font-bold text-red-700">{tl(gross - payout)}</div><div className="text-xs text-slate-500">{gross ? `%${((gross - payout) / gross * 100).toFixed(1)}` : ""}</div></div>}
        <div className="card"><div className="text-sm text-slate-500">İade / İptal</div><div className="text-2xl font-bold">{tl(refundSum)}</div><div className="text-xs text-slate-500">{refunds.length} işlem</div></div>
        <div className="card"><div className="text-sm text-slate-500">Eşleşen Satış</div><div className="text-2xl font-bold">{matched.length} / {sales.length}</div></div>
      </div>

      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">Eşleştirilmeyi Bekleyen Satışlar ({unmatched.length})</h2>
        <p className="mb-3 text-sm text-slate-500">Kaynağı iyzico olan ama henüz bir iyzico ödemesine bağlanmamış satışlar. Önerilen ödeme en üstte.</p>
        <div className="divide-y divide-slate-100">
          {unmatched.map((s) => {
            const c = candidates(s);
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-56">
                  <Link href={`/datalar/${s.customer_id}`} className="font-medium text-blue-700 hover:underline">{s.customer_name}</Link>
                  <div className="text-xs text-slate-500">{date(s.order_date)} · {s.seller_name ?? "-"} · {tl(s.amount)} · {s.installments ?? 1} taksit</div>
                </div>
                {c.length ? (
                  <ActionForm action={matchManually} submitLabel="Eşleştir" resetOnSuccess={false} className="flex flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="sale_id" value={s.id} />
                    <select name="transaction_id" className="input min-w-72 flex-1" defaultValue={c[0].id}>
                      {c.map((t) => <option key={t.id} value={t.id}>{dateTime(t.transaction_date)} · {tl(t.price)} · {t.installment ?? 1} taksit{seeNet ? ` · bize ${tl(t.merchant_payout_amount)}` : ""}</option>)}
                    </select>
                  </ActionForm>
                ) : <span className="text-xs text-amber-700">Bu tutarda boşta iyzico ödemesi yok (tutar, tarih ya da kaynak yanlış girilmiş olabilir).</span>}
              </div>
            );
          })}
          {!unmatched.length && <p className="py-3 text-sm text-green-700">Bu aralıktaki tüm iyzico satışları eşleşmiş.</p>}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Satışa Bağlanmamış iyzico Ödemeleri ({freeTx.length})</h2>
        <p className="px-4 pb-2 text-sm text-slate-500">CRM&apos;de karşılığı bulunamayan ödemeler: satış girilmemiş ya da farklı tutar/kaynakla girilmiş olabilir.</p>
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Tarih</th><th className="th">Tutar</th><th className="th">Tahsil edilen</th><th className="th">Taksit</th>{seeNet && <th className="th">Bize kalan</th>}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {freeTx.map((t) => (
              <tr key={t.id}><td className="td">{dateTime(t.transaction_date)}</td><td className="td">{tl(t.price)}</td><td className="td">{tl(t.paid_price)}</td>
                <td className="td">{t.installment ?? 1}</td>{seeNet && <td className="td">{tl(t.merchant_payout_amount)}</td>}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-2 text-lg font-semibold">Eşleşen Satışlar ({matched.length})</h2>
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Tarih</th><th className="th">Müşteri</th><th className="th">Satışçı</th><th className="th">Tutar</th>{seeNet && <th className="th">Bize gelen</th>}<th className="th">İade</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {matched.map((s) => (
              <tr key={s.id}>
                <td className="td">{date(s.order_date)}</td>
                <td className="td"><Link href={`/datalar/${s.customer_id}`} className="text-blue-700 hover:underline">{s.customer_name}</Link></td>
                <td className="td">{s.seller_name ?? "-"}</td><td className="td">{tl(s.amount)}</td>
                {seeNet && <td className="td text-green-700">{tl(s.net_amount)}</td>}
                <td className="td">{Number(s.iyzico_refunded) > 0 ? <span className="pill bg-red-100 text-red-800">{tl(s.iyzico_refunded)}</span> : "-"}</td>
                <td className="td text-right">
                  <ActionForm action={unmatch} submitLabel="Kaldır" resetOnSuccess={false}><input type="hidden" name="sale_id" value={s.id} /></ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
