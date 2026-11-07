"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BankIcon, type IconName } from "@/components/bank-icon";
import { ReadAloudButton } from "@/components/read-aloud-button";

/**
 * "Get help", in the same place (bottom right) on every customer page. WCAG 2.2 "Consistent help" (3.2.6):
 * people who find things hard to remember can always find help where they expect it.
 */

// One plain sentence per page: what you can do here.
const PAGE_HELP: Record<string, string> = {
  "/": "This page shows what you owe, the least you need to pay, and when it is due.",
  "/statement": "Here you can see what you have spent, and ask questions about your bill in your own words, typed or spoken.",
  "/payment": "Choose how much to pay, then check it. Nothing is paid until you press Confirm.",
  "/simulator": "Try different monthly payments to see how long it would take to pay off, and how much interest you would pay. Nothing is paid here.",
  "/limit": "Set your own monthly spending limit, or pause your card for 24 hours if you need a break.",
  "/support": "Ask a person for help without phoning. Choose how they reply, and see their replies here.",
  "/settings": "Change how the site looks and sounds: text size, contrast, font, wording, motion and read-aloud.",
  "/needs": "Tell us once how you want us to contact and support you, and choose whether our staff can see it.",
};

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/statement#bill-question", label: "Ask a question about my account", icon: "sparkle" },
  { href: "/support", label: "Talk to a person (no phone needed)", icon: "help" },
  { href: "/settings", label: "Make the site easier to use", icon: "settings" },
  { href: "/needs", label: "Tell us how to contact me", icon: "shield" },
];

export function HelpButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headingId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageHelp = PAGE_HELP[path] ?? "Use the links below to get help with anything on this page.";

  // Opening moves focus into the panel; Escape closes it and puts focus back on the button.
  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return <div className="help-dock">
    {open && <section id={panelId} className="help-panel" role="dialog" aria-modal="false" aria-labelledby={headingId}>
      <div className="help-panel-top">
        <h2 id={headingId} ref={heading} tabIndex={-1}>How can we help?</h2>
        <button type="button" className="help-close" aria-label="Close help" onClick={() => { close(); button.current?.focus(); }}><BankIcon name="close" size={18} /></button>
      </div>
      <p className="help-page"><strong>On this page:</strong> {pageHelp}</p>
      <ReadAloudButton text={`On this page: ${pageHelp}`} />
      <ul className="help-links">
        {LINKS.map((l) => <li key={l.href}><Link href={l.href} onClick={close}><BankIcon name={l.icon} size={17} /><span>{l.label}</span><BankIcon name="chevron-right" size={15} /></Link></li>)}
      </ul>
      <p className="help-note">Press Escape to close. This button is in the same place on every page.</p>
    </section>}
    <button
      ref={button}
      type="button"
      className="help-button"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={() => setOpen((o) => !o)}
    >
      <BankIcon name={open ? "close" : "help"} size={20} />
      <span>{open ? "Close help" : "Get help"}</span>
    </button>
  </div>;
}
