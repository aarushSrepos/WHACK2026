"use client";
import Link from "next/link";
import { useState } from "react";
import { BankIcon } from "@/components/bank-icon";
import { useDemo } from "@/components/demo-provider";
import { ApiError, support, type Channel, type SupportRequest, type SupportTopic } from "@/lib/api";
import { CHANNEL_PHRASE, STATUS_LABEL, TOPICS, timeAgo } from "@/lib/support-labels";
import { useLoad } from "@/lib/use-load";

/** Ask a person for help. Only the ways the customer allows are offered for the reply. */
export function SupportRequestForm({ topic: presetTopic, onSent, onAnother, compact = false }: {
  topic?: SupportTopic;
  onSent?: (r: SupportRequest) => void;
  /** Show an "Ask about something else" button after sending. */
  onAnother?: () => void;
  compact?: boolean;
}) {
  const { persona } = useDemo();
  const needs = useLoad(persona, () => support.needs(persona));
  const [topic, setTopic] = useState<SupportTopic>(presetTopic ?? "struggling_to_pay");
  const [message, setMessage] = useState("");
  const [chosen, setChosen] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SupportRequest | null>(null);

  if (needs.loading) return <p role="status">Loading your contact choices…</p>;
  if (needs.error || !needs.data) return <p role="alert" className="bank-status bank-status-error">{needs.error}</p>;
  const profile = needs.data;
  const channel = chosen && profile.channels.includes(chosen) ? chosen : profile.preferred_channel;

  if (sent) {
    return <div className="bank-status" role="status">
      <strong>Request sent (reference SR-{String(sent.id).padStart(4, "0")}).</strong> A member of our team will reply by {CHANNEL_PHRASE[sent.channel]}
      {sent.channel !== "app" && ", and you will see it on the Get support page too"}. There is no need to phone us.
      {compact && <> <Link href="/support">See your conversations <BankIcon name="arrow-right" size={13} className="inline-block" /></Link></>}
      {onAnother && <div className="mt-3"><button type="button" className="v2-button-alt" onClick={onAnother}>Ask about something else</button></div>}
    </div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await support.create(persona, { topic, message: message.trim() || undefined, channel });
      setSent(r);
      onSent?.(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="support-form">
    {!presetTopic && <fieldset className="needs-options">
      <legend>What would you like help with?</legend>
      {TOPICS.map((t) => <label key={t.value} className="needs-option">
        <input type="radio" name="topic" checked={topic === t.value} onChange={() => setTopic(t.value)} /> <span>{t.label}</span>
      </label>)}
    </fieldset>}
    <label htmlFor={`support-message-${compact ? "c" : "f"}`} className="block mt-4 mb-2 font-semibold">Tell us more, if you want to</label>
    <textarea id={`support-message-${compact ? "c" : "f"}`} className="v2-input" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional. Say as much or as little as you like." />
    <fieldset className="needs-options needs-inline mt-4">
      <legend>How should we reply?</legend>
      {profile.channels.map((c) => <label key={c} className="needs-chip">
        <input type="radio" name={`reply-channel-${compact ? "c" : "f"}`} checked={channel === c} onChange={() => setChosen(c)} /> {CHANNEL_PHRASE[c]}
      </label>)}
    </fieldset>
    <p className="text-sm text-muted mt-2">
      These are the ways you allow on <Link href="/needs">Your needs</Link>.{" "}
      {profile.share_with_staff ? "The person who helps you will see your needs, so you won't have to explain them again." : "Your needs are not shared with staff. You can change that on Your needs."}
    </p>
    {error && <p role="alert" className="bank-status bank-status-error mt-3">{error}</p>}
    <button className="v2-button mt-4" disabled={busy}>{busy ? "Sending…" : "Send to our team"} <BankIcon name="arrow-right" size={16} /></button>
  </form>;
}

/** Shown under an answer when the customer seems to be struggling. Nothing is sent unless they choose to. */
export function SupportOffer() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <section className="support-offer" aria-labelledby="support-offer-heading">
    <h3 id="support-offer-heading"><BankIcon name="help" size={18} /> Would you like a person to help?</h3>
    {!open ? <>
      <p>It can help to talk things through. Someone from our team can look at your options with you, by text, email or in the app. You choose how. Nothing is sent unless you ask.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="v2-button" onClick={() => setOpen(true)}>Yes, choose how</button>
        <button type="button" className="v2-button-alt" onClick={() => setDismissed(true)}>No thanks</button>
      </div>
    </> : <SupportRequestForm topic="struggling_to_pay" compact />}
  </section>;
}

function Thread({ request, onChange }: { request: SupportRequest; onChange: (r: SupportRequest) => void }) {
  const { persona } = useDemo();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await support.reply(persona, request.id, draft.trim()));
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return <article className="ss-card support-thread" aria-labelledby={`thread-${request.id}`}>
    <div className="panel-title-row">
      <div><p className="eyebrow on-light">SR-{String(request.id).padStart(4, "0")} · {timeAgo(request.created_at)}</p><h3 id={`thread-${request.id}`}>{request.topic_label}</h3></div>
      <span className={`status-pill status-${request.status}`}>{STATUS_LABEL[request.status]}</span>
    </div>
    <ol className="thread-messages">
      {request.message && <li className="from-customer"><span className="thread-meta">You</span><p>{request.message}</p></li>}
      {request.messages.map((m) => <li key={m.id} className={m.author === "customer" ? "from-customer" : "from-staff"}>
        <span className="thread-meta">{m.author === "customer" ? "You" : `${m.staff_name ?? "Our team"}${m.channel && m.channel !== "app" ? ` · also sent by ${CHANNEL_PHRASE[m.channel]} (simulated)` : ""}`} · {timeAgo(m.created_at)}</span>
        <p>{m.text}</p>
      </li>)}
      {request.messages.length === 0 && <li className="thread-waiting">We have your request. We will reply by {CHANNEL_PHRASE[request.channel]}.</li>}
    </ol>
    <form onSubmit={send} className="thread-reply">
      <label htmlFor={`reply-${request.id}`} className="sr-only">Reply about {request.topic_label}</label>
      <input id={`reply-${request.id}`} className="v2-input" maxLength={500} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply…" />
      <button className="v2-button-alt" disabled={busy || !draft.trim()}>{busy ? "Sending…" : "Reply"}</button>
    </form>
    {error && <p role="alert" className="bank-status bank-status-error mt-2">{error}</p>}
  </article>;
}

/** The Get support page: start a conversation, and see replies. Refreshes every few seconds. */
export function SupportCenter() {
  const { persona } = useDemo();
  const list = useLoad(persona, () => support.requests(persona), 5000);
  const [formKey, setFormKey] = useState(0);
  const requests = list.data?.requests ?? [];
  const replace = (r: SupportRequest) => list.set({ requests: requests.map((x) => (x.id === r.id ? r : x)) });

  return <div className="tools-columns">
    <div>
      <section className="ss-card" aria-labelledby="your-conversations">
        <p className="eyebrow on-light">YOUR CONVERSATIONS</p>
        <h2 id="your-conversations">Messages with our team</h2>
        {list.loading && <p role="status" className="mt-3">Loading…</p>}
        {list.error && <p role="alert" className="bank-status bank-status-error mt-3">{list.error}</p>}
        {!list.loading && !list.error && requests.length === 0 && <p className="readable-copy mt-3">No conversations yet. When you ask for help, our replies appear here.</p>}
      </section>
      {requests.map((r) => <Thread key={r.id} request={r} onChange={replace} />)}
    </div>
    <section className="ss-card" aria-labelledby="new-request">
      <p className="eyebrow on-light">TALK TO A PERSON</p>
      <h2 id="new-request">Ask for help, your way</h2>
      <p className="readable-copy mt-2">No phone queue. Tell us what is going on and how you would like us to reply.</p>
      <SupportRequestForm key={`${persona}:${formKey}`} onSent={() => list.reload()} onAnother={() => setFormKey((k) => k + 1)} />
    </section>
  </div>;
}
