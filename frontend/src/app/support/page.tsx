import type { Metadata } from "next";
import { SupportCenter } from "@/components/support-center";

export const metadata: Metadata = {
  title: "Get support",
  description: "Talk to a person about your account, without a phone queue.",
};

export default function Page() {
  return <main id="main" tabIndex={-1} className="bank-inner-page">
    <header className="page-heading"><div>
      <p className="eyebrow"><span className="eyebrow-rule" /> TOOLS & SUPPORT</p>
      <h1>Get support</h1>
      <p className="page-intro">Talk to a person about your account, in the way that suits you. Replies are simulated in this demo.</p>
    </div></header>
    <SupportCenter />
  </main>;
}
