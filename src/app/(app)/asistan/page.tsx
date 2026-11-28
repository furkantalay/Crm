import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import VoiceNote from "@/components/VoiceNote";
import TaskList, { type Task } from "@/components/TaskList";
import { assistantAdd, setTaskStatus } from "./actions";

const SEL = "id, title, details, due_at, status, done_at, done_note, remind_count, created_at, created_by, assignee, person:profiles!assignee(full_name)";

export default async function AssistantPage() {
  const me = await requireRole(["admin", "yonetici"]);
  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: open }, { data: done }] = await Promise.all([
    supabase.from("tasks").select(SEL).eq("created_by", me.id).eq("status", "acik").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("tasks").select(SEL).eq("created_by", me.id).neq("status", "acik").gte("created_at", weekAgo).order("done_at", { ascending: false }).limit(30),
  ]);
  const all = (open ?? []) as unknown as Task[];
  const mine = all.filter((t) => !t.assignee || t.assignee === me.id);
  const team = all.filter((t) => t.assignee && t.assignee !== me.id);
  const late = team.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🤖 Asistan</h1>
        <p className="text-slate-600">Aklına geleni yaz ya da söyle. Asistan işlere böler, ekipten birine aitse ona iletir, bitene kadar hatırlatır ve bittiğinde sana haber verir.</p>
      </div>
      <div className="card">
        <VoiceNote action={assistantAdd} rows={4} submitLabel="✨ Asistana ver" pendingLabel="Asistan düzenliyor…" footer={null}
          placeholder={'Örn: "Pazartesi WhatsApp ana hattını yeni portföye bağlamaya devam edeceğim, önce Facebook sayfası ile Instagram bağlantısını kontrol et. Merve cuma akşamına kadar haftalık satış raporunu hazırlasın. Zeynep yarın 11\'de Ahmet Bey\'i arasın."'} />
      </div>

      <div className="card p-0">
        <h2 className="p-4 pb-0 text-lg font-semibold">📝 Benim işlerim ve notlarım ({mine.length})</h2>
        <TaskList tasks={mine} action={setTaskStatus} empty="Açık işin yok." />
      </div>

      <div className="card p-0">
        <h2 className="p-4 pb-0 text-lg font-semibold">👥 Ekibe verdiklerim ({team.length}){late ? <span className="ml-2 text-sm text-red-600">{late} gecikmiş</span> : null}</h2>
        <TaskList tasks={team} action={setTaskStatus} showPerson empty="Ekipte bekleyen iş yok." />
      </div>

      <div className="card p-0">
        <h2 className="p-4 pb-0 text-lg font-semibold">Son 7 gün tamamlanan / iptal</h2>
        <TaskList tasks={(done ?? []) as unknown as Task[]} action={setTaskStatus} showPerson empty="Henüz yok." />
      </div>
    </div>
  );
}
