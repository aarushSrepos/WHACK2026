/** Self-contained, local-only demo ledger. No bank data or money movement. */
import type {
  ActionRequest, ActionType, ApiPersona, ApiTransaction, AskResponse,
  ConfirmResponse, Format, MeResponse, ProposedAction, SpendResponse,
} from "./api";

const KEY = "spendsense-demo-ledger-v3";
type Ledger = {
  balance: number; creditLimit: number; monthlyLimit: number | null;
  spent: number; paused: boolean; due: string; transactions: ApiTransaction[];
};
const names: Record<ApiPersona, string> = { priya: "Priya", sam: "Sam", amara: "Amara", alex: "Alex" };
const initialBalance: Record<ApiPersona, number> = { priya: 128475, sam: 85000, amara: 97560, alex: 64230 };
const initialLimit: Record<ApiPersona, number | null> = { priya: 40000, sam: null, amara: 55000, alex: null };
const amounts = [4200, 1875, 6200, 850, 3499, 1299, 1475, 2940, 7800];
const merchants = ["UNKNOWN ONLINE STORE", "Sainsbury's", "Trainline", "Pret A Manger", "Spotify", "Tesco Express", "Waterstones", "Amazon Marketplace", "Marks & Spencer"];
const offset = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function seed(persona: ApiPersona): Ledger {
  return {
    balance: initialBalance[persona], creditLimit: 400000, monthlyLimit: initialLimit[persona],
    spent: { priya: 28000, sam: 21850, amara: 36000, alex: 19400 }[persona],
    paused: false, due: offset(12),
    transactions: merchants.map((merchant, i) => ({
      id: i === 0 ? "tx_042" : `tx_${100 + i}`,
      merchant, amount_pence: amounts[i], date: offset(-i - 1),
      status: i === 2 ? "pending" : "posted",
    })),
  };
}
function all(): Record<string, Ledger> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, Ledger>; }
  catch { return {}; }
}
function get(persona: ApiPersona): Ledger { return all()[persona] ?? seed(persona); }
function save(persona: ApiPersona, ledger: Ledger) {
  const records = all(); records[persona] = ledger;
  localStorage.setItem(KEY, JSON.stringify(records));
}
function money(pence: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100); }
const proposals = new Map<string, { persona: ApiPersona; request: ActionRequest; readBack: string }>();

export const mockBank = {
  async me(persona: ApiPersona): Promise<MeResponse> {
    const l = get(persona);
    const min = l.balance === 0 ? 0 : Math.min(l.balance, 3500);
    return {
      persona, display_name: names[persona], label: "Illustrative account · demo data",
      account: {
        balance_pence: l.balance, credit_limit_pence: l.creditLimit,
        available_credit_pence: Math.max(0, l.creditLimit - l.balance),
        utilisation_percent: Math.round(l.balance / l.creditLimit * 1000) / 10,
        apr_basis_points: 2490, minimum_payment_pence: min, due_date: l.due,
        interest_estimate_pence: Math.round(l.balance * 0.0188),
        card_paused_until: l.paused ? "demo-paused" : null,
      },
      spending: {
        monthly_limit_pence: l.monthlyLimit, spent_this_month_pence: l.spent,
        percent_used: l.monthlyLimit ? Math.round(l.spent / l.monthlyLimit * 1000) / 10 : null,
      },
    };
  },
  async transactions(persona: ApiPersona): Promise<{ transactions: ApiTransaction[] }> {
    return { transactions: get(persona).transactions };
  },
  async ask(persona: ApiPersona, question: string, format: Format): Promise<AskResponse> {
    const l = get(persona);
    const q = question.toLowerCase();
    let answer: string;
    if (/minimum|smallest/.test(q)) answer = format === "simple"
      ? `Your minimum payment is ${money(Math.min(3500, l.balance))}. Paying more can reduce future interest.`
      : `The minimum due is ${money(Math.min(3500, l.balance))}. Paying only the minimum can increase total borrowing costs. Compare different amounts in the repayment planner.`;
    else if (/due|when|date/.test(q)) answer = `Your next payment is due on ${new Date(l.due + "T12:00:00").toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric"})}. This is a sample date.`;
    else if (/unknown|recognise|unfamiliar/.test(q)) answer = "You can review the transaction details in your statement. For help with a real card, contact your bank using its official website or app. This demo cannot take action on real transactions.";
    else if (/limit|pause|spend/.test(q)) answer = l.monthlyLimit
      ? `Your personal monthly limit is ${money(l.monthlyLimit)}. You have used ${money(l.spent)}. You can change the limit in Spending controls.`
      : "You haven't set a personal monthly limit. You can create one from Spending controls.";
    else if (/higher|increase|why|statement|balance|owe|interest/.test(q)) answer = format === "simple"
      ? `Your current balance is ${money(l.balance)}. Purchases increase what you owe. Payments reduce it. Your full transaction list is below.`
      : `Your statement shows a balance of ${money(l.balance)} against a credit limit of ${money(l.creditLimit)}. Recent purchases and any interest affect the amount owed. This demo does not include a previous statement, so it cannot verify a month-on-month change.`;
    else answer = `Your current sample balance is ${money(l.balance)} and your minimum payment is ${money(Math.min(3500, l.balance))}. Try asking about your due date, a charge, repayments or spending limits.`;
    return {
      answer, format, figures: [{ id: "balance", label: "Current balance", display: money(l.balance) }, { id: "minimum", label: "Minimum payment", display: money(Math.min(3500, l.balance)) }],
      verified: true, badge: "Based on sample account figures · rule-based demo", proposed_action: null,
    };
  },
  async propose(persona: ApiPersona, request: ActionRequest): Promise<ProposedAction> {
    const l = get(persona);
    let readBack = "";
    if (request.type === "pay") {
      if (!request.amount_pence || !Number.isInteger(request.amount_pence) || request.amount_pence < 1 || request.amount_pence > l.balance) throw Error("Choose an amount up to your remaining balance.");
      readBack = `You are about to simulate a payment of ${money(request.amount_pence)}. No money will leave your account.`;
    } else if (request.type === "pause_card") readBack = "Pause this sample card. This does not affect any real card.";
    else if (request.type === "unpause_card") readBack = "Resume this sample card. This does not affect any real card.";
    else throw Error("This action is not supported.");
    const action_id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    proposals.set(action_id, { persona, request, readBack });
    return { action_id, type: request.type, read_back: readBack };
  },
  async confirm(persona: ApiPersona, id: string): Promise<ConfirmResponse> {
    const proposal = proposals.get(id);
    if (!proposal || proposal.persona !== persona) throw Error("This action has expired. Please review it again.");
    proposals.delete(id);
    const l = get(persona), request = proposal.request;
    let summary = "";
    if (request.type === "pay") {
      l.balance = Math.max(0, l.balance - (request.amount_pence || 0));
      summary = `Sample payment of ${money(request.amount_pence || 0)} recorded.`;
    } else if (request.type === "pause_card") {
      l.paused = true; summary = "Sample card paused.";
    } else { l.paused = false; summary = "Sample card resumed."; }
    save(persona, l);
    return { action_id: id, type: request.type as ActionType, status: "done", summary, reference: `DEMO-${id.slice(-6).toUpperCase()}`, simulated: true };
  },
  async setLimit(persona: ApiPersona, pence: number): Promise<MeResponse> {
    const l = get(persona);
    if (!Number.isInteger(pence) || pence < 100 || pence > l.creditLimit) throw Error(`Choose a limit between £1 and ${money(l.creditLimit)}.`);
    l.monthlyLimit = pence; save(persona, l); return this.me(persona);
  },
  async spend(persona: ApiPersona, merchant: string, pence: number): Promise<SpendResponse> {
    const l = get(persona);
    if (pence <= 0 || l.paused || l.balance + pence > l.creditLimit) throw Error("Demo purchase couldn't be completed. Check your available credit or card status.");
    const before = l.monthlyLimit ? l.spent / l.monthlyLimit * 100 : 0;
    l.spent += pence; l.balance += pence;
    l.transactions.unshift({ id: `demo-tx-${Date.now()}`, merchant, amount_pence: pence, date: offset(0), status: "posted" });
    save(persona, l);
    const now = l.monthlyLimit ? l.spent / l.monthlyLimit * 100 : 0;
    return { spending: { monthly_limit_pence: l.monthlyLimit, spent_this_month_pence: l.spent, percent_used: l.monthlyLimit ? Math.round(now * 10) / 10 : null },
      threshold_crossed: before < 80 && now >= 80 ? 80 : before < 100 && now >= 100 ? 100 : null,
      message: "Sample purchase added to your account." };
  },
  async reset(persona: ApiPersona): Promise<{ok: boolean; message: string}> {
    const records = all(); delete records[persona]; localStorage.setItem(KEY, JSON.stringify(records));
    proposals.clear(); return {ok:true,message:"Sample data restored."};
  },
};
