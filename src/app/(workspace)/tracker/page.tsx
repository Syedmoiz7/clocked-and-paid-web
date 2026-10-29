import { AppShell } from "@/components/AppShell";
import { Tracker } from "@/features/tracker/components/Tracker";
import "@/features/tracker/tracker.css";
export default function TrackerPage() {
  return (
    <AppShell>
      <Tracker />
    </AppShell>
  );
}
