/**
 * Credit score coach: runs the gradient-boosted model trained in ml/credit-score-model
 * entirely in the browser, and turns its what-if answers into ranked, plain-English steps.
 *
 * `planProfile` and `applicable` are ports of ml/credit-score-model/world.py and must stay
 * in step with it. `npm run test:credit-coach` checks this file against Python's numbers.
 */

export const FEATURES = [
  "utilisation", "total_limit", "min_payment_months", "missed_12m", "missed_older",
  "months_since_missed", "defaults", "months_since_default", "ccj", "oldest_account_months",
  "num_accounts", "new_accounts_6m", "hard_searches_12m", "electoral_roll", "payday_loan_12m",
  "overdraft_months_12m", "financial_association", "rent_reported", "address_moves_2y",
] as const;
export type Feature = (typeof FEATURES)[number];
export type Profile = Record<Feature, number> & { renting: number };

export const ACTIONS = [
  "lower_utilisation", "electoral_roll", "pause_applications", "on_time_payments",
  "more_than_minimum", "avoid_payday", "overdraft", "rent_reporting", "dissociate", "build_history",
] as const;
export type ActionId = (typeof ACTIONS)[number];

type Tree = { f: number[]; v: number[]; l: number[]; r: number[] };
export type SegmentInfo = {
  id: number; name: string; share: number; median_score: number;
  typical_top_actions: Record<string, number>; median_plan_gain_12m: number;
};
export type CreditModel = {
  version: number;
  features: string[];
  bands: { min: number; max: number; name: string }[];
  model: { base: number; trees: Tree[] };
  segments: {
    scaler_mean: number[]; scaler_scale: number[]; log_features: string[];
    centroids: number[][]; info: SegmentInfo[];
  };
  metrics: { profiles: number; test_mae: number; test_r2: number; band_accuracy: number; top_action_matches_truth: number };
};

export function predict(model: CreditModel, p: Profile): number {
  const x = model.features.map(f => p[f as Feature]);
  let s = model.model.base;
  for (const t of model.model.trees) {
    let k = 0;
    while (t.f[k] !== -1) k = x[t.f[k]] <= t.v[k] ? t.l[k] : t.r[k];
    s += t.v[k];
  }
  return Math.min(999, Math.max(0, s));
}

export function bandOf(model: CreditModel, score: number) {
  const s = Math.round(score);
  const i = model.bands.findIndex(b => s <= b.max);
  return { ...model.bands[i < 0 ? model.bands.length - 1 : i], index: i < 0 ? model.bands.length - 1 : i };
}

export function applicable(p: Profile, a: ActionId): boolean {
  switch (a) {
    case "lower_utilisation": return p.total_limit > 0 && p.utilisation > 0.2;
    case "electoral_roll": return p.electoral_roll === 0;
    case "pause_applications": return p.hard_searches_12m > 0 || p.new_accounts_6m > 0;
    case "on_time_payments": return p.missed_12m > 0;
    case "more_than_minimum": return p.min_payment_months >= 3;
    case "avoid_payday": return p.payday_loan_12m === 1;
    case "overdraft": return p.overdraft_months_12m > 0;
    case "rent_reporting": return p.rent_reported === 0 && p.renting === 1;
    case "dissociate": return p.financial_association === 1;
    case "build_history": return p.num_accounts <= 2 || p.total_limit === 0;
  }
}

// Python's round() is round-half-to-even; match it so the port gives identical profiles.
function pyRound(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

/** The profile `months` from now if the person keeps their habits, except those in `actions`. */
export function planProfile(p: Profile, months: number, actions: Set<ActionId>, utilTarget = 0.09): Profile {
  const q: Profile = { ...p };
  const t = months;
  q.oldest_account_months = p.oldest_account_months + t;
  if (p.defaults > 0) {
    const msd = p.months_since_default + t;
    if (msd >= 72) { q.defaults = 0; q.months_since_default = 72; } else q.months_since_default = msd;
  }
  if (actions.has("on_time_payments") && p.missed_12m > 0) {
    q.missed_12m = pyRound(p.missed_12m * Math.max(0, 12 - t) / 12);
    q.missed_older = p.missed_older + (p.missed_12m - q.missed_12m);
    q.months_since_missed = Math.min(71, p.months_since_missed + t);
  } else if (p.missed_12m === 0 && p.missed_older > 0) {
    const msm = p.months_since_missed + t;
    if (msm >= 72) { q.missed_older = 0; q.months_since_missed = 72; } else q.months_since_missed = msm;
  }
  if (actions.has("lower_utilisation") && p.utilisation > utilTarget) {
    const frac = Math.min(1, t / 2);
    q.utilisation = p.utilisation + (utilTarget - p.utilisation) * frac;
  }
  if (actions.has("pause_applications")) {
    q.hard_searches_12m = pyRound(p.hard_searches_12m * Math.max(0, 12 - t) / 12);
    q.new_accounts_6m = pyRound(p.new_accounts_6m * Math.max(0, 6 - t) / 6);
  }
  if (actions.has("more_than_minimum")) q.min_payment_months = pyRound(p.min_payment_months * Math.max(0, 12 - t) / 12);
  if (actions.has("overdraft")) q.overdraft_months_12m = pyRound(p.overdraft_months_12m * Math.max(0, 12 - t) / 12);
  if (actions.has("avoid_payday") && t >= 12) q.payday_loan_12m = 0;
  if (actions.has("electoral_roll") && t >= 1) q.electoral_roll = 1;
  if (actions.has("rent_reporting") && t >= 2) q.rent_reported = 1;
  if (actions.has("dissociate") && t >= 2) q.financial_association = 0;
  if (actions.has("build_history") && t >= 1) {
    q.num_accounts = p.num_accounts + 1;
    if (p.total_limit === 0) q.utilisation = 0.1;
    else q.utilisation = Math.min(q.utilisation, (p.utilisation * p.total_limit + 50) / (p.total_limit + 500));
    q.total_limit = p.total_limit + 500;
    q.new_accounts_6m = q.new_accounts_6m + (t <= 6 ? 1 : 0);
    q.hard_searches_12m = q.hard_searches_12m + (t <= 12 ? 1 : 0);
    if (p.num_accounts === 0) q.oldest_account_months = t;
  }
  return q;
}

export const HORIZON = 12;

/** Points each applicable action adds after `HORIZON` months, versus carrying on as now. */
export function actionGains(model: CreditModel, p: Profile, utilTarget = 0.09): Partial<Record<ActionId, number>> {
  const base = predict(model, planProfile(p, HORIZON, new Set()));
  const out: Partial<Record<ActionId, number>> = {};
  for (const a of ACTIONS) if (applicable(p, a)) out[a] = predict(model, planProfile(p, HORIZON, new Set([a]), utilTarget)) - base;
  return out;
}

/**
 * The model-chosen utilisation target: the highest level (smallest pay-down) that still
 * gets at least 85% of the benefit of going all the way down to 5%.
 */
export function bestUtilisationTarget(model: CreditModel, p: Profile): number {
  const options = [0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05].filter(t => t < p.utilisation - 0.02);
  if (!options.length) return p.utilisation;
  const gain = (t: number) => predict(model, { ...p, utilisation: t }) - predict(model, p);
  const full = gain(0.05);
  return options.find(t => gain(t) >= 0.85 * full) ?? 0.05;
}

export function segmentOf(model: CreditModel, p: Profile): SegmentInfo {
  const s = model.segments;
  const z = model.features.map((f, i) => {
    const raw = p[f as Feature];
    const v = s.log_features.includes(f) ? Math.log1p(raw) : raw;
    return (v - s.scaler_mean[i]) / s.scaler_scale[i];
  });
  let best = 0, bestD = Infinity;
  s.centroids.forEach((c, k) => {
    const d = c.reduce((acc, v, i) => acc + (v - z[i]) ** 2, 0);
    if (d < bestD) { bestD = d; best = k; }
  });
  return s.info.find(i => i.id === best) ?? s.info[0];
}

/** Effect of each factor today: points gained by fixing it (holding back) or lost without it (helping). */
export type Factor = { key: string; points: number };
export function factors(model: CreditModel, p: Profile): { holding: Factor[]; helping: Factor[] } {
  const now = predict(model, p);
  const fixes: [string, Partial<Profile> | null][] = [
    ["utilisation", p.total_limit > 0 && p.utilisation > 0.15 ? { utilisation: 0.08 } : null],
    ["missed_recent", p.missed_12m > 0 ? { missed_12m: 0, missed_older: 0, months_since_missed: 72 } : null],
    ["missed_older", p.missed_12m === 0 && p.missed_older > 0 ? { missed_older: 0, months_since_missed: 72 } : null],
    ["defaults", p.defaults > 0 ? { defaults: 0, months_since_default: 72 } : null],
    ["ccj", p.ccj ? { ccj: 0 } : null],
    ["searches", p.hard_searches_12m > 0 || p.new_accounts_6m > 0 ? { hard_searches_12m: 0, new_accounts_6m: 0 } : null],
    ["electoral_roll", p.electoral_roll ? null : { electoral_roll: 1 }],
    ["payday", p.payday_loan_12m ? { payday_loan_12m: 0 } : null],
    ["overdraft", p.overdraft_months_12m ? { overdraft_months_12m: 0 } : null],
    ["min_payments", p.min_payment_months ? { min_payment_months: 0 } : null],
    ["financial_association", p.financial_association ? { financial_association: 0 } : null],
    ["short_history", p.oldest_account_months < 72 ? { oldest_account_months: 120, num_accounts: Math.max(3, p.num_accounts) } : null],
    ["address_moves", p.address_moves_2y ? { address_moves_2y: 0 } : null],
  ];
  const holding = fixes.filter(([, f]) => f).map(([key, f]) => ({ key, points: predict(model, { ...p, ...f }) - now }))
    .filter(f => f.points >= 6).sort((a, b) => b.points - a.points);
  const keeps: [string, Partial<Profile> | null][] = [
    ["no_missed", p.missed_12m === 0 && p.missed_older === 0 && p.num_accounts > 0 ? { missed_12m: 1, months_since_missed: 3 } : null],
    ["low_utilisation", p.total_limit > 0 && p.utilisation <= 0.3 ? { utilisation: 0.7 } : null],
    ["electoral_roll", p.electoral_roll ? { electoral_roll: 0 } : null],
    ["long_history", p.oldest_account_months >= 60 ? { oldest_account_months: 12 } : null],
    ["no_searches", p.hard_searches_12m === 0 && p.num_accounts > 0 ? { hard_searches_12m: 3 } : null],
    ["rent_reported", p.rent_reported ? { rent_reported: 0 } : null],
    ["clean_record", p.defaults === 0 && p.ccj === 0 && p.num_accounts > 0 ? { defaults: 1, months_since_default: 12 } : null],
  ];
  const helping = keeps.filter(([, f]) => f).map(([key, f]) => ({ key, points: now - predict(model, { ...p, ...f }) }))
    .filter(f => f.points >= 6).sort((a, b) => b.points - a.points);
  return { holding, helping };
}

export type RankedAction = { id: ActionId; points: number; utilTarget?: number };
export type Analysis = {
  score: number;
  band: ReturnType<typeof bandOf>;
  nextBand: { name: string; min: number } | null;
  segment: SegmentInfo;
  actions: RankedAction[];
  factors: ReturnType<typeof factors>;
  projection: { month: number; now: number; plan: number }[];
  planGain12: number;
};

/** The whole analysis the page shows: score, ranked steps and a 24-month projection. */
export function analyse(model: CreditModel, p: Profile): Analysis {
  const score = predict(model, p);
  const band = bandOf(model, score);
  const next = model.bands[band.index + 1];
  const utilTarget = bestUtilisationTarget(model, p);
  const gains = actionGains(model, p, utilTarget);
  const actions = (Object.entries(gains) as [ActionId, number][])
    .filter(([, g]) => g >= 3)
    .map(([id, points]) => ({ id, points, ...(id === "lower_utilisation" ? { utilTarget } : {}) }))
    .sort((a, b) => b.points - a.points);
  const plan = new Set(actions.map(a => a.id));
  const projection = Array.from({ length: 25 }, (_, month) => ({
    month,
    now: predict(model, planProfile(p, month, new Set())),
    plan: predict(model, planProfile(p, month, plan, utilTarget)),
  }));
  return {
    score, band, nextBand: next ? { name: next.name, min: next.min } : null,
    segment: segmentOf(model, p), actions, factors: factors(model, p), projection,
    planGain12: projection[12].plan - projection[12].now,
  };
}

let cached: Promise<CreditModel> | null = null;
export function loadCreditModel(): Promise<CreditModel> {
  cached ??= fetch("/credit-coach/model.json").then(r => {
    if (!r.ok) throw new Error(`Model download failed (${r.status})`);
    return r.json() as Promise<CreditModel>;
  }).catch(e => { cached = null; throw e; });
  return cached;
}
