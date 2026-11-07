import type { Metadata, Viewport } from "next";

import { DemoProvider } from "@/components/demo-provider";
import { AccessibilityProvider } from "@/components/accessibility-provider";
import { AppExperience } from "@/components/app-experience";
import { BOOT_SCRIPT } from "@/lib/accessibility";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SpendSense",
    template: "%s · SpendSense",
  },
  description:
    "An accessibility-focused credit card companion. This demo uses sample data only.",
  applicationName: "SpendSense",
};

export const viewport: Viewport = {
  themeColor: "#004977",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full"
      data-text-size="default"
      data-contrast="standard"
      data-font="default"
      data-motion="system"
      data-language="detailed"
      data-reading-spacing="standard"
      data-large-targets="false"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <AccessibilityProvider><DemoProvider>
          <a href="#main" className="skip-link">
            Skip to main content
          </a>
          <AppExperience>{children}</AppExperience>
        </DemoProvider></AccessibilityProvider>
      </body>
    </html>
  );
}
