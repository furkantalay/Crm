import Link from "next/link";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import ChatRoom, { type Msg } from "./ChatRoom";
import { createGroup, openDm, setMember } from "./actions";

type SP = Promise<Record<string, string | undefined>>;
type Room = { room_id: number; kind: string; title: string | null; other_id: string | null; last_message_at: string | null;
  last_body: string | null; last_user: string | null; unread: number; member_count: number };

const ago = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return d.toDateString() === new Date().toDateString()
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit" }).format(d);
};

export default async function ChatPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const me = await getMe();
  const manager = me.role === "admin" || me.role === "yonetici";
  const supabase = await createClient();
  const [{ data: roomsRaw }, { data: people }] = await Promise.all([
    supabase.rpc("chat_my_rooms"),
    supabase.from("profiles").select("id, full_name, role").eq("is_active", true).neq("id", me.id).order("full_name"),
  ]);
  const rooms = (roomsRaw ?? []) as Room[];
  let roomId = Number(sp.oda) || 0;
  // Admin, üyesi olmadığı birebir odayı da açabilir (denetim)
  const { data: openRoom } = roomId ? await supabase.from("chat_rooms").select("id, kind, name").eq("id", roomId).maybeSingle() : { data: null };
  if (!openRoom) roomId = 0;
  const current = rooms.find((r) => r.room_id === roomId);
  const isMember = !!current;

  let msgs: Msg[] = []; let names: Record<string, string> = {}; let customers: Record<number, string> = {}; let members: { user_id: string }[] = [];
  if (roomId) {
    const [{ data: m }, { data: mem }] = await Promise.all([
      supabase.from("chat_messages").select("id, user_id, body, customer_id, created_at").eq("room_id", roomId).order("created_at", { ascending: false }).limit(200),
      supabase.from("chat_members").select("user_id").eq("room_id", roomId),
    ]);
    msgs = ((m ?? []) as Msg[]).reverse();
    members = mem ?? [];
    names = Object.fromEntries([...(people ?? []).map((p) => [p.id, p.full_name]), [me.id, me.full_name]]);
    const cids = [...new Set(msgs.map((x) => x.customer_id).filter(Boolean))] as number[];
    if (cids.length) {
      const { data: cs } = await supabase.from("customers").select("id, full_name").in("id", cids);
      customers = Object.fromEntries((cs ?? []).map((c) => [c.id, c.full_name]));
    }
  }
  const audit = me.role === "admin"
    ? (((await supabase.from("chat_rooms").select("id, last_message_at, chat_members(user_id)").eq("kind", "dm")
        .not("last_message_at", "is", null).order("last_message_at", { ascending: false }).limit(50)).data ?? []) as { id: number; last_message_at: string; chat_members: { user_id: string }[] }[])
        .filter((r) => !r.chat_members.some((m) => m.user_id === me.id))
    : [];
  const nameOf = (id: string) => (people ?? []).find((p) => p.id === id)?.full_name ?? "?";
  const auditRoom = audit.find((r) => r.id === roomId);
  const title = current?.title ?? openRoom?.name ?? (auditRoom ? auditRoom.chat_members.map((m) => nameOf(m.user_id)).join(" ↔ ") : "Birebir sohbet (denetim)");
  const canWrite = isMember && (openRoom?.kind !== "announce" || manager);
  const memberIds = new Set(members.map((m) => m.user_id));

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Mesajlar</h1>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Sol: sohbetler */}
        <div className={`space-y-3 ${roomId ? "hidden lg:block" : ""}`}>
          <div className="card p-0">
            <ul className="divide-y divide-slate-100">
              {rooms.map((r) => (
                <li key={r.room_id}>
                  <Link href={`/mesajlar?oda=${r.room_id}`} className={`flex items-start gap-2 px-3 py-2 hover:bg-slate-50 ${r.room_id === roomId ? "bg-blue-50" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate ${r.unread ? "font-bold" : "font-medium"}`}>{r.kind === "dm" ? "👤 " : ""}{r.title ?? "Sohbet"}</span>
                        <span className="shrink-0 text-xs text-slate-400">{ago(r.last_message_at)}</span>
                      </div>
                      <div className="truncate text-xs text-slate-500">{r.last_body ? `${r.kind !== "dm" && r.last_user ? r.last_user + ": " : ""}${r.last_body}` : r.kind === "dm" ? "Henüz mesaj yok" : `${r.member_count} üye`}</div>
                    </div>
                    {r.unread > 0 && <span className="mt-1 rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{r.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2 className="mb-2 text-sm font-semibold">Yeni birebir mesaj</h2>
            <form action={openDm} className="flex gap-2">
              <select name="user_id" className="input flex-1" required defaultValue="">
                <option value="" disabled>Kişi seçin</option>
                {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} · {roleLabel[p.role]}</option>)}
              </select>
              <button className="btn">Aç</button>
            </form>
          </div>

          {audit.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-semibold">🔍 Ekip içi birebir sohbetler ({audit.length})</summary>
              <p className="mt-1 text-xs text-slate-500">Yalnız admin görür. Açıp okuyabilirsiniz; yazamazsınız.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {audit.map((r) => (
                  <li key={r.id}><Link href={`/mesajlar?oda=${r.id}`} className="text-blue-700 hover:underline">{r.chat_members.map((m) => nameOf(m.user_id)).join(" ↔ ")}</Link> <span className="text-xs text-slate-400">{ago(r.last_message_at)}</span></li>
                ))}
              </ul>
            </details>
          )}

          {manager && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-semibold">+ Yeni grup / duyuru kanalı</summary>
              <ActionForm action={createGroup} submitLabel="Oluştur" className="mt-3 space-y-2">
                <input name="name" className="input" placeholder="Grup adı" required />
                <select name="kind" className="input" defaultValue="group">
                  <option value="group">Grup (herkes yazar)</option>
                  <option value="announce">Duyuru kanalı (yalnız admin/yönetici yazar)</option>
                </select>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">
                  {(people ?? []).map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="members" value={p.id} />{p.full_name}</label>)}
                </div>
              </ActionForm>
            </details>
          )}
        </div>

        {/* Sağ: açık sohbet */}
        <div className={`card overflow-hidden p-0 ${roomId ? "" : "hidden lg:block"}`}>
          {roomId ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <Link href="/mesajlar" className="text-blue-700 lg:hidden">←</Link>
                <div className="flex-1">
                  <div className="font-semibold">{openRoom?.kind === "dm" && current ? "👤 " : ""}{title}</div>
                  <div className="text-xs text-slate-500">
                    {openRoom?.kind === "dm" ? (isMember ? "Birebir · yalnız siz, karşı taraf ve admin görür" : "Admin denetimi: yalnız okuyabilirsiniz")
                      : openRoom?.kind === "announce" ? `Duyuru kanalı · ${memberIds.size} kişi` : `Grup · ${memberIds.size} üye`}
                  </div>
                </div>
                {manager && openRoom?.kind !== "dm" && (
                  <details className="relative">
                    <summary className="cursor-pointer text-sm text-blue-700">Üyeler</summary>
                    <div className="absolute right-0 z-10 mt-2 max-h-80 w-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      {(people ?? []).map((p) => (
                        <ActionForm key={p.id} action={setMember} resetOnSuccess={false} submitLabel={`${memberIds.has(p.id) ? "✓" : "+"} ${p.full_name}`} className="text-xs">
                          <input type="hidden" name="room_id" value={roomId} /><input type="hidden" name="user_id" value={p.id} />
                          <input type="hidden" name="on" value={memberIds.has(p.id) ? "0" : "1"} />
                        </ActionForm>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <div className="bg-slate-50">
                <ChatRoom roomId={roomId} companyId={me.company_id} meId={me.id} canWrite={canWrite} initial={msgs}
                          names={names} customers={customers} kind={openRoom?.kind ?? "group"} />
              </div>
            </>
          ) : (
            <div className="flex h-[70vh] items-center justify-center text-sm text-slate-500">Soldan bir sohbet seçin.</div>
          )}
        </div>
      </div>
    </div>
  );
}
