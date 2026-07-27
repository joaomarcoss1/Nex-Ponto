import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatISO } from "date-fns";
import { dateKeyInTimezone } from "@/lib/calculations";
import type { HolidayOperationStatus, MinimalHoliday } from "@/types/domain";

type HolidayRow = MinimalHoliday & { id: string };
type DecisionRow = {
  id: string;
  holiday_id: string;
  branch_id: string | null;
  operation_status: HolidayOperationStatus;
};

type DecisionWrite = {
  holiday_id: string;
  branch_id: string | null;
  operation_status: HolidayOperationStatus;
  decided_by?: string | null;
  decided_at?: string | null;
  notes?: string | null;
};

function decisionForHoliday(decisions: DecisionRow[], holidayId: string, branchId: string | null) {
  return decisions.find((decision) => decision.holiday_id === holidayId && decision.branch_id === branchId)
    || decisions.find((decision) => decision.holiday_id === holidayId && decision.branch_id === null)
    || null;
}

export function materializeOperationalHolidays(params: {
  holidays: HolidayRow[];
  decisions: DecisionRow[];
  branchIds?: string[];
}) {
  const { holidays, decisions, branchIds = [] } = params;
  const result: MinimalHoliday[] = [];

  for (const holiday of holidays) {
    if (holiday.type !== "holiday") {
      result.push(holiday);
      continue;
    }

    const scopes = holiday.branch_id ? [holiday.branch_id] : (branchIds.length ? branchIds : [null]);
    for (const scope of scopes) {
      const decision = decisionForHoliday(decisions, holiday.id, scope);
      result.push({
        ...holiday,
        branch_id: scope,
        operation_status: decision?.operation_status || "pending",
        decision_id: decision?.id || null
      });
    }
  }

  return result;
}

export async function fetchOperationalHolidays(params: {
  supabase: SupabaseClient;
  startDate: string;
  endDate: string;
  branchIds?: string[];
}) {
  const { supabase, startDate, endDate, branchIds = [] } = params;
  let holidayQuery = supabase
    .from("holidays")
    .select("id,holiday_date,branch_id,type,active")
    .eq("active", true)
    .gte("holiday_date", startDate)
    .lte("holiday_date", endDate);

  if (branchIds.length) {
    holidayQuery = holidayQuery.or(`branch_id.is.null,branch_id.in.(${branchIds.join(",")})`);
  }

  const { data: holidays, error: holidayError } = await holidayQuery;
  if (holidayError) throw new Error(holidayError.message);
  const holidayIds = (holidays || []).map((holiday) => holiday.id);
  if (!holidayIds.length) return [] as MinimalHoliday[];

  let decisionQuery = supabase
    .from("holiday_operation_decisions")
    .select("id,holiday_id,branch_id,operation_status")
    .in("holiday_id", holidayIds);
  if (branchIds.length) {
    decisionQuery = decisionQuery.or(`branch_id.is.null,branch_id.in.(${branchIds.join(",")})`);
  }
  const { data: decisions, error: decisionError } = await decisionQuery;
  if (decisionError) throw new Error(decisionError.message);

  return materializeOperationalHolidays({
    holidays: (holidays || []) as HolidayRow[],
    decisions: (decisions || []) as DecisionRow[],
    branchIds
  });
}

export function pendingHolidayDecisions(holidays: MinimalHoliday[]) {
  const seen = new Set<string>();
  return holidays.filter((holiday) => {
    if (holiday.type !== "holiday" || holiday.operation_status !== "pending") return false;
    const key = `${holiday.id || holiday.holiday_date}:${holiday.branch_id || "global"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function findDecision(supabase: SupabaseClient, holidayId: string, branchId: string | null) {
  let query = supabase
    .from("holiday_operation_decisions")
    .select("*")
    .eq("holiday_id", holidayId);
  query = branchId ? query.eq("branch_id", branchId) : query.is("branch_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveHolidayOperationDecision(params: {
  supabase: SupabaseClient;
  decision: DecisionWrite;
  onlyIfMissing?: boolean;
}) {
  const { supabase, decision, onlyIfMissing = false } = params;
  const existing = await findDecision(supabase, decision.holiday_id, decision.branch_id);
  if (existing && onlyIfMissing) return existing;
  if (existing) {
    const { data, error } = await supabase
      .from("holiday_operation_decisions")
      .update({
        operation_status: decision.operation_status,
        decided_by: decision.decided_by ?? null,
        decided_at: decision.decided_at ?? null,
        notes: decision.notes ?? null
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("holiday_operation_decisions")
    .insert(decision)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function notificationWindowDays(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "holiday_decision_notification_days")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const parsed = Number(data?.value ?? 7);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(60, parsed) : 7;
}

export async function syncUpcomingHolidayDecisions(params: {
  supabase: SupabaseClient;
  syncedBy?: string | null;
}) {
  const { supabase, syncedBy = null } = params;
  const today = dateKeyInTimezone();
  const days = await notificationWindowDays(supabase);
  const until = formatISO(addDays(new Date(`${today}T12:00:00Z`), days), { representation: "date" });
  const { data: holidays, error } = await supabase
    .from("holidays")
    .select("id,title,holiday_date,branch_id,type,active")
    .eq("active", true)
    .eq("type", "holiday")
    .gte("holiday_date", today)
    .lte("holiday_date", until);
  if (error) throw new Error(error.message);

  for (const holiday of holidays || []) {
    await saveHolidayOperationDecision({
      supabase,
      onlyIfMissing: true,
      decision: {
        holiday_id: holiday.id,
        branch_id: holiday.branch_id,
        operation_status: "pending"
      }
    });

    const sourceKey = `holiday-decision:${holiday.id}:${holiday.branch_id || "global"}`;
    const notificationResult = await supabase
      .from("admin_notifications")
      .upsert({
        source_key: sourceKey,
        admin_user_id: null,
        branch_id: holiday.branch_id,
        title: "Decisão de funcionamento em feriado",
        message: `${holiday.title} (${holiday.holiday_date}): a empresa funcionará normalmente?`,
        notification_type: "holiday_decision",
        payload: {
          holiday_id: holiday.id,
          holiday_date: holiday.holiday_date,
          requires_decision: true,
          synced_by: syncedBy
        }
      }, { onConflict: "source_key", ignoreDuplicates: true });
    if (notificationResult.error) throw new Error(notificationResult.error.message);
  }

  return { today, until, holidays: holidays || [] };
}
