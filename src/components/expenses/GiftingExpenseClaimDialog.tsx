import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2, Gift, Paperclip, AlertTriangle, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProjectExpenseProjectCombobox } from "./ProjectExpenseProjectCombobox";
import { useRmplProjectsForExpense, type RmplProjectOption } from "@/hooks/useProjectExpenses";
import { useCreateGiftingExpenseClaim } from "@/hooks/useGiftingExpenses";
import { downloadGiftingImportTemplate, parseGiftingImportFile } from "@/lib/giftingExcelImport";
import { useQuery } from "@tanstack/react-query";

interface GiftingExpenseClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  orgId: string;
}

interface DraftLine {
  line_date: string;
  rmpl_project_id: string | null;
  project_number: string | null;
  project_name: string;
  recipient: string;
  description: string;
  amount: string;
  file?: File;
}

const emptyLine: DraftLine = {
  line_date: "", rmpl_project_id: null, project_number: null, project_name: "",
  recipient: "", description: "", amount: "",
};

const isLineBlank = (l: DraftLine) =>
  !l.line_date && !l.project_name && !l.description && !l.recipient && !l.file && (parseFloat(l.amount) || 0) === 0;

function useOwnFullName(userId: string) {
  return useQuery({
    queryKey: ["own-full-name", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as never).select("full_name").eq("id", userId).single();
      return (data as { full_name: string } | null)?.full_name ?? "";
    },
    enabled: !!userId,
  });
}

export function GiftingExpenseClaimDialog({ open, onOpenChange, userId, orgId }: GiftingExpenseClaimDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { data: ownName } = useOwnFullName(userId);
  const { data: rmplProjects = [] } = useRmplProjectsForExpense(open);

  const [filerName, setFilerName] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);

  const createClaim = useCreateGiftingExpenseClaim();

  useEffect(() => {
    if (open && !filerName && ownName) setFilerName(ownName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownName]);

  const resetForm = () => {
    setFilerName(ownName || "");
    setPeriodFrom("");
    setPeriodTo("");
    setLines([{ ...emptyLine }]);
  };

  const addLine = () => setLines([...lines, { ...emptyLine }]);
  const removeLine = (i: number) => { if (lines.length > 1) setLines(lines.filter((_, idx) => idx !== i)); };
  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], ...patch };
    setLines(updated);
  };
  const setLineFile = (i: number, file: File | undefined) => updateLine(i, { file });

  const matchProject = (projectNumber: string): RmplProjectOption | undefined => {
    const q = projectNumber.trim().toLowerCase();
    return (
      rmplProjects.find((p) => (p.project_number ?? "").trim().toLowerCase() === q) ||
      rmplProjects.find((p) => p.project_name.trim().toLowerCase() === q) ||
      rmplProjects.find((p) => p.project_name.toLowerCase().includes(q))
    );
  };

  const handleImportExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const { lines: parsedLines, errors } = await parseGiftingImportFile(file);

      let unmatched = 0;
      const resolved: DraftLine[] = parsedLines.map((l) => {
        const match = matchProject(l.project_number);
        if (!match) unmatched++;
        return {
          line_date: l.line_date,
          rmpl_project_id: match?.id ?? null,
          project_number: match?.project_number ?? l.project_number,
          project_name: match?.project_name ?? "",
          recipient: l.recipient,
          description: l.description,
          amount: l.amount,
        };
      });

      if (resolved.length > 0) {
        setLines((prev) => {
          const filledPrev = prev.filter((l) => !isLineBlank(l));
          return [...filledPrev, ...resolved];
        });
      }

      const parts: string[] = [];
      if (resolved.length > 0) parts.push(`Imported ${resolved.length} row(s)`);
      if (unmatched > 0) parts.push(`${unmatched} row(s) need the project picked manually — couldn't match that Project Number to a live RMPL project`);
      if (errors.length > 0) parts.push(`${errors.length} row(s) skipped — ${errors.slice(0, 3).join(" ")}`);

      if (parts.length === 0) toast.error("No rows found in that file.");
      else if (unmatched > 0 || errors.length > 0) toast.error(parts.join(". "), { duration: 9000 });
      else toast.success(parts.join(". ") + ".");
    } catch (err) {
      console.error("Gifting Excel import failed:", err);
      toast.error("Could not read that file. Please use the downloadable template.");
    } finally {
      setImporting(false);
    }
  };

  const activeLines = lines.filter((l) => !isLineBlank(l));
  const total = activeLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const unresolvedCount = activeLines.filter((l) => !l.rmpl_project_id).length;

  const canSubmit =
    !!filerName.trim() &&
    activeLines.length > 0 &&
    activeLines.every((l) => l.line_date && l.rmpl_project_id && (parseFloat(l.amount) || 0) > 0);

  const periodDisplay =
    periodFrom && periodTo ? `${periodFrom} – ${periodTo}` : periodFrom || periodTo || "";

  const handleSubmit = async (asDraft: boolean) => {
    setSubmitting(true);
    try {
      await createClaim.mutateAsync({
        org_id: orgId,
        user_id: userId,
        filer_name: filerName.trim(),
        period: periodDisplay,
        items: activeLines.map((l) => ({
          line_date: l.line_date,
          rmpl_project_id: l.rmpl_project_id as string,
          project_number: l.project_number,
          project_name: l.project_name,
          recipient: l.recipient || null,
          description: l.description,
          amount: parseFloat(l.amount) || 0,
        })),
        itemFiles: activeLines.map((l) => l.file),
        submit: !asDraft,
      });
      resetForm();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) resetForm(); } }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" /> New Gifting Expense
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Each line here can belong to a different project — no need to file a separate claim per project.
            This goes straight to Accounts for payment; there's no per-project approval step.
          </p>

          <div className="grid grid-cols-6 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input className="h-9" value={filerName} onChange={(e) => setFilerName(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Period</Label>
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-9 flex-1" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                <span className="text-muted-foreground text-sm shrink-0">–</span>
                <Input type="date" className="h-9 flex-1" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Gifting lines */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Gifting Lines</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadGiftingImportTemplate}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 flex items-center gap-1"
                >
                  <Download className="h-3 w-3" /> Download Excel template
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
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
            </div>

            {unresolvedCount > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {unresolvedCount} line{unresolvedCount > 1 ? "s" : ""} still need{unresolvedCount === 1 ? "s" : ""} a project picked before this can be submitted.
              </p>
            )}

            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[112px_1fr_1fr_140px_92px_36px_28px] gap-1.5 px-2 py-1.5 bg-muted text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <span>Date *</span>
                <span>Project *</span>
                <span>Description / Recipient</span>
                <span className="text-right">Amount *</span>
                <span className="text-center">Doc</span>
                <span />
                <span />
              </div>
              <div className="divide-y">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[112px_1fr_1fr_140px_92px_36px_28px] gap-1.5 px-2 py-1 items-center">
                    <Input
                      type="date" className="h-8 text-xs px-1.5"
                      value={line.line_date} onChange={(e) => updateLine(index, { line_date: e.target.value })}
                    />
                    <div className={!line.rmpl_project_id && !isLineBlank(line) ? "ring-1 ring-destructive rounded-md" : ""}>
                      <ProjectExpenseProjectCombobox
                        value={line.rmpl_project_id}
                        valueName={line.project_name || line.project_number || undefined}
                        onChange={(p) => updateLine(index, {
                          rmpl_project_id: p.id, project_number: p.project_number, project_name: p.project_name,
                        })}
                      />
                    </div>
                    <div className="flex gap-1">
                      <Input
                        className="h-8 text-xs px-1.5" placeholder="Description"
                        value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })}
                      />
                      <Input
                        className="h-8 text-xs px-1.5" placeholder="Recipient / occasion"
                        value={line.recipient} onChange={(e) => updateLine(index, { recipient: e.target.value })}
                      />
                    </div>
                    <Input
                      type="number" className="h-8 text-xs px-1.5 text-right" placeholder="0.00"
                      value={line.amount} onChange={(e) => updateLine(index, { amount: e.target.value })}
                    />
                    <div className="flex items-center justify-center">
                      <input
                        type="file" id={`gifting-line-file-${index}`} className="sr-only"
                        accept="image/*,.pdf"
                        onChange={(e) => setLineFile(index, e.target.files?.[0])}
                      />
                      <label
                        htmlFor={`gifting-line-file-${index}`}
                        title={line.file?.name || "Attach supporting document"}
                        className={`h-8 w-8 flex items-center justify-center rounded border cursor-pointer hover:bg-muted ${line.file ? "border-primary text-primary" : "text-muted-foreground"}`}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </label>
                    </div>
                    <span className="text-xs font-semibold text-right pr-1">
                      {(parseFloat(line.amount) || 0) > 0 ? `₹${(parseFloat(line.amount) || 0).toLocaleString("en-IN")}` : ""}
                    </span>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-7"
                      onClick={() => removeLine(index)} disabled={lines.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-2" /> Add Gifting Line
            </Button>
          </div>

          {/* Summary */}
          <div className="space-y-1 p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={submitting || !filerName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Draft
              </Button>
              <Button onClick={() => handleSubmit(false)} disabled={submitting || !canSubmit}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Submit
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
