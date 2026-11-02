import type { Metadata } from "next";
import { saveSetting } from "@/app/settings/actions";
import { createBackupAction, exportCsvAction, restoreBackupAction } from "@/app/settings/backup-actions";
import { loadSettingsView } from "@/app/_lib/views";
import { formatMoney } from "@/domain/money";
import { friendlyDate } from "@/ui/finance/dates";
import { amountInputValue } from "@/ui/finance/amount";
import { bottleMascots } from "@/ui/mascots";
import { BackupForms } from "@/ui/settings/backup-forms";
import { OperationForm, type InputSpec } from "@/ui/settings/operation-form";
import { RatioEditor } from "@/ui/settings/ratio-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mascotOptions = bottleMascots.map((m) => ({ value: m.key, label: m.name }));

const sections = [
  ["bottles", "Bottles"],
  ["categories", "Categories"],
  ["payment-methods", "Payment methods"],
  ["rates", "Currencies & rates"],
  ["pay-days", "Pay days & week"],
  ["living-limit", "Living limit"],
  ["data", "Backup & export"],
] as const;

export default function SettingsPage() {
  const v = loadSettingsView();
  const { options, settings } = v;
  const base = settings.baseCurrency;
  const bottleChoices = v.activeBottles.map((b) => ({ value: b.id, label: b.name }));
  const currentLimit = v.limits.find((l) => l.month === v.month);

  const categoryFields = (c?: (typeof options.categories)[number]): InputSpec[] => [
    { name: "name", label: "Name", value: c?.name ?? "", required: true },
    {
      name: "kind",
      label: "Kind",
      value: c?.kind ?? "daily",
      options: [
        { value: "daily", label: "Daily" },
        { value: "subscription", label: "Subscription" },
        { value: "other", label: "Other" },
      ],
    },
    {
      name: "defaultBottleId",
      label: "Default bottle",
      value: c?.defaultBottleId ?? "",
      options: [{ value: "", label: "None" }, ...bottleChoices],
    },
    { name: "mascot", label: "Buddy", value: c?.mascot ?? "nest", options: mascotOptions },
    {
      name: "color",
      label: "Colour (hex)",
      value: c?.color ?? "#7C8C78",
      required: true,
      hint: "Like #7C8C78",
    },
    {
      name: "countsTowardLivingLimit",
      label: "Counts toward the living limit",
      type: "checkbox",
      value: c?.countsTowardLivingLimit === false ? "" : "on",
    },
  ];
  const paymentFields = (p?: (typeof options.paymentMethods)[number]): InputSpec[] => [
    { name: "name", label: "Name", value: p?.name ?? "", required: true },
    {
      name: "type",
      label: "Type",
      value: p?.type ?? "debit",
      options: [
        { value: "credit", label: "Credit" },
        { value: "debit", label: "Debit" },
        { value: "cash", label: "Cash" },
      ],
    },
    { name: "last4", label: "Last 4 digits (optional)", value: p?.last4 ?? "" },
  ];
  const otherCurrencies = (["USD", "VND"] as const).filter((c) => c !== base);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Make it yours</p>
          <h1>Settings</h1>
          <p>Bottles, categories, currencies, pay days, your living limit and your data.</p>
        </div>
      </div>
      <nav aria-label="Settings sections" className="settings-nav">
        {sections.map(([id, name]) => (
          <a key={id} href={`#${id}`} className="text-link">
            {name}
          </a>
        ))}
      </nav>

      <section id="bottles" className="card settings-section" aria-labelledby="bottles-h">
        <h2 id="bottles-h">Bottles</h2>
        <p>Ratios decide how each new income is split.</p>
        <RatioEditor bottles={v.activeBottles} ratios={v.ratios} action={saveSetting} />
        <details>
          <summary>Add a bottle</summary>
          <OperationForm
            action={saveSetting}
            operation="addBottle"
            label="Add bottle"
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "mascot", label: "Buddy", value: "nest", options: mascotOptions },
            ]}
          />
        </details>
        {v.activeBottles.map((b) => (
          <details key={b.id}>
            <summary>Manage {b.name}</summary>
            <OperationForm
              action={saveSetting}
              operation="renameBottle"
              id={b.id}
              label="Rename"
              fields={[{ name: "name", label: "Name", value: b.name, required: true }]}
            />
            <OperationForm
              action={saveSetting}
              operation="removeBottle"
              id={b.id}
              label={`Remove ${b.name}`}
              description="Its balance moves to the bottle you choose and its categories follow. History stays."
              fields={[
                {
                  name: "targetBottleId",
                  label: "Move its balance to",
                  value: bottleChoices.find((c) => c.value !== b.id)?.value ?? "",
                  options: bottleChoices.filter((c) => c.value !== b.id),
                },
              ]}
              confirm={`Yes, remove ${b.name}`}
            />
          </details>
        ))}
      </section>

      <section id="categories" className="card settings-section" aria-labelledby="categories-h">
        <h2 id="categories-h">Categories</h2>
        <p>Categories marked for the living limit count toward it; Tuition and gifts usually don&rsquo;t.</p>
        {options.categories
          .filter((c) => !c.archivedAt)
          .map((c) => (
            <details key={c.id}>
              <summary>{c.name}</summary>
              <OperationForm
                action={saveSetting}
                operation="category"
                id={c.id}
                label="Save category"
                fields={categoryFields(c)}
              />
              <OperationForm
                action={saveSetting}
                operation="archiveCategory"
                id={c.id}
                label={`Archive ${c.name}`}
                description="Archived categories disappear from new entries but stay in your history."
              />
            </details>
          ))}
        <details>
          <summary>Add a category</summary>
          <OperationForm
            action={saveSetting}
            operation="category"
            label="Add category"
            fields={categoryFields()}
          />
        </details>
      </section>

      <section id="payment-methods" className="card settings-section" aria-labelledby="payment-h">
        <h2 id="payment-h">Payment methods</h2>
        {options.paymentMethods
          .filter((p) => !p.archivedAt)
          .map((p) => (
            <details key={p.id}>
              <summary>{p.name}</summary>
              <OperationForm
                action={saveSetting}
                operation="payment"
                id={p.id}
                label="Save payment method"
                fields={paymentFields(p)}
              />
              <OperationForm
                action={saveSetting}
                operation="archivePayment"
                id={p.id}
                label={`Archive ${p.name}`}
                description="Archived methods stay in your history."
              />
            </details>
          ))}
        <details>
          <summary>Add a payment method</summary>
          <OperationForm
            action={saveSetting}
            operation="payment"
            label="Add payment method"
            fields={paymentFields()}
          />
        </details>
      </section>

      <section id="rates" className="card settings-section" aria-labelledby="rates-h">
        <h2 id="rates-h">Currencies &amp; exchange rates</h2>
        <p>
          Base currency: <strong>{base}</strong>. Foreign amounts use the rate on the entry, otherwise the
          month&rsquo;s rate below. Without a rate they&rsquo;re left out of totals and flagged, never
          guessed.
        </p>
        {v.rates.length > 0 && (
          <ul className="allocation-list" aria-label="Saved exchange rates">
            {[...v.rates]
              .sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency))
              .map((r) => (
                <li key={`${r.month}-${r.currency}`}>
                  <span>
                    {r.month} · 1 {r.currency}
                  </span>
                  <span className="money">
                    {r.rateToBase} {base}
                  </span>
                </li>
              ))}
          </ul>
        )}
        <OperationForm
          action={saveSetting}
          operation="rate"
          label="Save rate"
          fields={[
            { name: "month", label: "Month", type: "month", value: v.month, required: true },
            {
              name: "currency",
              label: "Currency",
              value: otherCurrencies[0] ?? "VND",
              options: otherCurrencies.map((c) => ({ value: c, label: c })),
            },
            {
              name: "rateToBase",
              label: `1 unit equals … ${base}`,
              type: "number",
              step: "any",
              min: "0",
              required: true,
              hint: "For example 0.00004",
            },
          ]}
        />
      </section>

      <section id="pay-days" className="card settings-section" aria-labelledby="pay-h">
        <h2 id="pay-h">Pay days &amp; week</h2>
        <p>
          You started using Cozy Coins on <strong>{friendlyDate(settings.firstUsedOn)}</strong>. Missed pay
          days are counted from then.
        </p>
        <OperationForm
          action={saveSetting}
          operation="settings"
          label="Save"
          fields={[
            {
              name: "baseCurrency",
              label: "Base currency",
              value: base,
              options: [
                { value: "USD", label: "USD" },
                { value: "VND", label: "VND" },
              ],
            },
            {
              name: "timezone",
              label: "Time zone",
              value: settings.timezone,
              required: true,
              hint: "Like America/Los_Angeles",
            },
            {
              name: "weekStartsOn",
              label: "Week starts on",
              value: String(settings.weekStartsOn),
              options: WEEKDAYS.map((d, i) => ({ value: String(i), label: d })),
            },
            {
              name: "payDays",
              label: "Pay days of the month",
              value: settings.payDays.join(", "),
              required: true,
              hint: "Comma separated, like 10, 25",
            },
          ]}
        />
      </section>

      <section id="living-limit" className="card settings-section" aria-labelledby="limit-h">
        <h2 id="limit-h">Living limit</h2>
        <p>
          {currentLimit
            ? `This month's limit: ${formatMoney({ amountMinor: currentLimit.limitMinor, currency: base })}.`
            : "No limit is set for this month; the latest earlier limit carries forward."}{" "}
          {v.suggested && v.suggested.limitMinor > 0
            ? `Suggested from this month's Necessities income: ${formatMoney({ amountMinor: v.suggested.limitMinor, currency: base })}.`
            : ""}
        </p>
        <OperationForm
          action={saveSetting}
          operation="limit"
          label="Save limit"
          fields={[
            { name: "month", label: "Month", type: "month", value: v.month, required: true },
            {
              name: "amount",
              label: `Limit (${base})`,
              required: true,
              value: amountInputValue(currentLimit?.limitMinor ?? v.suggested?.limitMinor ?? 0, base),
              hint: currentLimit ? undefined : "Pre-filled with the suggestion; change it freely.",
            },
          ]}
        />
      </section>

      <section id="data" className="card settings-section" aria-labelledby="data-h">
        <h2 id="data-h">Backup &amp; export</h2>
        <p>Your data stays on this computer. Backups and exports are plain files you control.</p>
        <BackupForms
          createBackup={createBackupAction}
          exportCsv={exportCsvAction}
          restore={restoreBackupAction}
        />
      </section>
    </>
  );
}
