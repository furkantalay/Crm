"use client";

import { useActionState, useEffect, useRef } from "react";

type State = { ok?: string; error?: string } | null;

/** Server action formu: sonucu altında gösterir, başarıda formu temizler. */
export default function ActionForm({
  action, children, className, submitLabel, resetOnSuccess = true, confirm,
}: {
  action: (s: State, f: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
  submitLabel: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}
          onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Kaydediliyor…" : submitLabel}</button>
        {state?.ok && <span className="text-sm text-green-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
