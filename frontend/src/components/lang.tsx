"use client";

import { useAccessibility } from "@/components/accessibility-provider";

export function Lang({
  simple,
  detailed,
}: {
  simple: React.ReactNode;
  detailed: React.ReactNode;
}) {
  const { settings } = useAccessibility();
  return <>{settings.language === "simple" ? simple : detailed}</>;
}
