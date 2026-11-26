import Link from "next/link";
import { getMe } from "@/lib/auth";
import v from "@/lib/app-version.json";

const steps: { t: string; d: string }[] = [
  { t: "Dosyayı indirin", d: "Bu sayfayı telefonunuzda açın (CRM'e telefonunuzdan giriş yapın) ve aşağıdaki \"Uygulamayı indir\" düğmesine basın." },
  { t: "Kurulumuna izin verin", d: "İndirme bitince dosyaya dokunun. \"Bilinmeyen uygulamalar\" uyarısı çıkarsa \"Ayarlar\" → \"Bu kaynaktan izin ver\" deyip geri dönün ve \"Yükle\"ye basın. Play Koruma uyarısı çıkarsa \"Yine de yükle\" deyin; uygulama şirket içi olduğu için Play Store'da yoktur." },
  { t: "Giriş yapın", d: "\"CRM Arama\" uygulamasını açın, CRM kullanıcı adınız ve şifrenizle giriş yapın." },
  { t: "İzinleri verin", d: "\"Arama kayıtları\" ve \"Telefon\" izinlerine \"İzin ver\" deyin. Uygulamada \"Pil kısıtlaması\" satırı kırmızıysa \"Kaldır\"a basıp \"İzin ver\" deyin." },
  { t: "Markaya özel ayar", d: "Xiaomi, Samsung, Oppo, Huawei gibi telefonlarda uygulama ekranında sarı bir kutu çıkar; oradaki ayarı bir kez yapın. Bu yapılmazsa telefon uygulamayı arka planda kapatabilir." },
  { t: "Bitti", d: "Uygulamayı açık tutmanıza gerek yok. Her görüşmeden birkaç saniye sonra arama CRM'e düşer. Kontrol için birini arayın ve CRM'de o datanın kartına bakın." },
];

export default async function AppPage() {
  await getMe();
  const ready = v.version !== "henüz yok";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/aramalar" className="text-sm text-blue-700 hover:underline">← Aramalar</Link>
      <h1 className="text-3xl font-bold">📱 CRM Arama uygulaması</h1>
      <p className="text-slate-600">Android telefonunuzdan yaptığınız müşteri aramalarını otomatik olarak CRM&apos;e kaydeder: kimi aradınız, ne zaman, kaç dakika konuştunuz. Cevapsız aramalar &quot;Geri dönülecekler&quot; listesine düşer.</p>

      <div className="card space-y-3">
        {ready ? (
          <>
            <a href="/crm-arama.apk" download className="btn w-full py-3 text-base">⬇️ Uygulamayı indir (Android)</a>
            <p className="text-center text-xs text-slate-500">Sürüm {v.version}{v.date ? ` · ${v.date}` : ""}</p>
          </>
        ) : <p className="text-sm text-amber-700">Uygulama hazırlanıyor, kısa süre içinde burada olacak.</p>}
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Kurulum (bir kez, 3 dakika)</h2>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{i + 1}</span>
              <div><div className="font-semibold">{s.t}</div><div className="text-sm text-slate-600">{s.d}</div></div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card space-y-2 text-sm text-slate-600">
        <h2 className="text-lg font-semibold text-slate-900">🔒 Gizlilik</h2>
        <p>Yalnızca <b>CRM&apos;de kayıtlı müşterilerle</b> yapılan görüşmeler ve size <b>gelen</b> aramalar gönderilir.</p>
        <p>CRM&apos;de kayıtlı olmayan bir numarayı aradığınızda (kişisel aramalar) numara telefonunuzdan çıkmaz: uygulama yalnızca numaranın şifrelenmiş bir özetini sorar, kayıtlı değilse hiçbir şey göndermez.</p>
        <p>Konuşmanın içeriği ve ses kaydı alınmaz. Rehberinize, mesajlarınıza veya başka hiçbir veriye erişilmez.</p>
      </div>
    </div>
  );
}
