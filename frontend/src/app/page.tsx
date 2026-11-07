import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Your demo card balance, minimum payment and due date.",
};

export default function Page() {
  return <DashboardView />;
}
