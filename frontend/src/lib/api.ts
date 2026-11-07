// SpendSense API client. Types mirror backend/app/schemas.py (the API contract).
// Money is stored in whole pence. Local demo mode is the default; set NEXT_PUBLIC_API_URL to use a compatible backend.
import { mockBank } from "./mock-bank";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const DEMO_MODE = !API_BASE_URL;

export type ApiPersona = "priya" | "sam" | "amara" | "alex";
export type ActionType = "pay" | "pause_card" | "unpause_card";
export type Format = "simple" | "detailed";

export type ApiAccount = {
  credit_limit_pence: number;
  balance_pence: number;
  available_credit_pence: number;
  utilisation_percent: number;
  apr_basis_points: number;
  minimum_payment_pence: number;
  due_date: string; // "2026-11-12"
  interest_estimate_pence: number;
  card_paused_until: string | null;
};
export type ApiSpending = {
  monthly_limit_pence: number | null;
  spent_this_month_pence: number;
  percent_used: number | null;
};
export type MeResponse = {
  persona: ApiPersona;
  display_name: string;
  account: ApiAccount;
  spending: ApiSpending;
  label: string;
};
export type ApiTransaction = {
  id: string;
  merchant: string;
  amount_pence: number;
  date: string;
  status: "posted" | "pending" | "disputed";
};
export type Figure = { id: string; label: string; kind?: string | null; display?: string | null };
export type ProposedAction = { action_id: string; type: ActionType; read_back: string };
export type AskResponse = {
  answer: string;
  format: Format;
  figures: Figure[];
  verified: boolean;
  badge: string;
  proposed_action: ProposedAction | null;
  /** True when the customer seems to be struggling: offer to put them in touch with a person. */
  support_offer?: boolean;
};
export type ConfirmResponse = {
  action_id: string;
  type: ActionType;
  status: "done";
  summary: string;
  reference: string | null;
  simulated: boolean;
};
export type ActionRequest = {
  type: ActionType;
  amount_pence?: number;
};
export type SpendResponse = {
  spending: ApiSpending;
  threshold_crossed: 80 | 100 | null;
  message: string | null;
};

/** An error with a message that is safe to show the customer. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, persona: ApiPersona, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "X-Persona": persona, ...options.headers },
    });
  } catch {
    throw new ApiError("We cannot reach the SpendSense server. Please check that it is running and try again.", 0);
  }
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (response.status === 422) message = "Please check what you entered and try again.";
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: (p: ApiPersona) => DEMO_MODE ? mockBank.me(p) : apiRequest<MeResponse>("/me", p),
  transactions: (p: ApiPersona) => DEMO_MODE ? mockBank.transactions(p) : apiRequest<{ transactions: ApiTransaction[] }>("/transactions", p),
  ask: (p: ApiPersona, question: string, format: Format) =>
    DEMO_MODE ? mockBank.ask(p, question, format) : apiRequest<AskResponse>("/ask", p, post({ question, format })),
  propose: (p: ApiPersona, body: ActionRequest) => DEMO_MODE ? mockBank.propose(p, body) : apiRequest<ProposedAction>("/actions", p, post(body)),
  confirm: (p: ApiPersona, id: string) =>
    DEMO_MODE ? mockBank.confirm(p, id) : apiRequest<ConfirmResponse>(`/actions/${encodeURIComponent(id)}/confirm`, p, post()),
  setLimit: (p: ApiPersona, pence: number) =>
    DEMO_MODE ? mockBank.setLimit(p, pence) : apiRequest<MeResponse>("/me/settings", p, { method: "PUT", body: JSON.stringify({ monthly_limit_pence: pence }) }),
  spend: (p: ApiPersona, merchant: string, pence: number) =>
    DEMO_MODE ? mockBank.spend(p, merchant, pence) : apiRequest<SpendResponse>("/demo/spend", p, post({ merchant, amount_pence: pence })),
  reset: (p: ApiPersona) => DEMO_MODE ? mockBank.reset(p) : apiRequest<{ ok: boolean; message: string }>("/demo/reset", p, post()),
};


// ---------- "Tell us once" and support (need the backend: not available in local demo mode) ----------

export type Channel = "app" | "email" | "text" | "letter" | "phone";
export type LetterFormat = "standard" | "large_print" | "braille" | "easy_read" | "audio";
export type CallAdjustment = "extra_time" | "speak_slowly" | "relay_uk" | "agreed_times" | "same_person";
export type SupportTopic = "struggling_to_pay" | "understanding_account" | "accessibility" | "something_else";
export type SupportStatus = "open" | "in_progress" | "resolved";

export type NeedsProfile = {
  channels: Channel[];
  preferred_channel: Channel;
  letter_format: LetterFormat;
  call_adjustments: CallAdjustment[];
  helper_name: string | null;
  notes: string | null;
  share_with_staff: boolean;
  updated_at?: string | null;
};
export type SupportMessage = {
  id: number;
  author: "customer" | "staff" | "note";
  text: string;
  channel: Channel | null;
  staff_name: string | null;
  created_at: string;
};
export type SupportRequest = {
  id: number;
  topic: SupportTopic;
  topic_label: string;
  message: string | null;
  channel: Channel;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  messages: SupportMessage[];
};
export type Guidance = { kind: "contact" | "no_phone" | "letters" | "calls" | "helper" | "notes"; text: string };
export type StaffRequestSummary = Omit<SupportRequest, "messages"> & { persona: ApiPersona; display_name: string; needs_shared: boolean };
export type RiskBand = "low" | "medium" | "high";
export type MissedPaymentRisk = {
  probability: number;
  percent: number;
  band: RiskBand;
  drivers: { feature: string; label: string; value: string; effect: "raises" | "lowers"; impact: number; text: string }[];
  suggestion: string;
  model: { kind: string; trained_on: string; test_auc: number; test_accuracy: number; synthetic_data: boolean };
};
export type StaffCustomerSummary = {
  persona: ApiPersona; display_name: string; needs_shared: boolean; open_requests: number; risk_percent: number; risk_band: RiskBand;
};
export type StaffCustomerView = {
  persona: ApiPersona;
  display_name: string;
  needs_shared: boolean;
  needs: NeedsProfile | null;
  guidance: Guidance[];
  allowed_channels: Channel[];
  account: {
    balance_pence: number;
    minimum_payment_pence: number;
    due_date: string;
    days_until_due: number;
    card_paused: boolean;
    monthly_limit_pence: number | null;
  };
  risk: MissedPaymentRisk;
  requests: SupportRequest[];
};

const NEEDS_SERVER = "Support and staff features need the SpendSense server. Start it with ./dev.sh.";

function needsServer<T>(call: () => Promise<T>): Promise<T> {
  return DEMO_MODE ? Promise.reject(new ApiError(NEEDS_SERVER, 0)) : call();
}

export const support = {
  needs: (p: ApiPersona) => needsServer(() => apiRequest<NeedsProfile>("/me/needs", p)),
  saveNeeds: (p: ApiPersona, profile: NeedsProfile) =>
    needsServer(() => apiRequest<NeedsProfile>("/me/needs", p, { method: "PUT", body: JSON.stringify(profile) })),
  requests: (p: ApiPersona) => needsServer(() => apiRequest<{ requests: SupportRequest[] }>("/support/requests", p)),
  create: (p: ApiPersona, body: { topic: SupportTopic; message?: string; channel: Channel }) =>
    needsServer(() => apiRequest<SupportRequest>("/support/requests", p, post(body))),
  reply: (p: ApiPersona, id: number, text: string) =>
    needsServer(() => apiRequest<SupportRequest>(`/support/requests/${id}/messages`, p, post({ text }))),
};

// The staff console. X-Staff stands in for staff sign-in in this demo; a real bank would use proper staff login and roles.
const asStaff = <T>(path: string, options: RequestInit = {}) =>
  needsServer(() => apiRequest<T>(path, "priya", { ...options, headers: { "X-Staff": "demo-agent", ...options.headers } }));

export const staff = {
  queue: () => asStaff<{ requests: StaffRequestSummary[] }>("/staff/requests"),
  customers: () => asStaff<{ customers: StaffCustomerSummary[] }>("/staff/customers"),
  customer: (persona: ApiPersona) => asStaff<StaffCustomerView>(`/staff/customers/${persona}`),
  setStatus: (id: number, status: SupportStatus) =>
    asStaff<SupportRequest>(`/staff/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  message: (id: number, body: { text: string; channel: Channel; internal: boolean }) =>
    asStaff<SupportRequest>(`/staff/requests/${id}/messages`, post(body)),
};
