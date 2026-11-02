import type { Bottle, Category, PaymentMethod, CurrencyCode, Income, Expense } from "@/domain/types";
export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}
export type FormAction = (state: FormState, data: FormData) => Promise<FormState>;
export interface FormOptions {
  categories: Category[];
  paymentMethods: PaymentMethod[];
  bottles: Bottle[];
  today: string;
  baseCurrency: CurrencyCode;
}
export type TransactionRow = { kind: "expense"; value: Expense } | { kind: "income"; value: Income };
