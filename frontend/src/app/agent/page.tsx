import type { Metadata } from "next";
import { StaffConsole } from "@/components/staff-console";

export const metadata: Metadata = {
  title: "Staff console",
  description: "Demo staff view: each customer's needs and support requests.",
};

export default function Page() {
  return <StaffConsole />;
}
