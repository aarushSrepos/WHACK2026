import {
  speechRateValue,
  type SpeechRate,
} from "@/lib/accessibility";

type SpeakHandlers = {
  onend?: () => void;
  onerror?: (message: string) => void;
};

function preferredVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices();
  return (
    voices.find((voice) => /en-GB/i.test(voice.lang)) ??
    voices.find((voice) => /^en/i.test(voice.lang))
  );
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}

export function speak(
  text: string,
  rate: SpeechRate,
  handlers: SpeakHandlers = {},
): boolean {
  if (!speechSupported()) return false;

  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = speechRateValue(rate);

  const voice = preferredVoice(synth);
  if (voice) utterance.voice = voice;

  utterance.onend = () => handlers.onend?.();
  utterance.onerror = (event) => {
    if (event.error === "interrupted" || event.error === "canceled") {
      handlers.onend?.();
      return;
    }
    handlers.onerror?.("Speech could not start in this browser.");
  };

  // Chrome sometimes leaves synthesis paused after cancel().
  synth.cancel();
  synth.resume();
  synth.speak(utterance);
  return true;
}
