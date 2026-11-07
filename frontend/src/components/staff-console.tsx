"use client";
import { useState } from "react";
import { BankIcon } from "@/components/bank-icon";
import { GuidanceList } from "@/components/guidance-list";
import { pounds } from "@/components/demo-provider";
import {
  ApiError, staff, type ApiPersona, type Channel, type StaffCustomerView, type StaffRequestSummary,
  type SupportRequest, type SupportStatus,
} from "@/lib/api";
import { CHANNELS, CHANNEL_PHRASE, STAFF_STATUS_LABEL, timeAgo } from "@/lib/support-labels";
import { useLoad } from "@/lib/use-load";

type Filter = SupportStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];
const POLL_MS = 4000; // picks up new customer requests during a live demo

/**
 * The staff side of "tell us once". Staff see a customer's needs only if the customer shared them,
 * and can only reply through channels the customer allows (the server enforces both).
 */
export function StaffConsole() {
  const queue = useLoad("queue", () => staff.queue(), POLL_MS);
  const customers = useLoad("customers", () => staff.customers(), POLL_MS);
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<{ persona: ApiPersona; requestId: number | null } | null>(null);

  const all = queue.data?.requests ?? [];
  const shown = filter === "all" ? all : all.filter((r) => r.status === filter);
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((r) => r.status === f).length);
  const refreshLists = () => { queue.reload(); customers.reload(); };

  return <div className="staff-shell">
    <header className="staff-topbar">
      <div className="staff-brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>SpendSense <strong>Staff console</strong></span></div>
      <div className="staff-topbar-right">
        <span className="staff-agent"><BankIcon name="shield" size={15} /> Signed in as Jordan (Customer Care) · demo</span>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="staff-main">
      <h1 className="sr-only">Staff console</h1>
      {queue.error && <p role="alert" className="bank-status bank-status-error">{queue.error}</p>}
      <div className="staff-grid">
        <nav className="staff-sidebar" aria-label="Support queue and customers">
          <section aria-labelledby="queue-heading">
            <h2 id="queue-heading" className="staff-section-title">Support queue</h2>
            <div className="segmented staff-filters" role="group" aria-label="Filter requests">
              {FILTERS.map((f) => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label} ({count(f.value)})</button>)}
            </div>
            {queue.loading && <p role="status">Loading…</p>}
            <ul className="staff-queue">
              {shown.map((r) => <li key={r.id}><QueueItem request={r} active={selected?.requestId === r.id} onOpen={() => setSelected({ persona: r.persona, requestId: r.id })} /></li>)}
              {!queue.loading && shown.length === 0 && <li className="staff-empty">Nothing here.</li>}
            </ul>
          </section>
          <section aria-labelledby="customers-heading" className="mt-6">
            <h2 id="customers-heading" className="staff-section-title">Customers</h2>
            <ul className="staff-customers">
              {(customers.data?.customers ?? []).map((c) => <li key={c.persona}>
                <button type="button" aria-current={selected?.persona === c.persona && selected.requestId === null ? "true" : undefined} onClick={() => setSelected({ persona: c.persona, requestId: null })}>
                  <span className="profile-avatar" aria-hidden="true">{c.display_name[0]}</span>
                  <span><strong>{c.display_name}</strong><small>{c.needs_shared ? "Needs shared" : "Needs not shared"}{c.open_requests ? ` · ${c.open_requests} open` : ""}</small></span>
                </button>
              </li>)}
            </ul>
          </section>
        </nav>
        <div className="staff-detail">
          {selected
            ? <CustomerPanel key={selected.persona} persona={selected.persona} requestId={selected.requestId} onSelectRequest={(id) => setSelected({ persona: selected.persona, requestId: id })} onChanged={refreshLists} />
            : <div className="ss-card staff-placeholder"><BankIcon name="help" size={28} /><h2>Pick a request or a customer</h2><p className="readable-copy">You will see how they want to be helped before you contact them.</p></div>}
        </div>
      </div>
    </main>
  </div>;
}

function QueueItem({ request: r, active, onOpen }: { request: StaffRequestSummary; active: boolean; onOpen: () => void }) {
  return <button type="button" className={`staff-queue-item ${active ? "is-active" : ""}`} aria-current={active ? "true" : undefined} onClick={onOpen}>
    <span className="staff-queue-top"><strong>{r.display_name}</strong><span className={`status-pill status-${r.status}`}>{STAFF_STATUS_LABEL[r.status]}</span></span>
    <span className="staff-queue-topic">{r.topic_label}</span>
    <span className="staff-queue-meta">{timeAgo(r.created_at)} · reply by {CHANNEL_PHRASE[r.channel]}{r.needs_shared ? "" : " · needs not shared"}</span>
  </button>;
}

function CustomerPanel({ persona, requestId, onSelectRequest, onChanged }: {
  persona: ApiPersona; requestId: number | null; onSelectRequest: (id: number) => void; onChanged: () => void;
}) {
  const view = useLoad(persona, () => staff.customer(persona), POLL_MS);
  if (view.loading) return <div className="ss-card" role="status">Loading customer…</div>;
  if (view.error || !view.data) return <div className="ss-card" role="alert">{view.error}</div>;
  const c = view.data;
  const request = c.requests.find((r) => r.id === requestId) ?? null;
  const updated = (r: SupportRequest) => { view.set({ ...c, requests: c.requests.map((x) => (x.id === r.id ? r : x)) }); onChanged(); };

  return <div className="staff-detail-stack">
    <section className={`ss-card staff-help-card ${c.needs_shared ? "" : "is-private"}`} aria-labelledby="help-heading">
      <div className="panel-title-row">
        <div><p className="eyebrow on-light">BEFORE YOU CONTACT THEM</p><h2 id="help-heading">How to help {c.display_name}</h2></div>
        <span className={`status-pill ${c.needs_shared ? "status-in_progress" : "status-private"}`}>{c.needs_shared ? `Shared ${c.needs?.updated_at ? timeAgo(c.needs.updated_at) : ""}` : "Not shared"}</span>
      </div>
      {c.needs_shared
        ? <GuidanceList items={c.guidance} />
        : <p className="readable-copy mt-3"><BankIcon name="lock" size={15} className="inline-block mr-1" /> {c.display_name} has not chosen to share their needs. Their contact choices are still enforced below. If they would like adjustments, they can add them on their Your needs page.</p>}
      <ChannelRow allowed={c.allowed_channels} />
    </section>

    <AccountSnapshot account={c.account} />

    {request
      ? <RequestPanel key={request.id} customer={c} request={request} onUpdated={updated} />
      : <section className="ss-card" aria-labelledby="requests-heading">
          <h2 id="requests-heading">Support requests</h2>
          {c.requests.length === 0 && <p className="readable-copy mt-3">No requests from {c.display_name}.</p>}
          <ul className="staff-request-list">
            {c.requests.map((r) => <li key={r.id}><button type="button" onClick={() => onSelectRequest(r.id)}><strong>{r.topic_label}</strong><span>{STAFF_STATUS_LABEL[r.status]} · {timeAgo(r.created_at)}</span><BankIcon name="chevron-right" size={16} /></button></li>)}
          </ul>
        </section>}
  </div>;
}

function ChannelRow({ allowed }: { allowed: Channel[] }) {
  return <div className="staff-channels" aria-label="Contact channels">
    {CHANNELS.map((ch) => {
      const ok = allowed.includes(ch.value);
      return <span key={ch.value} className={ok ? "channel-ok" : "channel-blocked"}>
        <BankIcon name={ok ? "check" : "close"} size={14} />{ch.label}<span className="sr-only">{ok ? ": allowed" : ": blocked by the customer"}</span>
      </span>;
    })}
  </div>;
}

function AccountSnapshot({ account: a }: { account: StaffCustomerView["account"] }) {
  return <section className="ss-card" aria-labelledby="snapshot-heading">
    <h2 id="snapshot-heading" className="staff-section-title">Account snapshot</h2>
    <dl className="staff-snapshot">
      <div><dt>Balance</dt><dd>{pounds(a.balance_pence)}</dd></div>
      <div><dt>Minimum due</dt><dd>{pounds(a.minimum_payment_pence)}</dd></div>
      <div><dt>Due</dt><dd>in {a.days_until_due} day{a.days_until_due === 1 ? "" : "s"}</dd></div>
      <div><dt>Card</dt><dd>{a.card_paused ? "Paused by customer" : "Active"}</dd></div>
      <div><dt>Own spending limit</dt><dd>{a.monthly_limit_pence ? pounds(a.monthly_limit_pence) : "None set"}</dd></div>
    </dl>
  </section>;
}

function RequestPanel({ customer, request, onUpdated }: { customer: StaffCustomerView; request: SupportRequest; onUpdated: (r: SupportRequest) => void }) {
  const allowed = customer.allowed_channels;
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<Channel>(allowed.includes(request.channel) ? request.channel : "app");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (call: () => Promise<SupportRequest>) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await call());
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That did not work. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (await act(() => staff.message(request.id, { text: text.trim(), channel, internal }))) setText("");
  };

  return <section className="ss-card" aria-labelledby="request-heading">
    <div className="panel-title-row">
      <div><p className="eyebrow on-light">SR-{String(request.id).padStart(4, "0")} · {timeAgo(request.created_at)} · asked for a reply by {CHANNEL_PHRASE[request.channel]}</p><h2 id="request-heading">{request.topic_label}</h2></div>
      <span className={`status-pill status-${request.status}`}>{STAFF_STATUS_LABEL[request.status]}</span>
    </div>
    <ol className="thread-messages">
      {request.message && <li className="from-customer"><span className="thread-meta">{customer.display_name}</span><p>{request.message}</p></li>}
      {request.messages.map((m) => <li key={m.id} className={m.author === "customer" ? "from-customer" : m.author === "note" ? "from-note" : "from-staff"}>
        <span className="thread-meta">{m.author === "customer" ? customer.display_name : m.author === "note" ? `Staff-only note · ${m.staff_name}` : `${m.staff_name} · sent by ${CHANNEL_PHRASE[m.channel ?? "app"]}`} · {timeAgo(m.created_at)}</span>
        <p>{m.text}</p>
      </li>)}
    </ol>

    <form onSubmit={send} className="staff-composer">
      <div className="segmented" role="group" aria-label="Message type">
        <button type="button" aria-pressed={!internal} onClick={() => setInternal(false)}>Reply to {customer.display_name}</button>
        <button type="button" aria-pressed={internal} onClick={() => setInternal(true)}>Staff-only note</button>
      </div>
      <label htmlFor="staff-text" className="sr-only">{internal ? "Note for colleagues" : `Message to ${customer.display_name}`}</label>
      <textarea id="staff-text" className="v2-input mt-3" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={internal ? "Only colleagues will see this." : "Write in plain English. Short sentences help."} />
      {!internal && <fieldset className="needs-options needs-inline mt-3">
        <legend>Send by</legend>
        {CHANNELS.map((ch) => {
          const ok = allowed.includes(ch.value);
          return <label key={ch.value} className={`needs-chip ${ok ? "" : "is-blocked"}`}>
            <input type="radio" name="staff-channel" checked={channel === ch.value} onChange={() => setChannel(ch.value)} />
            {ch.label}{!ok && <span className="blocked-note"> (customer asked us not to)</span>}
          </label>;
        })}
      </fieldset>}
      {error && <p role="alert" className="bank-status bank-status-error mt-3">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="v2-button" disabled={busy || !text.trim()}>{internal ? "Add note" : `Send by ${CHANNEL_PHRASE[channel]}`}</button>
        {request.status !== "resolved"
          ? <button type="button" className="v2-button-alt" disabled={busy} onClick={() => act(() => staff.setStatus(request.id, "resolved"))}><BankIcon name="check" size={15} /> Mark resolved</button>
          : <button type="button" className="v2-button-alt" disabled={busy} onClick={() => act(() => staff.setStatus(request.id, "open"))}><BankIcon name="reset" size={15} /> Reopen</button>}
      </div>
      {!internal && <p className="text-sm text-muted mt-2">Delivery by email, text, letter or phone is simulated. Every reply also appears in the customer&apos;s app.</p>}
    </form>
  </section>;
}
