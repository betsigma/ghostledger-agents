import { useState } from "react";
import { api, ApiError } from "../api";
import { useSession } from "../App";
import {
  agentName, channelLabel, money, riskBadge, runLabel, runTone, statusLabel, statusTone, stepLabel, visiblePath, when,
} from "../labels";
import type { AgentReport, Finding, WorkflowCase } from "../types";
import { Button, Card, Collapse, ErrorText, Pill, RecordChip, Working, useLoad } from "../ui";

export default function CasePage({ caseId }: { caseId: string }) {
  const { data: c, error, loading, reload } = useLoad<WorkflowCase>(`/workflow/cases/${encodeURIComponent(caseId)}`);
  if (loading && !c) return <Working text="Opening the case" />;
  if (!c) return <ErrorText error={error ?? "Case not found."} />;
  return <CaseView c={c} reload={reload} />;
}

export function CaseView({ c, reload }: { c: WorkflowCase; reload: () => void }) {
  const { me } = useSession();
  const isCustomer = me?.account.role === "CUSTOMER";
  const [risk, riskTone] = riskBadge(c);
  const channel = channelLabel(c.source_channel);
  const scripted = c.analysis?.analysis_source === "synthetic_fixture";

  return (
    <article className="mx-auto max-w-[760px] space-y-4">
      <Answer c={c} />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={statusTone(c.status)}>{statusLabel(c.status)}</Pill>
          {risk !== statusLabel(c.status) && <Pill tone={riskTone}>{risk}</Pill>}
          {scripted && <Pill tone="neutral">Scripted reading, not a live AI call</Pill>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Fact label="Amount" value={money(c.amount, c.currency)} />
          <Fact label="Vendor" value={c.vendor_name ?? "—"} />
          <Fact label="Invoice" value={c.invoice_number ?? "—"} />
          {channel && <Fact label="Sent as" value={channel} />}
        </dl>
      </Card>

      <Path c={c} />

      {c.status === "AWAITING_APPROVAL" &&
        (isCustomer ? <WaitingForApprover c={c} /> : <ApprovePanel c={c} reload={reload} />)}

      {c.status === "REQUIRES_REVIEW" && <ReviewPanel c={c} />}

      <PaymentSection c={c} />

      <Findings c={c} />

      <Collapse title="How did GhostLedger decide?">
        <Decision c={c} />
      </Collapse>
      <Collapse title="Full history">
        <ol className="space-y-2 text-sm">
          {c.audit.map((e) => (
            <li key={e.entry_id} className="border-l-2 border-sky pl-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">{when(e.at)} · {agentName(e.actor)} · {e.action.replaceAll("_", " ")}</span>
              <p>{e.detail}</p>
            </li>
          ))}
        </ol>
      </Collapse>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Case <RecordChip label={c.case_id.slice(0, 8)} value={c} />
      </p>
    </article>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="font-semibold">{value}</dd>
  </div>
);

/** One answer, one next action. Agent 5's customer_response wins when present. */
function Answer({ c }: { c: WorkflowCase }) {
  const response = c.customer_response;
  const latest = [...c.reports].reverse().find((r) => r.summary);
  const title = response?.headline ?? statusLabel(c.status);
  const sentence = response?.answer ?? c.pending_reason ?? latest?.summary ?? c.outcome ?? "GhostLedger is working on this case.";
  const steps = response?.next_steps ?? [];
  return (
    <Card className={response?.payment_settled ? "ring-2 ring-green-500" : ""}>
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-2 text-base">{sentence}</p>
      {steps.length > 0 && (
        <>
          <h2 className="mt-4 text-base">Next steps</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{steps.map((s) => <li key={s}>{s}</li>)}</ul>
        </>
      )}
    </Card>
  );
}

export function Path({ c }: { c: Pick<WorkflowCase, "agent_runs"> }) {
  const runs = visiblePath(c.agent_runs);
  return (
    <Card>
      <h2 className="mb-3 text-base">Path</h2>
      <ol className="space-y-2" aria-label="Workflow path">
        {runs.map((run) => (
          <li key={`${run.agent}-${run.order}`}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ${
              run.agent === "payment_simulator" ? "border border-dashed border-ocean" : "bg-foam dark:bg-[#07142f]"
            }`}>
            <span className="text-sm font-semibold">{stepLabel(run)}</span>
            <Pill tone={runTone(run.status)}>{runLabel(run.status)}</Pill>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function WaitingForApprover({ c }: { c: WorkflowCase }) {
  const policy = c.approval_policy;
  return (
    <Card>
      <h2 className="text-base">Waiting for a bank approver</h2>
      <p className="mt-1 text-sm">
        You requested this, so you can't approve it. A bank approver decides; payment only runs after they approve.
      </p>
      {policy && policy.blocked.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
          {policy.blocked.map((b) => <li key={b.user}>{b.reason}</li>)}
        </ul>
      )}
    </Card>
  );
}

export function ApprovePanel({ c, reload }: { c: WorkflowCase; reload: () => void }) {
  const { me } = useSession();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [simulate, setSimulate] = useState("SUCCESS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agent1 = [...c.reports].reverse().find((r) => r.agent === "agent_1");

  const decide = async (action: "approve" | "reject") => {
    if (action === "reject" && !reason.trim()) return setError("Give a reason for rejecting.");
    setBusy(true);
    setError(null);
    try {
      // approved_by / rejected_by are never sent: the backend records the signed-in account.
      const json = action === "approve" ? { ...(note && { note }), simulate } : { reason };
      await api(`/workflow/cases/${c.case_id}/${action}`, { method: "POST", json });
      reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <Working text="Running the payment and checking the bank" />;
  return (
    <Card className="ring-2 ring-ocean">
      <h2 className="text-base">Approve or reject</h2>
      <p className="mt-1 text-sm">Payment only runs after you approve. Requested by {c.approval_policy?.requester?.display_name ?? "a customer"}.</p>
      {agent1 && (
        <p className="mt-2 text-sm">
          <Pill tone="check">Agent 1 · {agent1.data.status}</Pill>{" "}
          {agent1.requires_human ? "Agent 1 wants a person to judge this." : "Agent 1 raised no objection."}
        </p>
      )}
      <label className="mt-3 block text-sm font-semibold">
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-sky px-3 py-2 font-normal dark:bg-[#07142f]" />
      </label>
      {me?.account.role === "DEMO_ADMIN" && (
        <label className="mt-3 block text-sm font-semibold">
          Developer: simulated bank result
          <select value={simulate} onChange={(e) => setSimulate(e.target.value)} className="mt-1 w-full rounded-xl border border-sky px-3 py-2 font-normal dark:bg-[#07142f]">
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="PARTIAL">Partial</option>
          </select>
        </label>
      )}
      <label className="mt-3 block text-sm font-semibold">
        Reason, if rejecting
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-sky px-3 py-2 font-normal dark:bg-[#07142f]" />
      </label>
      <div className="mt-3 space-y-3">
        <ErrorText error={error} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("approve")}>Approve payment</Button>
          <Button kind="danger" onClick={() => decide("reject")}>Reject</Button>
        </div>
      </div>
    </Card>
  );
}

function ReviewPanel({ c }: { c: WorkflowCase }) {
  const missing = c.customer_response?.missing_information ?? [];
  return (
    <section className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:ring-amber-700">
      <h2 className="text-base">A person needs to look at this</h2>
      {c.pending_reason && <p className="mt-1 text-sm">{c.pending_reason}</p>}
      {missing.length > 0 && <p className="mt-2 text-sm"><b>Missing:</b> {missing.join(", ")}</p>}
    </section>
  );
}

function PaymentSection({ c }: { c: WorkflowCase }) {
  const agent4 = [...c.reports].reverse().find((r) => r.agent === "agent_4");
  if (!c.payment && !c.reconciliation && !agent4) return null;
  const p = c.payment;
  const rec = c.reconciliation;
  const a4 = agent4?.data ?? {};
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base">Payment</h2>
        <Pill tone="neutral">Simulated, no real money</Pill>
      </div>
      {p && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Fact label="Amount" value={money(p.amount, p.currency)} />
          <Fact label="Bank result" value={p.provider_status} />
          <Fact label="Confirmed" value={p.verified ? "Yes, by Agent 2" : "No"} />
          {p.provider_reference && <div><dt className="text-xs text-slate-500">Reference</dt><dd><RecordChip label={p.provider_reference} value={p} /></dd></div>}
          {p.failure_code && <Fact label="Failure" value={`${p.failure_code}: ${p.failure_reason ?? ""}`} />}
        </dl>
      )}
      {c.receipt && (
        <p className="mt-3 text-sm">
          Receipt <RecordChip label={c.receipt.receipt_id.slice(0, 8)}
            load={() => api(`/workflow/cases/${c.case_id}/receipt`)} />
        </p>
      )}
      {rec && (
        <p className="mt-3 text-sm">
          <b>Reconciliation:</b> {String(rec.verdict ?? "—")}{rec.summary ? ` · ${rec.summary}` : ""}
        </p>
      )}
      {agent4 && (
        <div className="mt-3 rounded-xl bg-foam p-3 text-sm dark:bg-[#07142f]">
          <h3 className="text-sm">Agent 4 · Payment exception</h3>
          {a4.customer_explanation && <p className="mt-1">{a4.customer_explanation}</p>}
          {a4.diagnosis && <p className="mt-1"><b>Diagnosis:</b> {a4.diagnosis}</p>}
          {a4.failure_code && <p className="mt-1"><b>Bank code:</b> {a4.failure_code}</p>}
          {a4.recommended_resolution && <p className="mt-1"><b>Recommended:</b> {a4.recommended_resolution}</p>}
          {a4.retry_permitted !== undefined && <p className="mt-1"><b>Retry permitted:</b> {a4.retry_permitted ? "Yes" : "No"}</p>}
        </div>
      )}
      <p className="mt-3 text-sm font-semibold">A retry needs a fresh approval.</p>
    </Card>
  );
}

const FINDING_TONE: Record<Finding["status"], "check" | "failure" | "attention" | "neutral"> = {
  passed: "check", failed: "failure", unverified: "attention", info: "neutral",
};
const FINDING_TEXT: Record<Finding["status"], string> = {
  passed: "Passed", failed: "Failed", unverified: "Not verified", info: "Info",
};

function Findings({ c }: { c: WorkflowCase }) {
  const reports = c.reports.filter((r) => r.agent !== "agent_5");
  if (reports.length === 0) return null;
  return (
    <Collapse title="What the agents found">
      <div className="space-y-3">{reports.map((r, i) => <ReportCard key={i} r={r} caseId={c.case_id} />)}</div>
    </Collapse>
  );
}

function ReportCard({ r, caseId }: { r: AgentReport; caseId: string }) {
  return (
    <div className="rounded-xl bg-foam p-3 dark:bg-[#07142f]">
      <h3 className="text-sm">{agentName(r.agent)}</h3>
      <p className="mt-1 text-sm">{r.summary}</p>
      {r.agent === "agent_1" && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Pill tone="check">{String(r.data.status)}</Pill>
          <span>{r.requires_human ? "Needs human judgement" : "No human judgement needed"}</span>
          <RecordChip label="Evidence" load={() => api(`/workflow/cases/${caseId}/investigation`)} />
        </p>
      )}
      {r.findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.findings.map((f, i) => (
            <li key={i} className={`text-sm ${f.status === "unverified" ? "border-l-4 border-dashed border-amber-500 pl-2" : ""}`}>
              <Pill tone={FINDING_TONE[f.status]}>{FINDING_TEXT[f.status]}</Pill> <b>{f.label}:</b> {f.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Decision({ c }: { c: WorkflowCase }) {
  const routing = c.analysis?.routing;
  const checks: any[] = c.analysis?.validation?.validation_findings ?? [];
  return (
    <div className="space-y-3 text-sm">
      {routing && (
        <p><b>Agent 3 routed this to</b> {routing.agent_name ?? routing.recommended_agent}. {routing.reason}</p>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Python checks (teal) are deterministic. Agent 3 source: {String(c.analysis?.analysis_source ?? "—")}.
      </p>
      {checks.length > 0 && (
        <ul className="space-y-2">
          {checks.map((check, i) => (
            <li key={i}>
              <Pill tone={check.status === "passed" ? "check" : check.status === "failed" ? "failure" : check.status === "unverified" ? "attention" : "neutral"}>
                {check.status.replaceAll("_", " ")}
              </Pill>{" "}
              <b>{check.label}.</b> {check.explanation}
              {(check.expected || check.reported) && (
                <span className="block text-xs text-slate-600 dark:text-slate-300">
                  Expected {check.expected ?? "—"} · reported {check.reported ?? "—"}{check.variance ? ` · difference ${check.variance}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
