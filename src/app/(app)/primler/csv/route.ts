import { NextResponse, type NextRequest } from "next/server";
import { can, getMe } from "@/lib/auth";
import { loadCommissions, tierLabel } from "@/lib/commission";
import { todayIst } from "@/lib/format";

const tr = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

export async function GET(req: NextRequest) {
  const me = await getMe();
  if ((me.role !== "admin" && me.role !== "yonetici") || !can(me, "prim")) return new NextResponse("Yetkiniz yok", { status: 403 });
  const month = req.nextUrl.searchParams.get("ay") || todayIst().slice(0, 7);
  const { rows } = await loadCommissions(month);
  const head = ["Satışçı", "Satış adedi", "Aylık satış tutarı", "Kademe", "Aylık prim", "Günlük prim günü", "Günlük prim", "Toplam prim"];
  const lines = rows.map((r) => [r.seller_name, r.sale_count, tr(Number(r.total)), tierLabel(r), tr(Number(r.monthly_commission)),
    r.daily_bonus_days, tr(Number(r.daily_commission)), tr(Number(r.monthly_commission) + Number(r.daily_commission))].join(";"));
  return new NextResponse("﻿" + [head.join(";"), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="primler-${month}.csv"` },
  });
}
