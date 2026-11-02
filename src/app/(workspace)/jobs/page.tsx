import { AppShell } from "@/components/AppShell";
import { Jobs } from "@/features/jobs/components/Jobs";

import "@/features/jobs/jobs.css";
export default function JobsPage() {
  return (
    <AppShell>
      <Jobs />
    </AppShell>
  );
}
