import type { Metadata, Viewport } from "next";
// Fonts are bundled from npm (not fetched from Google at build time), so the app builds and runs offline.
import "@fontsource-variable/geist";
import "@fontsource-variable/lexend";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import { DemoProvider } from "@/components/demo-provider";
import { AccessibilityProvider } from "@/components/accessibility-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
  themeColor: "#0b1f3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full"
      data-text-size="default"
      data-contrast="standard"
      data-font="default"
      data-motion="system"
      data-language="detailed"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AccessibilityProvider><DemoProvider>
          <a href="#main" className="skip-link">
            Skip to main content
          </a>
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </DemoProvider></AccessibilityProvider>
      </body>
    </html>
  );
}
