import type { Metadata } from "next";
import { Landing } from "@/features/public/components/Landing";
export const metadata: Metadata = {
  title: "Clocked & Paid · Track your time. Know your pay.",
};
export default function Home() {
  return <Landing />;
}
