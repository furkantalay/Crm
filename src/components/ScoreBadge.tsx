export function ScoreBadge({ score, label, big }: { score?: number | null; label?: string | null; big?: boolean }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const cls = score >= 70 ? "bg-red-100 text-red-700 ring-red-200" : score >= 40 ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  const icon = score >= 70 ? "🔥" : score >= 40 ? "🌤" : "❄️";
  return (
    <span title={`Yapay zekâ puanı: ${score}${label ? ` (${label})` : ""}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ring-1 ${cls} ${big ? "text-base" : "text-xs"}`}>
      {icon} {score}{big && label ? ` · ${label}` : ""}
    </span>
  );
}
