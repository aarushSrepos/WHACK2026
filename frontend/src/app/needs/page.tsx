import type { Metadata } from "next";
import { NeedsForm } from "@/components/needs-form";

export const metadata: Metadata = {
  title: "Your needs",
  description: "Tell us once how you want to be contacted and supported.",
};

export default function Page() {
  return <main id="main" tabIndex={-1} className="bank-inner-page">
    <header className="page-heading"><div>
      <p className="eyebrow"><span className="eyebrow-rule" /> TELL US ONCE</p>
      <h1>Your needs</h1>
      <p className="page-intro">Tell us how you want us to contact and support you. You only need to do this once, and you can change it any time.</p>
    </div></header>
    <NeedsForm />
  </main>;
}
