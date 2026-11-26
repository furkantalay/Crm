import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tl } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { addProduct, updateProduct } from "./actions";

type Pr = { id: string; name: string; kind: string; includes: string[] | null; list_price: number | null; is_active: boolean; sort_order: number };

export default async function ProductsPage() {
  await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("*").order("kind", { ascending: false }).order("sort_order");
  const all = (data ?? []) as Pr[];
  const programs = all.filter((p) => p.kind === "program");
  const packages = all.filter((p) => p.kind === "package");

  const Row = ({ p }: { p: Pr }) => (
    <ActionForm action={updateProduct} submitLabel="Kaydet" resetOnSuccess={false} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2">
      <input type="hidden" name="id" value={p.id} />
      <input name="sort_order" defaultValue={p.sort_order} className="input w-14" title="Sıra" />
      <input name="name" defaultValue={p.name} className="input min-w-56 flex-1" />
      <input name="list_price" defaultValue={p.list_price ?? ""} placeholder="Liste fiyatı" inputMode="decimal" className="input w-32" />
      {p.kind === "package" && (
        <select name="includes" multiple defaultValue={p.includes ?? []} className="input h-20 w-64" title="Ctrl/Cmd ile çoklu seçim">
          {programs.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
        </select>
      )}
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" value="1" defaultChecked={p.is_active} /> aktif</label>
      {p.list_price != null && <span className="text-xs text-slate-500">{tl(p.list_price)}</span>}
    </ActionForm>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Eğitimler ve Paketler</h1>
      <p className="text-sm text-slate-600">Satış girerken seçilen eğitim ve paketler. Pasif yapılan eğitim yeni satışlarda görünmez, eski satışlarda kalır. Paketin içerdiği eğitimleri Ctrl/Cmd tuşuyla çoklu seçebilirsiniz.</p>

      <div className="card space-y-2">
        <h2 className="text-lg font-semibold">Eğitimler</h2>
        {programs.map((p) => <Row key={p.id} p={p} />)}
      </div>
      <div className="card space-y-2">
        <h2 className="text-lg font-semibold">Paketler</h2>
        {packages.map((p) => <Row key={p.id} p={p} />)}
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Yeni Eğitim / Paket</h2>
        <ActionForm action={addProduct} submitLabel="Ekle" className="space-y-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input name="name" placeholder="Ad" className="input md:col-span-2" required />
            <select name="kind" defaultValue="program" className="input"><option value="program">Eğitim</option><option value="package">Paket</option></select>
            <input name="list_price" placeholder="Liste fiyatı (isteğe bağlı)" inputMode="decimal" className="input" />
          </div>
          <div><label className="label">Paketse içerdiği eğitimler</label>
            <select name="includes" multiple className="input h-24">
              {programs.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
            </select></div>
        </ActionForm>
      </div>
    </div>
  );
}
