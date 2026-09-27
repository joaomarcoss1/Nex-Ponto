import { actionLabels } from "@/lib/constants";
import { getNextActions, isOutOfOrder, parseTimeToMinutes } from "@/lib/calculations";
import { createReceiptToken } from "@/lib/security/receipt-token";
import type { TimeAction, TimeEntryStatus } from "@/types/domain";

/**
 * Pure helpers extracted from the /api/public/clock/register route handler.
 * They live outside route.ts because Next.js only allows HTTP-method and
 * route-config exports from a route file — any other named export fails the
 * build ("is not a valid Route export field").
 */

function latestOpenBreak(entries: Array<{ action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }>) {
  const stack: Date[] = [];
  const usable = entries
    .filter((entry) => ["valid", "pending_review", "adjusted"].includes(entry.status))
    .sort((a, b) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());
  for (const entry of usable) {
    if (entry.action === "start_lunch") stack.push(new Date(entry.entry_timestamp));
    if (entry.action === "end_lunch") stack.pop();
  }
  return stack.at(-1) || null;
}

/** Shape returned for both the pre-check idempotency hit and the post-insert 23505 race. */
export function buildDuplicateResponse(entry: Record<string, unknown>) {
  let receiptUrl: string | null = null;
  try {
    receiptUrl = `/api/public/clock/receipt?entryId=${entry.id}&token=${createReceiptToken(entry.id as string)}`;
  } catch {
    receiptUrl = null;
  }
  return {
    entry,
    confirmation: "Este ponto já havia sido recebido. Mantivemos o primeiro registro para evitar duplicidade.",
    distanceMeters: entry.distance_meters,
    radiusMeters: entry.validation_radius_meters,
    accuracyMeters: entry.gps_accuracy_meters,
    insideAllowedRadius: entry.inside_allowed_radius,
    status: entry.status,
    receiptAvailable: Boolean(receiptUrl),
    receiptUrl,
  };
}

export type BlockingConditionsInput = {
  devicePolicy: { review: boolean };
  poorAccuracy: boolean;
  blockPoorGpsAccuracy: boolean;
  inside: boolean;
  allowOutsideRadiusReview: boolean;
  action: TimeAction;
  sessionEntries: Array<{ action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }>;
  branchOpen: boolean;
  outsideHoursPolicy: string;
};

/** Determines whether the attempt must be hard-blocked, and which soft review flags apply. */
export function evaluateBlockingConditions(input: BlockingConditionsInput) {
  const reviewFlags: string[] = [];
  let blockReason: string | null = null;
  if (input.devicePolicy.review) reviewFlags.push("new_or_untrusted_device");
  if (input.poorAccuracy && input.blockPoorGpsAccuracy) blockReason = "poor_gps_accuracy";
  if (!input.inside && !input.allowOutsideRadiusReview) blockReason = "outside_radius";
  if (isOutOfOrder(input.action, input.sessionEntries || [])) blockReason = "out_of_order";
  if (input.action === "start_shift" && !input.branchOpen) {
    if (input.outsideHoursPolicy === "block") blockReason = "outside_operating_hours";
    else reviewFlags.push("outside_operating_hours");
  }
  return { reviewFlags, blockReason };
}

export function blockReasonMessage(
  blockReason: string,
  context: { gpsAccuracy: number | null; maxAccuracy: number; distance: number; allowedRadius: number; sessionEntries: Array<{ action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }> }
) {
  const messages: Record<string, string> = {
    poor_gps_accuracy: `A precisão do GPS está acima do limite permitido (${context.gpsAccuracy}m > ${context.maxAccuracy}m).`,
    outside_radius: `Você está a ${context.distance}m da filial. O raio permitido é ${context.allowedRadius}m.`,
    out_of_order: getNextActions(context.sessionEntries || []).recommended
      ? `Ação fora de ordem. Próximo ponto esperado: ${actionLabels[getNextActions(context.sessionEntries || []).recommended as TimeAction]}.`
      : "A jornada já foi encerrada.",
    outside_operating_hours: "A filial está fora do horário de funcionamento configurado."
  };
  return messages[blockReason] || "Tentativa de ponto bloqueada.";
}

export type ScheduleComplianceInput = {
  action: TimeAction;
  registeredMinutes: number;
  timestamp: string;
  journey: { expected_lunch_start_time?: string | null; expected_lunch_minutes?: number | null };
  lunchTolerance: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  sessionEntries: Array<{ action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }>;
};

/** Flags break taken early/extended relative to the employee's expected journey. */
export function evaluateScheduleCompliance(input: ScheduleComplianceInput) {
  const reviewFlags: string[] = [];
  let lunchVariationMinutes = 0;
  let scheduleComplianceStatus = "ok";
  if (input.action === "start_shift" && input.lateMinutes > 0) scheduleComplianceStatus = "late";
  if (input.action === "end_shift" && input.earlyLeaveMinutes > 0) scheduleComplianceStatus = "early_leave";
  if (input.action === "start_lunch" && input.journey.expected_lunch_start_time) {
    const earlyBreak = parseTimeToMinutes(input.journey.expected_lunch_start_time) - input.registeredMinutes;
    if (earlyBreak > input.lunchTolerance) {
      lunchVariationMinutes = earlyBreak;
      scheduleComplianceStatus = "break_early";
      reviewFlags.push("break_early");
    }
  }
  if (input.action === "end_lunch") {
    const openBreak = latestOpenBreak(input.sessionEntries);
    if (openBreak && input.journey.expected_lunch_minutes) {
      const duration = Math.max(0, Math.round((new Date(input.timestamp).getTime() - openBreak.getTime()) / 60000));
      const over = duration - Number(input.journey.expected_lunch_minutes || 0);
      if (over > input.lunchTolerance) {
        lunchVariationMinutes = over;
        scheduleComplianceStatus = "break_long";
        reviewFlags.push("break_long");
      }
    }
  }
  return { lunchVariationMinutes, scheduleComplianceStatus, reviewFlags };
}
