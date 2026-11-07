"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PersonaPicker } from "@/components/persona-picker";

const links = [
  { href: "/", label: "Overview" },
  { href: "/statement", label: "Statement" },
  { href: "/simulator", label: "Credit simulator" },
  { href: "/dispute", label: "Dispute a charge" },
  { href: "/payment", label: "Payments" },
  { href: "/limit", label: "Spending & wellbeing" },
  { href: "/settings", label: "Accessibility" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="ss-header">
      <div className="ss-topline"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 text-xs font-semibold tracking-wide"><span>SPENDSENSE / ACCESSIBLE CREDIT COMPANION</span><span>HACKATHON PROTOTYPE · NOT A BANKING SERVICE</span></div></div>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5">
        <Link href="/" className="ss-wordmark" aria-label="SpendSense home"><span className="ss-mark" aria-hidden="true">S</span><span>Spend<span className="ss-wordmark-accent">Sense</span><small>YOUR MONEY. YOUR WAY.</small></span></Link>
        <PersonaPicker />
      </div>
      <nav aria-label="Main navigation" className="ss-nav"><ul className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4">
        {links.map(link => <li key={link.href}><Link href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={pathname === link.href ? "ss-nav-link ss-nav-active" : "ss-nav-link"}>{link.label}</Link></li>)}
      </ul></nav>
    </header>
  );
}
