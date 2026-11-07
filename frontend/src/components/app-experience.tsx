"use client";

import { usePathname } from "next/navigation";
import { useAccessibility } from "@/components/accessibility-provider";
import { AccessibilityWorkspace } from "@/components/accessibility-workspace";
import { HelpButton } from "@/components/help-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function AppExperience({ children }: { children: React.ReactNode }) {
  const { ready, setupComplete } = useAccessibility();
  const path = usePathname();
  // The staff console is a separate tool: no customer onboarding, no customer sidebar.
  if (path.startsWith("/agent")) return <>{children}</>;
  if (!ready) {
    return <main id="main" className="setup-loading" role="status"><span className="setup-loading-mark" aria-hidden="true" />Preparing your experience…</main>;
  }
  if (!setupComplete) return <AccessibilityWorkspace mode="onboarding" />;
  return <div className="bank-shell">
    <SiteHeader />
    <div className="bank-workspace">
      <div className="bank-content">{children}</div>
      <SiteFooter />
    </div>
    <HelpButton />
  </div>;
}
