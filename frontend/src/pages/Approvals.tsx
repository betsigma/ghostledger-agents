import { money, when } from "../labels";
import { Card, Empty, ErrorText, Pill, Working, useLoad } from "../ui";

export interface ApprovalItem {
  case_id: string;
  created_at: string;
  requester: { account_id: string; display_name: string | null; email: string | null } | null;
  invoice_number: string | null;
  vendor: string | null;
  amount: string | null;
  currency: string | null;
  agent1: { status: string | null; summary: string; needs_human_judgement: boolean } | null;
}

export default function Approvals() {
  const { data, error, loading } = useLoad<{ count: number; approvals: ApprovalItem[] }>("/workflow/approvals");
  if (loading) return <Working text="Loading approvals" />;
  return <ApprovalsList items={data?.approvals ?? []} error={error} />;
}

export function ApprovalsList({ items, error }: { items: ApprovalItem[]; error: string | null }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl">Approvals</h1>
      <p className="text-sm">Payment only runs after you approve. Agent 1 has already checked each one.</p>
      <ErrorText error={error} />
      {items.length === 0 && !error && <Empty>Nothing is waiting for approval.</Empty>}
      {items.map((a) => (
        <a key={a.case_id} href={`#/cases/${a.case_id}`} className="block">
          <Card className="hover:ring-ocean">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{a.invoice_number ?? "No invoice number"} · {a.vendor ?? "Unknown vendor"}</span>
              <span className="font-semibold">{money(a.amount, a.currency)}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Requested by {a.requester?.display_name ?? a.requester?.email ?? "unknown"} · {when(a.created_at)}
            </p>
            {a.agent1 && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="check">Agent 1 · {a.agent1.status}</Pill>
                {a.agent1.needs_human_judgement && <Pill tone="attention">Needs human judgement</Pill>}
                <span>{a.agent1.summary}</span>
              </p>
            )}
          </Card>
        </a>
      ))}
    </div>
  );
}
