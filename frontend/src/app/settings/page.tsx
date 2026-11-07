import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";

export const metadata: Metadata = {
  title: "Share your situation",
  description:
    "Choose text size, contrast, font, language, motion, and audio for SpendSense.",
};

export default function SettingsPage() {
  return <SettingsForm />;
}
