import Link from "next/link";
import { PublicLayout } from "@/features/public/components/PublicLayout";
export default function NotFound() {
  return (
    <PublicLayout title="Page not found">
      <p>This address does not match a page in Clocked & Paid.</p>
      <div className="public-actions">
        <Link className="button-link primary" href="/">
          Back to home
        </Link>
        <Link className="button-link" href="/tracker">
          Open your workspace
        </Link>
      </div>
    </PublicLayout>
  );
}
