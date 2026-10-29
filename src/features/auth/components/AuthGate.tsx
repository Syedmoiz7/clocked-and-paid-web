"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/components/WorkspaceProvider";
import { authRedirect } from "../routing";
import { BrowserTabTime } from "@/components/BrowserTabTime";
import { GlobalReminderHost } from "@/features/tracker/components/Reminders";

export function AuthGate({ children }: { children: ReactNode }) {
  const data = useApp(),
    path = usePathname(),
    router = useRouter(),
    destination = authRedirect(data, path);
  useEffect(() => {
    if (destination && path !== destination) router.replace(destination);
  }, [destination, path, router]);
  return (
    <>
      <BrowserTabTime />
      <GlobalReminderHost />
      {destination ? (
        <main className="loading">
          <span className="brand-mark">C&P</span>
          <p>Opening your workspace…</p>
        </main>
      ) : (
        children
      )}
    </>
  );
}
