"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  IncomeVsSpendRow,
  LivingLimitRow,
  PaymentSlice,
  StackedCategoryChart,
} from "@/domain/chartModels";
import type { CurrencyCode } from "@/domain/types";
import { money } from "@/ui/format";

const SERIES = ["#7C8C78", "#A3907A", "#8A9BAE", "#B59AA6", "#C2AE7E", "#8FA89C", "#A88C8C"];
const PAYMENT_COLORS = { credit: "#8A9BAE", debit: "#7C8C78", cash: "#C2AE7E" } as const;
const INK = "#33302C";

function Incomplete({ rows }: { rows: { label: string; incomplete: boolean }[] }) {
  const flagged = rows.filter((r) => r.incomplete);
  if (flagged.length === 0) return null;
  return (
    <div className="chart-notes">
      {flagged.map((r) => (
        <span key={r.label} className="badge badge-incomplete" role="note">
          Incomplete: {r.label} (some transactions have no exchange rate)
        </span>
      ))}
    </div>
  );
}

function ChartShell({
  title,
  description,
  summary,
  children,
  table,
}: {
  title: string;
  description: string;
  summary: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <section className="card chart-card" aria-label={title}>
      <h2>{title}</h2>
      <p className="muted-text">{description}</p>
      <div className="chart-frame" role="img" aria-label={`${title}. ${summary}`}>
        {children}
      </div>
      <details className="chart-data">
        <summary>View as table</summary>
        {table}
      </details>
    </section>
  );
}

export function StackedCategories({
  chart,
  currency,
}: {
  chart: StackedCategoryChart;
  currency: CurrencyCode;
}) {
  const data = chart.rows.map((r) => ({ label: r.label, ...r.values }));
  const empty = chart.series.length === 0;
  return (
    <ChartShell
      title="Spending by category"
      description="Where each period’s money went."
      summary={
        empty
          ? "No spending in these periods."
          : `${chart.series.length} categories across ${data.length} periods.`
      }
      table={
        <table>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {chart.series.map((s) => (
                <th key={s.id} scope="col">
                  {s.name}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => (
              <tr key={r.periodId}>
                <th scope="row">{r.label}</th>
                {chart.series.map((s) => (
                  <td key={s.id} className="money">
                    {money(r.values[s.id] ?? 0, currency)}
                  </td>
                ))}
                <td className="money">{money(r.totalMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#CDC7BD" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: INK, fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => money(v, currency)}
            tick={{ fill: INK, fontSize: 12 }}
            width={72}
          />
          <Tooltip formatter={(v) => money(Number(v), currency)} />
          <Legend />
          {chart.series.map((s, i) => (
            <Bar
              key={s.id}
              dataKey={s.id}
              name={s.name}
              stackId="spend"
              fill={s.color || SERIES[i % SERIES.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Incomplete rows={chart.rows} />
    </ChartShell>
  );
}

export function IncomeVsSpend({ rows, currency }: { rows: IncomeVsSpendRow[]; currency: CurrencyCode }) {
  return (
    <ChartShell
      title="Income vs spending"
      description="What came in next to what went out."
      summary={rows
        .map(
          (r) =>
            `${r.label}: income ${money(r.incomeMinor, currency)}, spending ${money(r.spendMinor, currency)}`,
        )
        .join("; ")}
      table={
        <table>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Income</th>
              <th scope="col">Spending</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.periodId}>
                <th scope="row">{r.label}</th>
                <td className="money">{money(r.incomeMinor, currency)}</td>
                <td className="money">{money(r.spendMinor, currency)}</td>
                <td className="money">{money(r.netMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#CDC7BD" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: INK, fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => money(v, currency)}
            tick={{ fill: INK, fontSize: 12 }}
            width={72}
          />
          <Tooltip formatter={(v) => money(Number(v), currency)} />
          <Legend />
          <Bar dataKey="incomeMinor" name="Income" fill="#7C8C78" />
          <Bar dataKey="spendMinor" name="Spending" fill="#A3907A" />
        </BarChart>
      </ResponsiveContainer>
      <Incomplete rows={rows} />
    </ChartShell>
  );
}

export function LivingLimitChart({ rows, currency }: { rows: LivingLimitRow[]; currency: CurrencyCode }) {
  const statusColor = { ok: "#7C8C78", warning: "#C49A5A", over: "#B07A5E" } as const;
  return (
    <ChartShell
      title="Living limit vs actual"
      description="Spending that counts toward your living limit, with the limit as a line."
      summary={rows
        .map(
          (r) =>
            `${r.label}: spent ${money(r.spentMinor, currency)}${r.limitMinor === null ? ", no limit" : ` of ${money(r.limitMinor, currency)}`}`,
        )
        .join("; ")}
      table={
        <table>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Spent</th>
              <th scope="col">Limit</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.periodId}>
                <th scope="row">{r.label}</th>
                <td className="money">{money(r.spentMinor, currency)}</td>
                <td className="money">{r.limitMinor === null ? "—" : money(r.limitMinor, currency)}</td>
                <td>
                  {r.status === null
                    ? "No limit"
                    : r.status === "ok"
                      ? "Within limit"
                      : r.status === "warning"
                        ? "Close to limit"
                        : "Over limit"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#CDC7BD" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: INK, fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => money(v, currency)}
            tick={{ fill: INK, fontSize: 12 }}
            width={72}
          />
          <Tooltip formatter={(v) => money(Number(v), currency)} />
          <Legend />
          <Bar dataKey="spentMinor" name="Spent" fill="#7C8C78">
            {rows.map((r) => (
              <Cell key={r.periodId} fill={r.status ? statusColor[r.status] : "#A3907A"} />
            ))}
          </Bar>
          <Line
            dataKey="limitMinor"
            name="Limit"
            stroke={INK}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Incomplete rows={rows} />
    </ChartShell>
  );
}

export function PaymentDonut({
  slices,
  currency,
  periodLabel,
}: {
  slices: PaymentSlice[];
  currency: CurrencyCode;
  periodLabel: string;
}) {
  return (
    <ChartShell
      title="Payment method split"
      description={`Credit, debit and cash for ${periodLabel}.`}
      summary={
        slices.length === 0
          ? "No spending in this period."
          : slices.map((s) => `${s.label} ${Math.round(s.ratio * 100)}%`).join(", ")
      }
      table={
        <table>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Spent</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.type}>
                <th scope="row">{s.label}</th>
                <td className="money">{money(s.totalMinor, currency)}</td>
                <td>{Math.round(s.ratio * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {slices.length === 0 ? (
        <p className="muted-text">No spending to split in this period.</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="totalMinor"
              nameKey="label"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
            >
              {slices.map((s) => (
                <Cell key={s.type} fill={PAYMENT_COLORS[s.type]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v), currency)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}
