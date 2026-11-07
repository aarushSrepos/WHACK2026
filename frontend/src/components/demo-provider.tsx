"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type ActionType,
  type ApiPersona,
  type ApiTransaction,
  type AskResponse,
  type Format,
  type MeResponse,
  type ProposedAction,
} from "@/lib/api";

export type Persona = "priya" | "sam" | "amara" | "alex";
// Every demo customer, Alex included, has their own data in the backend and in the local demo ledger.
const API_PERSONA: Record<Persona, ApiPersona> = { priya: "priya", sam: "sam", amara: "amara", alex: "alex" };

export type Transaction = { id: string; merchant: string; amountPence: number; date: string; dateISO: string; status: ApiTransaction["status"] };
export type Pending = { id: string; type: ActionType; readBack: string };
export type Notice = { kind: "ok" | "error"; text: string };
export type ProposeInput = { type: ActionType; amountPence?: number };

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

type Loaded = { me: MeResponse; transactions: Transaction[]; dueInDays: number };

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersonaState] = useState<Persona>("priya");
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [receipts, setReceipts] = useState<string[]>([]);
  const latest = useRef(0); // ignore a slow answer for a customer we have already switched away from
  const who = API_PERSONA[persona];

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    try {
      const [me, tx] = await Promise.all([api.me(who), api.transactions(who)]);
      if (id !== latest.current) return;
      setData({
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
      });
      setLoadError(null);
    } catch (e) {
      if (id !== latest.current) return;
      setLoadError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [who]);

  useEffect(() => {
    const v = localStorage.getItem("spendsense-persona");
    // Restore the persisted demo customer after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v === "priya" || v === "sam" || v === "amara" || v === "alex") setPersonaState(v);
  }, []);

  useEffect(() => {
    // Reset the view immediately when changing demo accounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setData(null);
    setPending(null);
    setNotice(null);
    setReceipts([]);
    refresh();
  }, [refresh]);

  const setPersona = (p: Persona) => {
    setPersonaState(p);
    localStorage.setItem("spendsense-persona", p);
  };

  const fail = (e: unknown) => {
    setNotice({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong. Please try again." });
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
          amount_pence: input.amountPence,
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
    loading,
    loadError,
    balancePence: me?.account.balance_pence ?? 0,
    minimumPence: me?.account.minimum_payment_pence ?? 0,
    creditLimitPence: me?.account.credit_limit_pence ?? 0,
    availableCreditPence: me?.account.available_credit_pence ?? 0,
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
export const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
