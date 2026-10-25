// Shapes returned by the backend (backend/workflow/schemas.py, main.py,
// workflow/admin_api.py, workflow/approvals.py). Only fields the UI reads.

export type Role = "CUSTOMER" | "BANK_ADMIN" | "DEMO_ADMIN";

export interface Account {
  account_id: string;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export type CaseStatus =
  | "RECEIVED" | "ANALYZING" | "VALIDATING" | "ROUTED" | "INVESTIGATING" | "AWAITING_APPROVAL"
  | "APPROVED" | "EXECUTING" | "PENDING" | "COMPLETED" | "FAILED" | "REQUIRES_REVIEW";

export type RunStatus = "waiting" | "running" | "completed" | "blocked" | "requires_human" | "skipped";

export interface AgentRun {
  agent: string;
  agent_name: string;
  status: RunStatus;
  order: number;
  phase: string | null;
  summary: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface Finding {
  code: string;
  label: string;
  status: "passed" | "failed" | "unverified" | "info";
  detail: string;
}

export interface AgentReport {
  agent: string;
  agent_name: string;
  summary: string;
  findings: Finding[];
  next_action: string | null;
  requires_human: boolean;
  resolved: boolean;
  data: Record<string, any>;
  completed_at: string | null;
}

export interface CustomerResponse {
  case_status: string;
  outcome: string;
  headline: string;
  answer: string;
  next_steps: string[];
  payment_settled: boolean;
  missing_information: string[];
  generated_by: "deterministic" | "llm";
}

export interface ApprovalPolicy {
  required: boolean;
  eligible_roles: Role[];
  requester: { account_id: string; display_name: string | null; email: string | null } | null;
  blocked: { user: string; reason: string }[];
}

export interface AuditEntry {
  entry_id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  actor_account_id?: string | null;
}

export interface PaymentAttempt {
  attempt_id: string;
  invoice_number: string | null;
  payee: string | null;
  amount: string | null;
  currency: string | null;
  status: "SUCCESS" | "FAILED" | "PENDING";
  provider_status: string;
  failure_code: string | null;
  failure_reason: string | null;
  provider_reference: string | null;
  settlement_reference: string | null;
  verified: boolean;
  attempted_at: string;
}

export interface Receipt {
  receipt_id: string;
  case_id: string;
  invoice_number: string | null;
  vendor_name: string | null;
  amount: string | null;
  currency: string | null;
  provider_reference: string | null;
  settlement_reference: string | null;
  approved_by: string | null;
  settled_at: string | null;
  disclaimer: string;
  verification: string[];
}

export interface WorkflowCase {
  case_id: string;
  created_at: string;
  updated_at: string;
  status: CaseStatus;
  intent: string;
  customer_name: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  amount: string | null;
  currency: string | null;
  analysis: Record<string, any> | null;
  owner_account_id: string | null;
  agent_runs: AgentRun[];
  reports: AgentReport[];
  approval: { approved_by: string; approved_at: string; note: string | null } | null;
  payment: PaymentAttempt | null;
  reconciliation: Record<string, any> | null;
  receipt: Receipt | null;
  audit: AuditEntry[];
  outcome: string | null;
  requires_human: boolean;
  pending_reason: string | null;
  customer_response: CustomerResponse | null;
  source_channel: "upload" | "message" | "demo" | null;
  approval_policy?: ApprovalPolicy | null;
  // Triage fields, written for the bank reviewer (backend summarise_for_human).
  why?: string | null;
  problems?: string[];
  next_action?: string | null;
}

export interface CaseSummary {
  case_id: string;
  updated_at: string;
  status: CaseStatus;
  intent: string;
  invoice_number: string | null;
  vendor_name: string | null;
  amount: string | null;
  currency: string | null;
  requires_human: boolean;
  why: string | null;
  next_action: string | null;
}

export interface Health {
  llm_configured: boolean;
  llm_model: string | null;
  detail: string | null;
}
