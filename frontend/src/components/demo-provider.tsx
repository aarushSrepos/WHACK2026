"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  api,
  ApiError,
  type ActionType,
  type ApiTransaction,
  type AskResponse,
  type Format,
  type MeResponse,
  type ProposedAction,
} from "@/lib/api";

export type Persona = "priya" | "sam" | "amara" | "alex";
export const PERSONAS: readonly Persona[] = ["priya", "sam", "amara", "alex"];

export type Transaction = { id: string; merchant: string; amountPence: number; date: string; dateISO: string; status: ApiTransaction["status"] };
export type Pending = { id: string; type: ActionType; readBack: string };
export type Notice = { kind: "ok" | "error"; text: string };
export type ProposeInput = { type: ActionType; transactionId?: string; amountPence?: number; reason?: string };

type Demo = {
  persona: Persona;
  setPersona: (p: Persona) => void;
  loading: boolean;
  /** Set when the first load failed (server down). The screens show it instead of numbers. */
  loadError: string | null;
  balancePence: number;
  minimumPence: number;
  creditLimitPence: number;
  availableCreditPence: number;
  aprBasisPoints: number;
  dueDate: string;
  dueDateISO: string;
  dueInDays: number;
  displayName: string;
  label: string;
  transactions: Transaction[];
  pending: Pending | null;
  notice: Notice | null;
  receipts: string[];
  monthlyLimitPence: number | null;
  spentPence: number;
  percentUsed: number | null;
  paused: boolean;
  propose: (input: ProposeInput) => Promise<boolean>;
  adopt: (action: ProposedAction) => void;
  cancel: () => void;
  confirm: () => Promise<boolean>;
  ask: (question: string, format: Format) => Promise<AskResponse | null>;
  setMonthlyLimit: (pounds: number) => Promise<boolean>;
  demoSpend: (pence: number) => Promise<void>;
  reset: () => Promise<void>;
};

const DemoContext = createContext<Demo | null>(null);

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const daysUntil = (iso: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86400000);
};

// The chosen demo customer lives in localStorage. Reading it through useSyncExternalStore means the
// server render and first client render agree ("priya"), then React switches to the saved one.
const PERSONA_KEY = "spendsense-persona";
const personaListeners = new Set<() => void>();
const isPersona = (v: unknown): v is Persona => PERSONAS.includes(v as Persona);
function readPersona(): Persona {
  try {
    const v = localStorage.getItem(PERSONA_KEY);
    return isPersona(v) ? v : "priya";
  } catch {
    return "priya";
  }
}
function subscribePersona(onChange: () => void) {
  personaListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    personaListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

type Loaded = { me: MeResponse; transactions: Transaction[]; dueInDays: number };
/** The last answer from the server, tagged with who it was for, so we never show one customer's data as another's. */
type Result = { who: Persona; data: Loaded | null; error: string | null };

/** Fetch one customer's account and transactions. Never throws: a failure comes back as `error`. */
async function load(who: Persona): Promise<Result> {
  try {
    const [me, tx] = await Promise.all([api.me(who), api.transactions(who)]);
    return {
      who,
      error: null,
      data: {
        me,
        dueInDays: daysUntil(me.account.due_date),
        transactions: tx.transactions.map((t) => ({
          id: t.id,
          merchant: t.merchant,
          amountPence: t.amount_pence,
          date: longDate(t.date),
          dateISO: t.date,
          status: t.status,
        })),
      },
    };
  } catch (e) {
    return { who, data: null, error: e instanceof ApiError ? e.message : "Something went wrong. Please try again." };
  }
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const persona = useSyncExternalStore(subscribePersona, readPersona, () => "priya" as Persona);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [receipts, setReceipts] = useState<string[]>([]);
  const latest = useRef(0); // ignore a slow answer for a customer we have already switched away from
  const who = persona;

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    const r = await load(who);
    if (id === latest.current) setResult(r);
  }, [who]);

  // Load the account whenever the customer changes. State is only set once the server answers.
  useEffect(() => {
    const id = ++latest.current;
    load(who).then((r) => {
      if (id === latest.current) setResult(r);
    });
  }, [who]);

  const current = result?.who === who ? result : null;
  const data = current?.data ?? null;

  const setPersona = (p: Persona) => {
    if (p === persona) return;
    setPending(null);
    setNotice(null);
    setReceipts([]);
    try {
      localStorage.setItem(PERSONA_KEY, p);
    } catch {
      /* private browsing: the choice just will not be remembered */
    }
    personaListeners.forEach((listener) => listener());
  };

  const fail = (e: unknown) => {
    setNotice({ kind: "error", text: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
  };

  const adopt = (a: ProposedAction) => {
    setNotice(null);
    setPending({ id: a.action_id, type: a.type, readBack: a.read_back });
  };

  const propose = async (input: ProposeInput) => {
    setNotice(null);
    try {
      adopt(
        await api.propose(who, {
          type: input.type,
          transaction_id: input.transactionId,
          amount_pence: input.amountPence,
          reason: input.reason?.trim() || undefined,
        }),
      );
      return true;
    } catch (e) {
      setPending(null);
      fail(e);
      return false;
    }
  };

  // Confirm runs the proposal the server saved. Nothing from this screen is sent except the id.
  const confirm = async () => {
    if (!pending) return false;
    try {
      const done = await api.confirm(who, pending.id);
      setPending(null);
      setReceipts((r) => [done.reference ? `${done.summary} Reference ${done.reference}.` : done.summary, ...r]);
      setNotice({ kind: "ok", text: done.summary });
      await refresh();
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const ask = async (question: string, format: Format) => {
    try {
      return await api.ask(who, question, format);
    } catch (e) {
      fail(e);
      return null;
    }
  };

  const setMonthlyLimit = async (pounds: number) => {
    setNotice(null);
    try {
      await api.setLimit(who, Math.round(pounds * 100));
      setNotice({ kind: "ok", text: "Your monthly limit has been saved." });
      await refresh();
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const demoSpend = async (pence: number) => {
    setNotice(null);
    try {
      const r = await api.spend(who, "Demo purchase", pence);
      setNotice({ kind: "ok", text: r.message ?? "Demo purchase added." });
      await refresh();
    } catch (e) {
      fail(e);
    }
  };

  const reset = async () => {
    setNotice(null);
    try {
      await api.reset(who);
      setPending(null);
      setReceipts([]);
      setNotice({ kind: "ok", text: "Demo data has been reset." });
      await refresh();
    } catch (e) {
      fail(e);
    }
  };

  const me = data?.me;
  const value: Demo = {
    persona,
    setPersona,
    loading: current === null,
    loadError: current?.error ?? null,
    balancePence: me?.account.balance_pence ?? 0,
    minimumPence: me?.account.minimum_payment_pence ?? 0,
    creditLimitPence: me?.account.credit_limit_pence ?? 0,
    availableCreditPence: me?.account.available_credit_pence ?? 0,
    aprBasisPoints: me?.account.apr_basis_points ?? 0,
    dueDate: me ? longDate(me.account.due_date) : "",
    dueDateISO: me?.account.due_date ?? "",
    dueInDays: data?.dueInDays ?? 0,
    displayName: me?.display_name ?? "",
    label: me?.label ?? "Simulated demo data",
    transactions: data?.transactions ?? [],
    pending,
    notice,
    receipts,
    monthlyLimitPence: me?.spending.monthly_limit_pence ?? null,
    spentPence: me?.spending.spent_this_month_pence ?? 0,
    percentUsed: me?.spending.percent_used ?? null,
    paused: !!me?.account.card_paused_until,
    propose,
    adopt,
    cancel: () => setPending(null),
    confirm,
    ask,
    setMonthlyLimit,
    demoSpend,
    reset,
  };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw Error("DemoProvider missing");
  return ctx;
}

