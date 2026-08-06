import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * RMPL-only "Project Expense" claim type, modeled on RMPL's own
 * "Outing Activity" sheet. Approval routes to that specific project's
 * Project Owner (resolved from RMPL's own project record, matched by
 * email into this app's profiles — see list-rmpl-projects), not the
 * filer's usual profiles.approver_id. Advance Received is pulled from
 * an actual disbursed advance (expense_advances), never typed in.
 */

export interface ProjectExpenseItem {
  id?: string;
  claim_id?: string;
  line_date: string;
  description: string;
  mode_of_transport: string;
  local_conveyance: number;
  event_expense: number;
  refreshment: number;
  other_expense: number;
  grand_total?: number;
  receipt_url?: string | null;
  receipt_name?: string | null;
  remarks?: string | null;
}

export interface ProjectExpenseTravelLog {
  id?: string;
  claim_id?: string;
  travel_date: string;
  from_place: string;
  to_place: string;
  mode: string;
  place: string;
  total: number;
}

export interface ProjectExpenseClaim {
  id: string;
  org_id: string;
  user_id: string;
  traveller_name: string;
  rmpl_project_id: string;
  project_number: string | null;
  project_name: string;
  project_owner_external_id: string | null;
  project_owner_user_id: string | null;
  project_owner_name: string | null;
  project_owner_email: string | null;
  activity: string | null;
  city: string | null;
  period: string | null;
  advance_id: string | null;
  advance_amount: number;
  actual_expense_total: number;
  net_balance: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reimbursed_at: string | null;
  reimbursed_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string; email: string } | null;
  items?: ProjectExpenseItem[];
  travel_logs?: ProjectExpenseTravelLog[];
}

export interface RmplProjectOption {
  id: string;
  project_name: string;
  project_number: string | null;
  project_owner_external_id: string | null;
  project_owner_name: string | null;
  project_owner_email: string | null;
  project_owner_user_id: string | null;
}

export interface DisbursedAdvance {
  id: string;
  amount: number;
  advance_date: string;
  note: string | null;
}

export function getProjectExpenseStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    submitted: "Pending Project Owner Approval",
    approved: "Approved — Awaiting Payment",
    rejected: "Rejected",
    reimbursed: "Paid",
  };
  return map[status] ?? status;
}

export function getProjectExpenseStatusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    submitted: "secondary",
    approved: "default",
    rejected: "destructive",
    reimbursed: "default",
  };
  return map[status] ?? "outline";
}

// ─── RMPL project picker (with project number + resolved owner) ──────────────

export function useRmplProjectsForExpense(enabled = true) {
  return useQuery({
    queryKey: ["rmpl-projects-for-project-expense"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-rmpl-projects");
      if (error) throw new Error("Could not load projects from RMPL");
      return (data?.projects || []) as RmplProjectOption[];
    },
    enabled,
    staleTime: 60_000,
  });
}

// ─── Advance picker: filer's own disbursed, unconsumed advances for a project ─

export function useMyDisbursedAdvancesForProject(userId?: string, rmplProjectId?: string | null) {
  return useQuery({
    queryKey: ["my-disbursed-advances-for-project", userId, rmplProjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_advances" as never)
        .select("id, amount, advance_date, note")
        .eq("user_id", userId as string)
        .eq("project_id", rmplProjectId as string)
        .is("project_claim_id", null)
        .order("advance_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DisbursedAdvance[];
    },
    enabled: !!userId && !!rmplProjectId,
  });
}

// ─── Upload: one supporting file per line item, to R2 ─────────────────────────

export async function uploadProjectExpenseFile(
  file: File,
  claimId: string
): Promise<{ url: string; name: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("claim_id", claimId);
  const { data, error } = await supabase.functions.invoke("upload-project-expense-file", { body: form });
  if (error) throw new Error("File upload failed: " + error.message);
  if (data?.error) throw new Error(data.error);
  return { url: data.url, name: data.name };
}

// ─── Query: my claims ─────────────────────────────────────────────────────────

export function useMyProjectExpenseClaims(userId?: string) {
  return useQuery({
    queryKey: ["my-project-expense-claims", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("project_expense_claims" as never)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectExpenseClaim[];
    },
    enabled: !!userId,
  });
}

// ─── Query: single claim with items + travel log ──────────────────────────────

export function useProjectExpenseClaimDetail(claimId?: string) {
  return useQuery({
    queryKey: ["project-expense-claim-detail", claimId],
    queryFn: async () => {
      if (!claimId) return null;
      const { data: claim, error } = await supabase
        .from("project_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("id", claimId)
        .single();
      if (error) throw error;

      const { data: items } = await supabase
        .from("project_expense_claim_items" as never)
        .select("*")
        .eq("claim_id", claimId)
        .order("line_date", { ascending: true });

      const { data: travelLogs } = await supabase
        .from("project_expense_travel_logs" as never)
        .select("*")
        .eq("claim_id", claimId)
        .order("travel_date", { ascending: true });

      return {
        ...(claim as unknown as ProjectExpenseClaim),
        items: (items ?? []) as unknown as ProjectExpenseItem[],
        travel_logs: (travelLogs ?? []) as unknown as ProjectExpenseTravelLog[],
      };
    },
    enabled: !!claimId,
  });
}

// ─── Query: pending approvals for this Project Owner ───────────────────────────

export function usePendingProjectOwnerApprovals(userId?: string) {
  return useQuery({
    queryKey: ["project-expense-approvals-pending", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("project_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("project_owner_user_id", userId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectExpenseClaim[];
    },
    enabled: !!userId,
  });
}

// ─── Query: accounts/admin — all history + approved awaiting payment ──────────

export function useAllProjectExpenseClaims(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["project-expense-claims-all", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("org_id", orgId as string)
        .neq("status", "draft")
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ProjectExpenseClaim[];
    },
    enabled: enabled && !!orgId,
  });
}

// ─── Query: combined per-project totals (native Project Expense claims +
//     regular Expense Claims tagged to a project) ──────────────────────────

export interface ProjectSummaryRow {
  project_number: string;
  project_name: string;
  projectExpenseTotal: number;
  projectExpenseCount: number;
  regularClaimTotal: number;
  regularClaimCount: number;
  combinedTotal: number;
}

const GENERAL_BUCKET = { number: "999", name: "General / Non-Project" };

export function useProjectExpenseSummary(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["project-expense-summary", orgId],
    queryFn: async () => {
      const [{ data: peClaims, error: peErr }, { data: regClaims, error: regErr }] = await Promise.all([
        supabase
          .from("project_expense_claims" as never)
          .select("project_number, project_name, actual_expense_total")
          .eq("org_id", orgId as string)
          .neq("status", "draft"),
        supabase
          .from("travel_expense_claims" as never)
          .select("project_number, project_name, total_amount, approved_amount, status")
          .eq("org_id", orgId as string)
          .neq("status", "draft"),
      ]);
      if (peErr) throw peErr;
      if (regErr) throw regErr;

      const map = new Map<string, ProjectSummaryRow>();
      const keyFor = (num: string | null, name: string | null) => `${num ?? GENERAL_BUCKET.number}|${name ?? GENERAL_BUCKET.name}`;
      const rowFor = (num: string | null, name: string | null) => {
        const key = keyFor(num, name);
        if (!map.has(key)) {
          map.set(key, {
            project_number: num ?? GENERAL_BUCKET.number,
            project_name: name ?? GENERAL_BUCKET.name,
            projectExpenseTotal: 0, projectExpenseCount: 0,
            regularClaimTotal: 0, regularClaimCount: 0,
            combinedTotal: 0,
          });
        }
        return map.get(key)!;
      };

      for (const c of (peClaims ?? []) as { project_number: string | null; project_name: string | null; actual_expense_total: number }[]) {
        const row = rowFor(c.project_number, c.project_name);
        row.projectExpenseTotal += Number(c.actual_expense_total);
        row.projectExpenseCount += 1;
      }
      for (const c of (regClaims ?? []) as { project_number: string | null; project_name: string | null; total_amount: number; approved_amount: number | null; status: string }[]) {
        const row = rowFor(c.project_number, c.project_name);
        const amount = (c.status === "approved" || c.status === "reimbursed") ? Number(c.approved_amount ?? c.total_amount) : Number(c.total_amount);
        row.regularClaimTotal += amount;
        row.regularClaimCount += 1;
      }
      for (const row of map.values()) row.combinedTotal = row.projectExpenseTotal + row.regularClaimTotal;

      return Array.from(map.values()).sort((a, b) => b.combinedTotal - a.combinedTotal);
    },
    enabled: enabled && !!orgId,
  });
}

function invalidateProjectExpenseQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["my-project-expense-claims"] });
  qc.invalidateQueries({ queryKey: ["project-expense-claim-detail"] });
  qc.invalidateQueries({ queryKey: ["project-expense-approvals-pending"] });
  qc.invalidateQueries({ queryKey: ["project-expense-claims-all"] });
  qc.invalidateQueries({ queryKey: ["my-disbursed-advances-for-project"] });
}

// ─── Mutation: create claim (draft or submitted) with line-item uploads ───────

interface CreateProjectExpenseClaimInput {
  org_id: string;
  user_id: string;
  traveller_name: string;
  rmpl_project_id: string;
  project_number: string | null;
  project_name: string;
  project_owner_external_id: string | null;
  project_owner_user_id: string | null;
  project_owner_name: string | null;
  project_owner_email: string | null;
  activity: string;
  city: string;
  period: string;
  advanceId: string | null;
  items: Omit<ProjectExpenseItem, "id" | "claim_id" | "grand_total">[];
  itemFiles: (File | undefined)[]; // parallel to items
  travelLogs: Omit<ProjectExpenseTravelLog, "id" | "claim_id">[];
  submit: boolean;
}

export function useCreateProjectExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, itemFiles, travelLogs, advanceId, submit, ...header }: CreateProjectExpenseClaimInput) => {
      const { data: newClaim, error } = await supabase
        .from("project_expense_claims" as never)
        .insert(header as never)
        .select("id")
        .single();
      if (error) throw error;
      const claimId = (newClaim as { id: string }).id;

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("project_expense_claim_items" as never)
          .insert(items.map((item) => ({ ...item, claim_id: claimId })));
        if (itemsError) throw itemsError;
      }

      if (itemFiles.some(Boolean)) {
        const { data: createdItems } = await supabase
          .from("project_expense_claim_items" as never)
          .select("id")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: true });

        for (let i = 0; i < itemFiles.length; i++) {
          const file = itemFiles[i];
          if (!file || !createdItems?.[i]) continue;
          try {
            const { url, name } = await uploadProjectExpenseFile(file, claimId);
            await supabase
              .from("project_expense_claim_items" as never)
              .update({ receipt_url: url, receipt_name: name })
              .eq("id", (createdItems[i] as { id: string }).id);
          } catch (err) {
            console.error("Supporting document upload failed for line", i, err);
          }
        }
      }

      if (travelLogs.length > 0) {
        const { error: logsError } = await supabase
          .from("project_expense_travel_logs" as never)
          .insert(travelLogs.map((log) => ({ ...log, claim_id: claimId })));
        if (logsError) throw logsError;
      }

      if (advanceId) {
        const { error: linkError } = await (supabase as never as {
          rpc: (fn: string, args: object) => Promise<{ data: unknown; error: Error | null }>;
        }).rpc("link_project_expense_advance", { _advance_id: advanceId, _claim_id: claimId });
        if (linkError) console.error("Failed to link advance:", linkError);
      }

      if (submit) {
        await supabase
          .from("project_expense_claims" as never)
          .update({ status: "submitted", submitted_at: new Date().toISOString() })
          .eq("id", claimId);
      }

      return claimId;
    },
    onSuccess: async (claimId, vars) => {
      invalidateProjectExpenseQueries(qc);
      toast.success(vars.submit ? "Project expense submitted for approval!" : "Saved as draft");
      if (vars.submit) {
        try {
          await supabase.functions.invoke("send-project-expense-notification", {
            body: { event: "submitted", claim_id: claimId },
          });
        } catch (err) {
          console.error("Notification failed:", err);
        }
      }
    },
    onError: (err: Error) => toast.error("Failed to save: " + err.message),
  });
}

// ─── Mutation: submit an existing draft ───────────────────────────────────────

export function useSubmitProjectExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("project_expense_claims" as never)
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", claimId);
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      invalidateProjectExpenseQueries(qc);
      toast.success("Submitted for approval!");
      try {
        await supabase.functions.invoke("send-project-expense-notification", {
          body: { event: "submitted", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to submit: " + err.message),
  });
}

// ─── Mutation: Project Owner approves ─────────────────────────────────────────

export function useApproveProjectExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, approverId }: { claimId: string; approverId: string }) => {
      const { error } = await supabase
        .from("project_expense_claims" as never)
        .update({ status: "approved", approved_by: approverId, approved_at: new Date().toISOString() })
        .eq("id", claimId)
        .eq("status", "submitted");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      invalidateProjectExpenseQueries(qc);
      toast.success("Project expense approved!");
      try {
        await supabase.functions.invoke("send-project-expense-notification", {
          body: { event: "approved", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to approve: " + err.message),
  });
}

// ─── Mutation: Project Owner rejects ──────────────────────────────────────────

export function useRejectProjectExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, approverId, reason }: { claimId: string; approverId: string; reason: string }) => {
      const { error } = await supabase
        .from("project_expense_claims" as never)
        .update({ status: "rejected", approved_by: approverId, approved_at: new Date().toISOString(), rejection_reason: reason })
        .eq("id", claimId)
        .eq("status", "submitted");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      invalidateProjectExpenseQueries(qc);
      toast.success("Project expense rejected.");
      try {
        await supabase.functions.invoke("send-project-expense-notification", {
          body: { event: "rejected", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to reject: " + err.message),
  });
}

// ─── Mutation: Accounts marks paid ────────────────────────────────────────────

export function useMarkProjectExpenseReimbursed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, reimbursedBy }: { claimId: string; reimbursedBy: string }) => {
      const { error } = await supabase
        .from("project_expense_claims" as never)
        .update({ status: "reimbursed", reimbursed_at: new Date().toISOString(), reimbursed_by: reimbursedBy })
        .eq("id", claimId)
        .eq("status", "approved");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      invalidateProjectExpenseQueries(qc);
      toast.success("Marked as paid!");
      try {
        await supabase.functions.invoke("send-project-expense-notification", {
          body: { event: "reimbursed", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed: " + err.message),
  });
}

// ─── Mutation: delete a draft ──────────────────────────────────────────────────

export function useDeleteProjectExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase.from("project_expense_claims" as never).delete().eq("id", claimId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProjectExpenseQueries(qc);
      toast.success("Draft deleted.");
    },
    onError: (err: Error) => toast.error("Failed to delete: " + err.message),
  });
}
