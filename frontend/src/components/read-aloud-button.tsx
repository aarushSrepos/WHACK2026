"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccessibility } from "@/components/accessibility-provider";
import { BankIcon } from "@/components/bank-icon";
import { speak, speechSupported, stopSpeaking } from "@/lib/speech";

export function ReadAloudButton({ text }: { text: string }) {
  const { settings } = useAccessibility();
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  // Browser speech availability is only known after the component mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { mounted.current = true; setSupported(speechSupported()); return () => { mounted.current = false; stopSpeaking(); }; }, []);
  // Ensure playback and UI stop when the audio preference is disabled.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!settings.speechEnabled) { stopSpeaking(); setSpeaking(false); } }, [settings.speechEnabled]);
  const toggle = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); setStatus("Reading stopped."); return; }
    setSpeaking(true); setStatus("Reading aloud.");
    const started = speak(text, settings.speechRate, { onend: () => { if (mounted.current) { setSpeaking(false); setStatus("Reading finished."); } }, onerror: (message) => { if (mounted.current) { setSpeaking(false); setStatus(message); } } });
    if (!started) { setSpeaking(false); setStatus("Speech is unavailable in this browser."); }
  };
  if (!settings.speechEnabled || !supported) return <Link className="read-aloud-link" href="/settings"><BankIcon name="sound" size={15}/>{supported ? "Enable audio" : "Audio unavailable"}</Link>;
  return <span className="read-aloud-control"><button type="button" className="read-aloud-link" onClick={toggle} aria-pressed={speaking}><BankIcon name="sound" size={16}/>{speaking ? "Stop reading" : "Read aloud"}</button><span className="sr-only" role="status" aria-live="polite">{status}</span></span>;
}
