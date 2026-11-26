export const callIcon = (dir: string, dur: number) =>
  dir === "out" ? (dur > 0 ? "📤" : "📵") : dir === "in" ? "📥" : dir === "missed" ? "❗" : "⛔";

export const callLabel = (dir: string, dur: number) =>
  dir === "out" ? (dur > 0 ? "Giden arama" : "Giden · açılmadı")
  : dir === "in" ? "Gelen arama" : dir === "missed" ? "Cevapsız arama" : "Reddedilen arama";

export function callDur(sec: number | null | undefined): string {
  const s = Number(sec ?? 0);
  if (s <= 0) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} sa ${m} dk` : m ? `${m} dk ${r} sn` : `${r} sn`;
}
