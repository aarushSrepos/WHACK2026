import type { Persona } from "@/components/demo-provider";
import type { Profile } from "./engine";

/**
 * Each demo customer's simulated credit file. Everything except the SpendSense card is
 * made up here; the SpendSense card's balance and limit come from the live demo account,
 * so paying the card down in the app changes the advice.
 */
export type CreditFile = Omit<Profile, "utilisation" | "total_limit"> & {
  otherBalance: number; // £ owed on other credit cards
  otherLimit: number;   // £ of limits on other credit cards
};

export const DEMO_FILES: Record<Persona, CreditFile> = {
  // Two cards near their limits, paying the minimum, a few recent applications.
  priya: {
    otherBalance: 2350, otherLimit: 2500, min_payment_months: 7, missed_12m: 0, missed_older: 1,
    months_since_missed: 30, defaults: 0, months_since_default: 72, ccj: 0, oldest_account_months: 74,
    num_accounts: 5, new_accounts_6m: 1, hard_searches_12m: 3, electoral_roll: 1, payday_loan_12m: 0,
    overdraft_months_12m: 2, financial_association: 0, rent_reported: 0, address_moves_2y: 0, renting: 1,
  },
  // A short credit history after moving house: not yet on the electoral roll at the new address.
  sam: {
    otherBalance: 0, otherLimit: 0, min_payment_months: 1, missed_12m: 0, missed_older: 0,
    months_since_missed: 72, defaults: 0, months_since_default: 72, ccj: 0, oldest_account_months: 14,
    num_accounts: 1, new_accounts_6m: 0, hard_searches_12m: 2, electoral_roll: 0, payday_loan_12m: 0,
    overdraft_months_12m: 1, financial_association: 0, rent_reported: 0, address_moves_2y: 2, renting: 1,
  },
  // A long, clean history with low card use.
  amara: {
    otherBalance: 300, otherLimit: 8000, min_payment_months: 0, missed_12m: 0, missed_older: 0,
    months_since_missed: 72, defaults: 0, months_since_default: 72, ccj: 0, oldest_account_months: 192,
    num_accounts: 4, new_accounts_6m: 0, hard_searches_12m: 1, electoral_roll: 1, payday_loan_12m: 0,
    overdraft_months_12m: 0, financial_association: 0, rent_reported: 0, address_moves_2y: 0, renting: 0,
  },
  // Rebuilding: a default 2.5 years ago, a recent missed payment and a payday loan this year.
  alex: {
    otherBalance: 900, otherLimit: 1000, min_payment_months: 6, missed_12m: 1, missed_older: 2,
    months_since_missed: 4, defaults: 1, months_since_default: 30, ccj: 0, oldest_account_months: 60,
    num_accounts: 3, new_accounts_6m: 0, hard_searches_12m: 2, electoral_roll: 1, payday_loan_12m: 1,
    overdraft_months_12m: 5, financial_association: 0, rent_reported: 0, address_moves_2y: 1, renting: 1,
  },
};

export function toProfile(file: CreditFile, cardBalance: number, cardLimit: number): Profile {
  const { otherBalance, otherLimit, ...rest } = file;
  const limit = otherLimit + cardLimit;
  const balance = otherBalance + cardBalance;
  return { ...rest, total_limit: limit, utilisation: limit > 0 ? Math.round(balance / limit * 1000) / 1000 : 0 };
}
