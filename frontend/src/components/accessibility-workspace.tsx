"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { BankIcon } from "@/components/bank-icon";
import { VoiceInputButton } from "@/components/voice-input-button";
import { useAccessibility } from "@/components/accessibility-provider";
import {
  interpretAccessibilityMessage,
  validatePatch,
  type AssistantResult,
} from "@/lib/accessibility-chat";
import {
  type AccessibilitySettings,
} from "@/lib/accessibility";

type Mode = "onboarding" | "settings";
type Tab = "chat" | "manual";
type ChatMessage = { id: number; role: "assistant" | "user"; text: string };

const starterMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    text: "Hello, welcome to SpendSense. Tell me what would make the website easier for you to use. For example, you can ask for bigger text, clearer contrast, simpler language or less movement. I'll adjust the site as we go.",
  },
];

const examples = [
  "Make the text bigger and clearer",
  "I have dyslexia. Make reading easier",
  "Use simple language and less movement",
  "Read the page aloud more slowly",
];

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`setup-brand ${inverse ? "setup-brand-inverse" : ""}`}>
      <span className="setup-brand-icon" aria-hidden="true"><span /><span /><span /></span>
      <span className="setup-brand-word">Spend<span>Sense</span><small>YOUR CREDIT, CLEARER.</small></span>
    </div>
  );
}

function SettingsPreview() {
  const { settings } = useAccessibility();
  const settingsSummary = [
    settings.textSize === "default" ? "Standard text" : settings.textSize === "large" ? "Large text" : "Extra-large text",
    settings.contrast === "high" ? "High contrast" : "Standard contrast",
    settings.language === "simple" ? "Simple language" : "Detailed language",
    settings.motion === "reduce" ? "Reduced motion" : "Device motion",
    ...(settings.readingSpacing === "relaxed" ? ["More reading space"] : []),
    ...(settings.largeTargets ? ["Larger buttons"] : []),
  ];

  return (
    <aside className="setup-preview" aria-label="Preview of your accessibility preferences">
      <div className="setup-preview-head">
        <p className="setup-kicker">YOUR EXPERIENCE</p>
        <span className="setup-live-dot"><span /> Live preview</span>
      </div>
      <h2>See the difference.</h2>
      <p className="setup-preview-copy">Changes apply right away across SpendSense, not just on this screen.</p>
      <div className="setup-mini-account">
        <div className="setup-mini-account-top"><span>ACCOUNT PREVIEW</span><span>•••• 4242</span></div>
        <p>{settings.language === "simple" ? "Money you owe" : "Current outstanding balance"}</p>
        <strong>£1,284.75</strong>
        <div className="setup-mini-line" />
        <div className="setup-mini-meta"><span>{settings.language === "simple" ? "Pay at least" : "Minimum payment"}</span><strong>£35.00</strong></div>
        <div className="setup-mini-meta"><span>{settings.language === "simple" ? "Pay by" : "Payment due date"}</span><strong>19 Nov</strong></div>
      </div>
      <div className="setup-active-prefs"><p>YOUR CURRENT SETTINGS</p><div>{settingsSummary.map((value) => <span key={value}><BankIcon name="check" size={13}/>{value}</span>)}</div></div>
      <p className="setup-preview-note"><BankIcon name="lock" size={16}/> Your preferences are saved in this browser. No bank account is connected.</p>
    </aside>
  );
}

function ChatPanel() {
  const { settings, update } = useAccessibility();
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const sendButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [modeMessage, setModeMessage] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(2);

  useEffect(() => {
    let mounted = true;
    fetch("/api/accessibility-ai", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { available?: boolean } | null) => {
        if (mounted && body?.available) setAiAvailable(true);
      })
      .catch(() => { /* Local guided setup is always available. */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, settings.motion]);

  async function sendPrompt(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) return;
    setDraft("");
    setModeMessage("");
    setBusy(true);
    setMessages((before) => [...before, { id: sequence.current++, role: "user", text }]);

    let result: AssistantResult = interpretAccessibilityMessage(text, settings);
    if (useAi && aiAvailable) {
      try {
        const response = await fetch("/api/accessibility-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, current: settings }),
        });
        if (!response.ok) throw Error("Could not reach enhanced AI");
        const data = (await response.json()) as AssistantResult;
        if (data && data.source === "ai" && data.patch && typeof data.reply === "string") {
          result = { ...data, patch: validatePatch(data.patch) };
        }
      } catch {
        setModeMessage("Enhanced AI couldn't connect, so I used private guided mode for this answer.");
      }
    }
    if (Object.keys(result.patch).length > 0) update(result.patch);
    setMessages((before) => [...before, { id: sequence.current++, role: "assistant", text: result.reply }]);
    setBusy(false);
  }

  return (
    <section className="setup-chat-panel" aria-label="Accessibility setup chat">
      <div className="setup-chat-header">
        <div className="setup-assistant-avatar" aria-hidden="true"><BankIcon name="sparkle" size={21}/></div>
        <div><strong>Accessibility assistant</strong><span>{useAi && aiAvailable ? "Enhanced AI mode" : "Private guided mode"} <i aria-hidden="true">·</i> Here to help</span></div>
        <span className="setup-chat-ready"><span /> Ready</span>
      </div>
      <div className="setup-conversation" ref={conversationRef} role="log" aria-label="Conversation with accessibility assistant" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => (
          <div className={`setup-message ${message.role === "user" ? "setup-message-user" : "setup-message-bot"}`} key={message.id}>
            <span className="setup-msg-label">{message.role === "user" ? "YOU" : "SPENDSENSE ASSISTANT"}</span>
            <p>{message.text}</p>
          </div>
        ))}
        {busy && <div className="setup-message setup-message-bot"><span className="setup-msg-label">SPENDSENSE ASSISTANT</span><p role="status">Considering your preferences…</p></div>}
      </div>
      <div className="setup-chat-composer">
        {messages.length <= 2 && <div className="setup-suggestions" aria-label="Example requests">
          {examples.map((example) => <button type="button" key={example} disabled={busy} onClick={() => void sendPrompt(example)}>{example} <BankIcon name="arrow-up-right" size={13}/></button>)}
        </div>}
        <form onSubmit={(event) => { event.preventDefault(); void sendPrompt(draft); }}>
          <label className="sr-only" htmlFor="accessibility-request">Tell the accessibility assistant what you need</label>
          <textarea
            id="accessibility-request"
            value={draft}
            maxLength={800}
            rows={2}
            placeholder="Tell me what would make this site easier for you…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void sendPrompt(draft);
              }
            }}
          />
          <button ref={sendButton} type="submit" aria-label="Send accessibility request" disabled={busy || !draft.trim()}><BankIcon name="arrow-up-right" size={21}/></button>
        </form>
        <VoiceInputButton
          label="Say what you need"
          onText={(text) => setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text))}
          onDone={() => sendButton.current?.focus()}
        />
        <div className="setup-chat-bottom">
          <span><BankIcon name="lock" size={13}/> Don&apos;t include account details or personal identifiers.</span>
          {aiAvailable ? <label className="setup-ai-toggle"><input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)}/> Use enhanced AI <span>(sends your message to the AI provider)</span></label> : <span>Works privately on this device</span>}
        </div>
        {modeMessage && <p className="setup-mode-message" role="status">{modeMessage}</p>}
      </div>
    </section>
  );
}

type RadioValue = AccessibilitySettings[keyof AccessibilitySettings] & string;
function OptionSet<T extends RadioValue>({
  label, help, setting, value, options, onChange,
}: {
  label: string;
  help?: string;
  setting: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return <fieldset className="setup-control">
    <legend>{label}</legend>
    {help && <p>{help}</p>}
    <div className="setup-choice-grid">
      {options.map((option) => <label key={option.value} className={`setup-choice ${value === option.value ? "setup-choice-active" : ""}`}>
        <input type="radio" name={`${id}-${setting}`} checked={value === option.value} value={option.value} onChange={() => onChange(option.value)}/>
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

function ManualPanel() {
  const { settings, update, reset, announcement } = useAccessibility();
  return <div className="setup-manual-panel">
    <div className="setup-manual-intro"><div><h2>Adjust every detail.</h2><p>Choose what works for you. Changes take effect immediately and are saved automatically.</p></div><button type="button" className="setup-reset" onClick={reset}><BankIcon name="reset" size={15}/> Reset</button></div>
    <div className="setup-controls-grid">
      <div className="setup-control-column">
        <p className="setup-category"><BankIcon name="book" size={17}/> READING & DISPLAY</p>
        <OptionSet label="Text size" setting="text-size" value={settings.textSize} options={[{ value: "default", label: "Standard" }, { value: "large", label: "Large" }, { value: "xlarge", label: "Extra large" }]} onChange={(textSize) => update({ textSize })}/>
        <OptionSet label="Colour contrast" setting="contrast" value={settings.contrast} options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High contrast" }]} onChange={(contrast) => update({ contrast })}/>
        <OptionSet label="Reading font" setting="font" value={settings.font} options={[{ value: "default", label: "Default" }, { value: "lexend", label: "Lexend" }, { value: "atkinson", label: "Atkinson" }]} onChange={(font) => update({ font })}/>
        <OptionSet label="Explanation style" setting="language" value={settings.language} options={[{ value: "simple", label: "Plain language" }, { value: "detailed", label: "More detail" }]} onChange={(language) => update({ language })}/>
        <OptionSet label="Reading spacing" setting="reading-spacing" value={settings.readingSpacing} options={[{ value: "standard", label: "Standard" }, { value: "relaxed", label: "More space" }]} onChange={(readingSpacing) => update({ readingSpacing })}/>
        <OptionSet label="Animation and movement" setting="motion" value={settings.motion} options={[{ value: "system", label: "Follow device" }, { value: "reduce", label: "Reduce motion" }]} onChange={(motion) => update({ motion })}/>
      </div>
      <div className="setup-control-column">
        <p className="setup-category"><BankIcon name="sound" size={17}/> AUDIO & FEEDBACK</p>
        <label className="setup-switch-row"><div><strong>Larger buttons and controls</strong><p>Make interactive controls easier to click and tap.</p></div><input type="checkbox" checked={settings.largeTargets} onChange={(event) => update({ largeTargets: event.target.checked })}/></label>
        <label className="setup-switch-row"><div><strong>Allow read-aloud</strong><p>Hear supported text using your browser&apos;s voice.</p></div><input type="checkbox" checked={settings.speechEnabled} onChange={(event) => update({ speechEnabled: event.target.checked })}/></label>
        <OptionSet label="Reading speed" setting="speech-speed" value={settings.speechRate} options={[{ value: "slow", label: "Slow" }, { value: "normal", label: "Normal" }, { value: "fast", label: "Fast" }]} onChange={(speechRate) => update({ speechRate })}/>
        <label className="setup-switch-row"><div><strong>Speak setting confirmations</strong><p>Hear a short confirmation after changing a setting.</p></div><input type="checkbox" checked={settings.speakConfirmations} onChange={(event) => update({ speakConfirmations: event.target.checked })}/></label>
        <div className="setup-tip"><BankIcon name="info" size={18}/><p>Both setup methods use these exact settings. You can return and change them whenever you need to.</p></div>
        <p className="setup-saved" role="status" aria-live="polite">{announcement ? `Saved: ${announcement}` : "Your changes are saved automatically on this device."}</p>
      </div>
    </div>
  </div>;
}

export function AccessibilityWorkspace({ mode }: { mode: Mode }) {
  const { finishSetup, restartSetup } = useAccessibility();
  const [tab, setTab] = useState<Tab>("chat");
  const isOnboarding = mode === "onboarding";
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: Tab = event.key === "Home" ? "chat" : event.key === "End" ? "manual"
      : event.key === "ArrowRight" ? (tab === "chat" ? "manual" : "chat") : (tab === "manual" ? "chat" : "manual");
    setTab(next);
    const target = event.currentTarget.querySelector<HTMLButtonElement>(`[role="tab"][data-tab="${next}"]`);
    target?.focus();
  };

  return <main id="main" tabIndex={-1} className={isOnboarding ? "setup-onboarding" : "setup-settings-page"}>
    {isOnboarding && <header className="setup-topbar"><Brand inverse/><span><BankIcon name="lock" size={14}/> ACCESSIBLE BANKING DEMO</span></header>}
    <div className="setup-introduction">
      <p className="setup-eyebrow"><span /> {isOnboarding ? "BEFORE WE GET STARTED" : "YOUR PREFERENCES"}</p>
      <h1>{isOnboarding ? <>Your banking, <em>your way.</em></> : <>An experience that <em>works for you.</em></>}</h1>
      <p>{isOnboarding
        ? "Everyone uses their money differently. Start by telling our assistant what you need, or set things up yourself. You're always in control."
        : "Tell the assistant what would help, or use the manual controls. Your preferences carry across the entire dashboard."}</p>
    </div>
    <div className="setup-workspace-grid">
      <div className="setup-main-card">
        <div className="setup-main-topline"><span>PERSONALISE YOUR EXPERIENCE</span><span>01 — SETUP</span></div>
        <div className="setup-tabs" role="tablist" aria-label="Choose how to set up accessibility" onKeyDown={onTabKeyDown}>
          <button type="button" role="tab" data-tab="chat" tabIndex={tab === "chat" ? 0 : -1} id={`setup-chat-tab-${mode}`} aria-selected={tab === "chat"} aria-controls={`setup-chat-content-${mode}`} onClick={() => setTab("chat")}><BankIcon name="sparkle" size={18}/> Ask the assistant</button>
          <button type="button" role="tab" data-tab="manual" tabIndex={tab === "manual" ? 0 : -1} id={`setup-manual-tab-${mode}`} aria-selected={tab === "manual"} aria-controls={`setup-manual-content-${mode}`} onClick={() => setTab("manual")}><BankIcon name="sliders" size={18}/> Choose manually</button>
        </div>
        <div className="setup-panel" role="tabpanel" id={`setup-chat-content-${mode}`} aria-labelledby={`setup-chat-tab-${mode}`} hidden={tab !== "chat"}><ChatPanel/></div>
        <div className="setup-panel" role="tabpanel" id={`setup-manual-content-${mode}`} aria-labelledby={`setup-manual-tab-${mode}`} hidden={tab !== "manual"}><ManualPanel/></div>
        <div className="setup-card-footer">
          <p><BankIcon name="check" size={16}/> Every setting is optional. You can change it later.</p>
          {isOnboarding ? <button className="setup-continue" type="button" onClick={finishSetup}>Continue to dashboard <BankIcon name="arrow-right" size={18}/></button> : <button className="setup-continue setup-continue-secondary" type="button" onClick={restartSetup}>View welcome setup again <BankIcon name="arrow-right" size={18}/></button>}
        </div>
      </div>
      <SettingsPreview />
    </div>
    {isOnboarding && <footer className="setup-footer"><span>SpendSense <span aria-hidden="true">·</span> Interactive demonstration only</span><span>Designed for clarity, choice and control</span></footer>}
  </main>;
}
