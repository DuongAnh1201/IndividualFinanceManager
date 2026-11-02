import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney } from "@/domain/money";
import { saveSetting } from "@/app/settings/actions";
import { loadBottlesView } from "@/app/_lib/views";
import { friendlyDate } from "@/ui/finance/dates";
import { EmptyState } from "@/ui/empty-state";
import { OperationForm } from "@/ui/settings/operation-form";
import { Penny, bottleMascots } from "@/ui/mascots";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Income & Bottles" };

export default function BottlesPage() {
  const view = loadBottlesView();
  const { options, activeBottles } = view;
  const base = options.baseCurrency;
  const bottleName = (id: string) => options.bottles.find((b) => b.id === id)?.name ?? "Unknown bottle";
  const bottleOptions = activeBottles.map((b) => ({ value: b.id, label: b.name }));

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Every coin has a home</p>
          <h1>Income &amp; Bottles</h1>
          <p>See where each income landed and how much each bottle holds.</p>
        </div>
        <Link href="/quick-add?kind=income" className="button">
          Add income
        </Link>
      </div>

      {view.missingRateRows > 0 && (
        <p className="inline-notice" role="status">
          {view.missingRateRows} {view.missingRateRows === 1 ? "entry has" : "entries have"} no exchange rate
          yet, so balances below leave {view.missingRateRows === 1 ? "it" : "them"} out. Add the monthly rate
          in <Link href="/settings#rates">Settings</Link>.
        </p>
      )}

      <section aria-labelledby="balances-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your bottle buddies</p>
            <h2 id="balances-heading">Bottle balances</h2>
          </div>
        </div>
        <div className="bottle-grid">
          {activeBottles.map((bottle) => {
            const buddy = bottleMascots.find((m) => m.key === bottle.mascot);
            const Mascot = buddy?.Component ?? Penny;
            const balance = view.balances[bottle.id] ?? 0;
            return (
              <article key={bottle.id} className="card bottle-card">
                <Mascot size={88} />
                <h3>{bottle.name}</h3>
                <strong className="bottle-balance money">
                  {formatMoney({ amountMinor: balance, currency: base })}
                </strong>
                <span className="muted">
                  {balance < 0 ? "Overspent: a transfer can top this up." : "Available"}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card settings-section" aria-labelledby="transfer-heading">
        <h2 id="transfer-heading">Move money between bottles</h2>
        <p>Transfers keep your history: nothing is edited, a transfer is recorded.</p>
        <OperationForm
          action={saveSetting}
          operation="transfer"
          label="Transfer"
          fields={[
            { name: "fromBottleId", label: "From", options: bottleOptions, value: bottleOptions[0]?.value },
            { name: "toBottleId", label: "To", options: bottleOptions, value: bottleOptions[1]?.value },
            {
              name: "amount",
              label: `Amount (${base})`,
              required: true,
              hint: "Dollars and cents, or whole đồng.",
            },
            { name: "date", label: "Date", type: "date", value: options.today, required: true },
            { name: "note", label: "Note (optional)" },
          ]}
        />
      </section>

      <section aria-labelledby="income-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Allocation detail</p>
            <h2 id="income-heading">Income</h2>
          </div>
        </div>
        {view.incomes.length === 0 ? (
          <EmptyState
            title="No income yet."
            description="Add your first income and Cozy Coins will split it into your bottles."
          />
        ) : (
          view.incomes.map(({ income, allocations, rule }) => (
            <details key={income.id} className="card income-detail">
              <summary>
                <span>
                  {income.source} · {friendlyDate(income.date)}
                </span>
                <span className="money">{formatMoney(income)}</span>
              </summary>
              <ul className="allocation-list" aria-label={`Allocation of ${income.source}`}>
                {allocations.map((a) => (
                  <li key={a.id}>
                    <span>{bottleName(a.bottleId)}</span>
                    <span className="money">
                      {formatMoney({ amountMinor: a.amountMinor, currency: income.currency })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted">
                {rule ? `Split with the rules from ${friendlyDate(rule.effectiveFrom.slice(0, 10))}.` : ""}
                {income.payDaySlot ? ` Resolved the ${friendlyDate(income.payDaySlot)} pay day.` : ""}
              </p>
              <div className="form-actions">
                <Link
                  className="text-link"
                  href={`/quick-add?kind=income&id=${encodeURIComponent(income.id)}`}
                >
                  Edit income
                </Link>
              </div>
              <details>
                <summary>Re-split with today&rsquo;s rules</summary>
                <OperationForm
                  action={saveSetting}
                  operation="resplit"
                  id={income.id}
                  label="Re-split this income"
                  description="Replaces this income's allocations with a split using your current bottle ratios."
                  confirm="Yes, re-split this income with the current rules"
                />
              </details>
            </details>
          ))
        )}
      </section>

      {view.transfers.length > 0 && (
        <section aria-labelledby="transfers-heading">
          <div className="section-heading">
            <h2 id="transfers-heading">Transfers</h2>
          </div>
          <ul className="allocation-list card income-detail" aria-label="Bottle transfers">
            {view.transfers.map((t) => (
              <li key={t.id}>
                <span>
                  {friendlyDate(t.date)} · {bottleName(t.fromBottleId)} → {bottleName(t.toBottleId)}
                  {t.note ? ` · ${t.note}` : ""}
                </span>
                <span className="money">
                  {formatMoney({ amountMinor: t.amountMinor, currency: t.currency })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
