import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { navFor, Page, SessionContext, type Me } from "./App";
import { Answer, CaseView } from "./pages/CasePage";
import { ApprovalsList } from "./pages/Approvals";
import type { Role, WorkflowCase } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
afterEach(() => container?.remove());

function render(ui: ReactNode, role: Role) {
  const me: Me = { account: { account_id: "a1", email: "x@example.test", display_name: "X", role, created_at: "" }, payment_history: [], receipts: [] };
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => createRoot(container).render(<SessionContext.Provider value={{ me, health: null }}>{ui}</SessionContext.Provider>));
  return { me, text: () => container.textContent ?? "", buttons: () => [...container.querySelectorAll("button")].map((b) => b.textContent) };
}

// Shape of GET /workflow/cases/{id} for a case awaiting approval (backend README).
const awaiting: WorkflowCase = {
  case_id: "case-1", created_at: "", updated_at: "", status: "AWAITING_APPROVAL", intent: "new_payment_request",
  customer_name: null, vendor_name: "Northstar Office Supplies LLC", invoice_number: "INV-7781", amount: "1280.00", currency: "USD",
  analysis: null, owner_account_id: "cust-1", approval: null, payment: null, reconciliation: null, receipt: null,
  audit: [], outcome: null, requires_human: true, pending_reason: null, customer_response: null, source_channel: "message",
  agent_runs: [
    { agent: "agent_3", agent_name: "", status: "completed", order: 0, phase: null, summary: null, started_at: null, completed_at: null },
    { agent: "agent_1", agent_name: "", status: "completed", order: 1, phase: null, summary: null, started_at: null, completed_at: null },
    { agent: "human_approval", agent_name: "", status: "requires_human", order: 2, phase: null, summary: null, started_at: null, completed_at: null },
  ],
  reports: [{ agent: "agent_1", agent_name: "", summary: "No comparison records.", findings: [], next_action: null,
    requires_human: true, resolved: false, data: { status: "INSUFFICIENT_INFORMATION" }, completed_at: null }],
  approval_policy: {
    required: true, eligible_roles: ["BANK_ADMIN", "DEMO_ADMIN"],
    requester: { account_id: "cust-1", display_name: "Demo Customer A", email: "customer.a@ghostledger.test" },
    blocked: [{ user: "Demo Customer A", reason: "The account that requested a payment cannot approve it." }],
  },
};

describe("approval by role", () => {
  it("a customer sees no approve button, only the waiting notice", () => {
    const view = render(<CaseView c={awaiting} reload={() => {}} />, "CUSTOMER");
    expect(view.buttons()).not.toContain("Approve payment");
    expect(view.text()).toContain("Waiting for a bank approver");
    expect(view.text()).toContain("You requested this, so you can't approve it");
    expect(view.text()).toContain("The account that requested a payment cannot approve it.");
  });

  it("a bank admin sees approve and reject", () => {
    const view = render(<CaseView c={awaiting} reload={() => {}} />, "BANK_ADMIN");
    expect(view.buttons()).toEqual(expect.arrayContaining(["Approve payment", "Reject"]));
    expect(view.text()).toContain("Payment only runs after you approve.");
    expect(view.text()).toContain("INSUFFICIENT_INFORMATION");
  });

  it("only the demo admin gets the simulated bank result option", () => {
    expect(render(<CaseView c={awaiting} reload={() => {}} />, "BANK_ADMIN").text()).not.toContain("Developer: simulated bank result");
    expect(render(<CaseView c={awaiting} reload={() => {}} />, "DEMO_ADMIN").text()).toContain("Developer: simulated bank result");
  });
});

describe("navigation by role", () => {
  it("customers get no ledger or admin links", () => {
    const paths = navFor("CUSTOMER").map(([p]) => p);
    expect(paths).toEqual(["new", "cases", "payments", "profile"]);
  });

  it("admins see approvals; only the demo admin sees demo scenarios", () => {
    expect(navFor("BANK_ADMIN").map(([p]) => p)).toEqual(["approvals", "overview", "ledger", "failures", "activity", "customers"]);
    expect(navFor("DEMO_ADMIN").map(([p]) => p)).toContain("scenarios");
  });

  it("a customer opening an admin URL is told it is for bank admins", () => {
    const { me } = render(<div />, "CUSTOMER");
    const view = render(<Page me={me} route={["approvals"]} />, "CUSTOMER");
    expect(view.text()).toContain("This area is for bank admins.");
  });

  it("the approvals list shows requester, terms and Agent 1's result", () => {
    const view = render(<ApprovalsList error={null} items={[{
      case_id: "case-1", created_at: "", requester: awaiting.approval_policy!.requester, invoice_number: "INV-7781",
      vendor: "Northstar Office Supplies LLC", amount: "1280.00", currency: "USD",
      agent1: { status: "INSUFFICIENT_INFORMATION", summary: "No comparison records.", needs_human_judgement: true },
    }]} />, "BANK_ADMIN");
    for (const text of ["INV-7781", "Demo Customer A", "1,280.00 USD", "INSUFFICIENT_INFORMATION", "Needs human judgement"]) {
      expect(view.text()).toContain(text);
    }
  });
});

describe("answer before Agent 5 replies", () => {
  const triaged: WorkflowCase = {
    ...awaiting,
    why: "No comparison records are available.",
    next_action: "Approve 1280.00 USD to Northstar Office Supplies LLC, or reject it.",
  };

  it("a customer sees why, but not the reviewer's approve step", () => {
    const view = render(<Answer c={triaged} isCustomer />, "CUSTOMER");
    expect(view.text()).toContain("No comparison records are available.");
    expect(view.text()).not.toContain("Approve 1280.00 USD");
  });

  it("an admin also gets next_action as the one next step", () => {
    const view = render(<Answer c={triaged} isCustomer={false} />, "BANK_ADMIN");
    expect(view.text()).toContain("Approve 1280.00 USD to Northstar Office Supplies LLC, or reject it.");
  });

  it("Agent 5's answer wins once it exists", () => {
    const answered: WorkflowCase = { ...triaged, customer_response: {
      case_status: "COMPLETED", outcome: "PAID", headline: "Payment confirmed", answer: "Your payment is confirmed.",
      next_steps: ["No action is needed."], payment_settled: true, missing_information: [], generated_by: "deterministic",
    } };
    const view = render(<Answer c={answered} isCustomer />, "CUSTOMER");
    expect(view.text()).toContain("Payment confirmed");
    expect(view.text()).not.toContain("No comparison records");
  });
});
