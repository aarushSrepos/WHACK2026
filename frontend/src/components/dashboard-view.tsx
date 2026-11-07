"use client";

import Link from "next/link";
import { WellbeingSupport } from "@/components/wellbeing-support";
import {useDemo} from "@/components/demo-provider";
import { Lang } from "@/components/lang";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { useAccessibility } from "@/components/accessibility-provider";
import { DataGate } from "@/components/v2-ui";
import { formatPounds } from "@/lib/demo-account";

export function DashboardView() {
  const { settings } = useAccessibility();
  const d = useDemo();
  const { persona } = d;
  const balance = d.balancePence / 100;
  const minimum = d.minimumPence / 100;
  const spoken =
    settings.language === "simple"
      ? `You owe ${balance} pounds. The smallest payment is ${minimum} pounds. It is due in ${d.dueInDays} days.`
      : `Your statement balance is ${balance} pounds. The minimum payment is ${minimum} pounds. It is due in ${d.dueInDays} days. This is sample data for the SpendSense demo, not a live account.`;
  const dueWeekday = d.dueDateISO
    ? new Date(`${d.dueDateISO}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";
  const recent = d.transactions.slice(0, 5);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="ss-demo-label">{d.label.toUpperCase()}</span>
        <span className="text-sm font-semibold text-muted">Sample credit account ···· 4242</span>
      </div>
      <section className="ss-hero" aria-labelledby="welcome-title">
        <div className="ss-hero-eyebrow">Your accessible account companion</div>
        <h1 id="welcome-title">Money made clearer.<br /><span style={{color:"#ffb2a8"}}>On your terms.</span></h1>
        <p>{persona === "priya" ? "Welcome, Priya. Clear words, larger text, and less clutter." : persona === "sam" ? "Welcome, Sam. Manage your account entirely through text." : persona === "amara" ? "Welcome, Amara. Navigate with your screen reader and hear your account summary." : "Welcome, Alex. Take things one step at a time, at your own pace."}</p>
      </section>
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-5 py-4" aria-label="Your personalised experience">
        <div><p className="font-bold">Your experience is personalised</p><p className="text-sm text-muted">You can change text size, contrast and language at any time.</p></div>
        <Link href="/settings" className="v2-button-alt">Adjust accessibility</Link>
      </section>
      {persona === "alex" && <WellbeingSupport />}
      <h2 className="mb-3 text-xl font-bold">What would you like to do?</h2>
      <nav aria-label="Account tasks" className="mb-7 flex flex-wrap gap-3">{[{href:"/simulator",label:"Compare repayments"},{href:"/statement",label:"Explain my statement"},{href:"/dispute",label:"Dispute a charge"},{href:"/payment",label:"Pay minimum"},{href:"/limit",label:"Set spending limit"}].map(item=><Link key={item.href} className="v2-button-alt" href={item.href}>{item.label}</Link>)}</nav>
      <DataGate>
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Account summary
        </h2>
        <dl className="grid gap-4 md:grid-cols-2">
          <div className="ss-navy-panel rounded-3xl bg-navy p-6 text-on-navy md:col-span-2 sm:p-8">
            <dt className="text-lg font-semibold text-on-navy-muted">
              <Lang simple="You owe" detailed="Statement balance" />
            </dt>
            <dd>
              <p className="mt-1 text-5xl font-bold tracking-tight sm:text-6xl">
                {formatPounds(balance, 0)}
              </p>
              <p className="mt-3 max-w-2xl text-on-navy-muted">
                <Lang
                  simple="This is the money to pay back."
                  detailed={
                    <>
                      This statement total is {formatPounds(balance)}.
                      The sample credit limit is{" "}
                      {formatPounds(d.creditLimitPence / 100)}, so{" "}
                      {formatPounds(d.availableCreditPence / 100)} is still available.
                      Paying more than the minimum reduces what you owe.
                    </>
                  }
                />
              </p>
              <ReadAloudButton text={spoken} />
            </dd>
          </div>

          <div className="ss-card">
            <dt className="text-lg font-semibold">
              <Lang simple="Smallest payment" detailed="Minimum payment" />
            </dt>
            <dd>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {formatPounds(minimum, 0)}
              </p>
              <p className="mt-3 text-muted">
                <Lang
                  simple="Pay at least this much to stay on track."
                  detailed="Paying at least this amount by the due date keeps the sample account in good standing. Interest can still apply to the rest of the balance."
                />
              </p>
            </dd>
          </div>

          <div className="ss-card border-warning-line bg-warning text-warning-ink">
            <dt className="text-lg font-semibold">
              <Lang simple="Pay within" detailed="Payment due" />
            </dt>
            <dd>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {d.dueInDays} days
              </p>
              <p className="mt-3 font-semibold">Due soon</p>
              <p className="mt-1">
                <Lang
                  simple={
                    <>
                      The last day is{" "}
                      <time dateTime={d.dueDateISO}>{dueWeekday}</time>
                      .
                    </>
                  }
                  detailed={
                    <>
                      Due{" "}
                      <time dateTime={d.dueDateISO}>{d.dueDate}</time>
                      . That is {d.dueInDays} days from today.
                    </>
                  }
                />
              </p>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="activity-heading" className="ss-card mt-4">
        <h2 id="activity-heading" className="text-2xl font-bold">
          <Lang simple="Recent spending" detailed="Sample transactions" />
        </h2>
        <p className="mt-2 mb-4 text-muted">
          <Lang
            simple="Your latest spending. This is demo data, not real spending."
            detailed="Example activity for the demo statement. Nothing here is a live transaction."
          />
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <caption className="sr-only">
              Your five most recent sample transactions
            </caption>
            <thead>
              <tr className="border-b-2 border-line">
                <th scope="col" className="py-3 pr-4 font-semibold">
                  Date
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  Where
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  Status
                </th>
                <th scope="col" className="py-3 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((transaction) => (
                <tr key={transaction.id} className="border-b border-line">
                  <td className="py-3 pr-4">
                    <time dateTime={transaction.dateISO}>{transaction.date}</time>
                  </td>
                  <td className="py-3 pr-4 font-semibold">{transaction.merchant}</td>
                  <td className="py-3 pr-4">{transaction.status}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">
                    {formatPounds(transaction.amountPence / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="next-heading" className="ss-card mt-4">
        <h2 id="next-heading" className="text-2xl font-bold">
          <Lang simple="Paying" detailed="What you can do next" />
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          <Lang
            simple="You can pay on the Pay page."
            detailed={`The minimum to pay is ${formatPounds(minimum)}, due in ${d.dueInDays} days. You will review and confirm before anything happens.`}
          />
        </p>
        <Link href="/payment" className="v2-button mt-4 inline-block">Go to payment</Link>
      </section>
      </DataGate>
    </main>
  );
}
