export type TeamRow = {
  user_id: string; full_name: string; role: string; last_seen_at: string | null;
  first_at: string | null; last_event_at: string | null; last_event_kind: string | null; last_event_detail: string | null;
  last_ping_at: string | null; last_ping_active: boolean | null; last_active_at: string | null;
  note_count: number; sale_count: number; sale_amount: number; other_count: number;
  active_minutes: number; open_minutes: number; longest_gap_minutes: number | null; longest_gap_from: string | null;
  call_out: number; call_answered: number; call_in: number; call_missed: number; talk_seconds: number;
  app_last_sync: string | null; app_permission_ok: boolean | null;
};

/** Telefon uygulamasının durumu (bugün için) */
export function appState(r: TeamRow, now = Date.now()): { label: string; cls: string } {
  if (!r.app_last_sync) return { label: "📱 uygulama kurulu değil", cls: "text-slate-400" };
  if (r.app_permission_ok === false) return { label: "📱 izin kapalı", cls: "font-semibold text-red-700" };
  const m = (now - new Date(r.app_last_sync).getTime()) / 60_000;
  if (m > 90) return { label: `📱 ${ago(r.app_last_sync, now)} gönderdi`, cls: "font-semibold text-red-700" };
  return { label: "📱 bağlı", cls: "text-green-700" };
}

export type Status = { key: "working" | "browsing" | "idle" | "offline"; label: string; cls: string; dot: string; order: number };

const mins = (v: string | null, now: number) => (v ? (now - new Date(v).getTime()) / 60_000 : Infinity);

/** Durum kuralları (yalnız bugün için anlamlı) */
export function statusOf(r: TeamRow, now = Date.now()): Status {
  const sinceEvent = mins(r.last_event_at, now);
  const sincePing = mins(r.last_ping_at ?? r.last_seen_at, now);
  const sinceActive = mins(r.last_active_at, now);
  if (sinceEvent <= 15 && sincePing <= 5)
    return { key: "working", label: "Çalışıyor", cls: "bg-green-100 text-green-800", dot: "bg-green-500", order: 0 };
  if (sincePing <= 3 && sinceActive <= 5)
    return { key: "browsing", label: "CRM'de, kayıt girmiyor", cls: "bg-blue-100 text-blue-800", dot: "bg-blue-500", order: 1 };
  if (sincePing <= 3)
    return { key: "idle", label: "Açık ama boşta", cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500", order: 2 };
  return { key: "offline", label: "Çevrimdışı", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400", order: 3 };
}

export function ago(v: string | null, now = Date.now()): string {
  if (!v) return "—";
  const m = Math.floor((now - new Date(v).getTime()) / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60} dk önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export function duration(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

export const timeIst = (v: string | null) =>
  v ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";

/** 45 dk üstü boşluk dikkat, 90 dk üstü kırmızı */
export const gapCls = (m: number | null) => (m == null ? "" : m >= 90 ? "font-semibold text-red-700" : m >= 45 ? "font-semibold text-amber-700" : "");
