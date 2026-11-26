"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Hareketsizlikte otomatik çıkış + 2 dakikada bir "son görülme" güncellemesi. */
export default function IdleLogout({ minutes }: { minutes: number | null }) {
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("touch_last_seen");
    const ping = setInterval(() => supabase.rpc("touch_last_seen"), 120_000);

    if (!minutes) return () => clearInterval(ping);
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { window.location.href = "/cikis"; }, minutes * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearInterval(ping);
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return null;
}
