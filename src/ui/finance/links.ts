/** Banner callers must name the slot; income arrival date can precede payday. */
export function paydayIncomeHref(payDaySlot: string): string {
  return `/quick-add?kind=income&payDaySlot=${encodeURIComponent(payDaySlot)}`;
}
