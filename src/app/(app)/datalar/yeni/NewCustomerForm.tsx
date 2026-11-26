"use client";

import ActionForm from "@/components/ActionForm";

type Opt = { id: string; label: string };
type Act = (s: { ok?: string; error?: string } | null, f: FormData) => Promise<{ ok?: string; error?: string } | null>;

export default function NewCustomerForm({ action, sellers, dataTypes }: { action: Act; sellers: Opt[]; dataTypes: Opt[] }) {
  return (
    <ActionForm action={action} submitLabel="Datayı Kaydet" resetOnSuccess={false} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div><label className="label">Ad soyad *</label><input name="full_name" className="input" required /></div>
        <div><label className="label">Telefon *</label><input name="phone" className="input" required inputMode="tel" /></div>
        <div><label className="label">E-posta</label><input name="email" type="email" className="input" /></div>
        <div><label className="label">Şehir</label><input name="city" className="input" /></div>
        <div><label className="label">Sektör</label><input name="sector" className="input" /></div>
        <div><label className="label">Data tipi</label>
          <select name="data_type_id" className="input" defaultValue={dataTypes[0]?.id}>{dataTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
        <div><label className="label">Satışçıya ata</label>
          <select name="seller_id" className="input" defaultValue=""><option value="">— Atanmamış —</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div className="md:col-span-2"><label className="label">Sorun / ihtiyaç</label><input name="problem" className="input" /></div>
      </div>
      <textarea name="note" rows={2} className="input" placeholder="İlk not" />
    </ActionForm>
  );
}
