import ActionForm from "@/components/ActionForm";

export type Task = {
  id: number; title: string; details: string | null; due_at: string | null; status: string; done_at: string | null;
  done_note: string | null; remind_count: number; created_at: string; created_by: string; assignee: string | null;
  creator?: { full_name: string } | null; person?: { full_name: string } | null;
};
type Act = (s: { ok?: string; error?: string } | null, f: FormData) => Promise<{ ok?: string; error?: string } | null>;

const fmt = (d: string) => new Date(d).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function TaskList({ tasks, action, showPerson, showCreator, empty }: {
  tasks: Task[]; action: Act; showPerson?: boolean; showCreator?: boolean; empty?: string;
}) {
  if (!tasks.length) return <p className="p-4 text-sm text-slate-500">{empty ?? "Kayıt yok."}</p>;
  const now = Date.now();
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const late = t.status === "acik" && t.due_at && new Date(t.due_at).getTime() < now;
        return (
          <li key={t.id} className={`flex flex-wrap items-start gap-3 px-4 py-3 ${t.status !== "acik" ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${t.status === "yapildi" ? "line-through" : ""}`}>{t.title}</div>
              {t.details && <div className="text-sm text-slate-600">{t.details}</div>}
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                {showPerson && <span>👤 {t.person?.full_name ?? "Ben"}</span>}
                {showCreator && t.creator && <span>Veren: {t.creator.full_name}</span>}
                {t.due_at && <span className={late ? "font-semibold text-red-600" : ""}>⏰ {fmt(t.due_at)}{late ? " · gecikti" : ""}</span>}
                {t.remind_count > 0 && t.status === "acik" && <span>🔔 {t.remind_count} kez hatırlatıldı</span>}
                {t.status === "yapildi" && t.done_at && <span className="text-green-700">✅ {fmt(t.done_at)}{t.done_note ? ` · ${t.done_note}` : ""}</span>}
                {t.status === "iptal" && <span>İptal</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {t.status === "acik" ? (
                <>
                  <ActionForm action={action} submitLabel="✅ Yapıldı" className="flex items-start gap-2" resetOnSuccess={false}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value="yapildi" />
                    <input name="note" placeholder="Not (isteğe bağlı)" className="input w-40 py-1 text-sm" />
                  </ActionForm>
                  <ActionForm action={action} submitLabel="İptal" resetOnSuccess={false} confirm="Bu iş iptal edilsin mi?">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value="iptal" />
                  </ActionForm>
                </>
              ) : (
                <ActionForm action={action} submitLabel="Geri aç" resetOnSuccess={false}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value="acik" />
                </ActionForm>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
