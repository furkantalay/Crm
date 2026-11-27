import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM",
  description: "Satış ve müşteri takip sistemi",
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0f172a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
