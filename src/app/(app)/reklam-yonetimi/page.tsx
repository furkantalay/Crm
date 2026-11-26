import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { num, tl } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { addAdClient, deactivateAdClient, updateAdClient } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
type Ad = { id: number; brand: string; started_at: string | null; monthly_fee: number; status: string; ended_at: string | null; notes: string | null; is_admin_private: boolean };
const STATUS: Record<string, string> = { devam: "Devam Ediyor", durdu: "Durduruldu", bitti: "Sonlandırıldı" };

function AdTable({ rows, canDeactivate }: { rows: Ad[]; canDeactivate: boolean }) {
  return (
    <div className="space-y-2">
      {rows.map((a) => (
        <div key={a.id} className="card p-3">
          <ActionForm action={updateAdClient} submitLabel="Güncelle" resetOnSuccess={false} className="space-y-2">
            <input type="hidden" name="id" value={a.id} />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <div className="col-span-2 md:col-span-1"><label className="label">Marka</label><input name="brand" defaultValue={a.brand} className="input" /></div>
              <div><label className="label">Başlangıç</label><input type="date" name="started_at" defaultValue={a.started_at ?? ""} className="input" /></div>
              <div><label className="label">Aylık ödeme (₺)</label><input name="monthly_fee" defaultValue={a.monthly_fee} inputMode="decimal" className="input" /></div>
              <div><label className="label">Durum</label>
                <select name="status" defaultValue={a.status} className="input">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label">Bitiş</label><input type="date" name="ended_at" defaultValue={a.ended_at ?? ""} className="input" /></div>
              <div className="col-span-2 md:col-span-1"><label className="label">Notlar</label><textarea name="notes" defaultValue={a.notes ?? ""} rows={1} className="input" /></div>
            </div>
          </ActionForm>
          {canDeactivate && (
            <ActionForm action={deactivateAdClient} submitLabel="Pasife Al" className="mt-2" confirm={`${a.brand} pasife alınsın mı?`}>
              <input type="hidden" name="id" value={a.id} />
            </ActionForm>
          )}
        </div>
      ))}
      {!rows.length && <p className="text-sm text-slate-500">Kayıt yok.</p>}
    </div>
  );
}

export default async function AdsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await requireRole(["admin", "yonetici", "dataci"]);
  const supabase = await createClient();
  let q = supabase.from("ad_clients").select("*").eq("is_active", true).order("started_at", { ascending: false, nullsFirst: false });
  if (sp.durum) q = q.eq("status", sp.durum);
  const { data } = await q;
  const all = (data ?? []) as Ad[];
  const pub = all.filter((a) => !a.is_admin_private);
  const priv = all.filter((a) => a.is_admin_private);
  const sum = (a: Ad[]) => a.reduce((s, r) => s + Number(r.monthly_fee), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Reklam Yönetimi</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card"><div className="text-sm text-slate-500">Toplam Kayıt</div><div className="text-2xl font-bold">{num(pub.length)}</div><div className="text-xs text-slate-500">Genel reklam yönetimi kayıtları</div></div>
        <div className="card"><div className="text-sm text-slate-500">Aylık Ödeme Toplamı</div><div className="text-2xl font-bold">{tl(sum(pub))}</div><div className="text-xs text-slate-500">Genel kayıt toplamı</div></div>
        {me.role === "admin" && (
          <>
            <div className="card border-l-4 border-amber-500"><div className="text-sm text-slate-500">Admin Özel Kayıt</div><div className="text-2xl font-bold">{num(priv.length)}</div><div className="text-xs text-slate-500">Sadece sizin gördüğünüz kayıtlar</div></div>
            <div className="card border-l-4 border-amber-500"><div className="text-sm text-slate-500">Admin Özel Aylık Ödeme</div><div className="text-2xl font-bold">{tl(sum(priv))}</div><div className="text-xs text-slate-500">Genel toplama dahil değil</div></div>
          </>
        )}
      </div>

      <form className="card flex flex-wrap items-end gap-3" action="/reklam-yonetimi">
        <div><label className="label">Durum</label>
          <select name="durum" defaultValue={sp.durum ?? ""} className="input"><option value="">Tüm Durumlar</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="btn">Filtrele</button><Link href="/reklam-yonetimi" className="btn-light">Temizle</Link>
      </form>
      <p className="text-sm text-slate-600">Genel marka kayıtları Datacı, Yönetici ve Admin tarafından görünür. Admin özel kayıtları ayrı tabloda durur ve genel toplam değerlerine dahil edilmez.</p>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Yeni Kayıt</h2>
        <ActionForm action={addAdClient} submitLabel="Ekle" className="space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="col-span-2 md:col-span-1"><label className="label">Marka</label><input name="brand" className="input" required /></div>
            <div><label className="label">Başlangıç</label><input type="date" name="started_at" className="input" /></div>
            <div><label className="label">Aylık ödeme (₺)</label><input name="monthly_fee" inputMode="decimal" className="input" /></div>
            <div><label className="label">Durum</label>
              <select name="status" defaultValue="devam" className="input">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">Bitiş</label><input type="date" name="ended_at" className="input" /></div>
            <div className="col-span-2 md:col-span-1"><label className="label">Notlar</label><input name="notes" className="input" /></div>
          </div>
          {me.role === "admin" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_admin_private" value="1" /> Admin özel kayıt (genel toplama girmez)</label>}
        </ActionForm>
      </div>

      <h2 className="text-xl font-semibold">Genel Reklam Yönetimi Kayıtları</h2>
      <AdTable rows={pub} canDeactivate />
      {me.role === "admin" && (
        <>
          <h2 className="text-xl font-semibold">Admin Özel Kayıtlar</h2>
          <AdTable rows={priv} canDeactivate />
        </>
      )}
    </div>
  );
}
