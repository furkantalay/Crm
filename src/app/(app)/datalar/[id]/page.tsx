import Link from "next/link";
import { notFound } from "next/navigation";
import { getMe, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { date, dateTime, tl, todayIst } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { addInteraction, addSale, setActive, updateAssignment } from "./actions";
import { addExpected } from "../../beklenen-satislar/actions";
import { addMeeting } from "../../toplantilar/actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const supabase = await createClient();

  const { data: c } = await supabase.from("v_customer_list").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const [{ data: raw }, { data: history }, { data: sales }, { data: lookups }, { data: products }, { data: sellers }] = await Promise.all([
    supabase.from("customers").select("email, extra, created_at").eq("id", id).single(),
    supabase.from("interactions").select("id, note, channel, created_at, next_followup_at, user:profiles(full_name), status:lookups(label)")
      .eq("customer_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("v_sale_list").select("*").eq("customer_id", id).order("order_date", { ascending: false }),
    supabase.from("lookups").select("id, category, label").eq("is_active", true).order("sort_order"),
    supabase.from("products").select("id, name, kind").eq("is_active", true).order("kind", { ascending: false }).order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("role", "satisci").eq("is_active", true).order("full_name"),
  ]);
  const L = (cat: string) => (lookups ?? []).filter((l) => l.category === cat);
  const extra = (raw?.extra ?? {}) as Record<string, string>;
  const staff = isStaff(me.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/datalar" className="text-sm text-slate-500 hover:underline">← Datalar</Link>
          <h1 className="text-3xl font-bold">{c.full_name}</h1>
          <p className="text-slate-600">{c.phone}{raw?.email ? ` · ${raw.email}` : ""}{c.city ? ` · ${c.city}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="pill">{c.data_type ?? "-"}</span>
          <span className={`pill ${c.status_is_won ? "bg-green-100 text-green-800" : ""}`}>{c.status ?? "-"}</span>
          {!c.is_active && <span className="pill bg-red-100 text-red-800">Pasif</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-2 text-sm">
          <h2 className="text-lg font-semibold">Bilgiler</h2>
          <p><span className="text-slate-500">Satışçı:</span> {c.seller_name ?? "Atanmamış"}</p>
          <p><span className="text-slate-500">Atayan:</span> {c.assigner_name ?? "-"}</p>
          <p><span className="text-slate-500">Başvuru:</span> {dateTime(c.applied_at)}</p>
          <p><span className="text-slate-500">Sektör:</span> {c.sector ?? "-"}</p>
          {extra.problem && <p><span className="text-slate-500">Sorun / ihtiyaç:</span> {extra.problem}</p>}
          {extra.interest_training && <p><span className="text-slate-500">İlgilendiği eğitim:</span> {extra.interest_training}</p>}
          {extra.assignment_note && <p><span className="text-slate-500">Atama notu:</span> {extra.assignment_note}</p>}
          <p><span className="text-slate-500">Son işlem:</span> {dateTime(c.last_action_at)}</p>

          {staff && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <ActionForm action={updateAssignment} submitLabel="Ata" resetOnSuccess={false} className="space-y-2">
                <input type="hidden" name="customer_id" value={c.id} />
                <label className="label">Satışçıya ata</label>
                <select name="seller_id" defaultValue={c.assigned_to ?? ""} className="input">
                  <option value="">— Atanmamış —</option>
                  {(sellers ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </ActionForm>
              <ActionForm action={setActive} resetOnSuccess={false}
                          submitLabel={c.is_active ? "Pasife Al" : "Tekrar Aktif Et"}
                          confirm={c.is_active ? "Bu data pasife alınsın mı? (Silinmez, Pasif listesine taşınır.)" : undefined}>
                <input type="hidden" name="customer_id" value={c.id} />
                <input type="hidden" name="active" value={c.is_active ? "0" : "1"} />
              </ActionForm>
            </div>
          )}
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Görüşme Ekle</h2>
          <ActionForm action={addInteraction} submitLabel="Görüşmeyi Kaydet" className="space-y-3">
            <input type="hidden" name="customer_id" value={c.id} />
            <textarea name="note" rows={3} className="input" placeholder="Görüşme notu" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><label className="label">Durum</label>
                <select name="status_id" className="input" defaultValue="">
                  <option value="">Değiştirme</option>
                  {L("contact_status").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></div>
              <div><label className="label">Kanal</label>
                <select name="channel" className="input" defaultValue="Telefon">
                  {["Telefon", "WhatsApp", "Toplantı", "E-posta"].map((x) => <option key={x}>{x}</option>)}
                </select></div>
              <div><label className="label">Sonraki arama</label>
                <input type="datetime-local" name="next_followup_at" className="input" /></div>
            </div>
          </ActionForm>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold">Görüşme Geçmişi ({history?.length ?? 0})</h2>
          <ul className="space-y-3">
            {(history ?? []).map((h) => {
              const u = h.user as unknown as { full_name: string } | null;
              const s = h.status as unknown as { label: string } | null;
              return (
                <li key={h.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                  <div className="mb-1 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{dateTime(h.created_at)}</span><span>·</span><span>{u?.full_name ?? "Sistem"}</span>
                    {h.channel && <span className="pill">{h.channel}</span>}
                    {s && <span className="pill">{s.label}</span>}
                  </div>
                  <p className="whitespace-pre-wrap">{h.note ?? "-"}</p>
                  {h.next_followup_at && <p className="mt-1 text-xs text-blue-700">Sonraki arama: {dateTime(h.next_followup_at)}</p>}
                </li>
              );
            })}
            {!history?.length && <li className="text-sm text-slate-500">Henüz görüşme yok.</li>}
          </ul>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Satışlar</h2>
            {sales?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {sales.map((s) => (
                  <li key={s.id} className="py-2">
                    <div className="flex justify-between font-medium"><span>{date(s.order_date)} · {s.seller_name}</span><span>{tl(s.amount)}</span></div>
                    <div className="text-xs text-slate-500">{s.products ?? "-"} · {s.sale_source ?? "-"} · {s.payment_method ?? "-"}{s.installments ? ` / ${s.installments} taksit` : ""}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Satış yok.</p>}
          </div>

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Beklenen Satış Ekle</h2>
            <ActionForm action={addExpected} submitLabel="Beklenen Satışa Ekle" className="space-y-3">
              <input type="hidden" name="customer_id" value={c.id} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Beklenen tarih/saat</label><input type="datetime-local" name="expected_at" className="input" /></div>
                <div><label className="label">Tahmini tutar (₺)</label><input name="amount" inputMode="decimal" className="input" /></div>
                {staff && (
                  <div className="col-span-2"><label className="label">Satışçı</label>
                    <select name="seller_id" defaultValue={c.assigned_to ?? ""} className="input">
                      {(sellers ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select></div>
                )}
              </div>
              <input name="note" className="input" placeholder="Not (ör. maaş gününü bekliyor)" />
            </ActionForm>
          </div>

          {(sales?.length ?? 0) > 0 && (
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold">Toplantı Planla</h2>
              <ActionForm action={addMeeting} submitLabel="Toplantıyı Plana Ekle" className="space-y-3">
                <input type="hidden" name="customer_id" value={c.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Tarih / saat</label><input type="datetime-local" name="scheduled_at" className="input" required /></div>
                  <div><label className="label">Konu</label><input name="note" className="input" placeholder="Görüşülecek konu" /></div>
                </div>
              </ActionForm>
            </div>
          )}

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Satış Ekle</h2>
            <ActionForm action={addSale} submitLabel="Satışı Kaydet" className="space-y-3">
              <input type="hidden" name="customer_id" value={c.id} />
              <input type="hidden" name="data_type_id" value={c.data_type_id ?? ""} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Tutar (₺)</label><input name="amount" inputMode="decimal" className="input" required /></div>
                <div><label className="label">Bize gelen (₺)</label><input name="net_amount" inputMode="decimal" className="input" placeholder="Boşsa tutar" /></div>
                <div><label className="label">Sipariş tarihi</label><input type="date" name="order_date" defaultValue={todayIst()} className="input" /></div>
                <div><label className="label">Satış kaynağı</label>
                  <select name="sale_source_id" className="input">{L("sale_source").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                <div><label className="label">Ödeme</label>
                  <select name="payment_method_id" className="input">{L("payment_method").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                <div><label className="label">Taksit</label><input name="installments" inputMode="numeric" className="input" /></div>
                <div><label className="label">Banka</label>
                  <select name="bank_id" className="input" defaultValue=""><option value="">-</option>{L("bank").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                <div><label className="label">Ödeyen</label><input name="payer_name" className="input" /></div>
                {staff && (
                  <div className="col-span-2"><label className="label">Satışçı</label>
                    <select name="seller_id" defaultValue={c.assigned_to ?? ""} className="input">
                      {(sellers ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select></div>
                )}
              </div>
              <div><label className="label">Eğitim / paket</label>
                <div className="grid grid-cols-1 gap-1 rounded-lg border border-slate-200 p-2 text-sm md:grid-cols-2">
                  {(products ?? []).map((p) => (
                    <label key={p.id} className="flex items-center gap-2">
                      <input type="checkbox" name="product_ids" value={p.id} />
                      <span>{p.name}{p.kind === "package" && <span className="ml-1 text-xs text-slate-500">(paket)</span>}</span>
                    </label>
                  ))}
                </div></div>
              <textarea name="note" rows={2} className="input" placeholder="Satış notu" />
            </ActionForm>
          </div>
        </div>
      </div>
    </div>
  );
}
