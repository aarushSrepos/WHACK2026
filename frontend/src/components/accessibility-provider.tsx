"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import {
  applyToDocument,
  defaultSettings,
  describeChange,
  loadSettings,
  saveSettings,
  STORAGE_KEY,
  type AccessibilitySettings,
} from "@/lib/accessibility";
import { speak, stopSpeaking } from "@/lib/speech";

type AccessibilityContextValue = {
  settings: AccessibilitySettings;
  announcement: string;
  /** Change some settings. `message` replaces the default "Text size is now large." announcement. */
  update: (patch: Partial<AccessibilitySettings>, message?: string) => void;
  reset: () => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

// Settings live in localStorage, read through a tiny store. The server render uses the defaults;
// the boot script in layout.tsx has already applied the saved look before React starts, so nothing flashes.
let cached: AccessibilitySettings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): AccessibilitySettings {
  if (cached === null) cached = loadSettings();
  return cached;
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
function write(next: AccessibilitySettings) {
  cached = next;
  try {
    saveSettings(next);
  } catch {
    /* private browsing: settings last until the tab closes */
  }
  applyToDocument(next);
  listeners.forEach((listener) => listener());
}

/** First visit only (nothing saved yet): start from the demo customer's preferences. */
export function seedSettings(patch: Partial<AccessibilitySettings>) {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* no storage: use the patch */
  }
  if (saved === null) write({ ...defaultSettings, ...patch });
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => defaultSettings);
  const [announcement, setAnnouncement] = useState("");

  const update = useCallback((patch: Partial<AccessibilitySettings>, message?: string) => {
    const next = { ...getSnapshot(), ...patch };
    write(next);

    const text = message ?? describeChange(patch);
    setAnnouncement(text);

    if (patch.speechEnabled === false) {
      stopSpeaking();
      return;
    }

    const shouldSpeak = next.speechEnabled && (next.speakConfirmations || patch.speakConfirmations === false);
    if (shouldSpeak) speak(text, next.speechRate);
  }, []);

  const reset = useCallback(() => {
    const previous = getSnapshot();
    write(defaultSettings);
    const message = "Settings are back to the starting choices.";
    setAnnouncement(message);

    if (previous.speechEnabled && previous.speakConfirmations) {
      speak(message, previous.speechRate);
    }
  }, []);

  const value = useMemo(() => ({ settings, announcement, update, reset }), [settings, announcement, update, reset]);

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const value = useContext(AccessibilityContext);
  if (!value) {
    throw new Error("useAccessibility must be used within AccessibilityProvider");
  }
  return value;
}
