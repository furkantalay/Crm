"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function readError(e: unknown): Promise<string | null> {
  const ctx = (e as { context?: Response } | null)?.context;
  return ctx ? ctx.json().then((b) => b?.error ?? null).catch(() => null) : Promise.resolve(null);
}

function SetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("t") ?? "";
  const [who, setWho] = useState<{ username: string; full_name: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid("Bağlantı eksik."); return; }
    createClient().functions.invoke("set-password", { body: { token, check: true } }).then(async ({ data, error }) => {
      if (error || !data?.username) setInvalid((await readError(error)) ?? "Bağlantı geçersiz.");
      else setWho(data);
    });
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Şifre en az 8 karakter olmalı.");
    if (pw !== pw2) return setError("İki şifre aynı değil.");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("set-password", { body: { token, password: pw } });
      if (error || !data?.email) throw new Error((await readError(error)) ?? "Şifre kaydedilemedi.");
      const { error: se } = await supabase.auth.signInWithPassword({ email: data.email, password: pw });
      if (se) { router.replace("/giris"); return; }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre kaydedilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold">Yeni şifre belirle</h1>
          {who && <p className="text-sm text-slate-500">Kullanıcı adınız: <b>{who.username}</b></p>}
        </div>
        {invalid ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{invalid}</p>
        ) : !who ? (
          <p className="text-sm text-slate-500">Bağlantı kontrol ediliyor…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="p1">Yeni şifre (en az 8 karakter)</label>
              <input id="p1" type="password" className="input" autoComplete="new-password" value={pw}
                     onChange={(e) => setPw(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="p2">Yeni şifre (tekrar)</label>
              <input id="p2" type="password" className="input" autoComplete="new-password" value={pw2}
                     onChange={(e) => setPw2(e.target.value)} required />
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn w-full" disabled={loading}>{loading ? "Kaydediliyor…" : "Şifreyi kaydet ve giriş yap"}</button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><SetPasswordForm /></Suspense>;
}
