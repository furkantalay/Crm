"use client";

import { useActionState, useEffect, useRef, useState } from "react";

type State = { ok?: string; error?: string } | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;

/** Görüşme sonrası sesli not: telefon/Chrome'un Türkçe konuşma tanıması ile yazıya döker,
 *  yapay zekâ notu düzenler, durum ve geri arama zamanını çıkarır. Ses kaydedilmez. */
export default function VoiceNote({ customerId, action }: { customerId: number; action: (s: State, f: FormData) => Promise<State> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const rec = useRef<Rec>(null);
  const base = useRef("");

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSupported(false);
  }, []);
  useEffect(() => { if (state?.ok) setText(""); }, [state]);

  function start() {
    const w = window as unknown as Record<string, new () => Rec>;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return setSupported(false);
    const r = new SR();
    r.lang = "tr-TR"; r.continuous = true; r.interimResults = true;
    base.current = text ? text.trim() + " " : "";
    r.onresult = (e: Rec) => {
      let fin = "", tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + " "; else tmp += t;
      }
      setText((base.current + fin + tmp).replace(/\s+/g, " "));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start(); rec.current = r; setListening(true);
  }
  function stop() { rec.current?.stop(); setListening(false); }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="flex flex-wrap items-center gap-2">
        {supported ? (
          listening
            ? <button type="button" onClick={stop} className="btn bg-red-600 hover:bg-red-700">⏹ Bitir</button>
            : <button type="button" onClick={start} className="btn bg-violet-600 hover:bg-violet-700">🎙 Konuş</button>
        ) : <span className="text-xs text-slate-500">Bu tarayıcı konuşma tanımayı desteklemiyor; klavyedeki 🎤 tuşuyla yazabilirsiniz.</span>}
        {listening && <span className="animate-pulse text-sm text-red-600">● Dinliyorum…</span>}
      </div>
      <textarea name="text" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="input"
        placeholder='Örn: "Fiyatı yüksek buldu, eşine danışacak, cuma öğleden sonra tekrar ara"' />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || listening || !text.trim()}>{pending ? "Yapay zekâ düzenliyor…" : "✨ Kaydet"}</button>
        {state?.ok && <span className="text-sm text-green-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
      <p className="text-xs text-slate-400">Ses kaydedilmez; sadece yazıya dökülen metin işlenir. Yapay zekâ notu düzeltir, durumu ve geri arama zamanını kendisi işaretler.</p>
    </form>
  );
}
