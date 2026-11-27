"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type Msg = { id: number; user_id: string; body: string; customer_id: number | null; created_at: string };

const time = (v: string) => {
  const d = new Date(v);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", ...(sameDay ? {} : { day: "2-digit", month: "2-digit" }), hour: "2-digit", minute: "2-digit" }).format(d);
};

export default function ChatRoom({ roomId, companyId, meId, canWrite, initial, names, customers, kind }: {
  roomId: number; companyId: string; meId: string; canWrite: boolean; initial: Msg[];
  names: Record<string, string>; customers: Record<number, string>; kind: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const supabase = useRef(createClient()).current;

  const add = (m: Msg) => setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  const markRead = () => { supabase.from("chat_members").update({ last_read_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", meId).then(() => undefined); };

  useEffect(() => { setMsgs(initial); }, [initial]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  useEffect(() => {
    markRead();
    let live = false;
    const ch = supabase.channel(`room-${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        (p) => { add(p.new as Msg); if (document.visibilityState === "visible") markRead(); })
      .subscribe((status) => { live = status === "SUBSCRIBED"; });
    // Anlık bağlantı kurulamazsa 8 sn'de bir yokla
    const poll = setInterval(async () => {
      if (live) return;
      const last = msgs[msgs.length - 1]?.created_at ?? "1970-01-01";
      const { data } = await supabase.from("chat_messages").select("id, user_id, body, customer_id, created_at")
        .eq("room_id", roomId).gt("created_at", last).order("created_at");
      (data ?? []).forEach((m) => add(m as Msg));
    }, 8000);
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr(null);
    const { data, error } = await supabase.from("chat_messages").insert({ room_id: roomId, company_id: companyId, user_id: meId, body })
      .select("id, user_id, body, customer_id, created_at").single();
    setSending(false);
    if (error) { setErr("Gönderilemedi: " + error.message); return; }
    setText(""); if (data) add(data as Msg);
  };

  return (
    <div className="flex h-[70vh] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {!msgs.length && <p className="py-10 text-center text-sm text-slate-500">Henüz mesaj yok. İlk mesajı yazın.</p>}
        {msgs.map((m, i) => {
          const mine = m.user_id === meId;
          const showName = !mine && kind !== "dm" && msgs[i - 1]?.user_id !== m.user_id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? "bg-blue-600 text-white" : "bg-white"}`}>
                {showName && <div className="mb-0.5 text-xs font-semibold text-blue-700">{names[m.user_id] ?? "?"}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {m.customer_id && (
                  <Link href={`/datalar/${m.customer_id}`} className={`mt-1 block rounded-lg px-2 py-1 text-xs font-medium ${mine ? "bg-white/20 text-white" : "bg-slate-100 text-blue-700"}`}>
                    📎 {customers[m.customer_id] ?? `Data #${m.customer_id}`} →
                  </Link>
                )}
                <div className={`mt-0.5 text-right text-[10px] ${mine ? "text-blue-100" : "text-slate-400"}`}>{time(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {canWrite ? (
        <form onSubmit={send} className="flex gap-2 border-t border-slate-200 bg-white p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Mesaj yazın…"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
                    className="input flex-1 resize-none" maxLength={4000} />
          <button className="btn" disabled={sending || !text.trim()}>Gönder</button>
        </form>
      ) : <p className="border-t border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">Bu kanala yalnız admin ve yöneticiler yazabilir.</p>}
      {err && <p className="px-3 pb-2 text-xs text-red-700">{err}</p>}
    </div>
  );
}
