import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/components/WorkspaceProvider";
import { PrivacyProvider } from "@/features/settings/components/PrivacyProvider";
import { AuthGate } from "@/features/auth/components/AuthGate";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <PrivacyProvider>
      <WorkspaceProvider>
        <AuthGate>{children}</AuthGate>
      </WorkspaceProvider>
    </PrivacyProvider>
  );
}
