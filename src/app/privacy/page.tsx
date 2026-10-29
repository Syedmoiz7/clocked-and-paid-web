import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicLayout,
  DocumentSection as Section,
  contactEmail,
} from "@/features/public/components/PublicLayout";
export const metadata: Metadata = { title: "Privacy Policy · Clocked & Paid" };
export default function PrivacyPage() {
  return (
    <PublicLayout title="Privacy Policy">
      <p className="document-meta">
        Local demo preview · Updated October 29, 2026
      </p>
      <Section title="Overview">
        <p>
          Clocked & Paid is a personal time and pay tracker. This page describes
          the current browser demo, including guest and mock-account modes.
        </p>
      </Section>
      <Section title="What you save">
        <ul>
          <li>
            Time entries, jobs, notes, tips and payment status you record.
          </li>
          <li>
            Rates, overtime rules, deductions, schedules and pay estimates.
          </li>
          <li>
            Display preferences, reminders and optional mock profile name and
            email.
          </li>
        </ul>
        <p>
          Public pages do not load your saved workspace. Entering the app opens
          its local storage and privacy controls.
        </p>
      </Section>
      <Section title="How data is stored">
        <p>
          Both guest and mock-account modes save to this browser’s IndexedDB
          storage. No account database or cloud sync is connected. Changing mock
          identities does not create separate workspaces.
        </p>
        <p>
          Clearing site data, using another browser or changing the site address
          can make saved work unavailable. Premium backup exports let you keep a
          separate copy. Local storage is not an encrypted vault.
        </p>
      </Section>
      <Section title="Passwords and privacy lock">
        <p>
          Passwords entered for mock sign-in are not saved. Setting a demo
          password or privacy credential stores a salted digest separately from
          business data. These records are excluded from business backups.
        </p>
        <p>
          A PIN or password hides and blocks access through the app UI. It does
          not encrypt your data or protect it from someone who can inspect or
          modify this browser’s storage. No biometric data is collected.
        </p>
      </Section>
      <Section title="Data sharing and tracking">
        <p>
          The demo does not upload your time, pay or mock profile records, load
          advertising scripts, or include usage analytics. Public page and asset
          requests still reach the server hosting the site.
        </p>
        <p>
          Free is the ad-supported product tier and Premium removes ads; neither
          tier loads real ads in this demo. Backend, advertising and hosting
          practices must be reflected here before a production launch.
        </p>
      </Section>
      <Section title="Your choices">
        <ul>
          <li>Use guest mode without entering account details.</li>
          <li>Hide pay or configure a privacy lock in Settings.</li>
          <li>
            Review export, import and reset options in Settings. Reset clears
            business data while retaining the local account/plan and privacy
            configuration.
          </li>
          <li>
            Clear all site data through your browser to remove this origin’s
            business records, mock profile and local credentials. Downloaded
            backup files remain wherever you saved them.
          </li>
        </ul>
      </Section>
      <Section title="Reminders and contact">
        <p>
          System notifications require your browser’s permission. Reminders
          depend on an open workspace page; delivery with the browser closed is
          not provided.
        </p>
        <p>
          Contact links open your own email app. Messages you choose to send are
          handled by that email service; this demo does not submit support
          messages automatically.
        </p>
        <p>
          Questions? Visit <Link href="/contact">Contact</Link> or email{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </Section>
      <Section title="Changes">
        <p>
          This page will be reviewed when backend accounts, sync, ads or billing
          are introduced. The preview describes current behavior and does not
          claim those services are already available.
        </p>
      </Section>
    </PublicLayout>
  );
}
