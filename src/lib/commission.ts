import { createClient } from "@/lib/supabase/server";

export type CommissionRow = {
  seller_id: string; seller_name: string; seller_active: boolean; month: string; sale_count: number; total: number;
  daily_commission: number; daily_bonus_days: number; tier_kind: string | null; tier_value: number | null; tier_min: number | null;
  monthly_commission: number; next_tier_min: number | null; to_next_tier: number | null;
};

/** Ayın prim tablosu: yalnız prim hakkı olan kullanıcılar. month = YYYY-MM */
export async function loadCommissions(month: string) {
  const supabase = await createClient();
  const [{ data, error }, { data: eligible }] = await Promise.all([
    supabase.from("v_commission_monthly").select("*").eq("month", `${month}-01`).order("total", { ascending: false }),
    supabase.from("profiles").select("id").eq("commission_eligible", true),
  ]);
  const ok = new Set((eligible ?? []).map((p) => p.id));
  const rows = ((data ?? []) as CommissionRow[]).filter((r) => ok.has(r.seller_id));
  return { rows, error };
}

export const tierLabel = (r: Pick<CommissionRow, "tier_kind" | "tier_value">) =>
  !r.tier_kind ? "—" : r.tier_kind === "percent" ? `%${Number(r.tier_value)}` : `${Number(r.tier_value).toLocaleString("tr-TR")} ₺ sabit`;
