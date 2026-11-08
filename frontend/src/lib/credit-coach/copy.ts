import type { ActionId, Profile } from "./engine";

const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export type Effort = "Quick task" | "Habit" | "Takes money" | "Wait it out";
export type ActionCopy = {
  title: string;
  why: string;
  steps: string[];
  when: string;
  effort: Effort;
  link?: { href: string; label: string; external?: boolean };
};

type Ctx = { p: Profile; simple: boolean; utilTarget?: number };

export function actionCopy(id: ActionId, { p, simple, utilTarget = 0.09 }: Ctx): ActionCopy {
  switch (id) {
    case "lower_utilisation": {
      const owed = p.utilisation * p.total_limit;
      const pay = Math.max(0, owed - utilTarget * p.total_limit);
      return {
        title: simple ? `Pay ${gbp(pay)} off your cards` : `Bring card use down from ${pct(p.utilisation)} to about ${pct(utilTarget)} of your limits`,
        why: simple
          ? `You are using ${pct(p.utilisation)} of the credit you have. Using less tells lenders you are not relying on it.`
          : `You owe about ${gbp(owed)} across ${gbp(p.total_limit)} of card limits (${pct(p.utilisation)}). The model found most of the benefit comes by about ${pct(utilTarget)}: paying around ${gbp(pay)} gets you there. Going lower adds little.`,
        steps: [
          "Pay more than the minimum each month, starting with the card with the highest interest rate.",
          "Pay a few days before your statement date, because that is when the balance is reported.",
          "Keep the cards open after you clear them. Closing them lowers your total limit.",
        ],
        when: "Shows within 1 to 2 months",
        effort: "Takes money",
        link: { href: "/simulator", label: "Plan your repayments" },
      };
    }
    case "electoral_roll":
      return {
        title: "Register to vote at your address",
        why: simple
          ? "Lenders use the electoral roll to check who you are and where you live. It is free and quick."
          : "Lenders confirm your identity and address against the electoral roll. Not being on it is one of the biggest single drags the model sees, especially on a short credit history.",
        steps: [
          "Register online at gov.uk/register-to-vote. It takes about 5 minutes.",
          "You will need your National Insurance number.",
          "If you can't register (for example you are not eligible to vote), add a note to your credit file with proof of address instead.",
        ],
        when: "Shows within about 1 month",
        effort: "Quick task",
        link: { href: "https://www.gov.uk/register-to-vote", label: "Register to vote (GOV.UK)", external: true },
      };
    case "pause_applications":
      return {
        title: "Pause new credit applications",
        why: simple
          ? `You have applied for credit ${p.hard_searches_12m} time${p.hard_searches_12m === 1 ? "" : "s"} this year. Each one leaves a mark that lowers your score for a while.`
          : `${p.hard_searches_12m} hard search${p.hard_searches_12m === 1 ? "" : "es"} in 12 months${p.new_accounts_6m ? ` and ${p.new_accounts_6m} new account${p.new_accounts_6m === 1 ? "" : "s"} in 6 months` : ""}. Searches stay visible for 12 months${p.oldest_account_months < 36 ? " and cost more when your history is short, as yours is" : ""}.`,
        steps: [
          "Hold off applying for new cards, loans or phone contracts for now.",
          "If you need credit, use an eligibility checker first. It uses a soft search that lenders can't see.",
          "Space applications at least 3 months apart.",
        ],
        when: "Improves month by month, fully after 12 months",
        effort: "Wait it out",
      };
    case "on_time_payments":
      return {
        title: "Make every payment on time from now on",
        why: simple
          ? "A missed payment is the thing that hurts a score most. Each on-time month helps it fade."
          : `You have ${p.missed_12m} missed payment${p.missed_12m === 1 ? "" : "s"} in the last year. Missed payments weigh most when recent, so a clean run of on-time payments is worth a lot.`,
        steps: [
          "Set up a Direct Debit for at least the minimum payment on every card and loan.",
          "Move your payment date to just after payday if it helps. Most lenders allow this.",
          "If you can't pay, tell the lender before the due date. Missing quietly is worse.",
        ],
        when: "Builds every month, biggest change after 12 months",
        effort: "Habit",
        link: { href: "/payment", label: "Make a payment" },
      };
    case "more_than_minimum":
      return {
        title: "Pay more than the minimum",
        why: simple
          ? `You paid only the minimum in ${p.min_payment_months} of the last 12 months. Lenders can see this.`
          : `Minimum-only payments in ${p.min_payment_months} of 12 months. Credit files now show payment amounts, not just whether you paid, and it also costs you interest.`,
        steps: [
          "Add even £10 to £20 above the minimum each month.",
          "Use the repayment planner to see how much interest that saves.",
        ],
        when: "Improves over 12 months",
        effort: "Takes money",
        link: { href: "/simulator", label: "See the interest you'd save" },
      };
    case "avoid_payday":
      return {
        title: "Step away from payday loans",
        why: simple
          ? "Payday loans make many lenders more cautious, even if you paid them back."
          : "Short-term, high-cost loans in the last 12 months lower your score and make mainstream lenders more cautious, even when repaid on time.",
        steps: [
          "Speak to a free debt adviser before borrowing again: StepChange, National Debtline or MoneyHelper.",
          "Ask your bank about an arranged overdraft or a credit union loan instead.",
          "A small emergency fund, even £5 a week, can stop the cycle.",
        ],
        when: "Drops off after 12 months",
        effort: "Wait it out",
        link: { href: "/support", label: "Get support" },
      };
    case "overdraft":
      return {
        title: "Stay inside your arranged overdraft",
        why: simple
          ? "Going over your overdraft limit shows up on your credit file."
          : `You went over an arranged overdraft (or into an unarranged one) in ${p.overdraft_months_12m} of the last 12 months.`,
        steps: [
          "Turn on low-balance alerts in your banking app.",
          "Ask your bank about moving your overdraft limit or direct debit dates.",
          "Set a monthly spending limit in SpendSense.",
        ],
        when: "Improves over 12 months",
        effort: "Habit",
        link: { href: "/limit", label: "Set a spending limit" },
      };
    case "rent_reporting":
      return {
        title: "Get your rent added to your credit file",
        why: simple
          ? "Paying rent on time can count towards your score, but only if it is reported."
          : "Rent you already pay on time can be shared with the credit reference agencies. It helps most when your credit history is short.",
        steps: [
          "Ask your landlord or letting agent if they report rent payments.",
          "If not, look for a free rent reporting scheme that links to your bank account.",
        ],
        when: "Shows within about 2 months",
        effort: "Quick task",
      };
    case "dissociate":
      return {
        title: "Remove an old financial link, if it's over",
        why: simple
          ? "You are linked to someone whose credit is poor, through a joint account or loan."
          : "A financial association (for example a joint account) means lenders may look at the other person's file too.",
        steps: [
          "Only if you no longer share money: close or move any joint accounts.",
          "Then ask each credit reference agency (Experian, Equifax, TransUnion) for a 'notice of disassociation'. It is free.",
        ],
        when: "Shows within about 2 months",
        effort: "Quick task",
      };
    case "build_history":
      return {
        title: "Build a track record, carefully",
        why: simple
          ? "Your credit file is short, so lenders have little to go on."
          : "A thin file holds your score back. One small card, used lightly and paid in full, builds history. The model expects a small dip from the application first.",
        steps: [
          "Only do this if you can pay the card off in full every month.",
          "Use an eligibility checker first and apply for one credit-builder card.",
          "Put one small regular bill on it and set a Direct Debit to pay the full balance.",
        ],
        when: "Small dip at first, then improves over 12 months",
        effort: "Habit",
      };
  }
}

export const FACTOR_TEXT: Record<string, { holding?: string; helping?: string }> = {
  utilisation: { holding: "Using a high share of your credit limits" },
  missed_recent: { holding: "Missed payments in the last year" },
  missed_older: { holding: "Older missed payments (these fade over time)" },
  defaults: { holding: "A default on your file (it drops off after 6 years)" },
  ccj: { holding: "A county court judgment on your file" },
  searches: { holding: "Recent credit applications" },
  electoral_roll: { holding: "Not on the electoral roll", helping: "On the electoral roll at your address" },
  payday: { holding: "A payday loan this year" },
  overdraft: { holding: "Going past your overdraft limit" },
  min_payments: { holding: "Often paying only the minimum" },
  financial_association: { holding: "Linked to someone with poor credit" },
  short_history: { holding: "A short credit history" },
  address_moves: { holding: "Moving house recently" },
  no_missed: { helping: "No missed payments" },
  low_utilisation: { helping: "Using little of your available credit" },
  long_history: { helping: "A long credit history" },
  no_searches: { helping: "No recent credit applications" },
  rent_reported: { helping: "Rent payments on your file" },
  clean_record: { helping: "No defaults or court judgments" },
};

export const SEGMENT_TIPS: Record<string, string> = {
  "Rebuilding after a county court judgment": "Steady, on-time payments matter most. The judgment fades, and is removed after 6 years.",
  "Rebuilding after a default": "Steady, on-time payments matter most while the default fades. It drops off after 6 years.",
  "Juggling several credit problems": "Start with one thing: never missing a payment. Free debt advice can help you make a plan.",
  "Caught in short-term borrowing": "Breaking the borrowing cycle and lowering card balances help most.",
  "Linked to someone else's credit": "Your own habits matter most, and old links can be removed.",
  "Brand new to credit": "Getting on the electoral roll and building a small, careful history help most.",
  "Building a first track record": "Patience pays: time, the electoral roll and few applications help most.",
  "Renting and building steadily": "Keep doing what you're doing; lower card use adds the most.",
  "Cards close to the limit": "Lowering card balances is the fastest win for most people like you.",
  "Long, steady history": "You're in good shape. Mostly, protect what you have.",
  "Steady, with room to grow": "A few small changes add up over a year.",
};
