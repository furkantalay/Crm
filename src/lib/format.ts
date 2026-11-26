const TZ = "Europe/Istanbul";

export const tl = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " ₺";

export const num = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat("tr-TR").format(n);

export const dateTime = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "-";

export const date = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, dateStyle: "short" }).format(new Date(v.length === 10 ? v + "T12:00:00" : v)) : "-";

/** İstanbul saatine göre bugünün tarihi (YYYY-MM-DD) */
export function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** İstanbul saatine göre bu ayın ilk günü (YYYY-MM-DD) */
export function monthStartIst(): string {
  return todayIst().slice(0, 8) + "01";
}

export const roleLabel: Record<string, string> = {
  admin: "Admin",
  yonetici: "Yönetici",
  dataci: "Datacı",
  satisci: "Satışçı",
  teknik: "Teknik",
};
