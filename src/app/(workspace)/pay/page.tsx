import { AppShell } from "@/components/AppShell";
import { Pay } from "@/features/pay/components/Pay";

import "@/features/pay/pay.css";
export default function PayPage() {
  return (
    <AppShell>
      <Pay />
    </AppShell>
  );
}
