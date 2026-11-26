"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      // 1) Kullanıcı adını giriş e-postasına çevir (eski şifre varsa burada taşınır)
      const { data, error: fnError } = await supabase.functions.invoke("auth-login", {
        body: { username, password, company: process.env.NEXT_PUBLIC_COMPANY_SLUG },
      });
      if (data?.reset_token) {
        // Eski şifre doğru ama kısa: yeni şifre belirleme ekranına
        router.replace(`/sifre-belirle?t=${data.reset_token}&kisa=1`);
        return;
      }
      if (fnError || !data?.email) {
        let msg = "Kullanıcı adı veya şifre hatalı.";
        try {
          const ctx = (fnError as { context?: Response } | null)?.context;
          const body = ctx ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }
      // 2) Supabase oturumu
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password });
      if (signInError) throw new Error("Kullanıcı adı veya şifre hatalı.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-sm text-slate-500">Hesabınızla giriş yapın</p>
        </div>
        <div>
          <label className="label" htmlFor="u">Kullanıcı adı</label>
          <input id="u" className="input" autoComplete="username" value={username}
                 onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="p">Şifre</label>
          <input id="p" type="password" className="input" autoComplete="current-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full" disabled={loading}>{loading ? "Giriş yapılıyor…" : "Giriş yap"}</button>
      </form>
    </main>
  );
}
