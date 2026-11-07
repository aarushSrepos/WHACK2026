"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAccessibility } from "@/components/accessibility-provider";
import { speak, speechSupported, stopSpeaking } from "@/lib/speech";

const noSubscribe = () => () => {};

/**
 * Reads `text` aloud with the browser's speech.
 * `what` says what will be read, e.g. "your account summary" (used in the help text and status).
 * `onNavy` is for the dark balance panel; everywhere else the button sits on a light card.
 */
export function ReadAloudButton({ text, what = "this explanation", onNavy = false }: { text: string; what?: string; onNavy?: boolean }) {
  const muted = onNavy ? "text-on-navy-muted" : "text-muted";
  const { settings } = useAccessibility();
  const helpId = useId();
  const statusId = useId();
  const [playing, setPlaying] = useState(false);
  const supported = useSyncExternalStore(noSubscribe, speechSupported, () => true);
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  // Turning speech off in settings stops the button straight away.
  const speaking = playing && settings.speechEnabled;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (!settings.speechEnabled) stopSpeaking();
  }, [settings.speechEnabled]);

  function toggle() {
    if (!settings.speechEnabled || !supported) return;

    if (speaking) {
      stopSpeaking();
      setPlaying(false);
      setStatus("Stopped reading.");
      return;
    }

    setStatus(`Reading ${what}.`);
    setPlaying(true);
    const started = speak(text, settings.speechRate, {
      onend: () => {
        if (mounted.current) setPlaying(false);
      },
      onerror: (message) => {
        if (!mounted.current) return;
        setPlaying(false);
        setStatus(message);
      },
    });

    if (!started) {
      setPlaying(false);
      setStatus("This browser cannot read text aloud.");
    }
  }

  const unavailable = !supported || !settings.speechEnabled;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={speaking}
        aria-describedby={`${helpId} ${statusId}`}
        disabled={unavailable}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${
          onNavy ? "bg-white text-navy" : "border-2 border-brand bg-surface text-ink"
        }`}
      >
        <SpeakerIcon />
        {speaking ? "Stop reading" : "Read aloud"}
      </button>
      <p id={helpId} className={`mt-2 max-w-prose text-sm ${muted}`}>
        {unsupportedCopy(supported, settings.speechEnabled, what, onNavy)}
      </p>
      <p
        id={statusId}
        role="status"
        className={status ? `mt-2 text-sm ${muted}` : "sr-only"}
      >
        {status}
      </p>
    </div>
  );
}

function unsupportedCopy(supported: boolean, speechEnabled: boolean, what: string, onNavy: boolean) {
  if (!supported) {
    return "This browser cannot read text aloud.";
  }
  if (!speechEnabled) {
    return (
      <>
        Speech is turned off. Turn it on in{" "}
        <Link href="/settings" className={onNavy ? "text-on-navy" : "text-ink"}>
          Share your situation
        </Link>
        .
      </>
    );
  }
  return `Reads ${what} out loud.`;
}

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10v4h4l5 4V6L8 10H4z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </svg>
  );
}
