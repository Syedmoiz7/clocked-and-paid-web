import type { Metadata } from "next";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import "./globals.css";
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
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
