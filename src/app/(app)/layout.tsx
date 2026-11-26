import Link from "next/link";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, roleLabel } from "@/lib/format";
import NavLinks from "@/components/NavLinks";
import IdleLogout from "@/components/IdleLogout";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const supabase = await createClient();

  const [{ data: ann }, { count: unread }] = await Promise.all([
    supabase.from("announcements").select("body, created_at, author:profiles(full_name)")
      .eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  const r = me.role;
  const staff = r !== "satisci";
  const manager = r === "admin" || r === "yonetici";
  const items = [
    { href: "/", label: "Panel", show: true },
    { href: "/datalar", label: "Datalar", show: true },
    { href: "/satislar", label: "Satışlar", show: true },
    { href: "/beklenen-satislar", label: "Beklenen Satışlar", show: true },
    { href: "/toplantilar", label: "Toplantı Planı", show: true },
    { href: "/memnuniyet", label: "Memnuniyet", show: true },
    { href: "/aktarim", label: "Toplu Aktarım", show: staff },
    { href: "/reklam-yonetimi", label: "Reklam Yönetimi", show: r === "admin" || r === "yonetici" || r === "dataci" },
    { href: "/raporlar", label: "Raporlar", show: staff },
    { href: "/notlar", label: "Notlar", show: staff },
    { href: "/egitimler", label: "Eğitimler", show: manager },
    { href: "/kullanicilar", label: "Kullanıcılar", show: manager },
    { href: "/ayarlar", label: "Ayarlar", show: manager },
    { href: "/teknik-kontrol", label: "Teknik Kontrol", show: r === "admin" || r === "teknik" || r === "yonetici" },
    { href: "/loglar", label: "Loglar", show: r === "admin" || r === "teknik" },
    { href: "/yedekler", label: "Yedekler", show: r === "admin" || r === "teknik" },
  ].filter((i) => i.show).map(({ href, label }) => ({ href, label }));

  const logoutMinutes = me.auto_logout_enabled ? (me.auto_logout_minutes ?? me.company.default_logout_minutes) : null;
  const author = (ann?.author as unknown as { full_name: string } | null)?.full_name;

  return (
    <div className="min-h-screen">
      <IdleLogout minutes={logoutMinutes} />
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="text-xl font-bold">CRM</Link>
          <div className="flex-1"><NavLinks items={items} /></div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/bildirimler" title="Bildirimler" className="text-slate-300 hover:text-white">
              🔔 {unread ? <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">{unread}</span> : 0}
            </Link>
            <span className="text-slate-300">{me.full_name} / {roleLabel[me.role]}</span>
            <a href="/cikis" className="text-slate-300 hover:text-white">Çıkış</a>
          </div>
        </div>
      </header>
      {ann && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-7xl px-4 py-2 text-sm text-amber-900">
            <b>Not:</b> {ann.body}
            <span className="ml-2 text-xs text-amber-700">{author} / {dateTime(ann.created_at)}</span>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
