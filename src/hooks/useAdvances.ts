import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Advances register. An advance is money the company gives an employee
 * before a trip, usually against a specific expense claim (claim_id) but
 * optionally general (null claim). Settlement is per (employee, trip):
 * balance = advances − approved expenses.
 *   balance > 0 → Unspent (employee holds money to recover)
 *   balance < 0 → Payable (expenses exceeded the advance; company owes them)
 */

export interface AdvanceRecord {
  id: string;
  org_id: string;
  user_id: string;
  claim_id: string | null;
  amount: number;
  advance_date: string;
  note: string | null;
  given_by: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
  claim?: { trip_title: string } | null;
}

export interface ReconciliationRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  claim_id: string | null;
  trip_title: string | null;
  advances_total: number;
  advances_count: number;
  expenses_total: number;
  expenses_count: number;
  balance: number;
}

export type AdvanceKind = "unspent" | "payable" | "settled";

/** balance = advances − approved expenses. */
export const advanceKind = (balance: number): AdvanceKind =>
  balance > 0.0001 ? "unspent" : balance < -0.0001 ? "payable" : "settled";

export const advanceKindLabel = (kind: AdvanceKind) =>
  kind === "unspent" ? "Unspent (recover)" : kind === "payable" ? "Payable to employee" : "Settled";

/** Org-wide reconciliation: one row per (employee, trip) holding an advance. */
export function useAdvanceReconciliation(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["advance-reconciliation", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args: object) => Promise<{ data: unknown; error: Error | null }>;
      }).rpc("get_advance_reconciliation", { _org_id: orgId });
      if (error) throw error;
      return (data || []) as ReconciliationRow[];
    },
    enabled: enabled && !!orgId,
  });
}

/** The signed-in employee's own advance position, per trip. */
export function useMyAdvanceSummary(orgId?: string) {
  return useQuery({
    queryKey: ["my-advance-summary", orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args: object) => Promise<{ data: unknown; error: Error | null }>;
      }).rpc("get_my_advance_summary", { _org_id: orgId });
      if (error) throw error;
      return (data || []) as Omit<ReconciliationRow, "user_id" | "full_name" | "email">[];
    },
    enabled: !!orgId,
  });
}

/** Raw register entries (most recent first). Admins see the org's; employees their own. */
export function useAdvancesList(orgId?: string, limit = 200) {
  return useQuery({
    queryKey: ["advances-list", orgId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_advances" as never)
        .select("*, profiles:user_id(full_name, email), claim:claim_id(trip_title)")
        .eq("org_id", orgId as string)
        .order("advance_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as AdvanceRecord[];
    },
    enabled: !!orgId,
  });
}

function invalidateAdvanceQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["advance-reconciliation"] });
  qc.invalidateQueries({ queryKey: ["my-advance-summary"] });
  qc.invalidateQueries({ queryKey: ["advances-list"] });
}

export function useCreateAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (advance: {
      org_id: string;
      user_id: string;
      claim_id: string | null;
      amount: number;
      advance_date: string;
      note?: string | null;
      given_by: string;
    }) => {
      const { error } = await supabase.from("expense_advances" as never).insert(advance as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateAdvanceQueries(qc);
      toast.success(`Advance of ₹${vars.amount.toLocaleString("en-IN")} recorded.`);
    },
    onError: (err: Error) => toast.error("Failed to record advance: " + err.message),
  });
}

export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_advances" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAdvanceQueries(qc);
      toast.success("Advance entry removed.");
    },
    onError: (err: Error) => toast.error("Failed to remove advance: " + err.message),
  });
}

/** Active org members, for the "record advance" picker. */
export function useOrgMembers(orgId?: string) {
  return useQuery({
    queryKey: ["org-members-for-advances", orgId],
    queryFn: async () => {
      const { data: memberships, error: mErr } = await supabase
        .from("org_memberships" as never)
        .select("user_id")
        .eq("org_id", orgId as string)
        .eq("is_active", true);
      if (mErr) throw mErr;
      const ids = ((memberships ?? []) as { user_id: string }[]).map((m) => m.user_id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles" as never)
        .select("id, full_name, email")
        .in("id", ids)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as unknown as { id: string; full_name: string; email: string }[];
    },
    enabled: !!orgId,
  });
}

/** A member's recent claims, for tying an advance to a trip. */
export function useMemberClaims(orgId?: string, userId?: string | null) {
  return useQuery({
    queryKey: ["member-claims-for-advances", orgId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_expense_claims" as never)
        .select("id, trip_title, trip_start_date, status")
        .eq("org_id", orgId as string)
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as {
        id: string; trip_title: string; trip_start_date: string; status: string;
      }[];
    },
    enabled: !!orgId && !!userId,
  });
}
