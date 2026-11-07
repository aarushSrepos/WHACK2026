"use client";

import Link from "next/link";
import { useDemo, pounds } from "@/components/demo-provider";
import { BankIcon, type IconName } from "@/components/bank-icon";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { WellbeingSupport } from "@/components/wellbeing-support";
import { DataGate } from "@/components/v2-ui";
import { useAccessibility } from "@/components/accessibility-provider";

const shortMoney = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(pence / 100);
const actions: { href: string; icon: IconName; title: string; description: string }[] = [
  { href: "/payment", icon: "arrow-up-right", title: "Make a payment", description: "Pay towards your balance" },
  { href: "/statement", icon: "receipt", title: "View statement", description: "Understand recent charges" },
  { href: "/limit", icon: "sliders", title: "Manage card", description: "Limits and card controls" },
  { href: "/simulator", icon: "chart", title: "Plan repayments", description: "Explore your options" },
];

function UtilisationRing({ used }: { used: number }) {
  const pct = Math.max(0, Math.min(100, used));
  return <div className="util-ring" aria-label={`${Math.round(pct)}% of credit limit used`} role="img">
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="49" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8"/><circle cx="60" cy="60" r="49" fill="none" stroke="#c5e4f6" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${pct * 3.0788} 308`} transform="rotate(-90 60 60)"/></svg>
    <div className="util-ring-text"><strong>{Math.round(pct)}%</strong><span>used</span></div>
  </div>;
}

function MerchantIcon({ merchant }: { merchant: string }) {
  const key = merchant.toLowerCase();
  const category = /train|rail/.test(key) ? "travel" : /sainsbury|tesco|marks/.test(key) ? "food" : /spotify/.test(key) ? "music" : /unknown/.test(key) ? "unknown" : "shopping";
  return <span className={`merchant-icon merchant-${category}`} aria-hidden="true">{merchant.replace(/[^a-zA-Z ]/g, "").trim().charAt(0).toUpperCase()}</span>;
}

export function DashboardView() {
  const d = useDemo();
  const { settings } = useAccessibility();
  const used = d.creditLimitPence ? (d.balancePence / d.creditLimitPence) * 100 : 0;
  const recent = d.transactions.slice(0, 5);
  const bars = d.transactions.slice(0, 7).reverse();
  const tallest = Math.max(1, ...bars.map(t => t.amountPence));
  const spoken = settings.language === "simple"
    ? `Your balance is ${shortMoney(d.balancePence)}. Your minimum payment is ${shortMoney(d.minimumPence)}, due ${d.dueDate}.`
    : `Your sample credit account has a balance of ${shortMoney(d.balancePence)}. Available credit is ${shortMoney(d.availableCreditPence)}. The next minimum payment of ${shortMoney(d.minimumPence)} is due on ${d.dueDate}.`;

  return <main id="main" tabIndex={-1} className="dashboard-page">
    <header className="page-heading dashboard-heading">
      <div><p className="eyebrow"><span className="eyebrow-rule"/> YOUR ACCOUNT OVERVIEW</p><h1>Good to see you, <em>{d.displayName || "there"}.</em></h1><p className="page-intro">A clearer picture of your money, all in one place.</p></div>
      <Link href="/statement" className="outline-action">View statements <BankIcon name="arrow-up-right" size={17}/></Link>
    </header>
    <DataGate>
      <div className="dashboard-note" role="note"><BankIcon name="info" size={16}/><span>This is an interactive demo with sample transactions. No real financial account is connected.</span></div>
      <section className="balance-hero" aria-label="Credit account balance">
        <div className="balance-main">
          <div className="balance-head"><span className="eyebrow light">SPENDSENSE CREDIT <span className="balance-dot">·</span> ENDING IN 4242</span><span className="hero-active"><span className={`status-dot ${d.paused ? "status-paused" : ""}`}/>{d.paused ? "Paused" : "Active"}</span></div>
          <div><p className="balance-caption">Current balance</p><div className="balance-number">{shortMoney(d.balancePence)}</div><p className="balance-subtext">The amount currently outstanding on your sample account</p></div>
          <div className="balance-bottom">
            <div><span>Available credit</span><strong>{shortMoney(d.availableCreditPence)}</strong></div>
            <div><span>Total credit limit</span><strong>{shortMoney(d.creditLimitPence)}</strong></div>
            <Link href="/payment" className="hero-payment-link">Make a payment <BankIcon name="arrow-up-right" size={18}/></Link>
          </div>
        </div>
        <div className="balance-aside">
          <div className="card-visual" aria-hidden="true"><div className="visual-brand"><span className="tiny-brand-mark"/> SpendSense</div><div className="card-chip"><span/></div><div className="card-digits">•••• &nbsp;•••• &nbsp;•••• &nbsp;4242</div><div className="card-visual-bottom"><span>PERSONAL CREDIT</span><span>CREDIT <i>DEMO</i></span></div></div>
          <div className="utilisation-stat"><UtilisationRing used={used}/><div><span className="util-label">CREDIT UTILISATION</span><strong>{Math.round(used)}% of your limit</strong><p>Keeping track of how much credit you use can help you plan.</p></div></div>
        </div>
      </section>
      <section className="key-metrics" aria-label="Upcoming payment and spending">
        <div className="metric-block"><span className="metric-icon"><BankIcon name="calendar" size={18}/></span><div><p>Next payment due</p><strong>{d.dueDate || "—"}</strong><span>{d.dueInDays > 0 ? `In ${d.dueInDays} days` : d.dueInDays === 0 ? "Due today" : "Past due in sample data"}</span></div></div>
        <div className="metric-block"><span className="metric-icon"><BankIcon name="wallet" size={18}/></span><div><p>Minimum payment</p><strong>{shortMoney(d.minimumPence)}</strong><span>Or pay more to reduce interest</span></div></div>
        <div className="metric-block"><span className="metric-icon"><BankIcon name="chart" size={18}/></span><div><p>Monthly spending</p><strong>{shortMoney(d.spentPence)}</strong><span>{d.monthlyLimitPence ? `Of your ${shortMoney(d.monthlyLimitPence)} personal limit` : "No personal limit set"}</span></div></div>
      </section>
      <section className="quick-actions" aria-labelledby="quick-actions-heading"><div className="section-heading-row"><h2 id="quick-actions-heading">Quick actions</h2><span>EVERYDAY BANKING</span></div><div className="quick-action-grid">{actions.map(item => <Link href={item.href} key={item.href} className="quick-action"><span className="quick-action-icon"><BankIcon name={item.icon} size={20}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><BankIcon name="chevron-right" size={16} className="quick-action-arrow"/></Link>)}</div></section>
      <div className="dashboard-columns">
        <section className="ss-card transaction-panel" aria-labelledby="activity-heading">
          <div className="panel-title-row"><div><p className="eyebrow on-light">YOUR ACTIVITY</p><h2 id="activity-heading">Recent transactions</h2></div><Link href="/statement" className="text-link">See statement <BankIcon name="arrow-up-right" size={15}/></Link></div>
          <div className="transactions-list">{recent.map(t => <div className="transaction-row" key={t.id}><MerchantIcon merchant={t.merchant}/><div className="transaction-detail"><strong>{t.merchant}</strong><span>{t.date}<span className="transaction-bullet"> · </span>{t.status === "pending" ? "Pending" : "Card purchase"}</span></div><strong className="transaction-amount">−{pounds(t.amountPence)}</strong></div>)}</div>
          <Link href="/statement" className="transaction-all">View all transactions <BankIcon name="arrow-right" size={17}/></Link>
        </section>
        <div className="dashboard-side-panels">
          <section className="ss-card activity-chart-panel" aria-labelledby="spending-chart-heading"><div className="panel-title-row"><div><p className="eyebrow on-light">YOUR SPENDING</p><h2 id="spending-chart-heading">At a glance</h2></div><BankIcon name="chart" size={18}/></div><p className="chart-caption">Your most recent {bars.length} sample purchases</p><div className="mini-chart" role="img" aria-label={`Chart of amounts for the last ${bars.length} sample purchases`}>
            {bars.map((t, i) => <div className="chart-column" key={t.id}><div className="bar-track"><div className={`bar-fill ${i === bars.length - 1 ? "is-latest" : ""}`} style={{ height: `${Math.max(10, t.amountPence / tallest * 100)}%` }}/></div><span>{new Date(t.dateISO + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></div>)}
          </div><Link href="/simulator" className="text-link chart-footer-link">Explore repayments <BankIcon name="arrow-up-right" size={15}/></Link></section>
          <section className="insight-panel"><span className="insight-icon"><BankIcon name="book" size={22}/></span><p className="eyebrow light">HERE TO HELP</p><h2>Understand the numbers.</h2><p>Plain-language statement explanations, payment guidance and accessible support when you need it.</p><Link href="/statement">Ask about your statement <BankIcon name="arrow-right" size={17}/></Link></section>
        </div>
      </div>
      <section className="accessibility-strip"><div className="accessibility-strip-icon"><BankIcon name="settings" size={20}/></div><div><strong>Your experience, your choice.</strong><p>Adjust reading size, contrast, language or audio at any time.</p></div><div className="accessibility-strip-actions"><ReadAloudButton text={spoken}/><Link href="/settings" className="text-link">Personalise display <BankIcon name="arrow-right" size={16}/></Link></div></section>
      {d.persona === "alex" && <WellbeingSupport/>}
    </DataGate>
  </main>;
}
