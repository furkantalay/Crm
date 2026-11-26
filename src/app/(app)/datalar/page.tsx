import Link from "next/link";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, num } from "@/lib/format";

const PAGE = 50;
type SP = Promise<Record<string, string | undefined>>;

export default async function DatalarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const showPassive = sp.pasif === "1";

  const [{ data: sellers }, { data: lookups }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "satisci").eq("is_active", true).order("full_name"),
    supabase.from("lookups").select("id, category, label").in("category", ["data_type", "contact_status"]).eq("is_active", true).order("sort_order"),
  ]);
  const types = (lookups ?? []).filter((l) => l.category === "data_type");
  const statuses = (lookups ?? []).filter((l) => l.category === "contact_status");

  let q = supabase.from("v_customer_list").select("*", { count: "exact" }).eq("is_active", !showPassive);
  if (sp.satisci) q = q.eq("assigned_to", sp.satisci);
  if (sp.durum) q = q.eq("status_id", sp.durum);
  if (sp.tip) q = q.eq("data_type_id", sp.tip);
  if (sp.bas) q = q.gte("applied_at", `${sp.bas}T00:00:00+03:00`);
  if (sp.bit) q = q.lte("applied_at", `${sp.bit}T23:59:59+03:00`);
  if (sp.q) {
    const term = sp.q.replace(/[,()*%]/g, " ").trim();
    if (term) q = q.or(`full_name.ilike.*${term}*,phone.ilike.*${term}*,last_note.ilike.*${term}*`);
  }
  const sort = sp.sirala === "islem" ? "last_action_at" : "applied_at";
  q = q.order("is_priority", { ascending: false })
       .order(sort, { ascending: false, nullsFirst: false })
       .range((page - 1) * PAGE, page * PAGE - 1);
  const { data: rows, count, error } = await q;

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    return `/datalar?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Datalar</h1>
        {isStaff(me.role) && (
          <div className="flex gap-2">
            <Link href="/datalar/yeni" className="btn">+ Yeni Data</Link>
            <Link href="/aktarim" className="btn-light">Excel Toplu Aktarım</Link>
          </div>
        )}
      </div>

      {isStaff(me.role) && (
        <div className="flex flex-wrap gap-2">
          <Link href={link({ satisci: undefined, page: undefined })}
                className={`rounded-full px-3 py-1 text-sm ring-1 ring-slate-200 ${!sp.satisci ? "bg-slate-900 text-white" : "bg-white"}`}>Tüm Satışçılar</Link>
          {(sellers ?? []).map((s) => (
            <Link key={s.id} href={link({ satisci: s.id, page: undefined })}
                  className={`rounded-full px-3 py-1 text-sm ring-1 ring-slate-200 ${sp.satisci === s.id ? "bg-slate-900 text-white" : "bg-white"}`}>{s.full_name}</Link>
          ))}
        </div>
      )}

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8" action="/datalar">
        {sp.satisci && <input type="hidden" name="satisci" value={sp.satisci} />}
        <div className="col-span-2"><label className="label">Ara</label>
          <input name="q" defaultValue={sp.q} placeholder="İsim, telefon, not" className="input" /></div>
        <div><label className="label">Durum</label>
          <select name="durum" defaultValue={sp.durum ?? ""} className="input"><option value="">Tümü</option>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label">Data tipi</label>
          <select name="tip" defaultValue={sp.tip ?? ""} className="input"><option value="">Tümü</option>
            {types.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="label">Başvuru başlangıç</label><input type="date" name="bas" defaultValue={sp.bas} className="input" /></div>
        <div><label className="label">Başvuru bitiş</label><input type="date" name="bit" defaultValue={sp.bit} className="input" /></div>
        <div><label className="label">Sırala</label>
          <select name="sirala" defaultValue={sp.sirala ?? ""} className="input">
            <option value="">Başvuru tarihi</option><option value="islem">Son işlem</option></select></div>
        <div className="flex items-end gap-2">
          <button className="btn flex-1">Filtrele</button>
          <Link href="/datalar" className="btn-light">Temizle</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span><b>{num(count)}</b> data listeleniyor. Son 30 günde başvurup henüz not girilmemiş olanlar üstte ve sarı.</span>
        <Link href={link({ pasif: showPassive ? undefined : "1", page: undefined })} className="underline">
          {showPassive ? "Aktif dataları göster" : "Pasife alınanları göster"}
        </Link>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Liste yüklenemedi: {error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">İsim</th><th className="th">Telefon</th><th className="th">Başvuru</th>
              <th className="th">Data Tipi</th><th className="th">Sektör</th>
              {isStaff(me.role) && <th className="th">Satışçı</th>}
              <th className="th">Görüşme Notu</th><th className="th">Durum</th><th className="th">Son İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className={r.is_priority ? "bg-amber-50" : "hover:bg-slate-50"}>
                <td className="td"><Link href={`/datalar/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.full_name}</Link></td>
                <td className="td whitespace-nowrap">{r.phone}</td>
                <td className="td whitespace-nowrap">{dateTime(r.applied_at)}</td>
                <td className="td"><span className="pill">{r.data_type ?? "-"}</span></td>
                <td className="td max-w-40 truncate" title={r.sector ?? ""}>{r.sector ?? "-"}</td>
                {isStaff(me.role) && <td className="td whitespace-nowrap">{r.seller_name ?? <span className="text-red-600">Atanmamış</span>}</td>}
                <td className="td max-w-72"><div className="line-clamp-2" title={r.last_note ?? ""}>{r.last_note ?? "-"}</div></td>
                <td className="td"><span className={`pill ${r.status_is_won ? "bg-green-100 text-green-800" : ""}`}>{r.status ?? "-"}</span></td>
                <td className="td whitespace-nowrap">{dateTime(r.last_action_at)}</td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td className="td py-8 text-center text-slate-500" colSpan={9}>Kayıt bulunamadı.</td></tr>}
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
