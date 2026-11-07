import { BankIcon, type IconName } from "@/components/bank-icon";
import type { Guidance } from "@/lib/api";

const ICON: Record<Guidance["kind"], IconName> = {
  contact: "check",
  no_phone: "close",
  letters: "book",
  calls: "clock",
  helper: "shield",
  notes: "info",
};

/** The "How to help this customer" instructions, used by the staff console and the customer's preview. */
export function GuidanceList({ items }: { items: Guidance[] }) {
  if (items.length === 0) return <p className="readable-copy mt-3">No special requirements recorded.</p>;
  return <ul className="guidance-list">
    {items.map((g, i) => <li key={i} className={`guidance-${g.kind}`}>
      <BankIcon name={ICON[g.kind]} size={18} />
      <span>{g.text}</span>
    </li>)}
  </ul>;
}
