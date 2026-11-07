"use client";

import { useId } from "react";
import { Lang } from "@/components/lang";
import { useAccessibility } from "@/components/accessibility-provider";
import {
  contrasts,
  fonts,
  languages,
  motions,
  speechRates,
  textSizes,
} from "@/lib/accessibility";

export function SettingsForm() {
  const { settings, announcement, update, reset } = useAccessibility();
  const statusId = useId();

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Share your situation
        </h1>
        <p className="mt-3 text-lg text-muted">
          <Lang
            simple="Choose what makes this site easier. We save it on this device."
            detailed="Tell us how you want SpendSense to look, read, and sound. These choices apply to every page and stay on this device after you refresh."
          />
        </p>
      </div>

      <form
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-6"
      >
        <p id={statusId} role="status" aria-live="polite" aria-atomic="true" className="ss-card">
          {announcement
            ? `Saved. ${announcement}`
            : "Changes save on this device as soon as you make them."}
        </p>

        <section aria-labelledby="seeing-heading" className="grid gap-5">
          <h2 id="seeing-heading" className="text-2xl font-bold">
            Seeing the page
          </h2>
          <ChoiceGroup
            legend="Text size"
            description="Default follows the text size already set in your browser."
            name="text-size"
            value={settings.textSize}
            options={textSizes.map((value) => ({
              value,
              label:
                value === "default"
                  ? "Default"
                  : value === "large"
                    ? "Large"
                    : "Extra large",
            }))}
            onChange={(textSize) => update({ textSize })}
          />
          <ChoiceGroup
            legend="Contrast"
            description="High contrast uses black, white, and stronger borders."
            name="contrast"
            value={settings.contrast}
            options={contrasts.map((value) => ({
              value,
              label: value === "standard" ? "Standard" : "High contrast",
              hint:
                value === "standard"
                  ? "Navy, blue, and white."
                  : "Black text, white background, and yellow focus.",
            }))}
            onChange={(contrast) => update({ contrast })}
          />
          <ChoiceGroup
            legend="Font"
            name="font"
            value={settings.font}
            options={fonts.map((value) => ({
              value,
              label:
                value === "default"
                  ? "Default"
                  : value === "lexend"
                    ? "Lexend"
                    : "Atkinson Hyperlegible",
              hint:
                value === "default"
                  ? "A plain sans-serif."
                  : value === "lexend"
                    ? "Shaped to be easier to read in longer text."
                    : "Letter shapes that are easier to tell apart.",
            }))}
            onChange={(font) => update({ font })}
          />
          <ChoiceGroup
            legend="Motion"
            name="motion"
            value={settings.motion}
            options={motions.map((value) => ({
              value,
              label: value === "system" ? "Match this device" : "Reduce motion",
              hint:
                value === "system"
                  ? "Follows the reduced-motion setting on your device."
                  : "Turns off movement and animation on this site.",
            }))}
            onChange={(motion) => update({ motion })}
          />
        </section>

        <section aria-labelledby="language-heading" className="grid gap-5">
          <h2 id="language-heading" className="text-2xl font-bold">
            Understanding the words
          </h2>
          <ChoiceGroup
            legend="Language"
            name="language"
            value={settings.language}
            options={languages.map((value) => ({
              value,
              label: value === "simple" ? "Simple" : "Detailed",
              hint:
                value === "simple"
                  ? "Short sentences and everyday words."
                  : "More explanation about what the numbers mean.",
            }))}
            onChange={(language) => update({ language })}
          />
          <div className="ss-card" aria-label="Language preview">
            <p className="font-semibold">Preview</p>
            <p className="mt-2 text-lg">
              <Lang
                simple="You owe £850. The smallest payment is £35. Pay within 5 days."
                detailed="Statement balance £850. Minimum payment £35, due in 5 days on Thursday 12 November 2026."
              />
            </p>
          </div>
        </section>

        <section aria-labelledby="hearing-heading" className="grid gap-5">
          <h2 id="hearing-heading" className="text-2xl font-bold">
            Hearing the page
          </h2>
          <fieldset className="ss-card">
            <legend className="text-lg font-semibold">Spoken audio</legend>
            <p id="speech-help" className="mt-1 mb-4 text-muted">
              The Read aloud button on the dashboard uses your browser&apos;s
              voice. It does not send audio anywhere.
            </p>
            <Toggle
              name="speech-enabled"
              checked={settings.speechEnabled}
              describedBy="speech-help"
              label="Allow spoken audio"
              hint="Turns Read aloud on or off."
              onChange={(speechEnabled) => update({ speechEnabled })}
            />
          </fieldset>
          <ChoiceGroup
            legend="Speech speed"
            description="Used when spoken audio is on."
            name="speech-rate"
            value={settings.speechRate}
            options={speechRates.map((value) => ({
              value,
              label:
                value === "slow" ? "Slower" : value === "normal" ? "Normal" : "Faster",
              hint: value === "slow" ? "Easier to follow." : undefined,
            }))}
            onChange={(speechRate) => update({ speechRate })}
          />
          <fieldset className="ss-card">
            <legend className="text-lg font-semibold">Confirmations</legend>
            <div className="mt-3">
              <Toggle
                name="speak-confirmations"
                checked={settings.speakConfirmations}
                label="Speak when a setting changes"
                hint="Also say the confirmation out loud. Screen readers already hear the saved message."
                onChange={(speakConfirmations) => update({ speakConfirmations })}
              />
            </div>
          </fieldset>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-navy bg-surface px-5 py-3 font-semibold text-navy"
          >
            Reset to starting choices
          </button>
        </div>
      </form>
    </main>
  );
}

function ChoiceGroup<T extends string>({
  legend,
  description,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  description?: string;
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <fieldset className="ss-card">
      <legend className="text-lg font-semibold">{legend}</legend>
      {description ? (
        <p id={descriptionId} className="mt-1 mb-3 text-muted">
          {description}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="grid gap-2">
        {options.map((option) => {
          const optionId = `${id}-${String(option.value)}`;
          const checked = value === option.value;
          return (
            <label
              key={String(option.value)}
              htmlFor={optionId}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 ${
                checked ? "border-brand bg-soft" : "border-line bg-surface"
              }`}
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={String(option.value)}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              <span>
                <span className="block font-semibold">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block text-muted">{option.hint}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Toggle({
  name,
  label,
  hint,
  checked,
  describedBy,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  describedBy?: string;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        aria-describedby={describedBy ? `${hintId} ${describedBy}` : hintId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span id={hintId} className="mt-0.5 block text-muted">
          {hint}
        </span>
      </span>
    </label>
  );
}
