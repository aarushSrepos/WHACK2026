export const STORAGE_KEY = "spendsense-accessibility";

export const textSizes = ["default", "large", "xlarge"] as const;
export const contrasts = ["standard", "high"] as const;
export const fonts = ["default", "lexend", "atkinson"] as const;
export const languages = ["simple", "detailed"] as const;
export const motions = ["system", "reduce"] as const;
export const speechRates = ["slow", "normal", "fast"] as const;

export type TextSize = (typeof textSizes)[number];
export type Contrast = (typeof contrasts)[number];
export type FontChoice = (typeof fonts)[number];
export type Language = (typeof languages)[number];
export type Motion = (typeof motions)[number];
export type SpeechRate = (typeof speechRates)[number];

export type AccessibilitySettings = {
  textSize: TextSize;
  contrast: Contrast;
  font: FontChoice;
  language: Language;
  motion: Motion;
  speechEnabled: boolean;
  speechRate: SpeechRate;
  speakConfirmations: boolean;
};

export const defaultSettings: AccessibilitySettings = {
  textSize: "default",
  contrast: "standard",
  font: "default",
  language: "detailed",
  motion: "system",
  speechEnabled: true,
  speechRate: "normal",
  speakConfirmations: false,
};

const speechRateValues: Record<SpeechRate, number> = {
  slow: 0.85,
  normal: 1,
  fast: 1.15,
};

export function speechRateValue(rate: SpeechRate): number {
  return speechRateValues[rate];
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

export function sanitizeSettings(value: unknown): AccessibilitySettings {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    textSize: oneOf(record.textSize, textSizes, defaultSettings.textSize),
    contrast: oneOf(record.contrast, contrasts, defaultSettings.contrast),
    font: oneOf(record.font, fonts, defaultSettings.font),
    language: oneOf(record.language, languages, defaultSettings.language),
    motion: oneOf(record.motion, motions, defaultSettings.motion),
    speechEnabled:
      typeof record.speechEnabled === "boolean"
        ? record.speechEnabled
        : defaultSettings.speechEnabled,
    speechRate: oneOf(
      record.speechRate,
      speechRates,
      defaultSettings.speechRate,
    ),
    speakConfirmations:
      typeof record.speakConfirmations === "boolean"
        ? record.speakConfirmations
        : defaultSettings.speakConfirmations,
  };
}

export function loadSettings(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AccessibilitySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applyToDocument(settings: AccessibilitySettings): void {
  const root = document.documentElement;
  root.dataset.textSize = settings.textSize;
  root.dataset.contrast = settings.contrast;
  root.dataset.font = settings.font;
  root.dataset.motion = settings.motion;
  root.dataset.language = settings.language;
}

const valueLabels: Record<string, string> = {
  default: "default",
  large: "large",
  xlarge: "extra large",
  standard: "standard",
  high: "high contrast",
  lexend: "Lexend",
  atkinson: "Atkinson Hyperlegible",
  simple: "simple",
  detailed: "detailed",
  system: "match this device",
  reduce: "reduced",
  slow: "slower",
  normal: "normal",
  fast: "faster",
};

export function describeChange(patch: Partial<AccessibilitySettings>): string {
  const keys = Object.keys(patch) as (keyof AccessibilitySettings)[];
  if (keys.length !== 1) {
    return "Settings are back to the starting choices.";
  }

  const key = keys[0];
  const value = patch[key];

  if (key === "speechEnabled") {
    return value ? "Spoken audio is on." : "Spoken audio is off.";
  }

  if (key === "speakConfirmations") {
    return value
      ? "Spoken confirmations are on."
      : "Spoken confirmations are off.";
  }

  const names: Record<string, string> = {
    textSize: "Text size",
    contrast: "Contrast",
    font: "Font",
    language: "Language",
    motion: "Motion",
    speechRate: "Speech speed",
  };

  return `${names[key] ?? "Setting"} is now ${valueLabels[String(value)] ?? String(value)}.`;
}

export const BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(!raw)return;var s=JSON.parse(raw);var root=document.documentElement;var pairs=[["textSize","textSize"],["contrast","contrast"],["font","font"],["motion","motion"],["language","language"]];for(var i=0;i<pairs.length;i++){var key=pairs[i][0];if(typeof s[key]==="string")root.dataset[key]=s[key];}}catch(e){}})();`;
