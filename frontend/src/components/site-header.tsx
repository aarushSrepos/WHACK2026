"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BankIcon, type IconName } from "@/components/bank-icon";
import { PersonaPicker } from "@/components/persona-picker";
import { useDemo } from "@/components/demo-provider";

const nav: { href: string; label: string; icon: IconName; group?: string }[] = [
  { href: "/", label: "Overview", icon: "home", group: "YOUR ACCOUNT" },
  { href: "/statement", label: "Statements", icon: "receipt" },
  { href: "/payment", label: "Payments", icon: "wallet" },
  { href: "/simulator", label: "Repayment planner", icon: "chart", group: "TOOLS & SUPPORT" },
  { href: "/limit", label: "Spending controls", icon: "sliders" },
  { href: "/settings", label: "Accessibility", icon: "settings", group: "PREFERENCES" },
];

export function SiteHeader() {
  const path = usePathname();
  const { paused } = useDemo();
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <aside className={`bank-sidebar ${menuOpen ? "bank-sidebar-open" : ""}`}>
      <div className="bank-sidebar-top">
        <Link href="/" className="brand" onClick={() => setMenuOpen(false)} aria-label="SpendSense overview">
          <span className="brand-mark" aria-hidden="true"><span/><span/><span/></span>
          <span className="brand-name">Spend<span>Sense</span><small>YOUR CREDIT, CLEARER.</small></span>
        </Link>
        <button className="mobile-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><BankIcon name="close"/></button>
      </div>
      <div className="sidebar-line" />
      <nav className="bank-side-nav" aria-label="Primary navigation">
        {nav.map((item) => <div key={item.href}>
          {item.group && <p className="nav-group-label">{item.group}</p>}
          <Link href={item.href} onClick={() => setMenuOpen(false)} aria-current={path === item.href ? "page" : undefined} className={`bank-nav-link ${path === item.href ? "is-current" : ""}`}>
            <BankIcon name={item.icon} size={19}/><span>{item.label}</span>{path === item.href && <span className="nav-active-dot"/>}
          </Link>
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-account">
          <div className="sidebar-account-head"><BankIcon name="credit" size={17}/><span>CREDIT ACCOUNT</span></div>
          <div className="sidebar-account-number">•••• &nbsp;4242</div>
          <span className="sidebar-status"><span className={`status-dot ${paused ? "status-paused" : ""}`}/>{paused ? "Card paused" : "Account active"}</span>
        </div>
        <p className="sidebar-demo-note"><BankIcon name="lock" size={14}/> Demonstration environment</p>
      </div>
    </aside>
    {menuOpen && <button className="mobile-backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <header className="bank-toolbar">
      <div className="toolbar-left">
        <button type="button" className="mobile-menu-btn" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><BankIcon name="menu"/></button>
        <span className="toolbar-breadcrumb">PERSONAL <span>/</span> CREDIT ACCOUNT</span>
      </div>
      <div className="toolbar-right">
        <span className="toolbar-demo-indicator"><span className="status-dot"/> DEMO MODE</span>
        <PersonaPicker/>
      </div>
    </header>
  </>;
}
