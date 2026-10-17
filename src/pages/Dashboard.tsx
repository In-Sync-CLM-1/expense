import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isSameMonth } from "date-fns";
import { Loader2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { isRmplOrg } from "@/lib/rmplOrg";
import { useExpenseClaimDialog } from "@/contexts/ExpenseClaimDialogContext";
import { useCurrentUser, useExpenseClaims, usePendingApprovals } from "@/hooks/useExpenseClaims";
import { useMyProjectExpenseClaims, usePendingProjectOwnerApprovals } from "@/hooks/useProjectExpenses";
import { useMyGiftingExpenseClaims } from "@/hooks/useGiftingExpenses";
import { usePendingAdvanceRequests } from "@/hooks/useAdvanceRequests";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { computeScore, type ScoreClaim } from "@/lib/gamification";
import { ScoreCard } from "@/components/home/ScoreCard";
import { StatTile, PageTitle } from "@/components/StatTile";

type Kind = "travel" | "project" | "field";

interface Row {
  id: string;
  kind: Kind;
  title: string;
  kindLabel: string;
  amount: number;
  status: string;
  submitted_at: string | null;
  created_at: string;
  reimbursed_at: string | null;
  rejection_reason: string | null;
  endDate: string | null;
  to: string;
}

const KIND_LABEL: Record<Kind, string> = { travel: "Travel", project: "Project", field: "Field expense" };
const KIND_PATH: Record<Kind, string> = { travel: "/my-expenses", project: "/project-expenses", field: "/field-expenses" };

/** Plain-language status; field expenses skip approval so "submitted" means waiting for payment. */
function statusInfo(kind: Kind, status: string): { label: string; tone: "grey" | "blue" | "teal" | "amber" } {
  if (status === "draft") return { label: "Draft", tone: "grey" };
  if (status === "rejected") return { label: "Returned", tone: "amber" };
  if (status === "reimbursed") return { label: "Paid", tone: "teal" };
  if (status === "approved") return { label: "Approved", tone: "teal" };
  if (status === "submitted") return kind === "field" ? { label: "Awaiting payment", tone: "blue" } : { label: "With approver", tone: "blue" };
  return { label: status, tone: "grey" };
}

const TONE: Record<string, string> = {
  grey: "bg-muted text-muted-foreground",
  blue: "bg-sky-100 text-sky-900",
  teal: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-900",
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function useFirstName(userId?: string) {
  return useQuery({
    queryKey: ["home-first-name", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as never).select("full_name").eq("id", userId!).single();
      const full = (data as { full_name?: string } | null)?.full_name ?? "";
      return full.split(" ")[0] || "";
    },
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { openNewClaim } = useExpenseClaimDialog();
  const { currentOrg } = useOrg();
  const isRmpl = isRmplOrg(currentOrg?.id);
  const { permissions } = useUserPermissions();
  const { data: user } = useCurrentUser();
  const { data: firstName } = useFirstName(user?.id);

  const { data: travel, isLoading: l1 } = useExpenseClaims(user?.id);
  const { data: project, isLoading: l2 } = useMyProjectExpenseClaims(isRmpl ? user?.id : undefined);
  const { data: field, isLoading: l3 } = useMyGiftingExpenseClaims(isRmpl ? user?.id : undefined);

  const showApprover = permissions.canApproveExpenses || isRmpl;
  const { data: pTravel } = usePendingApprovals(showApprover ? user?.id : undefined);
  const { data: pAdv } = usePendingAdvanceRequests(showApprover ? user?.id : undefined);
  const { data: pProj } = usePendingProjectOwnerApprovals(showApprover && isRmpl ? user?.id : undefined);
  const toReview = (pTravel?.length ?? 0) + (pAdv?.length ?? 0) + (pProj?.length ?? 0);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const c of travel ?? []) {
      out.push({
        id: c.id, kind: "travel", title: c.trip_title, kindLabel: KIND_LABEL.travel,
        amount: Number(c.approved_amount ?? c.total_amount ?? 0), status: c.status,
        submitted_at: c.submitted_at, created_at: c.created_at, reimbursed_at: c.reimbursed_at,
        rejection_reason: c.rejection_reason, endDate: c.trip_end_date, to: KIND_PATH.travel,
      });
    }
    for (const c of project ?? []) {
      out.push({
        id: c.id, kind: "project", title: c.project_name, kindLabel: KIND_LABEL.project,
        amount: Number(c.net_balance ?? c.actual_expense_total ?? 0), status: c.status,
        submitted_at: c.submitted_at, created_at: c.created_at, reimbursed_at: c.reimbursed_at,
        rejection_reason: c.rejection_reason, endDate: null, to: KIND_PATH.project,
      });
    }
    for (const c of field ?? []) {
      out.push({
        id: c.id, kind: "field", title: c.period ? `Field expenses · ${c.period}` : "Field expenses",
        kindLabel: KIND_LABEL.field, amount: Number(c.total_amount ?? 0), status: c.status,
        submitted_at: c.submitted_at, created_at: c.created_at, reimbursed_at: c.reimbursed_at,
        rejection_reason: null, endDate: null, to: KIND_PATH.field,
      });
    }
    return out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [travel, project, field]);

  const now = new Date();
  const waiting = rows.filter((r) => r.status === "submitted" && r.kind !== "field");
  const beingPaid = rows.filter((r) => r.status === "approved" || (r.kind === "field" && r.status === "submitted"));
  const paidThisMonth = rows.filter((r) => r.status === "reimbursed" && r.reimbursed_at && isSameMonth(new Date(r.reimbursed_at), now));
  const returned = rows.filter((r) => r.status === "rejected");
  const sum = (xs: Row[]) => xs.reduce((s, r) => s + r.amount, 0);

  const score = useMemo(
    () => computeScore(rows.map<ScoreClaim>((r) => ({ kind: r.kind, status: r.status, submitted_at: r.submitted_at, endDate: r.endDate }))),
    [rows],
  );

  const loading = l1 || l2 || l3;
  const allCaughtUp = showApprover && toReview === 0;
  const owed = sum(beingPaid);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-8 py-8 space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <PageTitle eyebrow={format(new Date(), "EEEE, d MMMM")}>{firstName ? `Hello, ${firstName}` : "Hello"}</PageTitle>
          <p className="text-muted-foreground mt-2 text-lg">
            {owed > 0 ? `${inr(owed)} is on its way to you.` : "Nothing is waiting to be paid to you."}
            {returned.length > 0 ? ` ${returned.length === 1 ? "One claim needs" : `${returned.length} claims need`} your attention.` : ""}
          </p>
        </div>
        <Button size="lg" onClick={openNewClaim}>+ New claim</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          {returned.slice(0, 2).map((r) => (
            <div key={r.id} className="rounded-2xl border border-amber-300 border-l-4 border-l-amber-500 bg-amber-50 p-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold text-amber-900">Returned: needs a fix</div>
                <div className="text-amber-900/90 mt-1">
                  {r.title}{r.rejection_reason ? ` · "${r.rejection_reason}"` : ""}
                </div>
              </div>
              <Button variant="outline" className="border-amber-700 text-amber-900" onClick={() => navigate(r.to)}>
                Fix and resubmit
              </Button>
            </div>
          ))}

          {showApprover && (
            <div
              className={`rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap ${
                allCaughtUp ? "border-primary/30 bg-primary/5" : "border-border bg-card"
              }`}
            >
              {allCaughtUp ? (
                <div className="flex items-center gap-3 font-bold text-primary">
                  <PartyPopper className="h-6 w-6" aria-hidden="true" /> Inbox zero. Everything you review is done.
                </div>
              ) : (
                <>
                  <div>
                    <div className="font-bold">{toReview} waiting for your review</div>
                    <div className="text-muted-foreground mt-1">The people you approve for are waiting on you.</div>
                  </div>
                  <Button onClick={() => navigate("/approvals")}>Review now</Button>
                </>
              )}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <StatTile tone="amber" label="Waiting for approval" value={inr(sum(waiting))} note={`${waiting.length} ${waiting.length === 1 ? "claim" : "claims"}`} />
            <StatTile tone="primary" label="Approved, being paid" value={inr(sum(beingPaid))} note={`${beingPaid.length} ${beingPaid.length === 1 ? "claim" : "claims"}`} />
            <StatTile tone="green" label="Paid this month" value={inr(sum(paidThisMonth))} note={`${paidThisMonth.length} ${paidThisMonth.length === 1 ? "claim" : "claims"}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3 overflow-hidden">
              <div className="px-5 py-4 font-display text-lg font-semibold border-b bg-muted/30">Recent claims</div>
              {rows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No claims yet. Start your first one and earn your first badge.
                </div>
              ) : (
                <ul>
                  {rows.slice(0, 6).map((r) => {
                    const st = statusInfo(r.kind, r.status);
                    return (
                      <li key={`${r.kind}-${r.id}`} className="border-b last:border-0">
                        <button
                          type="button"
                          onClick={() => navigate(r.to)}
                          className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/50 min-h-[56px]"
                        >
                          <div className="min-w-0">
                            <div className="font-bold truncate">{r.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {r.kindLabel} · {format(new Date(r.created_at), "d MMM")}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-display text-lg font-semibold tabular-nums">{inr(r.amount)}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[st.tone]}`}>{st.label}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <div className="lg:col-span-2">
              <ScoreCard score={score} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
