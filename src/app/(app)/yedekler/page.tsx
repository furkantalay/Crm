import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { num } from "@/lib/format";
import { BACKUP_TABLES } from "./tables";

export default async function BackupsPage() {
  await requireRole(["admin", "teknik"]);
  const supabase = await createClient();
  const counts = await Promise.all(Object.keys(BACKUP_TABLES).map(async (t) => {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    return [t, count ?? 0] as const;
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Yedekler</h1>
      <div className="card space-y-2 text-sm text-slate-700">
        <p><b>Otomatik yedek:</b> Veritabanının tamamı Supabase tarafından her gün otomatik yedekleniyor (Pro plan, son 7 gün geri alınabilir). Geri yükleme Supabase panelinden <i>Database → Backups</i> bölümünden yapılır.</p>
        <p><b>Elle indirme:</b> Aşağıdan her tabloyu Excel&apos;de açılabilen CSV dosyası olarak indirebilirsiniz. Dosyada müşteri telefonları gibi kişisel veriler bulunur; güvenli bir yerde saklayın.</p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Tablo</th><th className="th">Kayıt</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {counts.map(([t, c]) => (
              <tr key={t}>
                <td className="td font-medium">{BACKUP_TABLES[t]}</td>
                <td className="td">{num(c)}</td>
                <td className="td text-right"><a href={`/yedekler/indir?tablo=${t}`} className="btn-light">CSV indir</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
