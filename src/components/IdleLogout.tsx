"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 1) Dakikada bir "ekip durumu" sinyali: sekme önde mi, son 1 dakikada klavye/fare hareketi var mı.
 * 2) Hareketsizlikte otomatik çıkış (kullanıcıya açıksa).
 */
export default function IdleLogout({ minutes }: { minutes: number | null }) {
  useEffect(() => {
    const supabase = createClient();
    let lastInput = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = () => {
      const visible = document.visibilityState === "visible";
      const active = visible && Date.now() - lastInput < 60_000;
      // rpc() ancak await/then ile gönderilir
      supabase.rpc("touch_presence", { p_active: active, p_visible: visible, p_path: window.location.pathname })
        .then(() => undefined);
    };

    const onInput = () => {
      lastInput = Date.now();
      if (minutes) {
        clearTimeout(timer);
        timer = setTimeout(() => { window.location.href = "/cikis"; }, minutes * 60_000);
      }
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener("visibilitychange", send);
    onInput();
    send();
    const ping = setInterval(send, 60_000);

    return () => {
      clearInterval(ping);
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener("visibilitychange", send);
    };
  }, [minutes]);

  return null;
}
