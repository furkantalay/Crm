import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM",
  description: "Satış ve müşteri takip sistemi",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
