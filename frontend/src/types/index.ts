/** Bilingual text field (Hebrew/English). */
export interface LocalizedText {
  he: string;
  en: string;
}

/** Tenant. */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan_id: string | null;
  created_at: string;
  updated_at: string;
}

/** User. */
export interface User {
  id: string;
  email: string;
  tenant_id: string | null;
  preferred_language: string;
  is_active: boolean;
  two_factor_enabled: boolean;
  last_login: string | null;
  created_at: string;
}

/** Employee. */
export interface Employee {
  id: string;
  tenant_id: string;
  employee_number: string;
  full_name: string;
  preferred_language: string;
  notification_channels: Record<string, unknown> | null;
  custom_fields: Record<string, unknown> | null;
  status: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Schedule Window. */
export interface ScheduleWindow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "draft" | "active" | "paused" | "archived";
}

/** Mission. */
export interface Mission {
  id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "draft" | "proposed" | "approved" | "active" | "completed" | "cancelled";
}

/** Mission Type. */
export interface MissionType {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  color: string | null;
  icon: string | null;
  duration_hours: number | null;
  is_standby: boolean;
  required_slots: SlotDefinition[];
  is_active: boolean;
}

/** Slot within a mission type. */
export interface SlotDefinition {
  slot_id: string;
  label: LocalizedText;
  work_role_id: string;
  count: number;
}

/** Rule evaluation result. */
export interface EvaluationResult {
  is_blocked: boolean;
  hard_conflicts: ConflictInfo[];
  soft_warnings: ConflictInfo[];
  score_adjustment: number;
}

export interface ConflictInfo {
  rule_id: string;
  rule_name: LocalizedText;
  severity: "hard" | "soft";
  message: LocalizedText;
}

/** Pagination. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Token pair. */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}
