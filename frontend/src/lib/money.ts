/** The one money formatter. Takes whole pence, like the API: pounds(3500) -> "£35.00". */
export function pounds(pence: number, digits: 0 | 2 = 2): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(pence / 100);
}
