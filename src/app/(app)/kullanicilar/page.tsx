import { requirePerm, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime, roleLabel } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { createUser, passwordLink, setUserActive, updateUser } from "./actions";

type P = { id: string; full_name: string; username: string; role: string; is_active: boolean; auto_logout_enabled: boolean;
  auto_logout_minutes: number | null; last_seen_at: string | null; created_at: string; creator: { full_name: string } | null };

function isOnline(v: string | null) {
  return !!v && Date.now() - new Date(v).getTime() < 5 * 60_000;
}

export default async function UsersPage() {
  const me = await requireRole(["admin", "yonetici"]); await requirePerm("users");
  const supabase = await createClient();
  const [{ data, error }, { data: company }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, role, is_active, auto_logout_enabled, auto_logout_minutes, last_seen_at, created_at, creator:profiles!created_by(full_name)")
      .order("is_active", { ascending: false }).order("role").order("full_name"),
    supabase.from("companies").select("default_logout_minutes").single(),
  ]);
  const users = (data ?? []) as unknown as P[];
  const roles = Object.entries(roleLabel).filter(([k]) => me.role === "admin" || k !== "admin");

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Kullanıcılar</h1>
      <p className="text-sm text-slate-600">
        Pasif kullanıcılar listenin altında durur ve giriş yapamaz. Yeni kullanıcıya şifre yazmazsınız: sistem kişiye özel bir
        bağlantı üretir, kişi şifresini kendisi belirler. Şifresini unutan için &quot;Şifre bağlantısı&quot; oluşturun.
        Hareketsizlik çıkışı yalnız &quot;otomatik çıkış&quot; seçili kullanıcılarda çalışır (boş süre = genel {company?.default_logout_minutes ?? 30} dk).
      </p>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Yeni Kullanıcı</h2>
        <ActionForm action={createUser} submitLabel="Ekle" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div><label className="label">Ad (ekranda görünen)</label><input name="full_name" className="input" required placeholder="AYŞE" /></div>
            <div><label className="label">Kullanıcı adı</label><input name="username" className="input" required placeholder="aysedijitalbiradam" /></div>
            <div><label className="label">Rol</label>
              <select name="role" defaultValue="satisci" className="input">{roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">Kişiye özel süre (dk)</label><input name="auto_logout_minutes" inputMode="numeric" placeholder="Boş: genel" className="input" /></div>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="auto_logout_enabled" value="1" defaultChecked /> Otomatik çıkış uygula</label>
          </div>
        </ActionForm>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Kullanıcı listesi yüklenemedi: {error.message}</p>}
      <div className="space-y-2">
        {users.map((u) => {
          const locked = me.role !== "admin" && u.role === "admin";
          return (
            <div key={u.id} className={`card ${u.is_active ? "" : "opacity-60"}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <b className="text-base">{u.full_name}</b>
                <span className="text-slate-500">@{u.username}</span>
                <span className="pill">{roleLabel[u.role]}</span>
                {u.is_active ? (isOnline(u.last_seen_at) ? <span className="pill bg-green-100 text-green-800">Aktif</span> : <span className="pill">Beklemede / Offline</span>)
                  : <span className="pill bg-red-100 text-red-800">Pasif</span>}
                <span className="text-xs text-slate-500">Son görülme: {dateTime(u.last_seen_at)} · Ekleyen: {u.creator?.full_name ?? "Sistem / Eski kayıt"}</span>
              </div>
              {locked ? <p className="text-xs text-slate-500">Admin hesabını yalnız admin düzenleyebilir.</p> : (
                <div className="grid gap-3 lg:grid-cols-3">
                  <ActionForm action={updateUser} submitLabel="Kaydet" resetOnSuccess={false} className="space-y-2 lg:col-span-2">
                    <input type="hidden" name="id" value={u.id} />
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <input name="full_name" defaultValue={u.full_name} className="input" />
                      <select name="role" defaultValue={u.role} className="input" disabled={u.id === me.id}>
                        {roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <input name="auto_logout_minutes" defaultValue={u.auto_logout_minutes ?? ""} placeholder="Süre (dk)" inputMode="numeric" className="input" />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_logout_enabled" value="1" defaultChecked={u.auto_logout_enabled} /> Otomatik çıkış</label>
                    </div>
                  </ActionForm>
                  <div className="space-y-2">
                    <ActionForm action={passwordLink} submitLabel="Şifre bağlantısı oluştur" resetOnSuccess={false}>
                      <input type="hidden" name="id" value={u.id} />
                    </ActionForm>
                    {u.id !== me.id && (
                      <ActionForm action={setUserActive} submitLabel={u.is_active ? "Pasife Al" : "Aktif Et"} resetOnSuccess={false}
                                  confirm={u.is_active ? `${u.full_name} pasife alınsın mı? Giriş yapamayacak.` : undefined}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.is_active ? "0" : "1"} />
                      </ActionForm>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
