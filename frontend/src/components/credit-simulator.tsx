"use client";
import { useMemo, useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { useAccessibility } from "@/components/accessibility-provider";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { DataGate } from "@/components/v2-ui";
import { pounds } from "@/lib/money";

type Outcome = { months: number; interestPence: number } | null;

/**
 * Pay the same amount every month until the balance is gone. Uses the same rule as the backend
 * engine (APR / 12 each month, whole pence), so the first month's interest matches the dashboard.
 * Returns null when the payment never clears the balance.
 */
function simulate(balancePence: number, paymentPence: number, aprBasisPoints: number): Outcome {
  let balance = balancePence;
  let interest = 0;
  let months = 0;
  while (balance > 0 && months < 600) {
    const charge = Math.round((balance * aprBasisPoints) / (10_000 * 12));
    if (paymentPence <= charge) return null;
    interest += charge;
    balance = Math.max(0, balance + charge - paymentPence);
    months++;
  }
  return balance > 0 ? null : { months, interestPence: interest };
}

const describeMonths = (months: number) => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months} month${months === 1 ? "" : "s"}`;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return rest === 0 ? y : `${y} and ${rest} month${rest === 1 ? "" : "s"}`;
};

const personaNote = {
  priya: "Priya: shorter sentences and larger text help explain the numbers.",
  sam: "Sam: every explanation is available in text, without needing sound.",
  amara: "Amara: controls have accessible labels and explanations can be read aloud.",
  alex: "Alex: take your time. You can explore choices without committing to anything.",
} as const;

export function CreditSimulator() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <span className="ss-demo-label">ILLUSTRATIVE CALCULATIONS · NOT FINANCIAL ADVICE</span>
      <section className="ss-hero">
        <div className="ss-hero-eyebrow">Understand before you decide</div>
        <h1>What happens if I pay more?</h1>
        <p>Explore how repayment choices could affect the cost of credit. Nothing here makes a payment.</p>
      </section>
      <DataGate>
        <Simulator />
      </DataGate>
    </main>
  );
}

function Simulator() {
  const { persona, balancePence, minimumPence, aprBasisPoints } = useDemo();
  const { settings } = useAccessibility();
  const simple = settings.language === "simple";
  const apr = aprBasisPoints / 100;
  const minPounds = Math.ceil(minimumPence / 100);
  const maxPounds = Math.max(250, minPounds + 50);
  const [chosen, setChosen] = useState<number | null>(null);
  const amount = Math.min(maxPounds, Math.max(minPounds, chosen ?? minPounds * 2));
  const [scenario, setScenario] = useState<"pay" | "miss">("pay");

  const base = useMemo(() => simulate(balancePence, minimumPence, aprBasisPoints), [balancePence, minimumPence, aprBasisPoints]);
  const result = useMemo(() => simulate(balancePence, amount * 100, aprBasisPoints), [balancePence, amount, aprBasisPoints]);
  const saved = base && result ? Math.max(0, base.interestPence - result.interestPence) : 0;

  let summary: string;
  if (scenario === "miss") {
    summary = simple
      ? "If you miss a payment, you may pay a fee and more interest. It can also show on your credit file. If paying is hard, tell us early."
      : "If you miss a payment, you may be charged a fee, pay more interest, and your credit file could be affected. Contact your lender as early as you can if you cannot pay.";
  } else if (!result) {
    summary = "This payment may not cover the interest. Try a higher amount.";
  } else if (simple) {
    summary = `Paying ${pounds(amount * 100, 0)} a month clears it in about ${describeMonths(result.months)}. Interest would be about ${pounds(result.interestPence)}.`;
  } else {
    summary =
      `At ${pounds(amount * 100, 0)} per month, the balance of ${pounds(balancePence)} could be repaid in about ` +
      `${describeMonths(result.months)}, with around ${pounds(result.interestPence)} interest` +
      (saved > 0 ? `. That is about ${pounds(saved)} less interest than paying ${pounds(minimumPence)} a month.` : ".");
  }

  if (balancePence <= 0) {
    return (
      <section className="ss-card">
        <h2 className="text-2xl font-bold">Nothing to repay</h2>
        <p className="mt-2">Your balance is {pounds(0)}, so there is no interest to compare. Reset the demo data to try the simulator again.</p>
      </section>
    );
  }

  return (
    <>
      <section className="ss-card space-y-5">
        <h2 className="text-2xl font-bold">Choose a scenario</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={scenario === "pay" ? "v2-button" : "v2-button-alt"} aria-pressed={scenario === "pay"} onClick={() => setScenario("pay")}>
            Make monthly payments
          </button>
          <button type="button" className={scenario === "miss" ? "v2-button" : "v2-button-alt"} aria-pressed={scenario === "miss"} onClick={() => setScenario("miss")}>
            What if I miss one?
          </button>
        </div>

        {scenario === "pay" ? (
          <>
            <p>
              Your balance: <strong>{pounds(balancePence)}</strong> · APR: <strong>{apr}%</strong> · Minimum payment:{" "}
              <strong>{pounds(minimumPence)}</strong>
            </p>
            <label htmlFor="repayment" className="block font-bold">
              Monthly payment: {pounds(amount * 100, 0)}
            </label>
            <input
              id="repayment"
              aria-valuetext={`${amount} pounds per month`}
              type="range"
              min={minPounds}
              max={maxPounds}
              step={5}
              value={amount}
              onChange={(e) => setChosen(Number(e.target.value))}
              className="w-full accent-[#0b1f3a]"
            />
            <div className="flex justify-between text-sm">
              <span>{pounds(minPounds * 100, 0)}</span>
              <span>{pounds(maxPounds * 100, 0)}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-soft p-5">
                <h3 className="font-bold">Paying the minimum ({pounds(minimumPence)})</h3>
                <p className="mt-2 text-2xl font-bold">{base ? describeMonths(base.months) : "Not repayable"}</p>
                <p>Estimated interest: {base ? pounds(base.interestPence) : "—"}</p>
              </div>
              <div className="rounded-xl border-2 border-brand bg-white p-5">
                <h3 className="font-bold">Your chosen payment</h3>
                <p className="mt-2 text-2xl font-bold">{result ? describeMonths(result.months) : "Not repayable"}</p>
                <p>Estimated interest: {result ? pounds(result.interestPence) : "—"}</p>
              </div>
            </div>
            {saved > 0 && <p className="rounded-xl bg-soft p-4 font-semibold">Estimated interest saved: {pounds(saved)}.</p>}
          </>
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-soft p-5">
            <h3 className="text-xl font-bold">Missing a payment can have consequences</h3>
            <p>Possible late fees, extra interest and credit-file effects depend on the lender and the account terms. This example does not predict a credit score or charge a fee.</p>
            <p>If you are struggling, contact your lender as early as you can to talk about support. Free, independent help is available from MoneyHelper and StepChange.</p>
          </div>
        )}

        <div aria-live="polite" className="rounded-xl border border-line p-4">
          <p className="font-bold">{simple ? "In simple words" : "What this means"}</p>
          <p className="mt-2">{summary}</p>
          <ReadAloudButton text={summary} what="this summary" />
        </div>

        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-bold">How are these estimates calculated?</summary>
          <p className="mt-3">
            We use your account&apos;s {apr}% APR, divided by 12 and added each month, the same fixed payment every month, no new
            purchases, no fees and no rate changes. The minimum payment is held at today&apos;s amount, although a real minimum goes
            down as the balance falls. Actual interest, minimum payments and repayment times can differ.
          </p>
        </details>
      </section>

      <section className="ss-card">
        <h2 className="text-xl font-bold">Your accessibility preferences still apply</h2>
        <p className="mt-2">{personaNote[persona]}</p>
      </section>
    </>
  );
}
