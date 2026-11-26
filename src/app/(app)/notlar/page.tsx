import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { addNote, toggleNote } from "./actions";

export default async function NotesPage() {
  await requireRole(["admin", "yonetici", "dataci", "teknik"]);
  const supabase = await createClient();
  const { data } = await supabase.from("announcements").select("id, body, is_active, created_at, author:profiles(full_name)")
    .order("created_at", { ascending: false }).limit(100);
  type N = { id: number; body: string; is_active: boolean; created_at: string; author: { full_name: string } | null };
  const notes = (data ?? []) as unknown as N[];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Notlar</h1>
      <p className="text-sm text-slate-600">Aktif olan en son not, tüm kullanıcıların ekranının üstündeki sarı bantta görünür.</p>
      <div className="card">
        <ActionForm action={addNote} submitLabel="Notu Yayınla" className="space-y-2">
          <textarea name="body" rows={2} className="input" placeholder="Ekibe duyuru / motivasyon notu" required />
        </ActionForm>
      </div>
      <div className="card divide-y divide-slate-100 p-0">
        {notes.map((n) => (
          <div key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <p className={n.is_active ? "" : "text-slate-400 line-through"}>{n.body}</p>
              <p className="text-xs text-slate-500">{n.author?.full_name ?? "-"} · {dateTime(n.created_at)}</p>
            </div>
            <ActionForm action={toggleNote} submitLabel={n.is_active ? "Kaldır" : "Tekrar yayınla"} resetOnSuccess={false}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="active" value={n.is_active ? "0" : "1"} />
            </ActionForm>
          </div>
        ))}
        {!notes.length && <p className="p-4 text-sm text-slate-500">Henüz not yok.</p>}
      </div>
    </div>
  );
}
