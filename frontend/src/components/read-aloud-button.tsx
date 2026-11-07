"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAccessibility } from "@/components/accessibility-provider";
import { speak, speechSupported, stopSpeaking } from "@/lib/speech";

export function ReadAloudButton({ text }: { text: string }) {
  const { settings } = useAccessibility();
  const helpId = useId();
  const statusId = useId();
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setSupported(speechSupported());
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (!settings.speechEnabled) {
      stopSpeaking();
      setSpeaking(false);
    }
  }, [settings.speechEnabled]);

  function toggle() {
    if (!settings.speechEnabled || !supported) return;

    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      setStatus("Stopped reading.");
      return;
    }

    setStatus("Reading your account summary.");
    setSpeaking(true);
    const started = speak(text, settings.speechRate, {
      onend: () => {
        if (mounted.current) setSpeaking(false);
      },
      onerror: (message) => {
        if (!mounted.current) return;
        setSpeaking(false);
        setStatus(message);
      },
    });

    if (!started) {
      setSpeaking(false);
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
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-3 text-base font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-70"
      >
        <SpeakerIcon />
        {speaking ? "Stop reading" : "Read aloud"}
      </button>
      <p id={helpId} className="mt-2 max-w-prose text-sm text-on-navy-muted">
        {unsupportedCopy(supported, settings.speechEnabled)}
      </p>
      <p
        id={statusId}
        role="status"
        className={status ? "mt-2 text-sm text-on-navy-muted" : "sr-only"}
      >
        {status}
      </p>
    </div>
  );
}

function unsupportedCopy(supported: boolean, speechEnabled: boolean) {
  if (!supported) {
    return "This browser cannot read text aloud.";
  }
  if (!speechEnabled) {
    return (
      <>
        Speech is turned off. Turn it on in{" "}
        <Link href="/settings" className="text-on-navy">
          Share your situation
        </Link>
        .
      </>
    );
  }
  return "Reads your balance, minimum payment, and due date.";
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
