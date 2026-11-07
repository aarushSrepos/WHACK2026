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
  ready: boolean;
  setupComplete: boolean;
  finishSetup: () => void;
  restartSetup: () => void;
  announcement: string;
  update: (patch: Partial<AccessibilitySettings>) => void;
  reset: () => void;
};

const ONBOARDING_KEY = "spendsense-accessibility-onboarded-v1";

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
  const [setupComplete, setSetupComplete] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const settingsRef = useRef(settings);

  useLayoutEffect(() => {
    const stored = loadSettings();
    settingsRef.current = stored;
    // This effect hydrates saved preferences from localStorage after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(stored);
    applyToDocument(stored);
    try {
      setSetupComplete(sessionStorage.getItem(ONBOARDING_KEY) === "yes");
    } catch { /* Storage may be disabled; onboarding remains available. */ }
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

  const finishSetup = useCallback(() => {
    try { sessionStorage.setItem(ONBOARDING_KEY, "yes"); } catch { /* Continue for this session. */ }
    setSetupComplete(true);
  }, []);

  const restartSetup = useCallback(() => {
    try { sessionStorage.removeItem(ONBOARDING_KEY); } catch { /* Continue for this session. */ }
    setSetupComplete(false);
  }, []);

  const value = useMemo(
    () => ({ settings, ready, setupComplete, finishSetup, restartSetup, announcement, update, reset }),
    [settings, ready, setupComplete, finishSetup, restartSetup, announcement, update, reset],
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
