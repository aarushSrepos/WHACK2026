import type { Metadata } from "next";
import { CreditCoach } from "@/components/credit-coach";
import "./credit-coach.css";

export const metadata: Metadata = { title: "Improve your credit score" };
export default function Page() { return <CreditCoach/>; }
