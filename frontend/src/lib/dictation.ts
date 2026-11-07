"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Voice to text with the browser's built-in speech recognition (no key, no extra service).
 * Works in Chrome, Edge and Safari. Firefox has no support, so the microphone button simply does not appear.
 * Note: Chrome sends the audio to Google's servers to turn it into text; the button's help text says so.
 */

// The Web Speech API is not in TypeScript's built-in types yet, so we describe the parts we use.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};
export function useDictationSupported(): boolean {
  return useSyncExternalStore(noSubscribe, () => recognitionClass() !== null, () => false);
}

const ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it from the icon in your browser's address bar, then try again.",
  "service-not-allowed": "The microphone is blocked. Allow it from the icon in your browser's address bar, then try again.",
  "no-speech": "I didn't hear anything. Press the microphone and try again.",
  "audio-capture": "No microphone was found. Check one is connected.",
  network: "Voice typing needs an internet connection. You can still type.",
};

/**
 * `onText` gets the finished words once you stop talking. `interim` shows words as they are heard.
 */
export function useDictation(onText: (text: string) => void) {
  const supported = useDictationSupported();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  }, [onText]);
  useEffect(() => () => recognition.current?.abort(), []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionClass();
    if (!Ctor) return;
    recognition.current?.abort();
    const r = new Ctor();
    r.lang = "en-GB";
    r.interimResults = true;
    r.continuous = false; // stops by itself after a pause
    r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else heard += result[0].transcript;
      }
      setInterim(heard);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(ERRORS[e.error] ?? "Voice typing stopped. Please try again.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      const text = finalText.trim();
      if (text) latest.current(text.charAt(0).toUpperCase() + text.slice(1));
    };
    recognition.current = r;
    setError(null);
    setInterim("");
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      setError("Voice typing could not start. Please try again.");
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}
