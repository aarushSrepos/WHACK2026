"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/demo-provider";
import { useAccessibility } from "@/components/accessibility-provider";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { BankIcon } from "@/components/bank-icon";

const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(v);
const APR = 24.9;
function simulate(balance: number, payment: number) {
  if (balance <= 0) return { months: 0, interest: 0, total: 0 };
  let outstanding = balance, interest = 0, months = 0;
  const monthly = Math.pow(1 + APR / 100, 1 / 12) - 1;
  while (outstanding > 0.005 && months < 600) {
    const charge = outstanding * monthly;
    interest += charge;
    if (payment <= charge + 0.001) return null;
    outstanding = Math.max(0, outstanding + charge - Math.min(payment, outstanding + charge));
    months++;
  }
  return outstanding > .005 ? null : { months, interest, total: balance + interest };
}
function Duration({ months }: { months: number | undefined }) {return <>{months === undefined ? "Not repayable" : months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months} months`}</>;}
export function CreditSimulator() {
  const { balancePence, minimumPence, loading, loadError } = useDemo();
  const { settings } = useAccessibility();
  const balance = balancePence / 100, minimum = minimumPence / 100;
  const [amount, setAmount] = useState(85);
  const [scenario, setScenario] = useState<"pay" | "miss">("pay");
  const base = useMemo(() => simulate(balance, minimum), [balance, minimum]);
  const result = useMemo(() => simulate(balance, amount), [balance, amount]);
  if (loading || loadError) return <main id="main" tabIndex={-1} className="bank-inner-page"><div role={loadError ? "alert" : "status"} className="ss-card">{loadError ?? "Loading your account…"}</div></main>;
  const saved = result && base ? Math.max(0, base.interest - result.interest) : 0;
  const summary = scenario === "miss"
    ? "A missed payment may lead to additional interest, fees or credit-file effects depending on the lender. If you cannot pay, ask the lender about available support."
    : result ? `In this illustration, paying ${gbp(amount)} each month could repay your sample balance in ${result.months} months, with approximately ${gbp(result.interest)} in interest.`
      : "This monthly payment would not cover the estimated interest. Choose a higher amount to see a repayment estimate.";
  const maxMonths = Math.max(1, base?.months ?? 0, result?.months ?? 0);
  return <main id="main" tabIndex={-1} className="bank-inner-page">
    <header className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> YOUR FINANCIAL TOOLS</p><h1>Repayment <em>planner.</em></h1><p className="page-intro">See how different monthly payments could change the cost of credit.</p></div><Link href="/payment" className="outline-action">Go to payments <BankIcon name="arrow-up-right" size={16}/></Link></header>
    <div className="demo-notice" role="note"><BankIcon name="info" size={16}/>Illustrative estimate at {APR}% APR. These calculations are not lending advice or a real payment.</div>
    <div className="tools-columns repayment-layout"><section className="ss-card"><p className="eyebrow on-light">EXPLORE A SCENARIO</p><h2 className="mt-2">Choose a repayment approach</h2><div className="segmented mt-5" role="group" aria-label="Repayment scenario"><button type="button" aria-pressed={scenario === "pay"} onClick={() => setScenario("pay")}>Pay every month</button><button type="button" aria-pressed={scenario === "miss"} onClick={() => setScenario("miss")}>Miss a payment</button></div>
      {scenario === "pay" ? <>
        <dl className="repay-facts"><div><dt>Sample balance</dt><dd>{gbp(balance)}</dd></div><div><dt>Minimum due</dt><dd>{gbp(minimum)}</dd></div><div><dt>Illustrative APR</dt><dd>{APR}%</dd></div></dl>
        <div className="range-heading"><label htmlFor="repayment">Monthly payment</label><strong>{gbp(amount)}</strong></div>
        <input type="range" id="repayment" value={amount} min={minimum} max={Math.max(250, minimum)} step={5} aria-valuetext={`${gbp(amount)} monthly`} onChange={e => setAmount(Number(e.target.value))} className="repayment-range w-full"/><div className="range-labels"><span>{gbp(minimum)}</span><span>{gbp(Math.max(250,minimum))}</span></div>
        <div className="repayment-comparison"><div><span>Minimum payment only</span><strong><Duration months={base?.months}/></strong><p>{base ? `${gbp(base.interest)} interest` : "Not repayable at this amount"}</p><div className="repayment-track"><span style={{ width: `${base ? base.months / maxMonths * 100 : 100}%` }}/></div></div><div><span>Your chosen payment</span><strong><Duration months={result?.months}/></strong><p>{result ? `${gbp(result.interest)} interest` : "Not repayable at this amount"}</p><div className="repayment-track"><span style={{ width: `${result ? result.months / maxMonths * 100 : 100}%` }}/></div></div></div>
        {result && base && amount > minimum && <p className="repayment-savings" role="status"><BankIcon name="check" size={17}/>Estimated interest saved: <strong>{gbp(saved)}</strong></p>}
      </> : <div className="repayment-missed"><BankIcon name="info" size={24}/><h3>Missing a payment can be costly.</h3><p>Charges and credit-file consequences depend on your provider&apos;s terms. This example does not forecast any fees or credit score changes.</p><p>If paying is difficult, contact your lender early to explore your options.</p></div>}
    </section><div><section className="ss-card repay-summary-card"><p className="eyebrow on-light">WHAT THIS MEANS</p><h2 className="mt-2">The bigger picture</h2><p className="readable-copy mt-4">{summary}</p><div className="mt-4"><ReadAloudButton text={summary}/></div><div className="repay-hint"><BankIcon name="lock" size={15}/>{settings.language === "simple" ? "No money will move. These are examples." : "All calculations stay within this demonstration and make no changes to your account."}</div></section><details className="ss-card repayment-method"><summary>How we calculate this <BankIcon name="chevron-down" size={17}/></summary><p>We apply a fixed effective APR of 24.9% using monthly compounding, fixed payments, no new purchases, and no additional fees. A fixed monthly minimum is used for comparison rather than a real provider&apos;s variable minimum payment. Actual repayment terms and interest charges differ.</p></details></div></div>
  </main>;
}
