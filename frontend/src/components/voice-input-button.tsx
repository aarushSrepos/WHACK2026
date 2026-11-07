"use client";
import { useEffect, useId, useState } from "react";
import { BankIcon } from "@/components/bank-icon";
import { useDictation } from "@/lib/dictation";

/**
 * A microphone button for a chat box. Press, speak, and your words are added to the box.
 * You still choose when to send, so nothing goes anywhere you haven't checked.
 * Renders nothing in browsers without speech recognition (e.g. Firefox): typing still works.
 */
export function VoiceInputButton({ onText, label = "Speak your question", onDone }: {
  onText: (text: string) => void;
  label?: string;
  /** Called after words are added, e.g. to move focus to the Send button. */
  onDone?: () => void;
}) {
  // Counts how many times words were added. onDone runs in an effect, i.e. after the screen has updated,
  // so a Send button that was disabled while the box was empty is enabled by then and can take focus.
  const [filled, setFilled] = useState(0);
  const { supported, listening, interim, error, start, stop } = useDictation((text) => {
    onText(text);
    setFilled((n) => n + 1);
  });
  useEffect(() => {
    if (filled) onDone?.();
    // Only when new words arrive, not when the parent passes a new onDone function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);
  const helpId = useId();
  if (!supported) return null;

  return <div className="voice-input">
    <button
      type="button"
      className={`voice-button ${listening ? "is-listening" : ""}`}
      aria-pressed={listening}
      aria-describedby={helpId}
      onClick={listening ? stop : start}
    >
      <BankIcon name={listening ? "close" : "microphone"} size={17} />
      <span>{listening ? "Stop listening" : label}</span>
    </button>
    <p id={helpId} className="voice-help" aria-live="polite">
      {error
        ? <span role="alert" className="voice-error">{error}</span>
        : listening
          ? <span>Listening… {interim && <q>{interim}</q>}</span>
          : <span>Your words appear in the box for you to check before sending. Uses your browser&apos;s speech recognition (Chrome sends audio to Google).</span>}
    </p>
  </div>;
}
