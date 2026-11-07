// Words for the "tell us once" options, shared by the customer pages and the staff console.
import type { CallAdjustment, Channel, Guidance, LetterFormat, NeedsProfile, SupportStatus, SupportTopic } from "./api";

export const CHANNELS: { value: Channel; label: string; help: string }[] = [
  { value: "app", label: "In-app message", help: "Always on. Replies appear on the Get support page." },
  { value: "email", label: "Email", help: "" },
  { value: "text", label: "Text message", help: "" },
  { value: "letter", label: "Letter", help: "In the format you choose below." },
  { value: "phone", label: "Phone call", help: "Untick this if you would rather we never phone you." },
];
export const CHANNEL_LABEL: Record<Channel, string> = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label])) as Record<Channel, string>;
// Mid-sentence form: "We'll reply by text message".
export const CHANNEL_PHRASE: Record<Channel, string> = {
  app: "in-app message", email: "email", text: "text message", letter: "letter", phone: "phone call",
};

export const LETTER_FORMATS: { value: LetterFormat; label: string }[] = [
  { value: "standard", label: "Standard print" },
  { value: "large_print", label: "Large print" },
  { value: "easy_read", label: "Easy Read (short sentences and pictures)" },
  { value: "braille", label: "Braille" },
  { value: "audio", label: "Audio recording" },
];

export const CALL_ADJUSTMENTS: { value: CallAdjustment; label: string }[] = [
  { value: "extra_time", label: "Give me extra time. Please don't rush me." },
  { value: "speak_slowly", label: "Speak slowly and clearly." },
  { value: "relay_uk", label: "Use Relay UK (text relay) for calls." },
  { value: "agreed_times", label: "Only call at a time we have agreed in writing." },
  { value: "same_person", label: "Keep the same person where you can." },
];

export const TOPICS: { value: SupportTopic; label: string }[] = [
  { value: "struggling_to_pay", label: "I'm finding it hard to pay" },
  { value: "understanding_account", label: "Help understanding my account" },
  { value: "accessibility", label: "Help using SpendSense" },
  { value: "something_else", label: "Something else" },
];

export const STATUS_LABEL: Record<SupportStatus, string> = { open: "Waiting for a reply", in_progress: "Being looked at", resolved: "Resolved" };
export const STAFF_STATUS_LABEL: Record<SupportStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

const LETTER_PHRASE: Record<LetterFormat, string> = {
  standard: "standard print", large_print: "large print", easy_read: "Easy Read", braille: "braille", audio: "audio",
};
const CALL_GUIDANCE: Record<CallAdjustment, string> = {
  extra_time: "Allow extra time. Do not rush them.",
  speak_slowly: "Speak slowly and clearly.",
  relay_uk: "Use Relay UK (text relay) for any call.",
  agreed_times: "Only call at a time agreed with them in writing first.",
  same_person: "Keep the same contact person where you can.",
};

/**
 * Preview of the staff guidance while the customer edits the form. Mirrors guidance() in
 * backend/app/support.py, which is what the staff console actually shows: keep the two in step.
 */
export function previewGuidance(p: NeedsProfile, name: string): Guidance[] {
  const others = p.channels.filter((c) => c !== p.preferred_channel).map((c) => CHANNEL_PHRASE[c]);
  const out: Guidance[] = [{ kind: "contact", text: `Contact by ${CHANNEL_PHRASE[p.preferred_channel]} first.${others.length ? ` Also OK: ${others.join(", ")}.` : ""}` }];
  if (!p.channels.includes("phone")) out.push({ kind: "no_phone", text: `Do not phone ${name}. Calls are blocked for this customer.` });
  if (p.letter_format !== "standard") out.push({ kind: "letters", text: `Send every letter in ${LETTER_PHRASE[p.letter_format]}.` });
  p.call_adjustments.forEach((a) => out.push({ kind: "calls", text: CALL_GUIDANCE[a] }));
  if (p.helper_name) out.push({ kind: "helper", text: `${p.helper_name} helps ${name} manage their money. Check you have consent before discussing the account with them.` });
  if (p.notes) out.push({ kind: "notes", text: `In their words: “${p.notes}”` });
  return out;
}

export function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
