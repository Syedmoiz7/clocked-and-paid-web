import { AppShell } from "@/components/AppShell";
import { Settings } from "@/features/settings/components/Settings";

import "@/features/settings/settings.css";
export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}
