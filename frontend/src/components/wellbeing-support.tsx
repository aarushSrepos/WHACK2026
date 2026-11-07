"use client";
import Link from "next/link";
import { BankIcon } from "@/components/bank-icon";
export function WellbeingSupport() {
  return <details className="support-disclosure"><summary><span><BankIcon name="help" size={19}/> Need a little more support?</span><BankIcon name="chevron-down" size={18}/></summary><div className="support-disclosure-body"><p>Money decisions can be complicated. You can review your balance in plain language, explore repayment scenarios without committing, or make the text easier to read.</p><div><Link href="/support">Talk to a person, your way <BankIcon name="arrow-right" size={14}/></Link><Link href="/statement">Understand my statement <BankIcon name="arrow-right" size={14}/></Link><Link href="/settings">Accessibility preferences <BankIcon name="arrow-right" size={14}/></Link></div><p>For a real account, contact your card provider directly if you need payment support. SpendSense is a demonstration, not a bank or financial advice service.</p></div></details>;
}
