import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSellers } from "@/lib/data";
import { todayIst } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { addMeeting, updateMeeting } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
const STATUS: Record<string, string> = { planlandi: "Planlandı", yapildi: "Görüşüldü", ertelendi: "Ertelendi", iptal: "İptal" };
const TZ = "Europe/Istanbul";

export default async function MeetingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const staff = isStaff(me.role);
  const supabase = await createClient();
  const sellers = await getSellers();

  const month = sp.ay || todayIst().slice(0, 7); // YYYY-MM
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;

  let q = supabase.from("meetings")
    .select("id, customer_id, seller_id, title, scheduled_at, status, note, customer:customers(full_name, phone), seller:profiles!meetings_seller_id_fkey(full_name)")
    .gte("scheduled_at", `${month}-01T00:00:00+03:00`).lt("scheduled_at", `${next}-01T00:00:00+03:00`)
    .order("scheduled_at");
  if (sp.satisci) q = q.eq("seller_id", sp.satisci);
  const { data, error } = await q;

  // Toplantı planlanabilecek müşteriler: satış yapılmış olanlar (satışçı yalnız kendininkini görür)
  const { data: soldRaw } = await supabase.from("v_sale_list").select("customer_id, customer_name, customer_phone, seller_id")
    .eq("is_active", true).order("order_date", { ascending: false }).limit(3000);
  const sold = Array.from(new Map((soldRaw ?? []).map((s) => [s.customer_id, s])).values());

  type Row = { id: number; customer_id: number; title: string | null; scheduled_at: string; status: string; note: string | null;
    customer: { full_name: string; phone: string } | null; seller: { full_name: string } | null };
  let rows = (data ?? []) as unknown as Row[];
  if (sp.q) {
    const t = sp.q.toLocaleLowerCase("tr");
    rows = rows.filter((r) => [r.customer?.full_name, r.customer?.phone].some((x) => x?.toLocaleLowerCase("tr").includes(t)));
  }
  const dayKey = (v: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(v));
  const timeOf = (v: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, timeStyle: "short" }).format(new Date(v));
  const groups = new Map<string, Row[]>();
  rows.forEach((r) => { const k = dayKey(r.scheduled_at); groups.set(k, [...(groups.get(k) ?? []), r]); });
  const monthName = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 15));

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Aylık Toplantı Planı</h1>

      <form className="card flex flex-wrap items-end gap-3" action="/toplantilar">
        <div><label className="label">Ay</label><input type="month" name="ay" defaultValue={month} className="input" /></div>
        {staff && (
          <div><label className="label">Satışçı</label>
            <select name="satisci" defaultValue={sp.satisci ?? ""} className="input"><option value="">Tüm Satışçılar</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        )}
        <div className="flex-1"><label className="label">Müşteri adı veya telefon</label><input name="q" defaultValue={sp.q} className="input" /></div>
        <button className="btn">Planı Göster</button>
        <Link href="/toplantilar" className="btn-light">Temizle</Link>
      </form>

      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">Yeni Toplantı Planla</h2>
        <p className="mb-3 text-sm text-slate-500">
          {staff ? `Satış yapılmış müşteriler için toplantı planlayabilirsiniz. ${sold.length} müşteri seçim için hazır.` : "Kendi satış yaptığınız müşteriler için toplantı oluşturabilirsiniz."}
        </p>
        <ActionForm action={addMeeting} submitLabel="Toplantıyı Plana Ekle" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {staff && (
              <div><label className="label">Satışçı</label>
                <select name="seller_id" className="input" defaultValue=""><option value="">Satışı yapan</option>
                  {sellers.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
            )}
            <div className={staff ? "" : "md:col-span-2"}><label className="label">Satış yapılan müşteri</label>
              <select name="customer_id" className="input" required defaultValue=""><option value="" disabled>Müşteri seçin</option>
                {sold.map((s) => <option key={s.customer_id} value={s.customer_id}>{s.customer_name} · {s.customer_phone}</option>)}</select></div>
            <div><label className="label">Tarih / saat</label><input type="datetime-local" name="scheduled_at" className="input" required /></div>
            <div><label className="label">Durum</label>
              <select name="status" className="input" defaultValue="planlandi">
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <textarea name="note" rows={2} className="input" placeholder="Toplantı öncesi not / görüşülecek konu" />
        </ActionForm>
      </div>

      <div className="flex items-center justify-between">
        <Link href={`/toplantilar?ay=${prev}${sp.satisci ? `&satisci=${sp.satisci}` : ""}`} className="btn-light">← Önceki ay</Link>
        <h2 className="text-xl font-semibold capitalize">{monthName} · {rows.length} toplantı</h2>
        <Link href={`/toplantilar?ay=${next}${sp.satisci ? `&satisci=${sp.satisci}` : ""}`} className="btn-light">Sonraki ay →</Link>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      <div className="space-y-4">
        {[...groups.entries()].map(([day, list]) => (
          <div key={day} className="card">
            <h3 className="mb-2 font-semibold capitalize">{day}</h3>
            <ul className="divide-y divide-slate-100">
              {list.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="pill bg-blue-50 text-blue-800">{timeOf(r.scheduled_at)}</span>
                    <Link href={`/datalar/${r.customer_id}`} className="font-medium text-blue-700 hover:underline">{r.customer?.full_name}</Link>
                    <span className="text-slate-500">{r.customer?.phone}</span>
                    {staff && <span className="text-slate-500">· {r.seller?.full_name ?? "-"}</span>}
                  </div>
                  <ActionForm action={updateMeeting} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className="input w-36">
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <input name="note" defaultValue={r.note ?? ""} placeholder="Not" className="input min-w-60 flex-1" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-slate-500">Bu ay için toplantı yok.</p>}
      </div>
    </div>
  );
}
