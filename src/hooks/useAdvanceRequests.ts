import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Advance requests: a maker asks for money before it's given, their
 * assigned approver (profiles.approver_id) decides. Mirrors
 * Vendor-Sync's vendor_advance_requests mechanism. Approval doesn't
 * hand out money by itself — Accounts still records the actual
 * disbursement via expense_advances (see useAdvances.ts), linked back
 * via advance_request_id.
 */

export interface AdvanceRequest {
  id: string;
  org_id: string;
  user_id: string;
  amount: number;
  purpose: string;
  employee_remarks: string | null;
  status: "pending" | "approved" | "rejected";
  project_id: string | null;
  project_name: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comments: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

export interface RmplProject {
  id: string;
  project_name: string;
}

/** The signed-in maker's own requests. */
export function useMyAdvanceRequests(orgId?: string, userId?: string) {
  return useQuery({
    queryKey: ["my-advance-requests", orgId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_advance_requests" as never)
        .select("*")
        .eq("org_id", orgId as string)
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AdvanceRequest[];
    },
    enabled: !!orgId && !!userId,
  });
}

/** Requests awaiting this approver's decision. */
export function usePendingAdvanceRequests(approverId?: string) {
  return useQuery({
    queryKey: ["advance-requests-pending", approverId],
    queryFn: async () => {
      if (!approverId) return [];
      const { data: makers } = await supabase
        .from("profiles" as never)
        .select("id")
        .eq("approver_id", approverId);
      const makerIds = (makers ?? []).map((m: { id: string }) => m.id);
      if (makerIds.length === 0) return [];

      const { data, error } = await supabase
        .from("expense_advance_requests" as never)
        .select("*, profiles:user_id(full_name, email)")
        .in("user_id", makerIds)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AdvanceRequest[];
    },
    enabled: !!approverId,
  });
}

/** Decided requests this approver has acted on (or all, if admin/accounts). */
export function useDecidedAdvanceRequests(userId?: string, seeAll = false) {
  return useQuery({
    queryKey: ["advance-requests-decided", userId, seeAll],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from("expense_advance_requests" as never)
        .select("*, profiles:user_id(full_name, email)")
        .neq("status", "pending")
        .order("reviewed_at", { ascending: false })
        .limit(200);

      if (!seeAll) {
        const { data: makers } = await supabase
          .from("profiles" as never)
          .select("id")
          .eq("approver_id", userId);
        const makerIds = (makers ?? []).map((m: { id: string }) => m.id);
        if (makerIds.length === 0) return [];
        query = query.in("user_id", makerIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AdvanceRequest[];
    },
    enabled: !!userId,
  });
}

function invalidateAdvanceRequestQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["my-advance-requests"] });
  qc.invalidateQueries({ queryKey: ["advance-requests-pending"] });
  qc.invalidateQueries({ queryKey: ["advance-requests-decided"] });
}

export function useCreateAdvanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: {
      org_id: string;
      user_id: string;
      amount: number;
      purpose: string;
      employee_remarks?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("expense_advance_requests" as never)
        .insert(req as never)
        .select("id")
        .single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: (data) => {
      invalidateAdvanceRequestQueries(qc);
      toast.success("Advance request submitted — your approver will review it shortly");
      supabase.functions
        .invoke("notify-advance-request-submitted", { body: { advance_request_id: data.id } })
        .catch(() => {
          // Notification failure shouldn't block the maker's submission
        });
    },
    onError: (err: Error) => toast.error("Failed to submit request: " + err.message),
  });
}

export function useDecideAdvanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (decision: {
      id: string;
      approve: boolean;
      reviewerId: string;
      projectId?: string | null;
      projectName?: string | null;
      comments?: string | null;
    }) => {
      const { error } = await supabase
        .from("expense_advance_requests" as never)
        .update({
          status: decision.approve ? "approved" : "rejected",
          project_id: decision.approve ? decision.projectId ?? null : null,
          project_name: decision.approve ? decision.projectName ?? null : null,
          reviewed_by: decision.reviewerId,
          reviewed_at: new Date().toISOString(),
          review_comments: decision.comments?.trim() || null,
        })
        .eq("id", decision.id);
      if (error) throw error;
      return decision.id;
    },
    onSuccess: (id, vars) => {
      invalidateAdvanceRequestQueries(qc);
      toast.success(vars.approve ? "Advance request approved" : "Advance request rejected");
      supabase.functions
        .invoke("notify-advance-decision", { body: { advance_request_id: id } })
        .catch((e) => console.error("Advance decision notification failed:", e));
    },
    onError: (err: Error) => toast.error("Action failed: " + err.message),
  });
}

/** Approved requests Accounts hasn't disbursed yet (no linked ledger entry). */
export function useApprovedUndisbursedRequests(orgId?: string) {
  return useQuery({
    queryKey: ["advance-requests-undisbursed", orgId],
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from("expense_advance_requests" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("org_id", orgId as string)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: true });
      if (error) throw error;

      const ids = ((requests ?? []) as AdvanceRequest[]).map((r) => r.id);
      if (ids.length === 0) return [];

      const { data: disbursed } = await supabase
        .from("expense_advances" as never)
        .select("advance_request_id")
        .in("advance_request_id", ids);
      const disbursedIds = new Set(((disbursed ?? []) as { advance_request_id: string }[]).map((d) => d.advance_request_id));

      return ((requests ?? []) as AdvanceRequest[]).filter((r) => !disbursedIds.has(r.id));
    },
    enabled: !!orgId,
  });
}

/** RMPL's live projects currently in execution, read-only. */
export function useRmplProjects(enabled = true) {
  return useQuery({
    queryKey: ["rmpl-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-rmpl-projects");
      if (error) throw new Error("Could not load projects from RMPL");
      return (data?.projects || []) as RmplProject[];
    },
    enabled,
    staleTime: 60_000,
  });
}
