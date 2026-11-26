import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { linker } from "@/lib/data";
import { dateTime, num } from "@/lib/format";

type SP = Promise<Record<string, string | undefined>>;
const PAGE = 100;
const TABLES: Record<string, string> = {
  customers: "Data", sales: "Satış", expected_sales: "Beklenen satış", meetings: "Toplantı", satisfaction_calls: "Memnuniyet",
  ad_clients: "Reklam yönetimi", profiles: "Kullanıcı", products: "Eğitim", lookups: "Liste",
};
const ACTION: Record<string, string> = { INSERT: "Ekledi", UPDATE: "Güncelledi", DELETE: "Sildi" };
const SKIP = new Set(["updated_at", "last_action_at", "last_seen_at"]);

type Log = { id: number; user_id: string | null; action: string; table_name: string; row_id: string | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string };

function summary(l: Log) {
  if (l.new_data?.legacy) return String(l.new_data.details ?? "");
  if (l.action === "UPDATE" && l.old_data && l.new_data) {
    const keys = Object.keys(l.new_data).filter((k) => !SKIP.has(k) && JSON.stringify(l.old_data![k]) !== JSON.stringify(l.new_data![k]));
    return keys.map((k) => `${k}: ${fmt(l.old_data![k])} → ${fmt(l.new_data![k])}`).join(" · ");
  }
  const d = l.new_data ?? l.old_data ?? {};
  return String(d.full_name ?? d.brand ?? d.name ?? d.label ?? (d.amount != null ? `${d.amount} ₺` : ""));
}
const fmt = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? "…" : String(v).slice(0, 60));

export default async function LogsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "teknik"]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const { data: people } = await supabase.from("profiles").select("id, full_name").order("full_name");
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.tablo) q = q.eq("table_name", sp.tablo);
  if (sp.kisi) q = q.eq("user_id", sp.kisi);
  if (sp.islem) q = q.eq("action", sp.islem);
  if (sp.kayit) q = q.eq("row_id", sp.kayit);
  if (sp.bas) q = q.gte("created_at", `${sp.bas}T00:00:00+03:00`);
  if (sp.bit) q = q.lte("created_at", `${sp.bit}T23:59:59+03:00`);
  const { data, count, error } = await q;
  const logs = (data ?? []) as Log[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = linker("/loglar", sp);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">İşlem Logları</h1>
      <form className="card grid grid-cols-2 gap-3 md:grid-cols-7" action="/loglar">
        <div><label className="label">Kayıt türü</label>
          <select name="tablo" defaultValue={sp.tablo ?? ""} className="input"><option value="">Tümü</option>
            {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Kişi</label>
          <select name="kisi" defaultValue={sp.kisi ?? ""} className="input"><option value="">Herkes</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
        <div><label className="label">İşlem</label>
          <select name="islem" defaultValue={sp.islem ?? ""} className="input"><option value="">Tümü</option>
            {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Kayıt no</label><input name="kayit" defaultValue={sp.kayit} className="input" /></div>
        <div><label className="label">Başlangıç</label><input type="date" name="bas" defaultValue={sp.bas} className="input" /></div>
        <div><label className="label">Bitiş</label><input type="date" name="bit" defaultValue={sp.bit} className="input" /></div>
        <div className="flex items-end gap-2"><button className="btn flex-1">Filtrele</button><Link href="/loglar" className="btn-light">Temizle</Link></div>
      </form>
      <p className="text-sm text-slate-600"><b>{num(count)}</b> log kaydı · eski sistemden gelen loglar da dahil</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Zaman</th><th className="th">Kişi</th><th className="th">İşlem</th><th className="th">Kayıt</th><th className="th">Detay</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap">{dateTime(l.created_at)}</td>
                <td className="td whitespace-nowrap">{l.user_id ? name.get(l.user_id) ?? "?" : "Sistem"}</td>
                <td className="td whitespace-nowrap">{ACTION[l.action] ?? l.action}</td>
                <td className="td whitespace-nowrap">{TABLES[l.table_name] ?? l.table_name}
                  {l.row_id && (l.table_name === "customers" ? <> <Link href={`/datalar/${l.row_id}`} className="text-blue-700 hover:underline">#{l.row_id}</Link></> : ` #${l.row_id}`)}</td>
                <td className="td max-w-xl text-xs text-slate-600">{summary(l)}</td>
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
