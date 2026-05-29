import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpenseItem {
  id?: string;
  claim_id?: string;
  expense_type: string;
  description: string;
  amount: number;
  expense_date: string;
  receipt_url?: string | null;
  receipt_name?: string | null;
  approved_amount?: number | null;
  item_status?: string;
  remarks?: string | null;
  created_at?: string;
}

export interface ProofFile {
  url: string;
  name: string;
  size: number;
}

export interface ExpenseClaim {
  id: string;
  user_id: string;
  trip_title: string;
  trip_start_date: string;
  trip_end_date: string;
  destination: string | null;
  purpose: string | null;
  total_amount: number;
  approved_amount: number | null;
  currency: string;
  status: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reimbursed_at: string | null;
  proof_urls: ProofFile[];
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string; email: string } | null;
  approver?: { full_name: string } | null;
  items?: ExpenseItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EXPENSE_TYPES = [
  { value: "airfare", label: "Airfare" },
  { value: "train", label: "Train" },
  { value: "bus", label: "Bus" },
  { value: "cab", label: "Cab / Taxi" },
  { value: "auto", label: "Auto" },
  { value: "fuel", label: "Fuel" },
  { value: "hotel", label: "Hotel" },
  { value: "food", label: "Food & Meals" },
  { value: "communication", label: "Communication" },
  { value: "visa", label: "Visa / Passport" },
  { value: "miscellaneous", label: "Miscellaneous" },
] as const;

export const MAX_PROOF_FILES = 6;
export const MAX_PROOF_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_RECEIPT_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_PROOF_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getExpenseTypeLabel(type: string): string {
  return EXPENSE_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function getStatusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    submitted: "secondary",
    approved: "default",
    partially_approved: "default",
    rejected: "destructive",
    reimbursed: "default",
  };
  return map[status] ?? "outline";
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    submitted: "Pending Approval",
    approved: "Approved",
    partially_approved: "Partially Approved",
    rejected: "Rejected",
    reimbursed: "Reimbursed",
  };
  return map[status] ?? status;
}

// ─── Upload: Receipt per expense item ─────────────────────────────────────────

/**
 * Uploads a single receipt file to the `expense-receipts` storage bucket.
 * Path: {userId}/{claimId}/receipts/{timestamp}.{ext}
 * Returns a 1-year signed URL so the file is accessible without being public.
 */
export async function uploadReceipt(
  file: File,
  userId: string,
  claimId: string
): Promise<{ url: string; name: string }> {
  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    throw new Error(
      `Receipt "${file.name}" exceeds the 2 MB limit (${(file.size / 1024 / 1024).toFixed(2)} MB).`
    );
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${claimId}/receipts/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("expense-receipts")
    .upload(path, file, { upsert: false });

  if (uploadError) throw uploadError;

  // Use a 1-year signed URL (bucket is private)
  const { data: signed } = await supabase.storage
    .from("expense-receipts")
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  return { url: signed?.signedUrl ?? "", name: file.name };
}

// ─── Validate a proof / supporting document file ──────────────────────────────

export function validateProofFile(file: File): string | null {
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported type. Only images (JPG, PNG, WebP, GIF) and PDFs are allowed.`;
  }
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    return `"${file.name}" exceeds the 1 MB limit (${(file.size / 1024 / 1024).toFixed(2)} MB).`;
  }
  return null;
}

// ─── Upload: Multiple proof / supporting documents ────────────────────────────

/**
 * Uploads multiple proof files and returns an array of { url, name, size }.
 * Files are stored at: {userId}/{claimId}/proofs/{timestamp}-{random}.{ext}
 */
export async function uploadProofFiles(
  files: File[],
  userId: string,
  claimId: string
): Promise<ProofFile[]> {
  const results: ProofFile[] = [];

  for (const file of files) {
    const err = validateProofFile(file);
    if (err) throw new Error(err);

    const ext = file.name.split(".").pop() ?? "bin";
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${userId}/${claimId}/proofs/${Date.now()}-${rand}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("expense-receipts")
      .upload(path, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: signed } = await supabase.storage
      .from("expense-receipts")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    results.push({
      url: signed?.signedUrl ?? "",
      name: file.name,
      size: file.size,
    });
  }

  return results;
}

// ─── Query: current auth user ─────────────────────────────────────────────────

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });
}

// ─── Query: my claims ─────────────────────────────────────────────────────────

export function useExpenseClaims(userId?: string) {
  return useQuery({
    queryKey: ["expense-claims", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("travel_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseClaim[];
    },
    enabled: !!userId,
  });
}

// ─── Query: single claim with items ──────────────────────────────────────────

export function useExpenseClaimDetail(claimId?: string) {
  return useQuery({
    queryKey: ["expense-claim-detail", claimId],
    queryFn: async () => {
      if (!claimId) return null;

      const { data: claim, error } = await supabase
        .from("travel_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email), approver:approved_by(full_name)")
        .eq("id", claimId)
        .single();
      if (error) throw error;

      const { data: items, error: itemsError } = await supabase
        .from("travel_expense_items" as never)
        .select("*")
        .eq("claim_id", claimId)
        .order("expense_date", { ascending: true });
      if (itemsError) throw itemsError;

      return { ...(claim as unknown as ExpenseClaim), items: items ?? [] };
    },
    enabled: !!claimId,
  });
}

// ─── Query: pending approvals (manager sees own subordinates) ─────────────────

export function usePendingApprovals(managerId?: string) {
  return useQuery({
    queryKey: ["expense-approvals-pending", managerId],
    queryFn: async () => {
      if (!managerId) return [];

      // Get subordinate user IDs
      const { data: subs } = await supabase
        .from("profiles" as never)
        .select("id")
        .eq("reports_to", managerId);

      const subIds = (subs ?? []).map((s: { id: string }) => s.id);
      if (subIds.length === 0) return [];

      const { data, error } = await supabase
        .from("travel_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email)")
        .in("user_id", subIds)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true });
      if (error) throw error;

      const claimIds = (data ?? []).map((c: { id: string }) => c.id);
      if (claimIds.length === 0) return [];

      const { data: allItems } = await supabase
        .from("travel_expense_items" as never)
        .select("*")
        .in("claim_id", claimIds)
        .order("expense_date", { ascending: true });

      return (data ?? []).map((claim: unknown) => ({
        ...(claim as ExpenseClaim),
        items: ((allItems ?? []) as { claim_id: string }[]).filter(
          (item) => item.claim_id === (claim as ExpenseClaim).id
        ),
      })) as ExpenseClaim[];
    },
    enabled: !!managerId,
  });
}

// ─── Query: all approvals history ────────────────────────────────────────────

export function useAllApprovals(userId?: string, isAdmin = false) {
  return useQuery({
    queryKey: ["expense-all-approvals", userId, isAdmin],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from("travel_expense_claims" as never)
        .select("*, profiles:user_id(full_name, email), approver:approved_by(full_name)")
        .neq("status", "draft")
        .order("submitted_at", { ascending: false })
        .limit(200);

      if (!isAdmin) {
        const { data: subs } = await supabase
          .from("profiles" as never)
          .select("id")
          .eq("reports_to", userId);
        const subIds = (subs ?? []).map((s: { id: string }) => s.id);
        if (subIds.length === 0) return [];
        query = query.in("user_id", subIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ExpenseClaim[];
    },
    enabled: !!userId,
  });
}

// ─── Query: org-wide summary (admin dashboard) ───────────────────────────────

export function useOrgExpenseSummary() {
  return useQuery({
    queryKey: ["org-expense-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_expense_claims" as never)
        .select("status, total_amount, approved_amount");
      if (error) throw error;
      const claims = (data ?? []) as { status: string; total_amount: number; approved_amount: number | null }[];
      return {
        total: claims.length,
        submitted: claims.filter((c) => c.status === "submitted").length,
        approved: claims.filter((c) => c.status === "approved" || c.status === "reimbursed").length,
        pendingAmount: claims
          .filter((c) => c.status === "submitted")
          .reduce((s, c) => s + Number(c.total_amount), 0),
        approvedAmount: claims
          .filter((c) => c.status === "approved" || c.status === "reimbursed")
          .reduce((s, c) => s + Number(c.approved_amount ?? c.total_amount), 0),
      };
    },
  });
}

// ─── Mutation: create claim (with receipt uploads) ───────────────────────────

interface CreateClaimInput {
  user_id: string;
  org_id?: string;
  trip_title: string;
  trip_start_date: string;
  trip_end_date: string;
  destination?: string;
  purpose?: string;
  items: Omit<ExpenseItem, "id" | "claim_id" | "created_at">[];
  receiptFiles?: (File | undefined)[];  // parallel array to items
  proofFiles?: File[];
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      receiptFiles,
      proofFiles,
      ...claimData
    }: CreateClaimInput) => {
      // 1. Insert claim row
      const { data: newClaim, error } = await supabase
        .from("travel_expense_claims" as never)
        .insert(claimData)
        .select("id")
        .single();
      if (error) throw error;
      const claimId = (newClaim as { id: string }).id;

      // 2. Insert expense items (without receipts yet)
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("travel_expense_items" as never)
          .insert(items.map((item) => ({ ...item, claim_id: claimId })));
        if (itemsError) throw itemsError;
      }

      // 3. Upload receipts and attach to items
      if (receiptFiles?.length) {
        const { data: createdItems } = await supabase
          .from("travel_expense_items" as never)
          .select("id")
          .eq("claim_id", claimId)
          .order("created_at", { ascending: true });

        for (let i = 0; i < receiptFiles.length; i++) {
          const file = receiptFiles[i];
          if (!file || !createdItems?.[i]) continue;
          try {
            const { url, name } = await uploadReceipt(file, claimData.user_id, claimId);
            await supabase
              .from("travel_expense_items" as never)
              .update({ receipt_url: url, receipt_name: name })
              .eq("id", (createdItems[i] as { id: string }).id);
          } catch (err) {
            console.error("Receipt upload failed for item", i, err);
          }
        }
      }

      // 4. Upload proof documents
      if (proofFiles?.length) {
        try {
          const proofUrls = await uploadProofFiles(proofFiles, claimData.user_id, claimId);
          await supabase
            .from("travel_expense_claims" as never)
            .update({ proof_urls: proofUrls })
            .eq("id", claimId);
        } catch (err) {
          console.error("Proof upload failed:", err);
          toast.error("Some proof files could not be uploaded.");
        }
      }

      return claimId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Expense claim created!");
    },
    onError: (err: Error) => {
      toast.error("Failed to create claim: " + err.message);
    },
  });
}

// ─── Mutation: submit draft for approval ──────────────────────────────────────

export function useSubmitClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("travel_expense_claims" as never)
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", claimId);
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      queryClient.invalidateQueries({ queryKey: ["expense-claim-detail"] });
      toast.success("Claim submitted for approval!");

      // Trigger email notification to manager
      try {
        await supabase.functions.invoke("send-expense-notification", {
          body: { event: "submitted", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to submit: " + err.message),
  });
}

// ─── Mutation: approve claim ──────────────────────────────────────────────────

export function useApproveClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      claimId,
      approverId,
      approvedAmount,
    }: {
      claimId: string;
      approverId: string;
      approvedAmount?: number;
    }) => {
      const { error } = await supabase
        .from("travel_expense_claims" as never)
        .update({
          status: "approved",
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          approved_amount: approvedAmount,
        })
        .eq("id", claimId)
        .eq("status", "submitted");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      queryClient.invalidateQueries({ queryKey: ["expense-approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["expense-all-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["expense-claim-detail"] });
      toast.success("Expense claim approved!");

      try {
        await supabase.functions.invoke("send-expense-notification", {
          body: { event: "approved", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to approve: " + err.message),
  });
}

// ─── Mutation: reject claim ───────────────────────────────────────────────────

export function useRejectClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      claimId,
      approverId,
      reason,
    }: {
      claimId: string;
      approverId: string;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("travel_expense_claims" as never)
        .update({
          status: "rejected",
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", claimId)
        .eq("status", "submitted");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      queryClient.invalidateQueries({ queryKey: ["expense-approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["expense-all-approvals"] });
      toast.success("Expense claim rejected.");

      try {
        await supabase.functions.invoke("send-expense-notification", {
          body: { event: "rejected", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed to reject: " + err.message),
  });
}

// ─── Mutation: delete draft ───────────────────────────────────────────────────

export function useDeleteClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("travel_expense_claims" as never)
        .delete()
        .eq("id", claimId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Draft claim deleted.");
    },
    onError: (err: Error) => toast.error("Failed to delete: " + err.message),
  });
}

// ─── Mutation: mark reimbursed (admin only) ───────────────────────────────────

export function useMarkReimbursed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("travel_expense_claims" as never)
        .update({
          status: "reimbursed",
          reimbursed_at: new Date().toISOString(),
        })
        .eq("id", claimId)
        .eq("status", "approved");
      if (error) throw error;
      return claimId;
    },
    onSuccess: async (claimId) => {
      queryClient.invalidateQueries({ queryKey: ["expense-approvals-pending"] });
      queryClient.invalidateQueries({ queryKey: ["expense-all-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Marked as reimbursed!");

      try {
        await supabase.functions.invoke("send-expense-notification", {
          body: { event: "reimbursed", claim_id: claimId },
        });
      } catch (err) {
        console.error("Notification failed:", err);
      }
    },
    onError: (err: Error) => toast.error("Failed: " + err.message),
  });
}
