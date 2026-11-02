"use client";
import { useActionState, useState } from "react";
import { ratioPercentages } from "@/domain/bottleRules";
import type { Bottle, BottleRatio } from "@/domain/types";
import type { FormAction } from "@/ui/finance/types";
import { FormError } from "@/ui/finance/form-parts";
export function RatioEditor({ bottles, ratios, action }: { bottles: Bottle[]; ratios: BottleRatio[]; action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [values, setValues] = useState(() => Object.fromEntries(bottles.map(b => [b.id, String(ratios.find(r => r.bottleId === b.id)?.ratio ?? 1)])));
  const current = bottles.map(b => ({ bottleId: b.id, ratio: Number(values[b.id]) }));
  let percentages: ReturnType<typeof ratioPercentages> = []; try { percentages = ratioPercentages(current); } catch { /* Invalid intermediate typing is handled on save. */ }
  return <form className="admin-form" action={formAction}><input type="hidden" name="operation" value="ratios" /><input type="hidden" name="ratios" value={JSON.stringify(current)} /><FormError state={state} /><p className="muted">Saving creates a new rule for future income. Existing allocations stay as they are. Newly added bottles join when you save these ratios.</p>{bottles.map(b => <div className="ratio-row" key={b.id}><label htmlFor={`ratio-${b.id}`}>{b.name}</label><input id={`ratio-${b.id}`} type="number" min="1" step="1" required value={values[b.id]} onChange={e => setValues(v => ({...v,[b.id]:e.target.value}))} /><output htmlFor={`ratio-${b.id}`}>{percentages.find(p => p.bottleId === b.id)?.percent.toFixed(1) ?? "—"}%</output></div>)}<button className="button" disabled={pending} type="submit">{pending ? "Saving…" : "Save bottle ratios"}</button>{state.success && <p role="status">{state.success}</p>}</form>;
}
