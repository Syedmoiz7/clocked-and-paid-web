"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock3,
  History,
  BriefcaseBusiness,
  Settings2,
  Wallet,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { useApp, useWorkspace } from "./WorkspaceProvider";
import { setPayVisible } from "@/store/appSlice";
import type { ReactNode, CSSProperties } from "react";

const links = [
  { href: "/tracker", label: "Tracker", icon: Clock3 },
  { href: "/history", label: "History", icon: History },
  { href: "/pay", label: "Pay", icon: Wallet },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    data = useApp(),
    { commit, busy, message, notify } = useWorkspace();
  return (
    <div
      className="workspace-theme"
      style={{ "--brand-h": data.preferences.themeHue } as CSSProperties}
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
          <nav aria-label="Main navigation">
            {links.map(({ href, label, icon: Icon }) =>
              href === "/tracker" ? (
                <Link
                  key={href}
                  className={path === href ? "active" : ""}
                  href={href}
                  aria-current={path === href ? "page" : undefined}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              ) : (
                <span
                  key={href}
                  className="upcoming"
                  title={`${label} is in the next web phase`}
                >
                  <Icon size={17} />
                  {label}
                </span>
              ),
            )}
          </nav>
          <div className="nav-actions">
            <button
              className="icon-button"
              disabled={busy}
              aria-label={data.payVisible ? "Hide pay" : "Show pay"}
              onClick={() => void commit(setPayVisible(!data.payVisible))}
            >
              {data.payVisible ? <Eye size={19} /> : <EyeOff size={19} />}
            </button>
            <Link className="plan-link" href="/plans">
              <Sparkles size={16} />
              {data.isPremium ? "Premium preview" : "See plans"}
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="page">
        {children}
      </main>
      <footer className="site-footer">
        Clocked & Paid <span>Guest workspace · saved in this browser</span>
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
