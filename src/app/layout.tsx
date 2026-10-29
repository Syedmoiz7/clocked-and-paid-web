import type { Metadata } from "next";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { PrivacyProvider } from "@/features/settings/components/PrivacyProvider";
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
        <PrivacyProvider>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </PrivacyProvider>
      </body>
    </html>
  );
}
