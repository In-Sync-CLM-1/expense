import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, MapPin, Calendar, User, Receipt, FileText, Image as ImageIcon, Upload, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type ExpenseClaim, type ProofFile, getExpenseTypeLabel, getStatusColor, getStatusLabel, useSubmitClaim, useDeleteClaim, uploadProofFiles, validateProofFile, MAX_PROOF_FILES } from "@/hooks/useExpenseClaims";

interface ExpenseClaimDetailProps {
  claim: ExpenseClaim | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner?: boolean;
}

export function ExpenseClaimDetail({ claim, open, onOpenChange, isOwner }: ExpenseClaimDetailProps) {
  const submitClaim = useSubmitClaim();
  const deleteClaim = useDeleteClaim();
  const queryClient = useQueryClient();
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingProofs = claim?.proof_urls ? (claim.proof_urls as ProofFile[]) : [];
  const remainingSlots = MAX_PROOF_FILES - existingProofs.length - newFiles.length;

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList) return;
    const toAdd: File[] = [];
    let available = MAX_PROOF_FILES - existingProofs.length - newFiles.length;
    for (const file of Array.from(fileList)) {
      if (available <= 0) { toast.error(`Maximum ${MAX_PROOF_FILES} files allowed.`); break; }
      const err = validateProofFile(file);
      if (err) { toast.error(err); continue; }
      toAdd.push(file);
      available--;
    }
    if (toAdd.length > 0) setNewFiles((prev) => [...prev, ...toAdd]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeNewFile = (index: number) => setNewFiles((prev) => prev.filter((_, i) => i !== index));

  const handleUpload = async () => {
    if (!claim || newFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await uploadProofFiles(newFiles, claim.user_id, claim.id);
      const updatedProofs = [...existingProofs, ...uploaded];
      const { error } = await supabase
        .from("travel_expense_claims" as never)
        .update({ proof_urls: updatedProofs })
        .eq("id", claim.id);
      if (error) throw error;
      setNewFiles([]);
      queryClient.invalidateQueries({ queryKey: ["expense-claim-detail", claim.id] });
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Documents uploaded successfully!");
    } catch (err: any) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (!claim) return null;

  const handleSubmit = async () => {
    await submitClaim.mutateAsync(claim.id);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await deleteClaim.mutateAsync(claim.id);
    onOpenChange(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setNewFiles([]);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Receipt className="h-5 w-5" />
            <span>{claim.trip_title}</span>
            <Badge variant={getStatusColor(claim.status)}>{getStatusLabel(claim.status)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trip info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {format(new Date(claim.trip_start_date), "MMM d")} — {format(new Date(claim.trip_end_date), "MMM d, yyyy")}
            </div>
            {claim.destination && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {claim.destination}
              </div>
            )}

            {claim.profiles && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                {claim.profiles.full_name}
              </div>
            )}
          </div>

          {claim.purpose && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{claim.purpose}</p>
          )}

          <Separator />

          {/* Expense items */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Expenses ({claim.items?.length || 0})</h3>
            {claim.items?.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{getExpenseTypeLabel(item.expense_type)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(item.expense_date), "MMM d, yyyy")}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm mt-1 text-muted-foreground">{item.description}</p>
                      )}
                      {item.receipt_url && (
                        <a
                          href={item.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {item.receipt_name || "View Receipt"}
                        </a>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">₹{Number(item.amount).toLocaleString("en-IN")}</span>
                      {item.approved_amount != null && item.approved_amount !== Number(item.amount) && (
                        <div className="text-xs text-green-600">
                          Approved: ₹{Number(item.approved_amount).toLocaleString("en-IN")}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator />

          {/* Total */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Total Claimed</span>
            <span className="text-xl font-bold">₹{Number(claim.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          {claim.approved_amount != null && (
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <span className="font-medium text-green-700 dark:text-green-300">Approved Amount</span>
              <span className="text-xl font-bold text-green-700 dark:text-green-300">
                ₹{Number(claim.approved_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Expense Proofs / Document Upload */}
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">
                Supporting Documents ({existingProofs.length}/{MAX_PROOF_FILES})
              </h3>

              {existingProofs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {existingProofs.map((proof, idx) => (
                    <a
                      key={idx}
                      href={proof.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 bg-muted rounded hover:bg-muted/80 transition-colors text-sm"
                    >
                      {proof.name?.toLowerCase().endsWith(".pdf") ? (
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">{proof.name}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </a>
                  ))}
                </div>
              )}

              {isOwner && existingProofs.length === 0 && newFiles.length === 0 && (
                <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
              )}

              {/* New files staged for upload */}
              {newFiles.length > 0 && (
                <div className="space-y-1.5">
                  {newFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-sm border border-blue-200 dark:border-blue-800">
                      {file.type === "application/pdf" ? (
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeNewFile(idx)}
                        disabled={uploading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload controls — available to owner when slots remain */}
              {isOwner && remainingSlots > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose Files
                  </Button>
                  {newFiles.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleUpload}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                      Upload {newFiles.length} file{newFiles.length > 1 ? "s" : ""}
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">{remainingSlots} slot{remainingSlots !== 1 ? "s" : ""} remaining · images or PDF, max 1 MB each</span>
                </div>
              )}
            </div>
          </>

          {/* Rejection reason */}
          {claim.rejection_reason && (
            <div className="p-3 bg-destructive/10 rounded-lg">
              <p className="text-sm font-medium text-destructive">Rejection Reason</p>
              <p className="text-sm">{claim.rejection_reason}</p>
            </div>
          )}

          {/* Approval info */}
          {claim.approver && (
            <p className="text-xs text-muted-foreground">
              {claim.status === "rejected" ? "Rejected" : "Approved"} by {claim.approver.full_name}
              {claim.approved_at && ` on ${format(new Date(claim.approved_at), "MMM d, yyyy 'at' h:mm a")}`}
            </p>
          )}

          {/* Actions for draft */}
          {isOwner && claim.status === "draft" && (
            <div className="flex gap-2 justify-end">
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete Draft
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitClaim.isPending}>
                Submit for Approval
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
