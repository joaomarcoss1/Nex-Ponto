import type { TimeAction, TimeEntryStatus } from "@/types/domain";
import { configuredFallbackTimezone } from "@/lib/time/operational-time";

export const TIMEZONE = configuredFallbackTimezone();

export const actionLabels: Record<TimeAction, string> = {
  start_shift: "Iniciar expediente",
  start_lunch: "Sair para almoço",
  end_lunch: "Voltar do almoço",
  end_shift: "Encerrar expediente"
};

export const statusLabels: Record<TimeEntryStatus, string> = {
  valid: "Válido",
  pending_review: "Pendente de revisão",
  adjusted: "Ajustado",
  blocked: "Bloqueado",
  canceled: "Cancelado"
};

export const orderedActions: TimeAction[] = ["start_shift", "start_lunch", "end_lunch", "end_shift"];

export const defaultSettings = {
  app_name: "NexPonto",
  app_short_name: "NexPonto",
  app_tagline: "Gestão inteligente de jornadas",
  logo_url: "/nexponto-logo.svg",
  mark_url: "/nexponto-mark.svg",
  late_tolerance_minutes: 10,
  early_leave_tolerance_minutes: 10,
  default_radius_meters: 250,
  overtime_multiplier: 1.5,
  daily_rate_calculation: "expected_work_days",
  company_name: "NexPonto",
  company_document: "",
  company_address: "",
  report_footer: "Relatório gerado pelo sistema NexPonto",
  allow_outside_radius_review: false,
  auto_approve_overtime: false,
  primary_color: "#1268F3",
  secondary_color: "#F4B51C",
  accent_color: "#22A5F5",
  background_color: "#F5F7FB",
  surface_color: "#FFFFFF",
  max_gps_accuracy_meters: 80,
  require_review_on_poor_gps_accuracy: true,
  block_poor_gps_accuracy: false,
  block_clock_without_confirmed_branch_gps: true,
  require_qr_for_clock: false,
  lunch_tolerance_minutes: 10,
  allow_different_branch_with_authorization: true,
  google_maps_enabled: true,
  payroll_block_critical_pending: true,
  payroll_pdf_max_detailed_rows: 300,
  payroll_pdf_block_rows: 1500,
  holiday_decision_notification_days: 7
} as const;
