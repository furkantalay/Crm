"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  const current = items.find((it) => (it.href === "/" ? path === "/" : path.startsWith(it.href)));
  return (
    <>
      {/* Telefonda: menü düğmesi */}
      <button type="button" onClick={() => setOpen((o) => !o)}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white md:hidden">
        ☰ {current?.label ?? "Menü"}
      </button>
      <nav className={`${open ? "flex" : "hidden"} w-full flex-col gap-1 pt-2 md:flex md:w-auto md:flex-row md:flex-wrap md:pt-0`}>
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href}
                  className={`rounded-md px-3 py-2 text-sm md:py-1.5 ${active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
