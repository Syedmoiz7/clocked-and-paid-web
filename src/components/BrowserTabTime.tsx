"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./WorkspaceProvider";
import { usePrivacy } from "@/features/settings/components/PrivacyProvider";
import { formatDuration, trackerMetrics } from "@/features/tracker/model";

export function BrowserTabTime() {
  const data = useApp(),
    privacy = usePrivacy(),
    path = usePathname();
  useEffect(() => {
    const tick = () => {
      if (privacy.locked) {
        document.title = "Workspace locked · Clocked & Paid";
        return;
      }
      if (document.documentElement.dataset.reminderTitle) return;
      const shift = data.activeShift,
        mode = data.preferences.headerTimerMode;
      if (!shift || mode === "off") {
        const label = (
          {
            "/history": "Work History",
            "/pay": "Pay",
            "/jobs": "Jobs",
            "/settings": "Settings",
            "/plans": "Plans",
          } as Record<string, string>
        )[path];
        document.title = label ? `${label} · Clocked & Paid` : "Clocked & Paid";
        return;
      }
      const now = Date.now(),
        metrics = trackerMetrics(shift, data.todayPlan, now);
      const seconds =
        mode === "count-up"
          ? metrics.worked
          : ((metrics.projected ?? now) - now) / 1000;
      document.title = `${seconds < 0 ? "+" : ""}${formatDuration(Math.abs(seconds))}${seconds < 0 ? " over plan" : ""} · Clocked & Paid`;
    };
    tick();
    const timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [
    data.activeShift,
    data.todayPlan,
    data.preferences.headerTimerMode,
    privacy.locked,
    path,
  ]);
  return null;
}
