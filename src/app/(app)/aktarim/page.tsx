import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLookups, getSellers } from "@/lib/data";
import Importer from "./Importer";

type SP = Promise<Record<string, string | undefined>>;

export default async function ImportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireRole(["admin", "yonetici", "dataci"]);
  const mode = sp.tur === "memnuniyet" ? "memnuniyet" : "data";
  const [sellers, lk] = await Promise.all([getSellers(), getLookups()]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Toplu Aktarım</h1>
      <div className="flex gap-2">
        <Link href="/aktarim" className={mode === "data" ? "btn" : "btn-light"}>Data Aktarımı</Link>
        <Link href="/aktarim?tur=memnuniyet" className={mode === "memnuniyet" ? "btn" : "btn-light"}>Memnuniyet Aktarımı</Link>
      </div>
      <div className="card space-y-3">
        {mode === "data" ? (
          <p className="text-sm text-slate-600">Excel (.xlsx) veya CSV dosyası yükleyin. İlk satır başlık olmalı. Sütunlar otomatik eşlenir, gerekirse düzeltin.
            Telefonu sistemde zaten olan kişiler <b>yeni data olarak eklenmez</b>; mevcut kaydına “tekrar başvuru” notu düşer ve listede tekrar üste çıkar.</p>
        ) : (
          <p className="text-sm text-slate-600">Satış yapılmış müşterilerin telefonlarını içeren dosyayı yükleyin. Her kişi için son satışına bağlı bir memnuniyet araması açılır;
            sorumlu sütunu yoksa satışı yapan sorumlu olur. Not: yeni satış girildiğinde memnuniyet araması zaten otomatik açılır.</p>
        )}
        <Importer key={mode} mode={mode}
                  sellers={sellers.map((s) => ({ id: s.id, label: s.full_name }))}
                  dataTypes={lk.by("data_type").map((d) => ({ id: d.id, label: d.label }))} />
      </div>
    </div>
  );
}
