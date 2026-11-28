import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TaskList, { type Task } from "@/components/TaskList";
import { setTaskStatus } from "../asistan/actions";

const SEL = "id, title, details, due_at, status, done_at, done_note, remind_count, created_at, created_by, assignee, creator:profiles!created_by(full_name)";

export default async function MyTasksPage() {
  const me = await getMe();
  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: open }, { data: done }] = await Promise.all([
    supabase.from("tasks").select(SEL).eq("assignee", me.id).eq("status", "acik").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("tasks").select(SEL).eq("assignee", me.id).neq("status", "acik").gte("created_at", weekAgo).order("done_at", { ascending: false }).limit(30),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">📌 Görevlerim</h1>
        <p className="text-slate-600">Sana verilen işler. Bitirince &quot;Yapıldı&quot;ya bas; görevi veren kişiye otomatik haber gider. Açık işler bitene kadar hatırlatılır.</p>
      </div>
      <div className="card p-0">
        <h2 className="p-4 pb-0 text-lg font-semibold">Açık ({(open ?? []).length})</h2>
        <TaskList tasks={(open ?? []) as unknown as Task[]} action={setTaskStatus} showCreator empty="Açık görevin yok 🎉" />
      </div>
      <div className="card p-0">
        <h2 className="p-4 pb-0 text-lg font-semibold">Son 7 gün</h2>
        <TaskList tasks={(done ?? []) as unknown as Task[]} action={setTaskStatus} showCreator empty="Henüz yok." />
      </div>
    </div>
  );
}
