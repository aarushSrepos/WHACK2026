import type { SVGProps } from "react";

export type IconName = "home" | "receipt" | "chart" | "shield" | "credit" | "sliders" | "settings" | "arrow-up-right" | "arrow-right" | "chevron-right" | "chevron-down" | "arrow-down-left" | "search" | "sparkle" | "calendar" | "clock" | "check" | "lock" | "info" | "wallet" | "book" | "pause" | "help" | "sound" | "menu" | "close" | "reset" | "microphone";
export function BankIcon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-5l5-4 5 4v5"/></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
    chart: <><path d="M3 19h18M6 15V9M12 15V5M18 15v-7"/></>,
    shield: <><path d="M12 22c-4.5-2-8-5-8-10V5l8-3 8 3v7c0 5-3.5 8-8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    credit: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></>,
    sliders: <><path d="M4 7h8m4 0h4M4 17h4m4 0h8"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></>,
    settings: <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></>,
    "arrow-up-right": <><path d="M5 19 19 5M8 5h11v11"/></>,
    "arrow-right": <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    "arrow-down-left": <><path d="M19 5 5 19M16 19H5V8"/></>,
    "chevron-right": <path d="m9 5 7 7-7 7"/>,
    "chevron-down": <path d="m5 9 7 7 7-7"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    sparkle: <><path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/></>,
    microphone: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 5 5L20 7"/>,
    lock: <><rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v1"/></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M16 11h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></>,
    book: <><path d="M4 4h13a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3V4Zm0 14a3 3 0 0 1 3-3h13"/></>,
    pause: <><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-1 .6-1.3 1.1-1.3 2.4M12 17v.2"/></>,
    sound: <><path d="M4 9h4l5-4v14l-5-4H4V9Zm13 0a5 5 0 0 1 0 6"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
