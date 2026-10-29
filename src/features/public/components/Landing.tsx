import Link from "next/link";
import {
  Clock,
  Banknote,
  CalendarDays,
  TrendingUp,
  Shield,
  Zap,
  ArrowRight,
  Check,
} from "lucide-react";
import { planOptions } from "@/features/auth/plans";
import { PublicLayout } from "./PublicLayout";
const features = [
  {
    icon: Clock,
    title: "One-tap time tracking",
    description:
      "Clock in, take lunch and clock out. See your worked time and estimated earnings update live.",
    color: "#d84982",
  },
  {
    icon: Banknote,
    title: "Automatic pay calculation",
    description:
      "Regular time, overtime and deductions, calculated from your saved rates and settings.",
    color: "#31b4d6",
  },
  {
    icon: CalendarDays,
    title: "Your work history",
    description:
      "Review current-month entries on Free. Premium adds full History, Calendar and export.",
    color: "#ab82e0",
  },
  {
    icon: TrendingUp,
    title: "Earnings insights",
    description:
      "Explore hours, pay periods and income trends with Premium. Keep different currencies separate.",
    color: "#5bce8b",
  },
  {
    icon: Shield,
    title: "Privacy controls",
    description:
      "Hide pay with one button or protect app access with a local PIN or password.",
    color: "#e8ae5a",
  },
  {
    icon: Zap,
    title: "Reminders for your workday",
    description:
      "Lunch, return-to-work and custom reminders while your workspace is open. Browser permissions apply.",
    color: "#e1ce45",
  },
];
export function Landing() {
  return (
    <PublicLayout landing>
      <section className="landing-hero">
        <p className="landing-badge">
          <Zap size={14} aria-hidden />
          Free to start · no credit card
        </p>
        <h1>
          Track your time.
          <br />
          <em>Know your pay.</em>
        </h1>
        <p className="landing-intro">
          The no-nonsense time tracker built for hourly workers. Clock in, track
          overtime and see your estimated earnings — all in one place. Start as
          a guest, with no account needed.
        </p>
        <div className="public-actions">
          <Link className="button-link primary" href="/signup">
            Create free account
            <ArrowRight size={17} aria-hidden />
          </Link>
          <Link className="button-link" href="/guest">
            Try as guest
          </Link>
        </div>
        <ul className="landing-checks">
          {[
            "No credit card",
            "Saved in this browser",
            "Free & Premium",
            "No real charges in this demo",
          ].map((text) => (
            <li key={text}>
              <Check size={15} aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        <Link href="/tracker" className="workspace-return">
          Open your workspace →
        </Link>
      </section>
      <section className="landing-section" aria-labelledby="features-heading">
        <div className="landing-heading">
          <p className="eyebrow">Features</p>
          <h2 id="features-heading">Everything you need, nothing you don’t.</h2>
        </div>
        <div className="landing-features">
          {features.map(({ icon: Icon, title, description, color }) => (
            <article className="card" key={title}>
              <span
                className="feature-symbol"
                style={{
                  color,
                  backgroundColor: `${color}18`,
                  borderColor: `${color}44`,
                }}
              >
                <Icon size={21} aria-hidden />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        className="landing-why card landing-section"
        aria-labelledby="pay-heading"
      >
        <div>
          <p className="eyebrow">Built for real workers</p>
          <h2 id="pay-heading">Your pay, easier to understand.</h2>
          <p>
            Regular hours, overtime, tips and payment status give you a clearer
            picture of your work. Estimates follow the settings you enter.
          </p>
          <ul className="landing-benefits">
            {[
              "Regular and overtime hours, automatically split",
              "Multiple jobs with their own rates on Premium",
              "Tips recorded per shift",
              "Payment received status for saved work",
              "CSV and JSON backup on Premium",
            ].map((text) => (
              <li key={text}>
                <Check size={17} aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div
          className="landing-example"
          aria-label="Illustrative earnings preview"
        >
          <p className="eyebrow">Example only · not your saved earnings</p>
          {[
            {
              label: "This week",
              value: "$842.50",
              detail: "32.5 hrs · 4 days",
            },
            {
              label: "This month",
              value: "$3,241.00",
              detail: "128 hrs worked",
            },
          ].map((stat) => (
            <div className="card" key={stat.label}>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <p>{stat.detail}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="landing-section" aria-labelledby="plans-heading">
        <div className="landing-heading">
          <p className="eyebrow">Choose your experience</p>
          <h2 id="plans-heading">Start Free. Make room with Premium.</h2>
          <p>Two tiers. Your signup choice applies after mock confirmation.</p>
        </div>
        <div className="public-plan-grid">
          {planOptions.map((plan) => (
            <article
              className={`card${plan.value === "premium" ? " premium" : ""}`}
              key={plan.value}
            >
              <h3>{plan.name}</h3>
              <p className="plan-description">{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="public-demo-note">
          This demo saves work in this browser. Accounts, email confirmation and
          Premium are local previews; no cloud sync, real ads or billing are
          connected.
        </p>
      </section>
      <section className="landing-cta">
        <h2>Ready to know what you’ve earned?</h2>
        <p>Start with Free. Keep your work close at hand.</p>
        <Link className="button-link primary" href="/signup">
          Get started free
          <ArrowRight size={18} aria-hidden />
        </Link>
      </section>
    </PublicLayout>
  );
}
