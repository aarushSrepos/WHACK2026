"use client";
import { useState } from "react";
import { BankIcon } from "@/components/bank-icon";
import { useDemo } from "@/components/demo-provider";
import { ApiError, support, type Channel, type NeedsProfile } from "@/lib/api";
import { CALL_ADJUSTMENTS, CHANNELS, CHANNEL_PHRASE, LETTER_FORMATS, previewGuidance } from "@/lib/support-labels";
import { useLoad } from "@/lib/use-load";
import { GuidanceList } from "@/components/guidance-list";

/** "Tell us once": how the customer wants to be contacted, and whether staff may see it. */
export function NeedsForm() {
  const { persona, displayName } = useDemo();
  const saved = useLoad(persona, () => support.needs(persona));
  if (saved.loading) return <div className="ss-card" role="status">Loading your needs…</div>;
  if (saved.error || !saved.data) return <div className="ss-card" role="alert">{saved.error}</div>;
  // key: a fresh form for each customer.
  return <NeedsEditor key={persona} initial={saved.data} name={displayName} onSaved={saved.set} />;
}

function NeedsEditor({ initial, name, onSaved }: { initial: NeedsProfile; name: string; onSaved: (p: NeedsProfile) => void }) {
  const { persona } = useDemo();
  const [form, setForm] = useState<NeedsProfile>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const change = (patch: Partial<NeedsProfile>) => { setForm((f) => ({ ...f, ...patch })); setStatus(null); };
  const dirty = JSON.stringify({ ...form, updated_at: null }) !== JSON.stringify({ ...initial, updated_at: null });

  const toggleChannel = (channel: Channel, on: boolean) => {
    const channels = on ? [...form.channels, channel] : form.channels.filter((c) => c !== channel);
    change({ channels, preferred_channel: channels.includes(form.preferred_channel) ? form.preferred_channel : "app" });
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = await support.saveNeeds(persona, form);
      onSaved(result);
      setForm(result); // the server tidies the profile (e.g. in-app messages always first)
      setStatus({ kind: "ok", text: result.share_with_staff ? "Saved. Staff who help you will see this." : "Saved. Your details stay private, and we will still respect your contact choices." });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "We could not save that. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const preview = previewGuidance(form, name || "this customer");

  return <div className="tools-columns">
    <div>
      <section className="ss-card needs-section" aria-labelledby="contact-heading">
        <p className="eyebrow on-light">STEP 1</p>
        <h2 id="contact-heading">How should we contact you?</h2>
        <p className="readable-copy mt-2">Tick every way that works for you. We will never use the others.</p>
        <fieldset className="needs-options">
          <legend className="sr-only">Ways we may contact you</legend>
          {CHANNELS.map((c) => <label key={c.value} className="needs-option">
            <input type="checkbox" checked={form.channels.includes(c.value)} disabled={c.value === "app"} onChange={(e) => toggleChannel(c.value, e.target.checked)} />
            <span><strong>{c.label}</strong>{c.help && <small>{c.help}</small>}</span>
          </label>)}
        </fieldset>
        <fieldset className="needs-options needs-inline mt-4">
          <legend>Which do you prefer?</legend>
          {form.channels.map((c) => <label key={c} className="needs-chip">
            <input type="radio" name="preferred" checked={form.preferred_channel === c} onChange={() => change({ preferred_channel: c })} /> {CHANNEL_PHRASE[c]}
          </label>)}
        </fieldset>
      </section>

      <section className="ss-card needs-section" aria-labelledby="letters-heading">
        <p className="eyebrow on-light">STEP 2</p>
        <h2 id="letters-heading">Letters and calls</h2>
        <fieldset className="needs-options needs-inline mt-3">
          <legend>Send letters in</legend>
          {LETTER_FORMATS.map((l) => <label key={l.value} className="needs-chip">
            <input type="radio" name="letter-format" checked={form.letter_format === l.value} onChange={() => change({ letter_format: l.value })} /> {l.label}
          </label>)}
        </fieldset>
        <fieldset className="needs-options mt-4">
          <legend>If we talk to you</legend>
          {CALL_ADJUSTMENTS.map((a) => <label key={a.value} className="needs-option">
            <input type="checkbox" checked={form.call_adjustments.includes(a.value)} onChange={(e) => change({ call_adjustments: e.target.checked ? [...form.call_adjustments, a.value] : form.call_adjustments.filter((x) => x !== a.value) })} />
            <span>{a.label}</span>
          </label>)}
        </fieldset>
      </section>

      <section className="ss-card needs-section" aria-labelledby="more-heading">
        <p className="eyebrow on-light">STEP 3 · OPTIONAL</p>
        <h2 id="more-heading">Anything else?</h2>
        <label htmlFor="helper" className="block mt-4 mb-2 font-semibold">Someone who helps you manage your money</label>
        <input id="helper" className="v2-input" maxLength={80} placeholder="For example: Jamie (partner)" value={form.helper_name ?? ""} onChange={(e) => change({ helper_name: e.target.value || null })} />
        <label htmlFor="notes" className="block mt-4 mb-2 font-semibold">Tell us in your own words</label>
        <textarea id="notes" className="v2-input" rows={3} maxLength={300} placeholder="For example: phone calls make me anxious, please write to me first." value={form.notes ?? ""} onChange={(e) => change({ notes: e.target.value || null })} />
        <p className="text-sm text-muted mt-2">You never have to tell us about a condition or diagnosis. Just say what helps.</p>
      </section>

      <section className={`ss-card needs-consent ${form.share_with_staff ? "is-on" : ""}`} aria-labelledby="consent-heading">
        <h2 id="consent-heading">Share this with staff who help me</h2>
        <label className="needs-switch">
          <input type="checkbox" role="switch" checked={form.share_with_staff} onChange={(e) => change({ share_with_staff: e.target.checked })} />
          <span>{form.share_with_staff ? "On: staff will see the summary on the right" : "Off: staff will not see these details"}</span>
        </label>
        <p className="readable-copy mt-2">Either way, we always respect the ways you have asked us to contact you. You can turn this off at any time.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="v2-button" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save my needs"} <BankIcon name="check" size={16} /></button>
          {!dirty && !status && <span className="text-sm text-muted">No changes to save.</span>}
        </div>
        {status && <p role={status.kind === "error" ? "alert" : "status"} className={`bank-status mt-4 ${status.kind === "error" ? "bank-status-error" : ""}`}>{status.text}</p>}
      </section>
    </div>

    <aside className="ss-card needs-preview" aria-labelledby="preview-heading">
      <p className="eyebrow on-light">WHAT STAFF WILL SEE</p>
      <h2 id="preview-heading">How to help {name || "you"}</h2>
      {form.share_with_staff
        ? <GuidanceList items={preview} />
        : <p className="readable-copy mt-3"><BankIcon name="lock" size={15} className="inline-block mr-1" /> Sharing is off. Staff will only see that you have contact preferences, and the system will stop them using the ways you have not allowed.</p>}
      {dirty && <p className="text-sm text-muted mt-4">Preview of unsaved changes.</p>}
    </aside>
  </div>;
}
