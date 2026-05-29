import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Loader2, Receipt, X, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_TYPES, useCreateClaim, uploadReceipt, uploadProofFiles, validateProofFile, MAX_PROOF_FILES, type ExpenseItem } from "@/hooks/useExpenseClaims";

interface ExpenseClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  orgId?: string;
}

interface DraftItem {
  expense_type: string;
  description: string;
  amount: string;
  expense_date: string;
  receipt_file?: File;
  receipt_url?: string;
  receipt_name?: string;
}

const emptyItem: DraftItem = {
  expense_type: "",
  description: "",
  amount: "",
  expense_date: "",
};

export function ExpenseClaimDialog({ open, onOpenChange, userId, orgId }: ExpenseClaimDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [tripData, setTripData] = useState({
    trip_title: "",
    trip_start_date: "",
    trip_end_date: "",
    destination: "",
    purpose: "",
  });
  const [items, setItems] = useState<DraftItem[]>([{ ...emptyItem }]);
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  const createClaim = useCreateClaim();

  const resetForm = () => {
    setStep(1);
    setTripData({ trip_title: "", trip_start_date: "", trip_end_date: "", destination: "", purpose: "" });
    setItems([{ ...emptyItem }]);
    setProofFiles([]);
  };

  const addItem = () => setItems([...items, { ...emptyItem }]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof DraftItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleFileChange = (index: number, file: File | undefined) => {
    const updated = [...items];
    updated[index].receipt_file = file;
    updated[index].receipt_name = file?.name;
    setItems(updated);
  };

  const handleProofFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles = Array.from(fileList);
    const remaining = MAX_PROOF_FILES - proofFiles.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_PROOF_FILES} proof files allowed.`);
      return;
    }
    const filesToAdd: File[] = [];
    for (const file of newFiles.slice(0, remaining)) {
      const err = validateProofFile(file);
      if (err) {
        toast.error(err);
      } else {
        filesToAdd.push(file);
      }
    }
    if (filesToAdd.length > 0) {
      setProofFiles((prev) => [...prev, ...filesToAdd]);
    }
    if (newFiles.length > remaining) {
      toast.error(`Only ${remaining} more file(s) can be added.`);
    }
  };

  const removeProofFile = (index: number) => {
    setProofFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const canProceedToStep2 = tripData.trip_title && tripData.trip_start_date && tripData.trip_end_date;
  const canSubmit = items.every((item) => item.expense_type && item.amount && item.expense_date) && items.length > 0;

  const handleSubmit = async (asDraft: boolean) => {
    setSubmitting(true);
    try {
      // First create the claim to get an ID for receipt uploads
      const claimItems: Omit<ExpenseItem, "id" | "claim_id" | "created_at">[] = [];

      for (const item of items) {
        let receiptUrl: string | undefined;
        let receiptName: string | undefined;

        if (item.receipt_file) {
          // We'll upload after claim creation, use placeholder
          receiptName = item.receipt_file.name;
        }

        claimItems.push({
          expense_type: item.expense_type,
          description: item.description,
          amount: parseFloat(item.amount),
          expense_date: item.expense_date,
          receipt_url: receiptUrl || null,
          receipt_name: receiptName || null,
        });
      }

      const claimId = await createClaim.mutateAsync({
        user_id: userId,
        org_id: orgId,
        trip_title: tripData.trip_title,
        trip_start_date: tripData.trip_start_date,
        trip_end_date: tripData.trip_end_date,
        destination: tripData.destination || undefined,
        purpose: tripData.purpose || undefined,
        items: claimItems,
      });

      // Upload receipts and update items
      for (let i = 0; i < items.length; i++) {
        if (items[i].receipt_file) {
          try {
            const { url, name } = await uploadReceipt(items[i].receipt_file!, userId, claimId);
            const { data: createdItems } = await supabase
              .from("travel_expense_items" as never)
              .select("id")
              .eq("claim_id", claimId)
              .order("created_at", { ascending: true });
            if (createdItems?.[i]) {
              await supabase
                .from("travel_expense_items" as never)
                .update({ receipt_url: url, receipt_name: name })
                .eq("id", (createdItems[i] as { id: string }).id);
            }
          } catch (err) {
            console.error("Failed to upload receipt:", err);
          }
        }
      }

      // Upload proof files and update claim
      if (proofFiles.length > 0) {
        try {
          const proofUrls = await uploadProofFiles(proofFiles, userId, claimId);
          await supabase
            .from("travel_expense_claims" as never)
            .update({ proof_urls: proofUrls })
            .eq("id", claimId);
        } catch (err) {
          console.error("Failed to upload proofs:", err);
          toast.error("Some proof files failed to upload.");
        }
      }

      // If not draft, submit immediately
      if (!asDraft) {
        await supabase
          .from("travel_expense_claims" as never)
          .update({ status: "submitted", submitted_at: new Date().toISOString() })
          .eq("id", claimId);
      }

      resetForm();
      onOpenChange(false);
      toast.success(asDraft ? "Claim saved as draft" : "Claim submitted for approval!");
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) resetForm(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {step === 1 ? "New Expense Claim — Trip Details" : "Add Expenses"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Trip Title *</Label>
              <Input
                placeholder="e.g., Client meeting - Mumbai"
                value={tripData.trip_title}
                onChange={(e) => setTripData({ ...tripData, trip_title: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={tripData.trip_start_date}
                  onChange={(e) => setTripData({ ...tripData, trip_start_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={tripData.trip_end_date}
                  onChange={(e) => setTripData({ ...tripData, trip_end_date: e.target.value })}
                  min={tripData.trip_start_date}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Input
                placeholder="e.g., Mumbai, Maharashtra"
                value={tripData.destination}
                onChange={(e) => setTripData({ ...tripData, destination: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Textarea
                placeholder="Brief purpose of the trip"
                value={tripData.purpose}
                onChange={(e) => setTripData({ ...tripData, purpose: e.target.value })}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedToStep2}>
                Next — Add Expenses
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>{tripData.trip_title}</strong> · {tripData.trip_start_date} to {tripData.trip_end_date}
              {tripData.destination && ` · ${tripData.destination}`}
            </p>

            <div className="space-y-3">
              {items.map((item, index) => (
                <Card key={index} className="relative">
                  <CardContent className="pt-4 space-y-3">
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type *</Label>
                        <Select value={item.expense_type} onValueChange={(v) => updateItem(index, "expense_type", v)}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Date *</Label>
                        <Input
                          type="date"
                          className="h-9"
                          value={item.expense_date}
                          onChange={(e) => updateItem(index, "expense_date", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Amount (INR) *</Label>
                        <Input
                          type="number"
                          className="h-9"
                          placeholder="0.00"
                          value={item.amount}
                          onChange={(e) => updateItem(index, "amount", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Receipt</Label>
                        <div className="relative">
                          <Input
                            type="file"
                            className="h-9 text-xs"
                            accept="image/*,.pdf"
                            onChange={(e) => handleFileChange(index, e.target.files?.[0])}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-9"
                        placeholder="Brief description"
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button variant="outline" onClick={addItem} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Add Another Expense
            </Button>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="font-medium">Total Amount</span>
              <span className="text-xl font-bold">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>

            {/* Expense Proofs Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Expense Proofs (max {MAX_PROOF_FILES} files, 1 MB each)</Label>
              <p className="text-xs text-muted-foreground">Upload supporting documents — images (JPG, PNG, WebP, GIF) or PDFs</p>
              {proofFiles.length > 0 && (
                <div className="space-y-1.5">
                  {proofFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                      {file.type === "application/pdf" ? (
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeProofFile(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {proofFiles.length < MAX_PROOF_FILES && (
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                    multiple
                    className="h-9 text-xs"
                    onChange={(e) => {
                      handleProofFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {proofFiles.length}/{MAX_PROOF_FILES} files added
              </p>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                Back
              </Button>
              <div className="flex gap-2 ml-auto">
                <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={submitting || !canSubmit}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Draft
                </Button>
                <Button onClick={() => handleSubmit(false)} disabled={submitting || !canSubmit}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Submit for Approval
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
