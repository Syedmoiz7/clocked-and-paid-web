import Link from "next/link";
import { Clock, History, Banknote, Briefcase, Settings } from "lucide-react";

const links = [
  { href: "/tracker", label: "Tracker", icon: Clock },
  { href: "/history", label: "History", icon: History },
  { href: "/pay", label: "Pay", icon: Banknote },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function WorkspaceNavigation({ path }: { path: string }) {
  return (
    <nav className="workspace-navigation" aria-label="Main navigation">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          className={path === href ? "active" : ""}
          href={href}
          aria-current={path === href ? "page" : undefined}
        >
          <span className="navigation-icon">
            <Icon size={16} aria-hidden="true" />
          </span>
          <span className="navigation-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
