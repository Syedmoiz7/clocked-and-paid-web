import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicLayout,
  DocumentSection as Section,
  contactEmail,
} from "@/features/public/components/PublicLayout";
export const metadata: Metadata = {
  title: "Terms of Service · Clocked & Paid",
};
export default function TermsPage() {
  return (
    <PublicLayout title="Terms of Service">
      <p className="document-meta">
        Local demo preview · Updated October 29, 2026
      </p>
      <Section title="About this demo">
        <p>
          Clocked & Paid helps you record work and estimate pay. These terms
          describe the current local demo. Mock accounts and Premium previews do
          not create a server account, paid subscription or verified purchase.
        </p>
      </Section>
      <Section title="Use of the app">
        <p>
          You may use the app for personal or professional time tracking. You
          are responsible for the data you enter. Do not misuse the app, attempt
          unauthorised access to other people’s data, or use it for an unlawful
          purpose.
        </p>
      </Section>
      <Section title="Pay estimates">
        <p>
          The app calculates from the rates, schedules, overtime rules and
          deductions you enter. Estimates are for personal reference. This is
          not payroll or certified accounting software, financial advice, or a
          guarantee of what an employer owes.
        </p>
        <p>
          Verify your recorded hours and estimated pay against your employer’s
          official records.
        </p>
      </Section>
      <Section title="Your responsibility">
        <ul>
          <li>Keep your recorded times, rates and settings accurate.</li>
          <li>Keep independent copies of important records.</li>
          <li>
            Protect access to the browser and device containing your workspace.
          </li>
          <li>
            Review exported files before sharing them; backups contain personal
            work data and are not encrypted.
          </li>
        </ul>
      </Section>
      <Section title="Availability and limitations">
        <p>
          The demo is provided as-is. It may contain errors, become unavailable
          or change during development. Browser storage can be cleared or become
          unavailable. A local privacy lock is an app access control, not
          encryption.
        </p>
        <p>
          Reminders require an open workspace and may be affected by browser
          permissions, background throttling or device settings. Do not rely on
          them as your only reminder.
        </p>
      </Section>
      <Section title="Free and Premium">
        <p>
          Free is the ad-supported tier; Premium removes ads and adds the
          features shown during signup. In this demo, neither tier loads real
          ads, and switching plans does not charge you. Ending a Premium preview
          preserves your work but limits access to Premium features.
        </p>
        <p>
          Production prices, subscription terms and payment handling will be
          presented before real purchases are enabled. No production pricing is
          promised by this preview.
        </p>
      </Section>
      <Section title="Data and privacy">
        <p>
          Guest and mock-account modes share one workspace in this browser. No
          cloud sync or production account isolation is provided. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> for storage, deletion and
          credential behavior.
        </p>
      </Section>
      <Section title="Changes and contact">
        <p>
          These pages will be reviewed before production services are enabled.
          Questions about the app or these terms can be sent through your email
          app to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. See{" "}
          <Link href="/contact">Contact</Link> for bug-report details.
        </p>
      </Section>
    </PublicLayout>
  );
}
