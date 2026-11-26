import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIst } from "@/lib/format";
import { BACKUP_TABLES } from "../tables";

export const maxDuration = 60;

const esc = (v: unknown) => {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (me.role !== "admin" && me.role !== "teknik") return new NextResponse("Yetkiniz yok", { status: 403 });
  const table = req.nextUrl.searchParams.get("tablo") ?? "";
  if (!BACKUP_TABLES[table]) return new NextResponse("Bilinmeyen tablo", { status: 400 });

  const supabase = await createClient();
  const rows: Record<string, unknown>[] = [];
  const orderCol = table === "sale_products" ? "sale_id" : "id";
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").order(orderCol).range(from, from + 999);
    if (error) return new NextResponse("Okunamadı: " + error.message, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const body = "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${todayIst()}.csv"`,
    },
  });
}
