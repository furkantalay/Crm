"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type N = { id: number; title: string; body: string | null; link: string | null; created_at: string };

/** Yeni bildirimleri 20 sn'de bir kontrol eder; ekranda kutu + ses + (izin varsa) tarayıcı bildirimi gösterir. */
export default function NotificationWatcher() {
  const router = useRouter();
  const [toasts, setToasts] = useState<N[]>([]);
  const since = useRef<string>(new Date().toISOString());
  const [canAsk, setCanAsk] = useState(false);

  useEffect(() => {
    setCanAsk(typeof Notification !== "undefined" && Notification.permission === "default");
    const supabase = createClient();
    let stop = false;

    const beep = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
        o.start(); o.stop(ctx.currentTime + 0.18);
      } catch {}
    };

    const check = async () => {
      if (stop || document.visibilityState === "hidden" && typeof Notification === "undefined") return;
      const { data } = await supabase.from("notifications").select("id, title, body, link, created_at")
        .is("read_at", null).gt("created_at", since.current).order("created_at", { ascending: true }).limit(5);
      if (!data?.length) return;
      since.current = data[data.length - 1].created_at;
      setToasts((t) => [...t, ...data].slice(-4));
      beep();
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
        data.forEach((n) => { try { const x = new Notification(n.title, { body: n.body ?? "" }); x.onclick = () => { window.focus(); if (n.link) router.push(n.link); }; } catch {} });
      }
      router.refresh(); // zil sayacını güncelle
    };
    const t = setInterval(check, 20_000);
    check();
    return () => { stop = true; clearInterval(t); };
  }, [router]);

  const close = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <>
      {canAsk && (
        <button type="button" onClick={() => Notification.requestPermission().then(() => setCanAsk(false))}
                className="fixed bottom-4 left-4 z-40 rounded-full bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
          🔔 Bildirimlere izin ver
        </button>
      )}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((n) => (
          <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="text-sm font-semibold">{n.title}</div>
                {n.body && <div className="text-xs text-slate-600">{n.body}</div>}
              </div>
              <button type="button" onClick={() => close(n.id)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            {n.link && <Link href={n.link} onClick={() => close(n.id)} className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">Aç →</Link>}
          </div>
        ))}
      </div>
    </>
  );
}
