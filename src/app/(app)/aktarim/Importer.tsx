"use client";

import { useState } from "react";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { importCustomers, importSatisfaction, type ImportRow } from "./actions";

type Opt = { id: string; label: string };
const FIELDS_DATA: Record<string, string> = { name: "Ad soyad", phone: "Telefon", email: "E-posta", city: "Şehir", sector: "Sektör", problem: "Sorun / ihtiyaç", note: "Not", date: "Başvuru tarihi" };
const FIELDS_SAT: Record<string, string> = { phone: "Telefon", responsible: "Sorumlu (ad veya kullanıcı adı)", note: "Not" };
// Başlık adlarından otomatik eşleme
const GUESS: Record<string, RegExp> = {
  name: /^(ad|isim|ad ?soyad|ad ?soyadı|full.?name|müşteri|name)$/i, phone: /(tel|telefon|phone|gsm|cep)/i, email: /(mail|e-?posta)/i,
  city: /(şehir|il|city)/i, sector: /(sektör|sector|meslek|iş)/i, problem: /(sorun|problem|ihtiyaç|mesaj)/i, note: /^(not|açıklama|note)/i,
  date: /(tarih|date|zaman|başvuru)/i, responsible: /(sorumlu|satışçı|satıcı)/i,
};

const cellText = (v: unknown) => (v == null ? "" : v instanceof Date
  ? `${String(v.getDate()).padStart(2, "0")}.${String(v.getMonth() + 1).padStart(2, "0")}.${v.getFullYear()} ${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`
  : String(v).trim());

export default function Importer({ mode, sellers, dataTypes }: { mode: "data" | "memnuniyet"; sellers: Opt[]; dataTypes: Opt[] }) {
  const FIELDS = mode === "data" ? FIELDS_DATA : FIELDS_SAT;
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [sellerIds, setSellerIds] = useState<string[]>([]);
  const [dataType, setDataType] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    let table: string[][] = [];
    try {
      if (/\.xlsx$/i.test(file.name)) {
        table = (await readSheet(file)).map((r) => r.map(cellText));
      } else {
        const text = await file.text();
        table = (Papa.parse<string[]>(text, { skipEmptyLines: true }).data as string[][]).map((r) => r.map(cellText));
      }
    } catch {
      setMsg({ error: "Dosya okunamadı. .xlsx veya .csv yükleyin." });
      return;
    }
    if (table.length < 2) { setMsg({ error: "Dosyada başlık satırı ve en az bir kayıt olmalı." }); return; }
    const [h, ...data] = table;
    setHeaders(h);
    setRows(data.filter((r) => r.some((c) => c)));
    const m: Record<string, number> = {};
    Object.keys(FIELDS).forEach((f) => { const i = h.findIndex((x) => GUESS[f]?.test(x)); if (i >= 0) m[f] = i; });
    setMap(m);
  }

  const objects = (): ImportRow[] => rows.map((r) => Object.fromEntries(Object.entries(map).map(([f, i]) => [f, r[i] ?? ""])));

  async function run() {
    if (map.phone == null) { setMsg({ error: "Telefon sütununu seçin." }); return; }
    setBusy(true); setMsg(null);
    const all = objects();
    let created = 0, dup = 0, skip = 0;
    try {
      for (let i = 0; i < all.length; i += 500) {
        const chunk = all.slice(i, i + 500);
        const res = mode === "data"
          ? await importCustomers({ rows: chunk, sellerIds, dataTypeId: dataType || null, note: note || null, offset: created })
          : await importSatisfaction({ rows: chunk });
        if (res.error) throw new Error(res.error);
        created += res.created ?? 0; dup += res.duplicates ?? 0; skip += res.skipped ?? 0;
        setMsg({ ok: `İşleniyor… ${Math.min(i + 500, all.length)} / ${all.length}` });
      }
      setMsg({ ok: mode === "data"
        ? `${created} yeni data eklendi · ${dup} mükerrer (mevcut dataya "tekrar başvuru" notu düşüldü) · ${skip} telefonsuz satır atlandı.`
        : `${created} memnuniyet kaydı eklendi · ${dup} zaten vardı · ${skip} satır eşleşmedi (telefon sistemde yok).` });
      setRows([]); setHeaders([]);
    } catch (e) {
      setMsg({ error: (e instanceof Error ? e.message : "Hata") + ` (o ana kadar ${created} kayıt eklendi)` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <input type="file" accept=".xlsx,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="input" />

      {headers.length > 0 && (
        <>
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 font-semibold">Sütun eşleme ({rows.length} satır)</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Object.entries(FIELDS).map(([f, label]) => (
                <div key={f}><label className="label">{label}{f === "phone" && " *"}</label>
                  <select className="input" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) })}>
                    <option value="">— yok —</option>{headers.map((h, i) => <option key={i} value={i}>{h || `Sütun ${i + 1}`}</option>)}
                  </select></div>
              ))}
            </div>
          </div>

          {mode === "data" && (
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className="label">Data tipi</label>
                <select className="input" value={dataType} onChange={(e) => setDataType(e.target.value)}>
                  <option value="">—</option>{dataTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
              <div><label className="label">Satışçılara eşit dağıt (boş = atanmamış)</label>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
                  {sellers.map((s) => (
                    <label key={s.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={sellerIds.includes(s.id)}
                             onChange={(e) => setSellerIds(e.target.checked ? [...sellerIds, s.id] : sellerIds.filter((x) => x !== s.id))} />{s.label}
                    </label>))}
                </div></div>
              <div><label className="label">Geçmişe düşülecek not</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ör. Kasım Meta formu" /></div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>{Object.keys(map).map((f) => <th key={f} className="th">{FIELDS[f]}</th>)}</tr></thead>
              <tbody>{objects().slice(0, 5).map((o, i) => <tr key={i}>{Object.keys(map).map((f) => <td key={f} className="td">{o[f]}</td>)}</tr>)}</tbody>
            </table>
            <p className="p-2 text-xs text-slate-500">İlk 5 satırın önizlemesi</p>
          </div>

          <button className="btn" disabled={busy} onClick={run}>{busy ? "Aktarılıyor…" : `${rows.length} satırı aktar`}</button>
        </>
      )}
      {msg?.ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{msg.ok}</p>}
      {msg?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
    </div>
  );
}
