"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyToDocument,
  defaultSettings,
  describeChange,
  loadSettings,
  saveSettings,
  type AccessibilitySettings,
} from "@/lib/accessibility";
import { speak, stopSpeaking } from "@/lib/speech";

type AccessibilityContextValue = {
  settings: AccessibilitySettings;
  announcement: string;
  update: (patch: Partial<AccessibilitySettings>) => void;
  reset: () => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(
  null,
);

export function AccessibilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] =
    useState<AccessibilitySettings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const settingsRef = useRef(settings);

  useLayoutEffect(() => {
    const stored = loadSettings();
    settingsRef.current = stored;
    setSettings(stored);
    applyToDocument(stored);
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    applyToDocument(settings);
    saveSettings(settings);
  }, [ready, settings]);

  const update = useCallback((patch: Partial<AccessibilitySettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);

    const message = describeChange(patch);
    setAnnouncement(message);

    if (patch.speechEnabled === false) {
      stopSpeaking();
      return;
    }

    const shouldSpeak =
      next.speechEnabled &&
      (next.speakConfirmations || patch.speakConfirmations === false);

    if (shouldSpeak) speak(message, next.speechRate);
  }, []);

  const reset = useCallback(() => {
    const previous = settingsRef.current;
    settingsRef.current = defaultSettings;
    setSettings(defaultSettings);
    const message = "Settings are back to the starting choices.";
    setAnnouncement(message);

    if (previous.speechEnabled && previous.speakConfirmations) {
      speak(message, previous.speechRate);
    }
  }, []);

  const value = useMemo(
    () => ({ settings, announcement, update, reset }),
    [settings, announcement, update, reset],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const value = useContext(AccessibilityContext);
  if (!value) {
    throw new Error(
      "useAccessibility must be used within AccessibilityProvider",
    );
  }
  return value;
}
