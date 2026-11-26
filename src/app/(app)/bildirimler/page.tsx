import Link from "next/link";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dateTime } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import { markAllRead } from "./actions";

export default async function NotificationsPage() {
  await getMe();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, customer_id, read_at, created_at")
    .order("created_at", { ascending: false }).limit(200);
  const rows = data ?? [];
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Bildirimler</h1>
        {unread > 0 && <ActionForm action={markAllRead} submitLabel={`Tümünü okundu say (${unread})`} resetOnSuccess={false}><span /></ActionForm>}
      </div>
      <div className="card divide-y divide-slate-100 p-0">
        {rows.map((n) => (
          <div key={n.id} className={`p-4 ${n.read_at ? "" : "bg-blue-50"}`}>
            <p className="text-sm">{n.body ?? n.title}</p>
            <p className="mt-1 text-xs text-slate-500">{dateTime(n.created_at)}
              {n.customer_id && <> · <Link href={`/datalar/${n.customer_id}`} className="text-blue-700 hover:underline">Dataya git</Link></>}</p>
          </div>
        ))}
        {!rows.length && <p className="p-4 text-sm text-slate-500">Bildirim yok.</p>}
      </div>
    </div>
  );
}
