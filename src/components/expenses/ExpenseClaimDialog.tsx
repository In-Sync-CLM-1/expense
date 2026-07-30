import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  Loader2,
  Receipt,
  X,
  FileText,
  Image as ImageIcon,
  Sparkles,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EXPENSE_TYPES,
  useCreateClaim,
  uploadReceipt,
  uploadProofFiles,
  validateProofFile,
  MAX_PROOF_FILES,
  type ExpenseItem,
} from "@/hooks/useExpenseClaims";
import {
  downloadExpenseImportTemplate,
  parseExpenseImportFile,
} from "@/lib/expenseExcelImport";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  analyzing?: boolean;
  gst_number?: string;
  gst_amount?: string;
  // Silent fraud-review signals — never rendered in this dialog. Captured
  // from the AI's reading of the receipt so the submitted amount can be
  // compared against it for the approver/accounts, without telling the
  // employee this check exists.
  ai_declared_amount?: number | null;
  tampering_suspected?: boolean;
  tampering_reason?: string | null;
}

const emptyItem: DraftItem = {
  expense_type: "",
  description: "",
  amount: "",
  expense_date: "",
};

export function ExpenseClaimDialog({
  open,
  onOpenChange,
  userId,
  orgId,
}: ExpenseClaimDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [tripData, setTripData] = useState({
    trip_title: "",
    destination: "",
    purpose: "",
  });
  const [items, setItems] = useState<DraftItem[]>([{ ...emptyItem }]);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const createClaim = useCreateClaim();

  const resetForm = () => {
    setTripData({ trip_title: "", destination: "", purpose: "" });
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

  const handleFileChange = async (index: number, file: File | undefined) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        receipt_file: file,
        receipt_name: file?.name,
        analyzing: !!file,
      };
      return updated;
    });
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke(
        "analyze-receipt",
        {
          body: { file_base64: base64, mime_type: file.type },
        },
      );
      if (error) throw error;
      if (!data?.success) {
        toast.error(
          data?.error || "Could not read this receipt automatically.",
        );
        return;
      }

      const result = data.data as {
        expense_type: string | null;
        description: string | null;
        amount: number | null;
        expense_date: string | null;
        gst_number: string | null;
        gst_amount: number | null;
        tampering_suspected?: boolean;
        tampering_reason?: string | null;
      };

      setItems((prev) => {
        const updated = [...prev];
        const current = updated[index];
        if (current.receipt_file !== file) return prev; // a newer file was selected meanwhile
        updated[index] = {
          ...current,
          expense_type:
            current.expense_type || result.expense_type || current.expense_type,
          description:
            current.description || result.description || current.description,
          amount:
            current.amount ||
            (result.amount != null ? String(result.amount) : current.amount),
          expense_date:
            current.expense_date || result.expense_date || current.expense_date,
          gst_number:
            current.gst_number || result.gst_number || current.gst_number,
          gst_amount:
            current.gst_amount ||
            (result.gst_amount != null
              ? String(result.gst_amount)
              : current.gst_amount),
          // Hidden signals for the approver/accounts fraud review — always
          // refreshed to whatever this receipt image actually shows, never
          // surfaced anywhere in this dialog.
          ai_declared_amount: result.amount,
          tampering_suspected: !!result.tampering_suspected,
          tampering_reason: result.tampering_reason ?? null,
        };
        return updated;
      });
      toast.success(
        result.gst_amount != null
          ? "Filled in from the receipt, including GST — check before submitting."
          : "Filled in from the receipt — check the details before submitting.",
      );
    } catch (err) {
      console.error("Receipt analysis failed:", err);
      toast.error(
        "Could not read this receipt automatically. Please fill in the details manually.",
      );
    } finally {
      setItems((prev) => {
        const updated = [...prev];
        if (updated[index])
          updated[index] = { ...updated[index], analyzing: false };
        return updated;
      });
    }
  };

  const handleImportExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const { items: parsed, errors } = await parseExpenseImportFile(file);

      if (parsed.length > 0) {
        const imported: DraftItem[] = parsed.map((row) => ({
          expense_type: row.expense_type,
          description: row.description,
          amount: row.amount,
          expense_date: row.expense_date,
          gst_amount: row.gst_amount || undefined,
          gst_number: row.gst_number || undefined,
        }));

        setItems((prev) => {
          const prevIsBlank =
            prev.length === 1 &&
            !prev[0].expense_type &&
            !prev[0].amount &&
            !prev[0].expense_date &&
            !prev[0].description;
          return prevIsBlank ? imported : [...prev, ...imported];
        });
      }

      if (errors.length > 0) {
        toast.error(
          parsed.length > 0
            ? `Imported ${parsed.length} row(s). ${errors.length} row(s) skipped — ${errors.slice(0, 3).join(" ")}`
            : `Could not import any rows — ${errors.slice(0, 3).join(" ")}`,
          { duration: 8000 },
        );
      } else if (parsed.length > 0) {
        toast.success(`Imported ${parsed.length} expense(s) from the file — add receipts below before submitting.`);
      } else {
        toast.error("No expense rows found in that file.");
      }
    } catch (err) {
      console.error("Excel import failed:", err);
      toast.error("Could not read that file. Please use the downloadable template.");
    } finally {
      setImporting(false);
    }
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

  const totalAmount = items.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0,
  );

  const canSubmit =
    !!tripData.trip_title &&
    items.length > 0 &&
    items.every(
      (item) => item.expense_type && item.amount && item.expense_date,
    );

  const handleSubmit = async (asDraft: boolean) => {
    setSubmitting(true);
    try {
      // First create the claim to get an ID for receipt uploads
      const claimItems: Omit<ExpenseItem, "id" | "claim_id" | "created_at">[] =
        [];

      for (const item of items) {
        let receiptUrl: string | undefined;
        let receiptName: string | undefined;

        if (item.receipt_file) {
          // We'll upload after claim creation, use placeholder
          receiptName = item.receipt_file.name;
        }

        const submittedAmount = parseFloat(item.amount);
        const aiAmount = item.ai_declared_amount ?? null;
        // Only flag inflation past the AI's reading — not a downward
        // correction, and not noise from rounding.
        const amountMismatchTolerance = aiAmount != null ? Math.max(1, aiAmount * 0.02) : 0;
        const flagAmountMismatch =
          aiAmount != null && submittedAmount > aiAmount + amountMismatchTolerance;

        claimItems.push({
          expense_type: item.expense_type,
          description: item.description,
          amount: submittedAmount,
          expense_date: item.expense_date,
          receipt_url: receiptUrl || null,
          receipt_name: receiptName || null,
          gst_number: item.gst_number || null,
          gst_amount: item.gst_amount ? parseFloat(item.gst_amount) : null,
          ai_declared_amount: aiAmount,
          flag_amount_mismatch: flagAmountMismatch,
          flag_tampering: !!item.tampering_suspected,
          flag_tampering_reason: item.tampering_reason ?? null,
        });
      }

      const itemDates = items
        .map((item) => item.expense_date)
        .filter(Boolean)
        .sort();
      const claimId = await createClaim.mutateAsync({
        user_id: userId,
        org_id: orgId,
        trip_title: tripData.trip_title,
        trip_start_date: itemDates[0],
        trip_end_date: itemDates[itemDates.length - 1],
        destination: tripData.destination || undefined,
        purpose: tripData.purpose || undefined,
        items: claimItems,
      });

      // Upload receipts and update items
      for (let i = 0; i < items.length; i++) {
        if (items[i].receipt_file) {
          try {
            const { url, name } = await uploadReceipt(
              items[i].receipt_file!,
              userId,
              claimId,
            );
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
          .update({
            status: "submitted",
            submitted_at: new Date().toISOString(),
          })
          .eq("id", claimId);
      }

      resetForm();
      onOpenChange(false);
      toast.success(
        asDraft ? "Claim saved as draft" : "Claim submitted for approval!",
      );
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) {
          onOpenChange(v);
          if (!v) resetForm();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            New Expense Claim
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Claim Title *</Label>
            <Input
              placeholder="e.g., Client meeting — Delhi, Office supplies — June"
              value={tripData.trip_title}
              onChange={(e) =>
                setTripData({ ...tripData, trip_title: e.target.value })
              }
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location / Project (optional)</Label>
              <Input
                placeholder="e.g., Delhi office, Project Alpha"
                value={tripData.destination}
                onChange={(e) =>
                  setTripData({ ...tripData, destination: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Purpose (optional)</Label>
              <Input
                placeholder="Brief description of what this claim is for"
                value={tripData.purpose}
                onChange={(e) =>
                  setTripData({ ...tripData, purpose: e.target.value })
                }
              />
            </div>
          </div>

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
                      <Select
                        value={item.expense_type}
                        onValueChange={(v) =>
                          updateItem(index, "expense_type", v)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
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
                        onChange={(e) =>
                          updateItem(index, "expense_date", e.target.value)
                        }
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
                        onChange={(e) =>
                          updateItem(index, "amount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Receipt</Label>
                      <div className="relative">
                        <Input
                          type="file"
                          className="h-9 text-xs"
                          accept="image/*,.pdf"
                          onChange={(e) =>
                            handleFileChange(index, e.target.files?.[0])
                          }
                        />
                      </div>
                      {item.analyzing && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 pt-0.5">
                          <Sparkles className="h-3 w-3 animate-pulse" /> Reading
                          receipt…
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input
                      className="h-9"
                      placeholder="Brief description"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">GST Amount (optional)</Label>
                      <Input
                        type="number"
                        className="h-9"
                        placeholder="0.00"
                        value={item.gst_amount ?? ""}
                        onChange={(e) =>
                          updateItem(index, "gst_amount", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Vendor GSTIN (optional)</Label>
                      <Input
                        className="h-9 text-xs"
                        placeholder="e.g. 27ABCDE1234F1Z5"
                        value={item.gst_number ?? ""}
                        onChange={(e) =>
                          updateItem(index, "gst_number", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  {item.gst_amount && (
                    <p className="text-xs text-[hsl(142_76%_36%)] flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> GST captured —
                      recoverable input tax credit
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" /> Add Another Expense
            </Button>
            <Button
              variant="outline"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Import from Excel
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                handleImportExcel(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <button
            type="button"
            onClick={downloadExpenseImportTemplate}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 flex items-center gap-1"
          >
            <Download className="h-3 w-3" /> Download Excel template
          </button>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Total Amount</span>
            <span className="text-xl font-bold">
              ₹
              {totalAmount.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>

          {/* Expense Proofs Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Expense Proofs (max {MAX_PROOF_FILES} files, 1 MB each)
            </Label>
            <p className="text-xs text-muted-foreground">
              Upload supporting documents — images (JPG, PNG, WebP, GIF) or PDFs
            </p>
            {proofFiles.length > 0 && (
              <div className="space-y-1.5">
                {proofFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 bg-muted rounded text-sm"
                  >
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
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="secondary"
                onClick={() => handleSubmit(true)}
                disabled={submitting || !canSubmit}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save Draft
              </Button>
              <Button
                onClick={() => handleSubmit(false)}
                disabled={submitting || !canSubmit}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Submit for Approval
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
