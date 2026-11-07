import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Geist, Lexend } from "next/font/google";
import { DemoProvider } from "@/components/demo-provider";
import { AccessibilityProvider } from "@/components/accessibility-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BOOT_SCRIPT } from "@/lib/accessibility";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

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
      className={`${geistSans.variable} ${lexend.variable} ${atkinson.variable} h-full`}
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
