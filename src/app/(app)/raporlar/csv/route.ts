import { NextResponse, type NextRequest } from "next/server";
import { can, getMe } from "@/lib/auth";
import { loadReport } from "@/lib/report";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Formül enjeksiyonunu önle
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const tr = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (me.role === "satisci") return new NextResponse("Yetkiniz yok", { status: 403 });
  const f = Object.fromEntries(req.nextUrl.searchParams.entries());
  const r = await loadReport(f);
  const seeNet = can(me, "net");
  const head = ["Tarih", "Satışçı", "Müşteri", "Telefon", "Eğitim / Paket", "Tutar", ...(seeNet ? ["Bize Gelen"] : []), "Ödeme", "Taksit", "Kaynak", "Banka", "Ödeyen", "Data Tipi"];
  const lines = r.rows.map((s) => [s.order_date, s.seller_name, s.customer_name, s.customer_phone, s.products, tr(s.amount), ...(seeNet ? [tr(s.net_amount)] : []),
    s.payment_method, s.installments, s.sale_source, s.bank, s.payer_name, s.data_type].map(esc).join(";"));
  // Excel Türkçe ayarlarında ";" ayırıcı ve UTF-8 BOM ile doğru açılır
  const body = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="satis-raporu-${r.from}-${r.to}.csv"`,
    },
  });
}
