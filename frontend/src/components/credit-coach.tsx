"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDemo, type Persona } from "@/components/demo-provider";
import { useAccessibility } from "@/components/accessibility-provider";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { BankIcon } from "@/components/bank-icon";
import { analyse, loadCreditModel, type Analysis, type CreditModel, type Profile } from "@/lib/credit-coach/engine";
import { actionCopy, FACTOR_TEXT, SEGMENT_TIPS, type ActionCopy } from "@/lib/credit-coach/copy";
import { DEMO_FILES, toProfile, type CreditFile } from "@/lib/credit-coach/profiles";

const BAND_COLOURS = ["#b3261e", "#c4581b", "#a77a0b", "#2f7d4f", "#00628f"];
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const segmentName = (name: string) => name.replace(/ \(\d+\)$/, "");

export function CreditCoach() {
  const demo = useDemo();
  const { settings } = useAccessibility();
  const simple = settings.language === "simple";
  const [model, setModel] = useState<CreditModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Partial<Record<Persona, CreditFile>>>({});

  useEffect(() => {
    let live = true;
    loadCreditModel().then(m => { if (live) setModel(m); }).catch(e => { if (live) setError(e instanceof Error ? e.message : "Could not load the model"); });
    return () => { live = false; };
  }, []);

  const file = edits[demo.persona] ?? DEMO_FILES[demo.persona];
  const profile = useMemo(() => toProfile(file, demo.balancePence / 100, demo.creditLimitPence / 100), [file, demo.balancePence, demo.creditLimitPence]);
  const result = useMemo(() => (model && !demo.loading && !demo.loadError ? analyse(model, profile) : null), [model, profile, demo.loading, demo.loadError]);

  return <main id="main" tabIndex={-1} className="bank-inner-page credit-coach">
    <header className="page-heading"><div><p className="eyebrow"><span className="eyebrow-rule"/> YOUR CREDIT SCORE</p><h1>Improve your <em>credit score.</em></h1><p className="page-intro">{simple ? "What is helping your score, what is holding it back, and what to do next." : "A personal plan, built by testing hundreds of what-if changes to your credit file with our score model."}</p></div><Link href="/simulator" className="outline-action">Repayment planner <BankIcon name="arrow-up-right" size={16}/></Link></header>
    <div className="demo-notice" role="note"><BankIcon name="info" size={16}/>An estimate from a model trained on {model ? model.metrics.profiles.toLocaleString("en-GB") : "120,000"} simulated credit files, on a 0 to 999 scale. It is not your real credit score and not financial advice.</div>
    {error ? <div className="ss-card" role="alert">{error}. <button className="text-link" type="button" onClick={() => { setError(null); loadCreditModel().then(setModel).catch(e => setError(String(e?.message ?? e))); }}>Try again</button></div>
      : demo.loadError ? <div className="ss-card" role="alert">{demo.loadError}</div>
      : !result || !model ? <div className="ss-card coach-loading" role="status"><span className="coach-spinner" aria-hidden="true"/>Checking your credit file and testing what would help most…</div>
      : <Results key={demo.persona} model={model} result={result} profile={profile} simple={simple} name={demo.displayName} file={file} sample={DEMO_FILES[demo.persona]}
          onSave={f => setEdits(e => ({ ...e, [demo.persona]: f }))} onReset={() => setEdits(e => { const n = { ...e }; delete n[demo.persona]; return n; })} edited={!!edits[demo.persona]}/>}
  </main>;
}

function Results({ model, result, profile, simple, name, file, sample, onSave, onReset, edited }: {
  model: CreditModel; result: Analysis; profile: Profile; simple: boolean; name: string; file: CreditFile; sample: CreditFile;
  onSave: (f: CreditFile) => void; onReset: () => void; edited: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const score = Math.round(result.score);
  const steps = result.actions.map(a => ({ ...a, copy: actionCopy(a.id, { p: profile, simple, utilTarget: a.utilTarget }) }));
  const shown = showAll ? steps : steps.slice(0, 3);
  const in12 = Math.round(result.projection[12].plan), now12 = Math.round(result.projection[12].now);
  const bandIn12 = model.bands.find(b => in12 <= b.max)?.name ?? "";
  const struggling = profile.missed_12m > 0 || profile.defaults > 0 || profile.payday_loan_12m === 1 || profile.ccj === 1;
  const seg = segmentName(result.segment.name);
  const summary = [
    `${name ? `${name}, your` : "Your"} estimated score is ${score} out of 999. That is ${result.band.name}.`,
    steps.length ? `The step that would help most is: ${steps[0].copy.title}.` : "You are already doing the things that matter most.",
    steps.length ? `If you follow your plan, your score could reach about ${in12} in a year, compared with ${now12} if nothing changes.` : "",
  ].filter(Boolean).join(" ");

  return <>
    <section className="coach-hero ss-card" aria-labelledby="score-heading">
      <ScoreGauge model={model} score={score}/>
      <div className="coach-hero-text">
        <p className="eyebrow on-light">YOUR ESTIMATED SCORE</p>
        <h2 id="score-heading"><span className="coach-score">{score}</span><span className="coach-outof"> / 999</span></h2>
        <p className="coach-band" style={{ color: BAND_COLOURS[result.band.index] }}><span className="coach-band-dot" style={{ background: BAND_COLOURS[result.band.index] }}/>{result.band.name}</p>
        {result.nextBand && <p className="readable-copy">{result.nextBand.min - score} points to reach <strong>{result.nextBand.name}</strong>{steps.length > 0 && in12 >= result.nextBand.min ? ". Your plan could get you there within a year." : "."}</p>}
        <div className="coach-segment"><BankIcon name="chart" size={16}/><div><span>People in a similar situation</span><strong>{seg}</strong><p>{SEGMENT_TIPS[seg] ?? ""}{simple ? "" : ` In our simulation, ${Math.round(result.segment.share * 100)}% of people are in this group; following every step added a median of ${result.segment.median_plan_gain_12m} points in a year.`}</p></div></div>
        <ReadAloudButton text={summary}/>
      </div>
    </section>

    <div className="tools-columns coach-columns">
      <section className="ss-card" aria-labelledby="plan-heading">
        <div className="panel-title-row"><div><p className="eyebrow on-light">YOUR PLAN, MOST HELPFUL FIRST</p><h2 id="plan-heading">{steps.length ? "What to do next" : "Keep doing what you're doing"}</h2></div><BankIcon name="trend"/></div>
        {steps.length === 0 && <p className="readable-copy mt-3">The model could not find a change that would add more than a few points. Your score is mostly about time now. Keep the habits below.</p>}
        <ol className="coach-steps">{shown.map((s, i) => <StepCard key={s.id} rank={i + 1} points={s.points} copy={s.copy} simple={simple}/>)}</ol>
        {steps.length > 3 && <button type="button" className="v2-button-alt mt-3" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? "Show fewer steps" : `Show ${steps.length - 3} more step${steps.length - 3 === 1 ? "" : "s"}`}</button>}
        <div className="coach-protect"><p className="eyebrow on-light">ALWAYS WORTH DOING</p><ul>
          <li><BankIcon name="check" size={15}/>Keep your oldest card open, even if you rarely use it. It holds your history.</li>
          <li><BankIcon name="check" size={15}/>Check your credit report for free with Experian, Equifax and TransUnion, and get mistakes fixed.</li>
          <li><BankIcon name="check" size={15}/>Never miss a payment: a Direct Debit for the minimum is a safety net.</li>
        </ul></div>
      </section>
      <div>
        <section className="ss-card" aria-labelledby="projection-heading">
          <p className="eyebrow on-light">THE NEXT TWO YEARS</p><h2 id="projection-heading">Where your score could go</h2>
          <Projection model={model} result={result}/>
          <p className="readable-copy mt-3">{steps.length ? `In 12 months: about ${in12} (${bandIn12}) if you follow your plan, or ${now12} if nothing changes.` : `In 12 months: about ${now12} if you carry on as you are.`}</p>
        </section>
        <section className="ss-card" aria-labelledby="factors-heading">
          <p className="eyebrow on-light">WHAT THE MODEL SEES</p><h2 id="factors-heading">Your score today</h2>
          <FactorList title="Holding you back" items={result.factors.holding} kind="holding" empty="Nothing major. Well done."/>
          <FactorList title="Helping you" items={result.factors.helping} kind="helping" empty="Your plan will start building these."/>
        </section>
        {struggling && <section className="ss-card coach-support" aria-labelledby="support-heading"><h2 id="support-heading">Finding things hard?</h2><p className="readable-copy mt-2">You don&apos;t have to sort this out alone. Free, independent debt advice is available from StepChange, National Debtline and MoneyHelper, and our team can help without a phone call.</p><Link href="/support" className="text-link mt-3">Get support <BankIcon name="arrow-right" size={15}/></Link></section>}
      </div>
    </div>

    <DetailsForm file={file} sample={sample} onSave={onSave} onReset={onReset} edited={edited}/>
    <details className="ss-card coach-method"><summary>How this works <BankIcon name="chevron-down" size={17}/></summary>
      <p>We generated {model.metrics.profiles.toLocaleString("en-GB")} simulated UK credit files across 14 types of situation (students, people new to the UK, people rebuilding after a default, retirees and more) and trained a gradient-boosted tree model to estimate scores from them. On files it had never seen, it was within {Math.round(model.metrics.test_mae)} points on average and put {Math.round(model.metrics.band_accuracy * 100)}% of people in the right band.</p>
      <p>To make your plan, the model scores your file as it would look in 12 months if you carry on as you are, and again for each change you could make. Steps are ranked by the points they add. In testing, the step it ranked first was the truly best step for {Math.round(model.metrics.top_action_matches_truth * 100)}% of people.</p>
      <p>Everything runs in your browser. Your details are not sent anywhere.</p>
    </details>
  </>;
}

function StepCard({ rank, points, copy, simple }: { rank: number; points: number; copy: ActionCopy; simple: boolean }) {
  return <li className="coach-step">
    <span className="coach-step-rank" aria-hidden="true">{rank}</span>
    <div className="coach-step-body">
      <div className="coach-step-head"><h3>{copy.title}</h3><span className="coach-points" aria-label={`about ${round5(points)} points`}>+{round5(points)} pts</span></div>
      <p className="coach-step-why">{copy.why}</p>
      <p className="coach-step-meta"><span><BankIcon name="clock" size={14}/>{copy.when}</span><span className={`coach-effort coach-effort-${copy.effort.replace(/\s/g, "-").toLowerCase()}`}>{copy.effort}</span></p>
      <details className="coach-how" open={rank === 1}><summary>{simple ? "How to do it" : "Steps to take"} <BankIcon name="chevron-down" size={15}/></summary><ul>{copy.steps.map(s => <li key={s}>{s}</li>)}</ul>
        {copy.link && (copy.link.external
          ? <a className="text-link" href={copy.link.href} target="_blank" rel="noopener noreferrer">{copy.link.label} <BankIcon name="arrow-up-right" size={14}/></a>
          : <Link className="text-link" href={copy.link.href}>{copy.link.label} <BankIcon name="arrow-right" size={14}/></Link>)}
      </details>
    </div>
  </li>;
}

function ScoreGauge({ model, score }: { model: CreditModel; score: number }) {
  const r = 80, cx = 100, cy = 100;
  const pt = (v: number) => { const a = Math.PI * (1 - v / 999); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
  const [nx, ny] = pt(score);
  return <svg className="coach-gauge" viewBox="0 0 200 115" role="img" aria-label={`Score ${score} out of 999`}>
    {model.bands.map((b, i) => <path key={b.name} d={arc(b.min + (i ? 2 : 0), b.max - 2)} stroke={BAND_COLOURS[i]} strokeWidth="14" fill="none" opacity={0.85}/>)}
    <circle cx={nx} cy={ny} r="9" fill="#fff" stroke="#172b3d" strokeWidth="3"/>
    <text x="20" y="113" fontSize="9" fill="currentColor" textAnchor="middle">0</text><text x="180" y="113" fontSize="9" fill="currentColor" textAnchor="middle">999</text>
  </svg>;
}

function Projection({ model, result }: { model: CreditModel; result: Analysis }) {
  const W = 320, H = 170, L = 34, R = 8, T = 10, B = 24;
  const pts = result.projection;
  const vals = pts.flatMap(p => [p.now, p.plan]);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 40) / 50) * 50), hi = Math.min(999, Math.ceil((Math.max(...vals) + 30) / 50) * 50);
  const x = (m: number) => L + (m / 24) * (W - L - R), y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const line = (k: "now" | "plan") => pts.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
  const label = `Line chart. Following your plan: ${Math.round(pts[0].plan)} now, ${Math.round(pts[6].plan)} in 6 months, ${Math.round(pts[12].plan)} in 12 months, ${Math.round(pts[24].plan)} in 24 months. If nothing changes: ${Math.round(pts[12].now)} in 12 months and ${Math.round(pts[24].now)} in 24 months.`;
  return <figure className="coach-projection">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {model.bands.filter(b => b.min > lo && b.min < hi).map(b => <g key={b.name}><line x1={L} x2={W - R} y1={y(b.min)} y2={y(b.min)} className="coach-gridline"/><text x={W - R} y={y(b.min) - 3} textAnchor="end" className="coach-axis">{b.name}</text></g>)}
      {[lo, hi].map(v => <text key={v} x={L - 5} y={y(v) + 3} textAnchor="end" className="coach-axis">{v}</text>)}
      {[0, 6, 12, 18, 24].map(m => <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="coach-axis">{m === 0 ? "Now" : `${m}m`}</text>)}
      <path d={line("now")} className="coach-line-now"/>
      <path d={line("plan")} className="coach-line-plan"/>
      <circle cx={x(12)} cy={y(pts[12].plan)} r="4" className="coach-dot-plan"/>
    </svg>
    <figcaption><span className="coach-key coach-key-plan"/>Following your plan <span className="coach-key coach-key-now"/>If nothing changes</figcaption>
  </figure>;
}

function FactorList({ title, items, kind, empty }: { title: string; items: { key: string; points: number }[]; kind: "holding" | "helping"; empty: string }) {
  const max = Math.max(1, ...items.map(i => i.points));
  return <div className="coach-factors"><h3>{title}</h3>{items.length === 0 ? <p className="readable-copy">{empty}</p> : <ul>{items.slice(0, 5).map(i => <li key={i.key}>
    <span>{FACTOR_TEXT[i.key]?.[kind] ?? i.key}</span>
    <span className={`coach-bar coach-bar-${kind}`} aria-hidden="true"><i style={{ width: `${Math.max(8, i.points / max * 100)}%` }}/></span>
    <strong>{kind === "holding" ? "−" : "+"}{round5(i.points)}</strong>
  </li>)}</ul>}</div>;
}

type FieldDef = { key: keyof CreditFile; label: string; kind: "number" | "yesno"; min?: number; max?: number; step?: number; hint?: string };
const FIELDS: FieldDef[] = [
  { key: "otherBalance", label: "Owed on other credit cards (£)", kind: "number", min: 0, max: 100000, step: 10 },
  { key: "otherLimit", label: "Total limit on other credit cards (£)", kind: "number", min: 0, max: 100000, step: 50 },
  { key: "oldest_account_months", label: "Age of your oldest credit account (months)", kind: "number", min: 0, max: 600 },
  { key: "num_accounts", label: "Open credit accounts, including this card", kind: "number", min: 0, max: 20 },
  { key: "missed_12m", label: "Missed payments in the last 12 months", kind: "number", min: 0, max: 6 },
  { key: "missed_older", label: "Missed payments 1 to 6 years ago", kind: "number", min: 0, max: 10 },
  { key: "months_since_missed", label: "Months since your last missed payment", kind: "number", min: 0, max: 72, hint: "72 if none in 6 years" },
  { key: "min_payment_months", label: "Months you paid only the minimum (last 12)", kind: "number", min: 0, max: 12 },
  { key: "hard_searches_12m", label: "Credit applications in the last 12 months", kind: "number", min: 0, max: 10 },
  { key: "new_accounts_6m", label: "New accounts opened in the last 6 months", kind: "number", min: 0, max: 5 },
  { key: "overdraft_months_12m", label: "Months you went over your overdraft limit (last 12)", kind: "number", min: 0, max: 12 },
  { key: "defaults", label: "Defaults on your file", kind: "number", min: 0, max: 3 },
  { key: "months_since_default", label: "Months since your latest default", kind: "number", min: 0, max: 72, hint: "72 if none" },
  { key: "address_moves_2y", label: "House moves in the last 2 years", kind: "number", min: 0, max: 5 },
  { key: "electoral_roll", label: "On the electoral roll at this address", kind: "yesno" },
  { key: "payday_loan_12m", label: "Used a payday loan in the last 12 months", kind: "yesno" },
  { key: "ccj", label: "A county court judgment (CCJ) on your file", kind: "yesno" },
  { key: "financial_association", label: "Share an account with someone with poor credit", kind: "yesno" },
  { key: "renting", label: "You rent your home", kind: "yesno" },
  { key: "rent_reported", label: "Your rent is reported to credit agencies", kind: "yesno" },
];

/** Keep linked answers consistent so the model never sees an impossible file. */
function tidy(f: CreditFile): CreditFile {
  const n = { ...f };
  const clamp = (k: keyof CreditFile, lo: number, hi: number) => { const v = Number(n[k]); n[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo; };
  for (const d of FIELDS) if (d.kind === "number" && d.key !== "otherBalance" && d.key !== "otherLimit") clamp(d.key, d.min ?? 0, d.max ?? 999);
  n.otherBalance = Math.max(0, Number(n.otherBalance) || 0); n.otherLimit = Math.max(0, Number(n.otherLimit) || 0);
  if (n.missed_12m > 0) n.months_since_missed = Math.min(n.months_since_missed, 11);
  else if (n.missed_older > 0) n.months_since_missed = Math.min(71, Math.max(12, n.months_since_missed));
  else n.months_since_missed = 72;
  if (n.defaults === 0) n.months_since_default = 72; else n.months_since_default = Math.min(71, n.months_since_default);
  if (!n.renting) n.rent_reported = 0;
  n.num_accounts = Math.max(1, n.num_accounts); // this SpendSense card counts
  n.new_accounts_6m = Math.min(n.new_accounts_6m, n.num_accounts);
  n.hard_searches_12m = Math.max(n.hard_searches_12m, n.new_accounts_6m);
  if (n.oldest_account_months < 1) n.oldest_account_months = 1;
  return n;
}

function DetailsForm({ file, sample, onSave, onReset, edited }: { file: CreditFile; sample: CreditFile; onSave: (f: CreditFile) => void; onReset: () => void; edited: boolean }) {
  const [draft, setDraft] = useState<CreditFile>(file);
  const [note, setNote] = useState("");
  return <details className="ss-card coach-form">
    <summary>Is this right? Update your details <BankIcon name="chevron-down" size={17}/></summary>
    <p className="readable-copy">Change anything that doesn&apos;t match your situation and your plan updates straight away. Your SpendSense card balance comes from your account.</p>
    <form onSubmit={e => { e.preventDefault(); const t = tidy(draft); setDraft(t); onSave(t); setNote("Updated. Your score and plan above now use these details."); }}>
      <div className="coach-form-grid">{FIELDS.map(d => <label key={d.key} className="coach-field">
        <span>{d.label}{d.hint && <small> ({d.hint})</small>}</span>
        {d.kind === "yesno"
          ? <select value={draft[d.key] ? "1" : "0"} onChange={e => setDraft({ ...draft, [d.key]: Number(e.target.value) })}><option value="1">Yes</option><option value="0">No</option></select>
          : <input type="number" inputMode="numeric" min={d.min} max={d.max} step={d.step ?? 1} value={draft[d.key]} onChange={e => setDraft({ ...draft, [d.key]: e.target.value === "" ? 0 : Number(e.target.value) })}/>}
      </label>)}</div>
      <div className="mt-4 flex flex-wrap gap-3"><button className="v2-button">Update my plan <BankIcon name="arrow-right" size={15}/></button>
        {edited && <button type="button" className="v2-button-alt" onClick={() => { onReset(); setDraft(sample); setNote("Back to the sample details."); }}><BankIcon name="reset" size={15}/>Use sample details</button>}</div>
      <p className="sr-only" role="status">{note}</p>{note && <p className="text-sm text-muted mt-3" aria-hidden="true">{note}</p>}
    </form>
  </details>;
}
