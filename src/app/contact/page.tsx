import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Clock, Shield, MessageCircle } from "lucide-react";
import {
  PublicLayout,
  DocumentSection as Section,
  contactEmail,
} from "@/features/public/components/PublicLayout";
import { CopyEmail } from "@/features/public/components/CopyEmail";
export const metadata: Metadata = { title: "Contact · Clocked & Paid" };
export default function ContactPage() {
  return (
    <PublicLayout title="Contact">
      <section className="card contact-about">
        <h2>About Clocked & Paid</h2>
        <p>
          A personal time and pay tracker for hourly workers, freelancers and
          anyone who wants a clear way to keep track of their hours and
          estimated earnings.
        </p>
        <p>
          Start Free with no account needed. Guest and mock-account work stays
          in this browser; cloud sync is not connected.
        </p>
        <ul className="contact-benefits">
          {[
            { icon: Clock, text: "Live time tracking" },
            { icon: Shield, text: "Local privacy controls" },
            { icon: MessageCircle, text: "Free & Premium" },
          ].map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon size={18} aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </section>
      <Section title="Get in Touch">
        <p>
          Have a question, found a bug or want to suggest a feature? Use the
          email address below.
        </p>
        <a className="contact-email card" href={`mailto:${contactEmail}`}>
          <span className="feature-symbol">
            <Mail size={22} aria-hidden />
          </span>
          <span>
            <strong>Email us</strong>
            <span>{contactEmail}</span>
            <small>Questions, bug reports or feature requests</small>
          </span>
        </a>
        <p className="public-demo-note">
          Opens your email app. Review and send the message there; this demo
          does not send it for you.
        </p>
        <CopyEmail />
      </Section>
      <section className="card contact-report">
        <h2>When reporting a bug, please include:</h2>
        <ul>
          <li>What happened and what you expected.</li>
          <li>Your device and browser.</li>
          <li>Whether you used guest mode or a mock account.</li>
          <li>The steps to reproduce the issue.</li>
        </ul>
        <p>
          Do not include passwords or a full work-data backup unless you intend
          to share its contents.
        </p>
      </section>
      <div className="public-actions">
        <Link className="button-link" href="/privacy">
          Privacy Policy
        </Link>
        <Link className="button-link" href="/terms">
          Terms of Service
        </Link>
        <Link className="button-link" href="/tracker">
          Open your workspace
        </Link>
      </div>
    </PublicLayout>
  );
}
