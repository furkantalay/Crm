import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ActionForm from "@/components/ActionForm";
import { addLookup, saveCompany, updateLookup } from "./actions";

const CATS: Record<string, string> = {
  data_type: "Data tipleri", contact_status: "Görüşme durumları", sale_source: "Satış kaynakları",
  payment_method: "Ödeme yöntemleri", bank: "Bankalar", sector: "Sektörler",
};

export default async function SettingsPage() {
  const me = await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const [{ data: company }, { data: lookups }] = await Promise.all([
    supabase.from("companies").select("name, default_logout_minutes").single(),
    supabase.from("lookups").select("id, category, label, sort_order, is_active, is_won").order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Sistem Ayarları</h1>

      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">Şirket ve Genel Hareketsizlik Süresi</h2>
        <p className="mb-3 text-sm text-slate-600">Genel süre, otomatik çıkışı açık olup kişiye özel süresi boş bırakılan kullanıcılara uygulanır. Kişi bazlı ayarlar <Link href="/kullanicilar" className="underline">Kullanıcılar</Link> ekranında.</p>
        {me.role === "admin" ? (
          <ActionForm action={saveCompany} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-wrap items-end gap-3">
            <div><label className="label">Şirket adı</label><input name="name" defaultValue={company?.name ?? ""} className="input" /></div>
            <div><label className="label">Genel süre (dakika)</label><input name="default_logout_minutes" defaultValue={company?.default_logout_minutes ?? 30} inputMode="numeric" className="input w-32" /></div>
          </ActionForm>
        ) : <p className="text-sm">Genel süre: <b>{company?.default_logout_minutes} dk</b> (yalnız admin değiştirebilir)</p>}
      </div>

      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">Listeler</h2>
        <p className="mb-4 text-sm text-slate-600">Formlardaki seçenekler buradan yönetilir. Kullanılan bir değer silinmez; pasife alınınca yeni kayıtlarda görünmez ama eski kayıtlarda kalır. Görüşme durumlarında &quot;satış&quot; işaretli durum, satış girilince otomatik atanır.</p>
        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(CATS).map(([cat, title]) => {
            const items = (lookups ?? []).filter((l) => l.category === cat);
            return (
              <div key={cat} className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold">{title}</h3>
                <ul className="space-y-1">
                  {items.map((l) => (
                    <li key={l.id}>
                      <ActionForm action={updateLookup} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={l.id} />
                        <input name="sort_order" defaultValue={l.sort_order} className="input w-14" title="Sıra" />
                        <input name="label" defaultValue={l.label} className="input min-w-32 flex-1" />
                        {l.is_won && <span className="pill bg-green-100 text-green-800">satış</span>}
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" value="1" defaultChecked={l.is_active} /> aktif</label>
                      </ActionForm>
                    </li>
                  ))}
                  {!items.length && <li className="text-sm text-slate-500">Henüz değer yok.</li>}
                </ul>
                <ActionForm action={addLookup} submitLabel="Ekle" className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="category" value={cat} />
                  <input name="label" placeholder="Yeni değer" className="input min-w-32 flex-1" />
                  {cat === "contact_status" && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_won" value="1" /> satış durumu</label>}
                </ActionForm>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
