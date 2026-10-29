"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { setPremiumPreview } from "@/store/appSlice";
import { useEffect, useState } from "react";
import { planOptions } from "@/features/auth/components/PlanCards";
import { planReturn } from "@/features/auth/routing";
export default function Plans() {
  const data = useApp(),
    { commit, busy } = useWorkspace(),
    router = useRouter();
  const [returnTo, setReturnTo] = useState("/tracker");
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("returnTo");
    setReturnTo(planReturn(target));
  }, []);
  const choose = async (premium: boolean) => {
    if (await commit(setPremiumPreview(premium))) router.push(returnTo);
  };
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Choose your experience</p>
          <h1>Free & Premium</h1>
          <p>Useful from day one. More room to grow when you need it.</p>
        </div>
        <Link href={returnTo}>
          Back to{" "}
          {returnTo === "/history"
            ? "History"
            : returnTo === "/pay"
              ? "Pay"
              : returnTo === "/jobs"
                ? "Jobs"
                : returnTo === "/settings"
                  ? "Settings"
                  : returnTo.startsWith("/onboarding")
                    ? "Setup"
                    : "Tracker"}{" "}
          →
        </Link>
      </div>
      <p>
        Current plan:{" "}
        <strong>{data.isPremium ? "Premium preview" : "Free"}</strong>. This is
        a local demo; no payment or subscription is created.
      </p>
      <div className="plan-grid">
        <article className="card">
          <h2>Free</h2>
          <p>Ad-supported</p>
          <ul>
            {planOptions[0].features.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button
            disabled={busy || !data.isPremium}
            onClick={() => void choose(false)}
          >
            {data.isPremium ? "Use Free" : "Current plan"}
          </button>
        </article>
        <article className="card premium">
          <Sparkles size={24} />
          <h2>Premium</h2>
          <p>Ads removed</p>
          <ul>
            {planOptions[1].features.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={busy || data.isPremium}
            onClick={() => void choose(true)}
          >
            {data.isPremium
              ? "Current preview"
              : "Start Premium preview (no charge)"}
          </button>
        </article>
      </div>
      <p>
        No real ads load in this demo. Ending Premium preview preserves saved
        work. Web modules marked as upcoming are being ported in phases;
        switching plans does not unlock an unfinished screen.
      </p>
    </AppShell>
  );
}
