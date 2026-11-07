"use client";
import { useEffect, useState } from "react";
import { useDemo, PERSONAS, type Persona } from "@/components/demo-provider";
import { seedSettings, useAccessibility } from "@/components/accessibility-provider";
import type { AccessibilitySettings } from "@/lib/accessibility";

const labels: Record<Persona, string> = {
  priya: "Priya — easier reading",
  sam: "Sam — text first",
  amara: "Amara — screen reader",
  alex: "Alex — calmer view",
};

// Starting preferences for each demo customer. They are applied only when someone picks a customer
// from the dropdown, so changes made on the settings page survive a page reload.
const presets: Record<Persona, Partial<AccessibilitySettings>> = {
  priya: { textSize: "large", font: "lexend", language: "simple", motion: "system", speechEnabled: false, speakConfirmations: false },
  sam: { textSize: "default", font: "default", language: "detailed", motion: "system", speechEnabled: false, speakConfirmations: false },
  amara: { textSize: "large", font: "atkinson", language: "simple", motion: "system", speechEnabled: true, speakConfirmations: true },
  alex: { textSize: "large", font: "default", language: "simple", motion: "reduce", speechEnabled: false, speakConfirmations: false },
};

export function PersonaPicker() {
  const { persona, setPersona } = useDemo();
  const { update } = useAccessibility();
  const [said, setSaid] = useState("");

  // Lets CSS tweak the look per persona. This only touches the page, never React state.
  useEffect(() => {
    document.documentElement.dataset.persona = persona;
    seedSettings(presets[persona]);
  }, [persona]);

  const choose = (p: Persona) => {
    setPersona(p);
    const message = `Showing ${labels[p]}. Their starting preferences are applied. You can change them at any time.`;
    update(presets[p], message);
    setSaid(message);
  };

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      Demo customer{" "}
      <select
        className="rounded-lg border border-line bg-surface px-3 py-2 text-ink"
        value={persona}
        onChange={(e) => choose(e.target.value as Persona)}
      >
        {PERSONAS.map((p) => (
          <option key={p} value={p}>
            {labels[p]}
          </option>
        ))}
      </select>
      <span role="status" className="sr-only">{said}</span>
    </label>
  );
}
