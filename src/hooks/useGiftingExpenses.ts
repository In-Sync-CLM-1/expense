import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uploadProjectExpenseFile } from "@/hooks/useProjectExpenses";

/**
 * RMPL-only "Gifting Expense" claim type — a single claim whose line items
 * each carry their own RMPL project (unlike project_expense_claims, which
 * is one project per whole claim). Built for gifting spend that spans
 * several client projects in one spreadsheet.
 *
 * No approval step — submission goes straight to Accounts for payment.
 * On submit, each project's slice is pushed into RMPL's own
 * project_expense_submissions (category "Gifting & Merchandise") so it
 * counts toward that project's A-factor — see sync-gifting-expense-to-rmpl.
 */

export interface GiftingExpenseItem {
  id?: string;
  claim_id?: string;
  line_date: string;
  rmpl_project_id: string;
  project_number: string | null;
  project_name: string;
  recipient: string | null;
  description: string;
  amount: number;
  receipt_url?: string | null;
  receipt_name?: string | null;
}

export interface GiftingExpenseClaim {
  id: string;
  org_id: string;
  user_id: string;
  filer_name: string;
  period: string | null;
  total_amount: number;
  status: "draft" | "submitted" | "reimbursed";
  submitted_at: string | null;
  reimbursed_at: string | null;
  reimbursed_by: string | null;
  synced_to_rmpl_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string; email: string } | null;
  items?: GiftingExpenseItem[];
}

export function getGiftingStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    submitted: "Awaiting Payment",
    reimbursed: "Paid",
  };
  return map[status] ?? status;
}

export function getGiftingStatusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    submitted: "secondary",
    reimbursed: "default",
  };
  return map[status] ?? "outline";
}

// ─── Query: my claims ─────────────────────────────────────────────────────

export function useMyGiftingExpenseClaims(userId?: string) {
  return useQuery({
    queryKey: ["my-gifting-expense-claims", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("gifting_expense_claims" as never)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as GiftingExpenseClaim[];
    },
    enabled: !!userId,
  });
}

// ─── Query: single claim with items ────────────────────────────────────────

export function useGiftingExpenseClaimDetail(claimId?: string) {
  return useQuery({
    queryKey: ["gifting-expense-claim-detail", claimId],
    queryFn: async () => {
      if (!claimId) return null;
      const { data: claim, error } = await supabase
        .from("gifting_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("id", claimId)
        .single();
      if (error) throw error;

      const { data: items } = await supabase
        .from("gifting_expense_claim_items" as never)
        .select("*")
        .eq("claim_id", claimId)
        .order("line_date", { ascending: true });

      return {
        ...(claim as unknown as GiftingExpenseClaim),
        items: (items ?? []) as unknown as GiftingExpenseItem[],
      };
    },
    enabled: !!claimId,
  });
}

// ─── Query: Accounts/Admin — all history + submitted awaiting payment ─────

export function useAllGiftingExpenseClaims(orgId?: string, enabled = true) {
  return useQuery({
    queryKey: ["gifting-expense-claims-all", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gifting_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("org_id", orgId as string)
        .neq("status", "draft")
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as GiftingExpenseClaim[];
    },
    enabled: enabled && !!orgId,
  });
}

function invalidateGiftingQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["my-gifting-expense-claims"] });
  qc.invalidateQueries({ queryKey: ["gifting-expense-claim-detail"] });
  qc.invalidateQueries({ queryKey: ["gifting-expense-claims-all"] });
}

async function syncToRmpl(claimId: string) {
  try {
    const { data, error } = await supabase.functions.invoke("sync-gifting-expense-to-rmpl", {
      body: { claim_id: claimId },
    });
    if (error || data?.error) {
      console.error("RMPL sync failed:", error || data?.error);
      toast.error("Saved, but couldn't push into RMPL's project expenses yet — it'll retry automatically next time this claim is opened.");
    }
  } catch (err) {
    console.error("RMPL sync failed:", err);
  }
}

// ─── Mutation: create claim (draft or submitted) with line-item uploads ───

interface CreateGiftingExpenseClaimInput {
  org_id: string;
  user_id: string;
  filer_name: string;
  period: string;
  items: Omit<GiftingExpenseItem, "id" | "claim_id">[];
  itemFiles: (File | undefined)[]; // parallel to items
  submit: boolean;
}

export function useCreateGiftingExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, itemFiles, submit, ...header }: CreateGiftingExpenseClaimInput) => {
      const { data: newClaim, error } = await supabase
        .from("gifting_expense_claims" as never)
        .insert(header as never)
        .select("id")
        .single();
      if (error) throw error;
      const claimId = (newClaim as { id: string }).id;

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("gifting_expense_claim_items" as never)
          .insert(items.map((item) => ({ ...item, claim_id: claimId })));
        if (itemsError) throw itemsError;
      }

      if (itemFiles.some(Boolean)) {
        const { data: createdItems } = await supabase
          .from("gifting_expense_claim_items" as never)
          .select("id")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: true });

        for (let i = 0; i < itemFiles.length; i++) {
          const file = itemFiles[i];
          if (!file || !createdItems?.[i]) continue;
          try {
            const { url, name } = await uploadProjectExpenseFile(file, claimId);
            await supabase
              .from("gifting_expense_claim_items" as never)
              .update({ receipt_url: url, receipt_name: name })
              .eq("id", (createdItems[i] as { id: string }).id);
          } catch (err) {
            console.error("Supporting document upload failed for gifting line", i, err);
          }
        }
      }

      if (submit) {
        await supabase
          .from("gifting_expense_claims" as never)
          .update({ status: "submitted", submitted_at: new Date().toISOString() })
          .eq("id", claimId);
      }

      return claimId;
    },
    onSuccess: async (claimId, vars) => {
      invalidateGiftingQueries(qc);
      toast.success(vars.submit ? "Gifting expense submitted — awaiting payment!" : "Saved as draft");
      if (vars.submit) {
        await syncToRmpl(claimId);
        invalidateGiftingQueries(qc);
        try {
          await supabase.functions.invoke("send-gifting-expense-notification", {
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

// ─── Mutation: submit an existing draft ────────────────────────────────────

export function useSubmitGiftingExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("gifting_expense_claims" as never)
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", claimId);
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      invalidateGiftingQueries(qc);
      toast.success("Submitted — awaiting payment!");
      await syncToRmpl(claimId);
      invalidateGiftingQueries(qc);
      try {
        await supabase.functions.invoke("send-gifting-expense-notification", {
          body: { event: "submitted", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to submit: " + err.message),
  });
}

// ─── Mutation: Accounts marks paid ─────────────────────────────────────────

export function useMarkGiftingExpenseReimbursed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, reimbursedBy }: { claimId: string; reimbursedBy: string }) => {
      const { error } = await supabase
        .from("gifting_expense_claims" as never)
        .update({ status: "reimbursed", reimbursed_at: new Date().toISOString(), reimbursed_by: reimbursedBy })
        .eq("id", claimId)
        .eq("status", "submitted");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      invalidateGiftingQueries(qc);
      toast.success("Marked as paid!");
      try {
        await supabase.functions.invoke("send-gifting-expense-notification", {
          body: { event: "reimbursed", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed: " + err.message),
  });
}

// ─── Mutation: delete a draft ───────────────────────────────────────────────

export function useDeleteGiftingExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase.from("gifting_expense_claims" as never).delete().eq("id", claimId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateGiftingQueries(qc);
      toast.success("Draft deleted.");
    },
    onError: (err: Error) => toast.error("Failed to delete: " + err.message),
  });
}
