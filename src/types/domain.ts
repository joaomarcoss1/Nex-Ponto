export type AdminRole =
  | "platform_superadmin"
  | "tenant_owner"
  | "tenant_admin"
  | "hr_manager"
  | "payroll_manager"
  | "rh_admin"
  | "rh_analyst"
  | "finance_admin"
  | "regional_manager"
  | "branch_manager"
  | "department_leader"
  | "auditor"
  | "employee"
  | "master_admin"
  | "admin"
  | "admin_geral"
  | "gerente_filial"
  | "rh_financeiro";

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";
export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  permissions: string[];
};
export type BranchType = "matriz" | "filial";
export type EmploymentType = "mensalista" | "quinzenal" | "diarista";
export type DailyRateMode = "automatic" | "manual";
export type TimeAction =
  "start_shift" | "start_lunch" | "end_lunch" | "end_shift";
export type TimeEntryStatus =
  "valid" | "pending_review" | "adjusted" | "blocked" | "canceled";
export type JustificationStatus = "pending" | "approved" | "rejected";
export type PayrollStatus =
  | "draft"
  | "incomplete_preview"
  | "checking"
  | "ready"
  | "reviewed"
  | "closed"
  | "closed_with_exceptions"
  | "paid"
  | "reopened";
export type PayrollPeriodType = "monthly" | "biweekly" | "daily" | "custom";
export type HolidayType = "holiday" | "day_off" | "no_work";
export type HolidayOperationStatus = "pending" | "open" | "closed";

export type OccurrenceReviewStatus =
  "pending_review" | "approved" | "rejected" | "adjusted" | "cancelled";

export type MinimalHoliday = {
  id?: string;
  holiday_date: string;
  branch_id: string | null;
  type: HolidayType;
  active: boolean;
  operation_status?: HolidayOperationStatus;
  decision_id?: string | null;
};

export type Branch = {
  id: string;
  name: string;
  type: BranchType;
  address: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  google_maps_url?: string | null;
  map_place_id?: string | null;
  geofence_enabled?: boolean;
  geolocation_configured_at?: string | null;
  geolocation_confirmed_at?: string | null;
  geolocation_confirmed_by?: string | null;
  geolocation_status?: "pending" | "confirmed" | "needs_review";
  gps_ready?: boolean;
  last_gps_test_at?: string | null;
  last_inside_radius_test_at?: string | null;
  last_outside_radius_test_at?: string | null;
  employee_count?: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Employee = {
  id: string;
  registration_code: string | null;
  full_name: string;
  document: string | null;
  phone: string | null;
  role: string;
  sector?: string | null;
  branch_id: string;
  employment_type: EmploymentType;
  monthly_salary: number;
  daily_rate: number | null;
  daily_rate_mode: DailyRateMode;
  pix_key: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  pin_hash: string;
  active: boolean;
  admission_date: string;
  termination_date?: string | null;
  expected_start_time: string;
  expected_end_time: string;
  expected_daily_minutes: number;
  expected_lunch_minutes: number;
  expected_lunch_start_time?: string | null;
  expected_lunch_end_time?: string | null;
  schedule_confirmed?: boolean;
  profile_notes?: string | null;
  work_days: number[];
  allow_overtime: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicEmployee = Pick<Employee, "id" | "role" | "branch_id"> & {
  registration_code?: string | null;
  registration_code_masked?: string | null;
  display_name: string;
  full_name?: string;
  branch_name?: string;
};

export type TimeEntry = {
  id: string;
  employee_id: string;
  branch_id: string;
  action: TimeAction;
  entry_timestamp: string;
  entry_date: string;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_meters?: number | null;
  validation_branch_id?: string | null;
  validation_branch_latitude?: number | null;
  validation_branch_longitude?: number | null;
  validation_radius_meters?: number | null;
  distance_meters: number | null;
  inside_allowed_radius: boolean;
  late_minutes: number;
  early_leave_minutes: number;
  required_justification: boolean;
  justification_text: string | null;
  device_info: string | null;
  status: TimeEntryStatus;
  review_flags: string[];
  expected_start_time: string | null;
  expected_end_time: string | null;
  expected_daily_minutes: number | null;
  expected_lunch_minutes: number | null;
  expected_lunch_start_time?: string | null;
  expected_lunch_end_time?: string | null;
  idempotency_key?: string | null;
  gps_diagnostic_snapshot?: Record<string, unknown>;
  lunch_variation_minutes?: number;
  schedule_compliance_status?: string;
  occurrence_review_status: OccurrenceReviewStatus;
  occurrence_review_observation: string | null;
  occurrence_reviewed_by: string | null;
  occurrence_reviewed_at: string | null;
  original_entry_id: string | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  adjustment_reason: string | null;
  created_at: string;
};

export type SystemSettings = {
  app_name?: string;
  app_short_name?: string;
  app_tagline?: string;
  logo_url?: string;
  mark_url?: string;
  late_tolerance_minutes: number;
  early_leave_tolerance_minutes: number;
  default_radius_meters: number;
  overtime_multiplier: number;
  daily_rate_calculation: "expected_work_days" | "business_days" | "fixed_30";
  company_name: string;
  company_document: string;
  company_address: string;
  report_footer: string;
  allow_outside_radius_review?: boolean;
  auto_approve_overtime?: boolean;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  surface_color?: string;
  max_gps_accuracy_meters?: number;
  require_review_on_poor_gps_accuracy?: boolean;
  allow_different_branch_with_authorization?: boolean;
  google_maps_enabled?: boolean;
  block_clock_without_confirmed_branch_gps?: boolean;
  require_qr_for_clock?: boolean;
  authorized_device_mode?: "free" | "monitored" | "required";
  outside_operating_hours_policy?: "allow" | "justify" | "block";
  block_poor_gps_accuracy?: boolean;
  lunch_tolerance_minutes?: number;
  payroll_block_critical_pending?: boolean;
  payroll_pdf_max_detailed_rows?: number;
  payroll_pdf_block_rows?: number;
  holiday_decision_notification_days?: number;
};
