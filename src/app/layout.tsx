import type { Metadata } from "next";
import "./globals.css";
import "@/features/public/public.css";
export const metadata: Metadata = {
  title: "Clocked & Paid",
  description: "Track your time. Know your pay.",
  icons: { icon: "/branding/icon.png", apple: "/branding/icon.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
