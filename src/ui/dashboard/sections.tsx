import Link from "next/link";
import type {
  Bottle,
  BottleBalance,
  Category,
  CategoryTotal,
  CurrencyCode,
  LivingLimitStatus,
} from "@/domain/types";
import type { UpcomingSubscription } from "@/services/reports";
import { money, shortDate } from "@/ui/format";
import { Mochi, Penny, bottleMascots } from "@/ui/mascots";
import { barPercent, moodFor, percentLabel, shares, statusMessage } from "./model";

export function LivingLimitCard({
  status,
  currency,
  incompleteCount,
}: {
  status: LivingLimitStatus | null;
  currency: CurrencyCode;
  incompleteCount: number;
}) {
  const message = statusMessage(status);
  return (
    <section className="card dash-card living-card" aria-labelledby="living-heading">
      <div className="living-head">
        <Penny mood={moodFor(status)} size={96} />
        <div>
          <p className="eyebrow">Living limit</p>
          <h2 id="living-heading">{message.title}</h2>
          <p className="muted-text">{message.detail}</p>
        </div>
      </div>
      {status ? (
        <>
          <div
            role="progressbar"
            aria-label="Living limit used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={barPercent(status.ratio)}
            aria-valuetext={`${percentLabel(status.ratio)} of your living limit used`}
            className={`meter meter-${status.status}`}
          >
            <span style={{ width: `${barPercent(status.ratio)}%` }} />
          </div>
          <p className="meter-caption">
            <strong className="money">{money(status.spentMinor, currency)}</strong> of{" "}
            <span className="money">{money(status.limitMinor, currency)}</span> ·{" "}
            <span data-testid="limit-percent">{percentLabel(status.ratio)}</span> used
          </p>
        </>
      ) : (
        <Link href="/settings" className="text-link">
          Set a living limit ↗
        </Link>
      )}
      {incompleteCount > 0 && (
        <p className="badge badge-incomplete" role="note">
          Incomplete: {incompleteCount} {incompleteCount === 1 ? "expense has" : "expenses have"} no exchange
          rate and {incompleteCount === 1 ? "isn’t" : "aren’t"} counted yet.
        </p>
      )}
    </section>
  );
}

export function SpendCard({
  totalMinor,
  deltaMinor,
  currency,
}: {
  totalMinor: number;
  deltaMinor: number | null;
  currency: CurrencyCode;
}) {
  return (
    <section className="card dash-card" aria-labelledby="mtd-heading">
      <p className="eyebrow">Month to date</p>
      <h2 id="mtd-heading">Spent so far</h2>
      <p className="big-number money" data-testid="month-spend">
        {money(totalMinor, currency)}
      </p>
      <p className="muted-text">
        {deltaMinor === null
          ? "No earlier month to compare with yet."
          : deltaMinor === 0
            ? "Same as last month."
            : `${money(Math.abs(deltaMinor), currency)} ${deltaMinor > 0 ? "more" : "less"} than last month.`}
      </p>
    </section>
  );
}

export function CategoryBars({
  rows,
  categories,
  currency,
}: {
  rows: CategoryTotal[];
  categories: readonly Category[];
  currency: CurrencyCode;
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const visible = rows.filter((r) => r.totalMinor > 0);
  return (
    <section className="card dash-card" aria-labelledby="cat-heading">
      <p className="eyebrow">Where it went</p>
      <h2 id="cat-heading">Spend by category</h2>
      {visible.length === 0 ? (
        <p className="muted-text">No spending logged this month yet.</p>
      ) : (
        <ul className="bar-list">
          {shares(visible, (r) => r.totalMinor).map(({ item, percent }) => {
            const category = byId.get(item.categoryId);
            return (
              <li key={item.categoryId}>
                <div className="bar-label">
                  <span>{category?.name ?? "Other"}</span>
                  <span className="money">{money(item.totalMinor, currency)}</span>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    style={{ width: `${percent}%`, background: category?.color ?? "var(--chart-latte)" }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function BottleBalances({
  balances,
  bottles,
  currency,
}: {
  balances: BottleBalance[];
  bottles: readonly Bottle[];
  currency: CurrencyCode;
}) {
  const byId = new Map(bottles.map((b) => [b.id, b]));
  const active = balances.filter((b) => byId.get(b.bottleId)?.archivedAt === null);
  return (
    <section aria-labelledby="bottles-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">A home for every purpose</p>
          <h2 id="bottles-heading">Bottle balances</h2>
        </div>
        <Link href="/bottles" className="text-link">
          Income &amp; bottles ↗
        </Link>
      </div>
      <div className="bottle-grid">
        {active.map((balance) => {
          const bottle = byId.get(balance.bottleId)!;
          const buddy = bottleMascots.find((m) => m.key === bottle.mascot) ?? bottleMascots[0];
          const Buddy = buddy.Component;
          return (
            <article key={bottle.id} className="card bottle-card">
              <Buddy size={88} />
              <h3>{bottle.name}</h3>
              <p>{buddy.name}</p>
              <span className={`money bottle-balance${balance.balanceMinor < 0 ? " negative" : ""}`}>
                {money(balance.balanceMinor, currency)}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function UpcomingCharges({ items }: { items: UpcomingSubscription[] }) {
  return (
    <section className="card dash-card" aria-labelledby="upcoming-heading">
      <p className="eyebrow">Coming up</p>
      <h2 id="upcoming-heading">Upcoming subscriptions</h2>
      {items.length === 0 ? (
        <p className="muted-text">Nothing is due in the next two weeks.</p>
      ) : (
        <ul className="plain-list">
          {items.map(({ subscription, nextChargeDate }) => (
            <li key={subscription.id}>
              <span>
                <strong>{subscription.name}</strong>
                <small className="muted-text"> · {shortDate(nextChargeDate)}</small>
              </span>
              <span className="money">{money(subscription.amountMinor, subscription.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/subscriptions" className="text-link">
        All subscriptions ↗
      </Link>
    </section>
  );
}

export function PayDayBanner({
  slots,
  dismiss,
}: {
  slots: string[];
  dismiss: (data: FormData) => Promise<void>;
}) {
  if (slots.length === 0) return null;
  const latest = slots[slots.length - 1]!;
  return (
    <section className="payday-banner" aria-label="Pay-day reminder" role="status">
      <Mochi size={72} />
      <div>
        <h2>Payday! Feed the bottles 🐾</h2>
        <p>
          {slots.length === 1
            ? `Your ${shortDate(latest)} pay day is waiting to be logged.`
            : `${slots.length} pay days are waiting to be logged (${slots.map(shortDate).join(", ")}).`}
        </p>
      </div>
      <div className="payday-actions">
        <Link href={`/quick-add?kind=income&payDaySlot=${encodeURIComponent(slots[0]!)}`} className="button">
          Log income
        </Link>
        <form action={dismiss}>
          <input type="hidden" name="slot" value={slots[0]} />
          <button type="submit" className="quiet-button">
            Dismiss
          </button>
        </form>
      </div>
    </section>
  );
}
