import { AppShell } from "@/components/AppShell";
import { History } from "@/features/history/components/History";
import "@/features/history/history.css";
export default function HistoryPage() {
  return (
    <AppShell>
      <History />
    </AppShell>
  );
}
