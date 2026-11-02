"use server";
import { revalidatePath } from "next/cache";
import { withFinance } from "@/app/_lib/finance";
import { text, readMoney, formFailure } from "@/app/_lib/form-data";
import * as admin from "@/services/admin";
import { editBottleRules, removeBottle, resplitIncome } from "@/services/bottles";
import { dismissReminder } from "@/services/reminders";
import type { BottleRatio, CategoryKind, PaymentMethodType } from "@/domain/types";
import type { FormState } from "@/ui/finance/types";
export async function saveSetting(_state: FormState, data: FormData): Promise<FormState> {
  const operation = text(data,"operation"), id = text(data,"id");
  try {
    const result = withFinance(deps => {
      switch(operation) {
        case "settings": return admin.updateSettings(deps,{ baseCurrency:text(data,"baseCurrency"), timezone:text(data,"timezone"), weekStartsOn:Number(text(data,"weekStartsOn")), payDays:text(data,"payDays").split(",").map(v=>Number(v.trim())) });
        case "category": { const input = { name:text(data,"name"), kind:text(data,"kind") as CategoryKind, countsTowardLivingLimit:data.get("countsTowardLivingLimit")==="on", defaultBottleId:text(data,"defaultBottleId")||null, color:text(data,"color"), mascot:text(data,"mascot") }; return id ? admin.updateCategory(deps,id,input) : admin.createCategory(deps,input); }
        case "archiveCategory": return admin.archiveCategory(deps,id);
        case "payment": { const input = { name:text(data,"name"), type:text(data,"type") as PaymentMethodType, last4:text(data,"last4")||null }; return id ? admin.updatePaymentMethod(deps,id,input) : admin.createPaymentMethod(deps,input); }
        case "archivePayment": return admin.archivePaymentMethod(deps,id);
        case "rate": return admin.setExchangeRate(deps,{ month:text(data,"month"), currency:text(data,"currency"), rateToBase:Number(text(data,"rateToBase")) });
        case "limit": { data.set("currency",deps.repos.settings.get().baseCurrency); const money=readMoney(data); return money.ok ? admin.setLivingLimit(deps,{month:text(data,"month"),limitMinor:money.amountMinor}) : {ok:false as const,errors:[{field:"amount",message:money.state.error??"Invalid amount"}]}; }
        case "addBottle": return admin.addBottle(deps,{name:text(data,"name"),mascot:text(data,"mascot")});
        case "renameBottle": return admin.renameBottle(deps,id,text(data,"name"));
        case "ratios": { let ratios: BottleRatio[]; try { const parsed: unknown=JSON.parse(text(data,"ratios")); if(!Array.isArray(parsed)||parsed.some(r=>!r||typeof r.bottleId!=="string"||typeof r.ratio!=="number")) throw new Error(); ratios=parsed; } catch { return {ok:false as const,errors:[{field:"ratios",message:"Enter a positive whole-number ratio for every bottle."}]}; } return editBottleRules(deps,ratios); }
        case "removeBottle": if(data.get("confirm")!=="on") return {ok:false as const,errors:[{field:"confirm",message:"Confirm the bottle removal."}]}; return removeBottle(deps,id,text(data,"targetBottleId")||undefined);
        case "resplit": if(data.get("confirm")!=="on") return {ok:false as const,errors:[{field:"confirm",message:"Confirm re-splitting this income."}]}; return resplitIncome(deps,id);
        case "dismiss": return dismissReminder(deps,id);
        case "transfer": { data.set("currency",deps.repos.settings.get().baseCurrency); const money=readMoney(data); return money.ok ? admin.transferBetweenBottles(deps,{fromBottleId:text(data,"fromBottleId"),toBottleId:text(data,"toBottleId"),amountMinor:money.amountMinor,date:text(data,"date"),note:text(data,"note")}) : {ok:false as const,errors:[{field:"amount",message:money.state.error??"Invalid amount"}]}; }
        default: return {ok:false as const,errors:[{field:"operation",message:"Unknown settings action."}]};
      }
    });
    if(!result.ok) return formFailure(result.errors);
    revalidatePath("/","layout");
    return {success: operation === "dismiss" ? "Reminder dismissed." : "Saved. Your money space is up to date."};
  } catch(error) { return {error: error instanceof Error && error.name === "DatabaseBusyError" ? "A backup or restore is in progress. Please try again in a moment." : "We couldn’t save that change. Please check the fields and try again."}; }
}
