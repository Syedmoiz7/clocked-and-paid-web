"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspaceAccount } from "./WorkspaceAccount";
import { useApp, useWorkspace } from "./WorkspaceProvider";
import { setPayVisible } from "@/store/appSlice";
import type { ReactNode } from "react";
import { themeStyle } from "@/lib/theme";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    data = useApp(),
    { commit, busy, message, notify } = useWorkspace();
  return (
    <div
      className="workspace-theme"
      style={themeStyle(data.preferences.themeHue)}
    >
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="nav-inner">
          <Link className="brand" href="/tracker">
            <span className="brand-mark">C&P</span>
            <span>
              Clocked <em>&</em> Paid
            </span>
          </Link>
          <WorkspaceNavigation path={path} />
          <div className="nav-actions">
            <button
              className="pay-visibility-toggle"
              type="button"
              role="switch"
              aria-checked={data.payVisible}
              disabled={busy}
              aria-label="Show Pay"
              title={
                data.payVisible ? "Hide dollar amounts" : "Show dollar amounts"
              }
              onClick={() => void commit(setPayVisible(!data.payVisible))}
            >
              <span className="pay-visibility-track" aria-hidden="true">
                <span />
              </span>
              <span>Show Pay</span>
            </button>
            <Link
              className="plan-link"
              href={
                path === "/history"
                  ? "/plans?returnTo=history"
                  : path === "/pay"
                    ? "/plans?returnTo=pay"
                    : path === "/jobs"
                      ? "/plans?returnTo=jobs"
                      : path === "/settings"
                        ? "/plans?returnTo=settings"
                        : "/plans"
              }
            >
              <Sparkles size={16} />
              {data.isPremium ? "Premium preview" : "See plans"}
            </Link>
            <WorkspaceAccount />
          </div>
        </div>
      </header>
      <main id="main" className="page">
        {children}
      </main>
      <footer className="site-footer">
        Clocked & Paid{" "}
        <span>
          {data.auth.session === "mock" ? "Mock account" : "Guest workspace"} ·
          saved in this browser
        </span>
        <nav className="workspace-footer-links" aria-label="Information">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </footer>
      {message && (
        <div role="status" className="toast">
          <p>{message}</p>
          <button aria-label="Dismiss message" onClick={() => notify("")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
