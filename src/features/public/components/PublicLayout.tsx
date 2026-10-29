import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
export { contactEmail } from "../contact";
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container">
        <p>Clocked & Paid · Time and pay tracking for hourly workers</p>
        <nav aria-label="Information">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <p>© {new Date().getFullYear()} Clocked & Paid</p>
      </div>
    </footer>
  );
}
export function PublicLayout({
  children,
  title,
  landing = false,
}: {
  children: ReactNode;
  title?: string;
  landing?: boolean;
}) {
  return (
    <div
      className={`workspace-theme public-site${landing ? " public-landing" : ""}`}
    >
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <div className="public-container">
          <Link className="brand" href="/" aria-label="Clocked and Paid home">
            <span className="brand-mark">C&P</span>
            <span>
              Clocked <em>&</em> Paid
            </span>
          </Link>
          {landing ? (
            <nav aria-label="Get started">
              <Link className="button-link" href="/auth">
                Log in
              </Link>
              <Link className="button-link primary" href="/signup">
                Sign up
              </Link>
            </nav>
          ) : (
            <Link className="public-back" href="/">
              <ArrowLeft size={16} aria-hidden />
              Back to home
            </Link>
          )}
        </div>
      </header>
      <main
        id="main"
        className={`public-container${landing ? "" : " public-document"}`}
      >
        {title && <h1>{title}</h1>}
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
export function DocumentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="document-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
