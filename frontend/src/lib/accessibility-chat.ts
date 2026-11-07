import {
  defaultSettings,
  type AccessibilitySettings,
} from "./accessibility";

export type SettingsPatch = Partial<AccessibilitySettings>;
export type AssistantResult = {
  reply: string;
  patch: SettingsPatch;
  source: "guided" | "ai";
};

const labels: Record<keyof AccessibilitySettings, Record<string, string>> = {
  textSize: { default: "standard text", large: "larger text", xlarge: "extra-large text" },
  contrast: { standard: "standard contrast", high: "high contrast" },
  font: { default: "the default font", lexend: "Lexend font", atkinson: "Atkinson Hyperlegible font" },
  language: { simple: "plain-language explanations", detailed: "detailed explanations" },
  motion: { system: "your device's motion preference", reduce: "reduced animations" },
  speechEnabled: { true: "read-aloud enabled", false: "read-aloud disabled" },
  speechRate: { slow: "slower speech", normal: "normal speech speed", fast: "faster speech" },
  speakConfirmations: { true: "spoken setting confirmations", false: "quiet setting confirmations" },
  readingSpacing: { standard: "standard line spacing", relaxed: "more space between lines" },
  largeTargets: { true: "larger buttons and controls", false: "standard button sizes" },
};

export function describePatch(patch: SettingsPatch): string[] {
  return (Object.entries(patch) as [keyof AccessibilitySettings, string | boolean][])
    .map(([key, value]) => labels[key][String(value)] || `${key}: ${value}`);
}

/** Strictly validate any AI-suggested changes before they are applied. */
export function validatePatch(input: unknown): SettingsPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const data = input as Record<string, unknown>;
  const patch: SettingsPatch = {};
  if (["default", "large", "xlarge"].includes(String(data.textSize))) patch.textSize = data.textSize as AccessibilitySettings["textSize"];
  if (["standard", "high"].includes(String(data.contrast))) patch.contrast = data.contrast as AccessibilitySettings["contrast"];
  if (["default", "lexend", "atkinson"].includes(String(data.font))) patch.font = data.font as AccessibilitySettings["font"];
  if (["simple", "detailed"].includes(String(data.language))) patch.language = data.language as AccessibilitySettings["language"];
  if (["system", "reduce"].includes(String(data.motion))) patch.motion = data.motion as AccessibilitySettings["motion"];
  if (typeof data.speechEnabled === "boolean") patch.speechEnabled = data.speechEnabled;
  if (["slow", "normal", "fast"].includes(String(data.speechRate))) patch.speechRate = data.speechRate as AccessibilitySettings["speechRate"];
  if (typeof data.speakConfirmations === "boolean") patch.speakConfirmations = data.speakConfirmations;
  if (["standard", "relaxed"].includes(String(data.readingSpacing))) patch.readingSpacing = data.readingSpacing as AccessibilitySettings["readingSpacing"];
  if (typeof data.largeTargets === "boolean") patch.largeTargets = data.largeTargets;
  return patch;
}

const matches = (text: string, expression: RegExp) => expression.test(text);

/** Transparent, local pattern-based helper; no network or clinical inference. */
export function interpretAccessibilityMessage(
  message: string,
  current: AccessibilitySettings,
): AssistantResult {
  const q = message.toLowerCase().replace(/[^a-z\d\s'-]/g, " ").replace(/\s+/g, " ").trim();
  const patch: SettingsPatch = {};
  if (matches(q, /\b(reset (all |my |the )?(settings|preferences)|start (all )?over|restore defaults|back to default settings)\b/)) {
    return {
      patch: { ...defaultSettings },
      reply: "I've restored the starting preferences. You can fine-tune any setting again here or in the manual controls.",
      source: "guided",
    };
  }

  if (matches(q, /\b(extra[ -]?large|largest|much bigger|very (big|large)|huge|even bigger|enormous)\b/)) {
    patch.textSize = "xlarge";
  } else if (matches(q, /\b((text|font|letters|writing) (bigger|larger)|(bigger|larger) (text|font|letters|writing)|enlarge (the )?(text|font)|increase (the )?(text|font)|small (text|letters|writing)|tiny (text|letters)|hard to read (the )?(text|letters))\b/)) {
    patch.textSize = current.textSize === "xlarge" ? "xlarge" : "large";
  } else if (matches(q, /\b(default|regular|normal|standard) (text|font size)|make (the )?text smaller|smaller (text|letters|font)\b/)) {
    patch.textSize = "default";
  }

  if (matches(q, /\b(no|don't|do not|disable|turn off|less) (high )?contrast\b|\bstandard contrast\b/)) {
    patch.contrast = "standard";
  } else if (matches(q, /\b(high contrast|more contrast|stronger contrast|hard to see (the )?(text|colou?rs)|dark text on (a )?white background)\b/)) {
    patch.contrast = "high";
  }

  const readingHelp = matches(q, /\b(help (me )?(read|with reading)|make reading easier|easier to read|reading easier|readability|read the text)\b/);
  if (matches(q, /\b(default|regular|normal) font\b/)) {
    patch.font = "default";
  } else if (matches(q, /\b(atkinson|hyperlegible|letter shapes)\b/) || (readingHelp && matches(q, /\bdyslexia|dyslexic\b/))) {
    patch.font = "atkinson";
  } else if (matches(q, /\blexend\b/)) {
    patch.font = "lexend";
  }

  if (matches(q, /\b(more detail|more detailed|technical explanation|full explanation|longer explanation|detailed language)\b/)) {
    patch.language = "detailed";
  } else if (matches(q, /\b(simple|simplify|plain (english|language|words)|easy (to read|to understand)|short(er)? sentences|less jargon|without jargon|confusing words|simpler explanations)\b/)) {
    patch.language = "simple";
  }

  if (readingHelp && matches(q, /\bdyslexia|dyslexic\b/) && !matches(q, /\b(more detail|more detailed|technical|full explanation)\b/)) patch.language = "simple";

  if (matches(q, /\b(allow|enable|keep|turn on|more|restore|normal) (the )?(animation|animations|motion|movement|transitions)\b/)) {
    patch.motion = "system";
  } else if (matches(q, /\b(reduce|stop|disable|turn off|no|less|remove|avoid) (the )?(animation|animations|motion|movement|transitions)|\b(flashing|flicker|dizzy|vertigo|motion sickness|photosensitiv)\b|\b(animations?|movement|motion) (is |are )?(distracting|uncomfortable|painful|too much)\b/)) {
    patch.motion = "reduce";
  }

  if (matches(q, /\b(normal|standard|default) (line |letter |reading )?spacing|less (line |letter |reading )?spacing\b/)) {
    patch.readingSpacing = "standard";
  } else if (matches(q, /\b(more|extra|wider|relaxed|comfortable|increase) (line |letter |reading |word )?spacing|(more )?space between (the )?(lines|letters|words)|space (the )?(lines|letters|words) (out|apart)|lines (are )?(too )?(cramped|close together)\b/)) {
    patch.readingSpacing = "relaxed";
  }

  if (matches(q, /\b(normal|regular|standard|smaller) (buttons|button sizes|controls|click targets|tap targets)\b/)) {
    patch.largeTargets = false;
  } else if (matches(q, /\b(larger|bigger|big|large|wider) (buttons|controls|click targets|tap targets)|hard to (click|tap)|difficult to (click|tap)|keep missing (the )?buttons\b/)) {
    patch.largeTargets = true;
  }

  if (matches(q, /\b(no (sound|audio|speech|voice|read aloud)|mute|turn off (the )?(sound|audio|speech|voice|read aloud)|disable (the )?(sound|audio|speech|voice|read aloud)|stop (reading|speaking) aloud)\b/)) {
    patch.speechEnabled = false;
  } else if (matches(q, /\b(read (it |the page |this )?aloud|speak (to me|the page|the text)|talk to me|voice (support|reading)|enable (speech|audio|sound)|turn on (speech|audio|sound)|audio (support|reading)|hear (the )?(page|text|words))\b/)) {
    patch.speechEnabled = true;
  }

  if (matches(q, /\b(slow(er)? (voice|audio|speech|reading|talking)|read (more )?slowly|speak (more )?slowly|slower speech)\b/) || (matches(q, /\b(slower|slowly)\b/) && matches(q, /\b(read|speak|voice|audio|aloud)\b/))) {
    patch.speechRate = "slow";
    patch.speechEnabled = true;
  } else if (matches(q, /\b(fast(er)? (voice|audio|speech|reading|talking)|read (more )?quickly|speak (more )?quickly|faster speech)\b/)) {
    patch.speechRate = "fast";
    patch.speechEnabled = true;
  } else if (matches(q, /\b(normal|standard) (voice|audio|speech) speed\b/)) {
    patch.speechRate = "normal";
  }

  if (matches(q, /\b(don't|do not|stop|disable|no) (speak|read|announce) (the )?(setting )?(changes|confirmations)\b/)) {
    patch.speakConfirmations = false;
  } else if (matches(q, /\b(speak|read|announce) (the )?(setting )?(changes|confirmations)\b/)) {
    patch.speakConfirmations = true;
    patch.speechEnabled = true;
  }

  const changed = describePatch(patch);
  if (changed.length) {
    return {
      patch,
      reply: `I've applied ${changed.join(", ")}. You can describe another change, review the manual controls, or continue to your account. These choices are saved on this device.`,
      source: "guided",
    };
  }
  if (matches(q, /\b(adhd|dyslexia|dyslexic|low vision|poor eyesight|tremor|limited mobility|autism|autistic|anxious|anxiety|neurodivergen|disabled|disability|deaf|hearing loss)\b/)) {
    return {
      patch,
      reply: "Thanks for sharing. I won't assume which adjustments you want. Would larger text, simpler explanations, reduced animation, higher contrast or read-aloud support be useful? You can choose any combination.",
      source: "guided",
    };
  }
  return {
    patch,
    reply: "I can adjust text size, contrast, reading font, spacing, button sizes, explanation detail, animations, and read-aloud settings. For example, try ‘Make text much bigger, use simple words and stop animations.’ You can also choose every option manually.",
    source: "guided",
  };
}
