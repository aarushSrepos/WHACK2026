// SpendSense API client. Types mirror backend/app/schemas.py (the API contract).
// Money is whole pence in an int. Set NEXT_PUBLIC_API_URL in .env.local if the backend is not on port 8000.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ApiPersona = "priya" | "sam" | "amara";
export type ActionType = "pay" | "dispute" | "pause_card" | "unpause_card";
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
  transaction_id?: string;
  amount_pence?: number;
  reason?: string;
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
  me: (p: ApiPersona) => apiRequest<MeResponse>("/me", p),
  transactions: (p: ApiPersona) => apiRequest<{ transactions: ApiTransaction[] }>("/transactions", p),
  ask: (p: ApiPersona, question: string, format: Format) =>
    apiRequest<AskResponse>("/ask", p, post({ question, format })),
  propose: (p: ApiPersona, body: ActionRequest) => apiRequest<ProposedAction>("/actions", p, post(body)),
  confirm: (p: ApiPersona, id: string) =>
    apiRequest<ConfirmResponse>(`/actions/${encodeURIComponent(id)}/confirm`, p, post()),
  setLimit: (p: ApiPersona, pence: number) =>
    apiRequest<MeResponse>("/me/settings", p, { method: "PUT", body: JSON.stringify({ monthly_limit_pence: pence }) }),
  spend: (p: ApiPersona, merchant: string, pence: number) =>
    apiRequest<SpendResponse>("/demo/spend", p, post({ merchant, amount_pence: pence })),
  reset: (p: ApiPersona) => apiRequest<{ ok: boolean; message: string }>("/demo/reset", p, post()),
};
