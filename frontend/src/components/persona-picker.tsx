"use client";
import { useDemo, type Persona } from "@/components/demo-provider";
import { useAccessibility } from "@/components/accessibility-provider";
import { BankIcon } from "@/components/bank-icon";
import { useEffect, useRef } from "react";
import type { AccessibilitySettings } from "@/lib/accessibility";
const labels: Record<Persona, string> = { priya: "Priya", sam: "Sam", amara: "Amara", alex: "Alex" };
const presets: Record<Persona, Partial<AccessibilitySettings>> = {
  priya: { textSize: "large", font: "lexend", language: "simple", speechEnabled: false, speakConfirmations: false },
  sam: { textSize: "default", font: "default", language: "simple", speechEnabled: false, speakConfirmations: false },
  amara: { textSize: "large", font: "atkinson", language: "simple", speechEnabled: true, speakConfirmations: true },
  alex: { textSize: "large", font: "default", language: "simple", motion: "reduce", speechEnabled: false, speakConfirmations: false },
};
export function PersonaPicker() {
  const { persona, setPersona } = useDemo();
  const { update } = useAccessibility();
  const previous = useRef<Persona | null>(null);
  useEffect(() => {
    document.documentElement.dataset.persona = persona;
    if (previous.current !== persona) { if (previous.current !== null) update(presets[persona]); previous.current = persona; }
  }, [persona, update]);
  return <label className="account-switcher"><span className="profile-avatar" aria-hidden="true">{labels[persona][0]}</span><span className="profile-label">{labels[persona]}<small>Demo profile</small></span><select aria-label="Switch demo customer" value={persona} onChange={e => setPersona(e.target.value as Persona)}>{(Object.keys(labels) as Persona[]).map(p => <option key={p} value={p}>{labels[p]} — demo account</option>)}</select><BankIcon name="chevron-down" size={16}/></label>;
}
