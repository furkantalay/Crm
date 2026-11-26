import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLookups, getSellers } from "@/lib/data";
import { createCustomer } from "./actions";
import NewCustomerForm from "./NewCustomerForm";

export default async function NewCustomerPage() {
  await requireRole(["admin", "yonetici", "dataci"]);
  const [sellers, lk] = await Promise.all([getSellers(), getLookups()]);
  return (
    <div className="space-y-4">
      <Link href="/datalar" className="text-sm text-slate-500 hover:underline">← Datalar</Link>
      <h1 className="text-3xl font-bold">Yeni Data</h1>
      <div className="card">
        <NewCustomerForm action={createCustomer}
          sellers={sellers.map((s) => ({ id: s.id, label: s.full_name }))}
          dataTypes={lk.by("data_type").map((d) => ({ id: d.id, label: d.label }))} />
      </div>
    </div>
  );
}
