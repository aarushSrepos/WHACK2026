"use client";
import { useEffect, useRef, useState } from "react";
import { useDemo, pounds } from "@/components/demo-provider";
import { ReadAloudButton } from "@/components/read-aloud-button";
import type { AskResponse } from "@/lib/api";

export function DemoNotice() {
  const { label } = useDemo();
  return (
    <p role="note" className="ss-card mb-6 font-semibold">
      {label} — no real bank account is connected and no money will move.
    </p>
  );
}

/** Shows "loading" or "cannot reach the server" instead of the screen until the account has loaded. */
export function DataGate({ children }: { children: React.ReactNode }) {
  const { loading, loadError } = useDemo();
  if (loading) return <p role="status" className="ss-card">Loading your account…</p>;
  if (loadError)
    return (
      <p role="alert" className="ss-card border-2 border-brand font-semibold">
        {loadError}
      </p>
    );
  return <>{children}</>;
}

/** The result of the last action, and the review-and-confirm panel for a proposed one. */
export function ConfirmAction() {
  const { pending, cancel, confirm, notice } = useDemo();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await confirm();
    setBusy(false);
  };
  return (
    <>
      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} aria-live="polite" className="my-3 font-semibold">
          {notice.text}
        </p>
      )}
      {pending && (
        <section role="region" aria-labelledby="confirm-heading" className="ss-card my-5 border-2 border-brand">
          <h2 id="confirm-heading" className="text-xl font-bold">Review and confirm</h2>
          <p className="my-3">{pending.readBack}</p>
          <ReadAloudButton text={pending.readBack} />
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="v2-button" disabled={busy} onClick={run}>Confirm action</button>
            <button className="v2-button-alt" disabled={busy} onClick={cancel}>Cancel</button>
          </div>
          <p className="mt-3 text-sm">No time limit. Nothing happens until you confirm.</p>
        </section>
      )}
    </>
  );
}

function Receipts() {
  const { receipts } = useDemo();
  return (
    <>
      {receipts.map((r, i) => (
        <p className="ss-card mt-3" key={i}>{r}</p>
      ))}
    </>
  );
}

export function StatementContent() {
  const { transactions, balancePence, minimumPence, dueDate, ask, adopt, loading, loadError, persona } = useDemo();
  const [detailed, setDetailed] = useState(false);
  const [explain, setExplain] = useState<AskResponse | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const token = useRef(0);
  const format = detailed ? "detailed" : "simple";

  // The explanation comes from the server: the engine works out the numbers and every figure is checked.
  useEffect(() => {
    if (loading || loadError) return;
    const mine = ++token.current;
    setExplain(null);
    ask("Why is my bill higher this month?", format).then((r) => {
      if (mine === token.current) setExplain(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, format, persona]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    const r = await ask(question.trim(), format);
    setAsking(false);
    if (r) {
      setAnswer(r);
      if (r.proposed_action) adopt(r.proposed_action);
    }
  };

  return (
    <DataGate>
      <section className="ss-card space-y-4">
        <h2 className="text-2xl font-bold">Explain my statement</h2>
        <p>
          Balance <strong>{pounds(balancePence)}</strong> · Minimum payment <strong>{pounds(minimumPence)}</strong> · Due {dueDate}
        </p>
        <div className="flex gap-3">
          <button aria-pressed={!detailed} className="v2-button-alt" onClick={() => setDetailed(false)}>Simple</button>
          <button aria-pressed={detailed} className="v2-button-alt" onClick={() => setDetailed(true)}>Detailed</button>
        </div>
        {explain ? (
          <>
            <p>{explain.answer}</p>
            <p className="font-semibold">{explain.badge}</p>
            <ReadAloudButton text={explain.answer} />
          </>
        ) : (
          <p role="status">Working out your explanation…</p>
        )}
      </section>

      <form onSubmit={submit} className="ss-card mt-5 space-y-3">
        <h2 className="text-xl font-bold">Ask about your bill</h2>
        <label htmlFor="bill-question">Your question</label>
        <input
          id="bill-question"
          className="v2-input"
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why is my bill higher? I don't recognise a charge. Pay the minimum."
        />
        <button className="v2-button" type="submit" disabled={asking || !question.trim()}>
          {asking ? "Thinking…" : "Ask"}
        </button>
        {answer && (
          <div role="status" className="rounded-xl bg-soft p-4 space-y-2">
            <p>{answer.answer}</p>
            <p className="text-sm font-semibold">{answer.badge}</p>
            {answer.figures.length > 0 && (
              <ul className="text-sm">
                {answer.figures.map((f) => (
                  <li key={f.id}>{f.label}: {f.display}</li>
                ))}
              </ul>
            )}
            <ReadAloudButton text={answer.answer} />
          </div>
        )}
      </form>
      <ConfirmAction />

      <section className="ss-card mt-5">
        <h2 className="text-xl font-bold">Recent transactions</h2>
        <ul className="mt-3 divide-y divide-line">
          {transactions.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 py-3">
              <span>
                {t.merchant}
                <span className="block text-sm text-muted">
                  {t.date}
                  {t.status !== "posted" ? ` · ${t.status}` : ""}
                </span>
              </span>
              <strong>{pounds(t.amountPence)}</strong>
            </li>
          ))}
        </ul>
      </section>
    </DataGate>
  );
}

export function DisputeContent() {
  const { transactions, propose } = useDemo();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("I do not recognise this charge");
  const options = transactions.filter((t) => t.status !== "disputed");
  const chosen = options.find((t) => t.id === selected) ?? options.find((t) => t.id === "tx_042") ?? options[0];
  return (
    <DataGate>
      <section className="ss-card space-y-4">
        <h2 className="text-xl font-bold">Dispute a charge without calling</h2>
        {chosen ? (
          <>
            <label className="block" htmlFor="dispute-transaction">Choose a transaction</label>
            <select id="dispute-transaction" className="v2-input" value={chosen.id} onChange={(e) => setSelected(e.target.value)}>
              {options.map((t) => (
                <option value={t.id} key={t.id}>{t.merchant} — {pounds(t.amountPence)} — {t.date}</option>
              ))}
            </select>
            <label className="block" htmlFor="dispute-reason">Reason</label>
            <textarea id="dispute-reason" className="v2-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="v2-button" onClick={() => propose({ type: "dispute", transactionId: chosen.id, reason })}>
              Review dispute
            </button>
          </>
        ) : (
          <p>There are no charges left to dispute.</p>
        )}
      </section>
      <ConfirmAction />
      <Receipts />
      {transactions.some((t) => t.status === "disputed") && (
        <section className="ss-card mt-5">
          <h2 className="text-xl font-bold">Charges you have questioned</h2>
          <ul className="mt-3 divide-y divide-line">
            {transactions.filter((t) => t.status === "disputed").map((t) => (
              <li key={t.id} className="flex justify-between gap-3 py-3">
                <span>{t.merchant}<span className="block text-sm text-muted">{t.date} · dispute open</span></span>
                <strong>{pounds(t.amountPence)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </DataGate>
  );
}

export function PaymentContent() {
  const { minimumPence, balancePence, propose, dueDate } = useDemo();
  const [amount, setAmount] = useState("");
  const value = amount === "" ? minimumPence / 100 : Number(amount);
  const pence = Math.round(value * 100);
  return (
    <DataGate>
      <section className="ss-card space-y-4">
        <h2 className="text-xl font-bold">Make a simulated payment</h2>
        <p>Balance: {pounds(balancePence)}. Minimum payment: {pounds(minimumPence)}. Due {dueDate}.</p>
        <label htmlFor="payment-amount" className="block">Payment amount in pounds</label>
        <input
          id="payment-amount"
          className="v2-input"
          type="number"
          min="0.01"
          step="0.01"
          value={amount === "" ? String(minimumPence / 100) : amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="v2-button"
          disabled={!Number.isFinite(pence) || pence <= 0}
          onClick={() => propose({ type: "pay", amountPence: pence })}
        >
          Review payment
        </button>
      </section>
      <ConfirmAction />
      <Receipts />
    </DataGate>
  );
}

export function LimitContent() {
  const { monthlyLimitPence, setMonthlyLimit, spentPence, percentUsed, demoSpend, paused, propose, reset, creditLimitPence } = useDemo();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(monthlyLimitPence ? String(monthlyLimitPence / 100) : "");
  }, [monthlyLimitPence]);
  const percent = percentUsed === null ? null : Math.round(percentUsed);
  const draftNumber = Number(draft);
  return (
    <DataGate>
      <section className="ss-card space-y-4">
        <h2 className="text-xl font-bold">Your monthly spending limit</h2>
        <label htmlFor="limit">My monthly limit (£)</label>
        <input className="v2-input" id="limit" type="number" min="1" step="1" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <p className="text-sm">Your limit is your own choice and needs to be below your credit limit of {pounds(creditLimitPence)}.</p>
        <button className="v2-button" disabled={!(draftNumber > 0) || draftNumber * 100 === monthlyLimitPence} onClick={() => setMonthlyLimit(draftNumber)}>
          Save limit
        </button>
        {monthlyLimitPence === null || percent === null ? (
          <p>You have not set a limit yet. Spent this month: {pounds(spentPence)}.</p>
        ) : (
          <>
            <p>Spent this month: {pounds(spentPence)} of {pounds(monthlyLimitPence)} ({percent}%).</p>
            <progress className="w-full" max={100} value={Math.min(100, percent)} aria-label="Monthly spending limit progress" />
          </>
        )}
        <button className="v2-button-alt" onClick={() => demoSpend(4000)}>Simulate a £40 purchase</button>
        {percent !== null && percent >= 80 && (
          <div role="status" className="rounded-xl border border-line bg-soft p-4">
            <strong>A quick check-in</strong>
            <p>You have used {percent}% of the limit you chose. You can review your spending or pause your demo card. You are in control.</p>
          </div>
        )}
        <button
          className="v2-button mt-3"
          onClick={() => propose({ type: paused ? "unpause_card" : "pause_card" })}
        >
          {paused ? "Turn card back on" : "Pause card for 24 hours"}
        </button>
        {paused && <p role="status" className="font-semibold">Your demo card is paused.</p>}
      </section>
      <ConfirmAction />
      <button className="v2-button-alt mt-5" onClick={reset}>Reset demo data</button>
    </DataGate>
  );
}
