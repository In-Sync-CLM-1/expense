import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Briefcase, X, Paperclip, AlertTriangle, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProjectExpenseProjectCombobox } from "./ProjectExpenseProjectCombobox";
import {
  useCreateProjectExpenseClaim,
  useMyDisbursedAdvancesForProject,
  type RmplProjectOption,
} from "@/hooks/useProjectExpenses";
import { downloadProjectExpenseImportTemplate, parseProjectExpenseImportFile } from "@/lib/projectExpenseExcelImport";
import { useQuery } from "@tanstack/react-query";

interface ProjectExpenseClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  orgId: string;
}

interface DraftLine {
  line_date: string;
  description: string;
  mode_of_transport: string;
  local_conveyance: string;
  event_expense: string;
  refreshment: string;
  other_expense: string;
  file?: File;
}

interface DraftTravelLog {
  travel_date: string;
  from_place: string;
  to_place: string;
  mode: string;
  place: string;
  total: string;
}

const emptyLine: DraftLine = {
  line_date: "", description: "", mode_of_transport: "",
  local_conveyance: "", event_expense: "", refreshment: "", other_expense: "",
};

const emptyTravelLog: DraftTravelLog = {
  travel_date: "", from_place: "", to_place: "", mode: "", place: "", total: "",
};

const lineTotal = (l: DraftLine) =>
  (parseFloat(l.local_conveyance) || 0) + (parseFloat(l.event_expense) || 0) +
  (parseFloat(l.refreshment) || 0) + (parseFloat(l.other_expense) || 0);

const isLineBlank = (l: DraftLine) =>
  !l.line_date && !l.description && !l.mode_of_transport && !l.file && lineTotal(l) === 0;

const DEFAULT_LINE_COUNT = 5;
const makeDefaultLines = () => Array.from({ length: DEFAULT_LINE_COUNT }, () => ({ ...emptyLine }));

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

export function ProjectExpenseClaimDialog({ open, onOpenChange, userId, orgId }: ProjectExpenseClaimDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { data: ownName } = useOwnFullName(userId);

  const [project, setProject] = useState<RmplProjectOption | null>(null);
  const [travellerName, setTravellerName] = useState("");
  const [activity, setActivity] = useState("");
  const [city, setCity] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [advanceId, setAdvanceId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>(makeDefaultLines());
  const [travelLogs, setTravelLogs] = useState<DraftTravelLog[]>([]);

  const createClaim = useCreateProjectExpenseClaim();
  const { data: disbursedAdvances = [] } = useMyDisbursedAdvancesForProject(userId, project?.id);

  useEffect(() => {
    if (open && !travellerName && ownName) setTravellerName(ownName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownName]);

  useEffect(() => {
    setAdvanceId(disbursedAdvances.length === 1 ? disbursedAdvances[0].id : null);
  }, [disbursedAdvances]);

  const resetForm = () => {
    setProject(null);
    setTravellerName(ownName || "");
    setActivity("");
    setCity("");
    setPeriodFrom("");
    setPeriodTo("");
    setAdvanceId(null);
    setLines(makeDefaultLines());
    setTravelLogs([]);
  };

  const addLine = () => setLines([...lines, { ...emptyLine }]);
  const removeLine = (i: number) => { if (lines.length > 1) setLines(lines.filter((_, idx) => idx !== i)); };
  const updateLine = (i: number, field: keyof DraftLine, value: string) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    setLines(updated);
  };
  const setLineFile = (i: number, file: File | undefined) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], file };
    setLines(updated);
  };

  const addTravelLog = () => setTravelLogs([...travelLogs, { ...emptyTravelLog }]);
  const removeTravelLog = (i: number) => setTravelLogs(travelLogs.filter((_, idx) => idx !== i));
  const updateTravelLog = (i: number, field: keyof DraftTravelLog, value: string) => {
    const updated = [...travelLogs];
    updated[i] = { ...updated[i], [field]: value };
    setTravelLogs(updated);
  };

  const handleImportExcel = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const { lines: parsedLines, travelLogs: parsedTravelLogs, errors } = await parseProjectExpenseImportFile(file);

      if (parsedLines.length > 0) {
        setLines((prev) => {
          const filledPrev = prev.filter((l) => !isLineBlank(l));
          return [...filledPrev, ...parsedLines];
        });
      }
      if (parsedTravelLogs.length > 0) {
        setTravelLogs((prev) => [...prev, ...parsedTravelLogs]);
      }

      const importedCount = parsedLines.length + parsedTravelLogs.length;
      if (errors.length > 0) {
        toast.error(
          importedCount > 0
            ? `Imported ${importedCount} row(s). ${errors.length} row(s) skipped — ${errors.slice(0, 3).join(" ")}`
            : `Could not import any rows — ${errors.slice(0, 3).join(" ")}`,
          { duration: 8000 },
        );
      } else if (importedCount > 0) {
        toast.success(`Imported ${parsedLines.length} expense line(s)${parsedTravelLogs.length ? ` and ${parsedTravelLogs.length} travel log row(s)` : ""} — attach receipts below before submitting.`);
      } else {
        toast.error("No rows found in that file.");
      }
    } catch (err) {
      console.error("Project expense Excel import failed:", err);
      toast.error("Could not read that file. Please use the downloadable template.");
    } finally {
      setImporting(false);
    }
  };

  const formatPeriodDate = (d: string) => format(new Date(`${d}T00:00:00`), "d MMM yyyy");
  const periodDisplay =
    periodFrom && periodTo ? `${formatPeriodDate(periodFrom)} – ${formatPeriodDate(periodTo)}`
    : periodFrom ? formatPeriodDate(periodFrom)
    : periodTo ? formatPeriodDate(periodTo)
    : "";

  const activeLines = lines.filter((l) => !isLineBlank(l));
  const actualTotal = activeLines.reduce((sum, l) => sum + lineTotal(l), 0);
  const selectedAdvance = disbursedAdvances.find((a) => a.id === advanceId);
  const advanceAmount = selectedAdvance?.amount ?? 0;
  const netBalance = advanceAmount - actualTotal;

  const canSubmit =
    !!project &&
    !!travellerName.trim() &&
    !!project?.project_owner_user_id &&
    activeLines.length > 0 &&
    activeLines.every((l) => l.line_date && (l.description || lineTotal(l) > 0));

  const handleSubmit = async (asDraft: boolean) => {
    if (!project) return;
    setSubmitting(true);
    try {
      await createClaim.mutateAsync({
        org_id: orgId,
        user_id: userId,
        traveller_name: travellerName.trim(),
        rmpl_project_id: project.id,
        project_number: project.project_number,
        project_name: project.project_name,
        project_owner_external_id: project.project_owner_external_id,
        project_owner_user_id: project.project_owner_user_id,
        project_owner_name: project.project_owner_name,
        project_owner_email: project.project_owner_email,
        activity: activity.trim(),
        city: city.trim(),
        period: periodDisplay,
        advanceId,
        items: activeLines.map((l) => ({
          line_date: l.line_date,
          description: l.description,
          mode_of_transport: l.mode_of_transport,
          local_conveyance: parseFloat(l.local_conveyance) || 0,
          event_expense: parseFloat(l.event_expense) || 0,
          refreshment: parseFloat(l.refreshment) || 0,
          other_expense: parseFloat(l.other_expense) || 0,
        })),
        itemFiles: activeLines.map((l) => l.file),
        travelLogs: travelLogs
          .filter((t) => t.travel_date || t.from_place || t.to_place)
          .map((t) => ({
            travel_date: t.travel_date || null as unknown as string,
            from_place: t.from_place,
            to_place: t.to_place,
            mode: t.mode,
            place: t.place,
            total: parseFloat(t.total) || 0,
          })),
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
            <Briefcase className="h-5 w-5" /> New Project Expense
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <ProjectExpenseProjectCombobox
              value={project?.id ?? null}
              valueName={project?.project_name}
              onChange={setProject}
            />
            {project && (
              <p className="text-xs text-muted-foreground">
                Project No. {project.project_number ?? "—"} · Project Owner: {project.project_owner_name ?? "Unresolved"}
                {disbursedAdvances.length === 0 && " · No advance disbursed — Advance Received will be ₹0"}
                {disbursedAdvances.length === 1 &&
                  ` · Advance Received: ₹${disbursedAdvances[0].amount.toLocaleString("en-IN")} on ${new Date(disbursedAdvances[0].advance_date).toLocaleDateString("en-IN")}${disbursedAdvances[0].note ? ` (${disbursedAdvances[0].note})` : ""}`}
              </p>
            )}
            {project && !project.project_owner_user_id && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                This project's owner ({project.project_owner_email ?? project.project_owner_name ?? "unknown"}) isn't a user in Expense yet — this claim can't be routed for approval. Contact your admin.
              </p>
            )}
            {project && disbursedAdvances.length > 1 && (
              <div className="flex items-center gap-2 pt-0.5">
                <Label className="text-xs shrink-0">Advance Received</Label>
                <Select value={advanceId ?? ""} onValueChange={setAdvanceId}>
                  <SelectTrigger className="h-8 text-xs w-auto min-w-[260px]"><SelectValue placeholder="Select which disbursement this claim draws down" /></SelectTrigger>
                  <SelectContent>
                    {disbursedAdvances.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        ₹{a.amount.toLocaleString("en-IN")} — {new Date(a.advance_date).toLocaleDateString("en-IN")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input className="h-9" value={travellerName} onChange={(e) => setTravellerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input className="h-9" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bengaluru" />
            </div>
            <div className="space-y-1.5">
              <Label>Activity</Label>
              <Input className="h-9" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. Booth setup" />
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

          {/* Expense lines */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Expense Lines</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadProjectExpenseImportTemplate}
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

            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[112px_92px_1fr_82px_82px_82px_82px_36px_88px_28px] gap-1.5 px-2 py-1.5 bg-muted text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <span>Date *</span>
                <span>Mode</span>
                <span>Description</span>
                <span>Local Conv.</span>
                <span>Event</span>
                <span>Refreshmt.</span>
                <span>Other</span>
                <span className="text-center">Doc</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              <div className="divide-y">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[112px_92px_1fr_82px_82px_82px_82px_36px_88px_28px] gap-1.5 px-2 py-1 items-center">
                    <Input
                      type="date" className="h-8 text-xs px-1.5"
                      value={line.line_date} onChange={(e) => updateLine(index, "line_date", e.target.value)}
                    />
                    <Input
                      className="h-8 text-xs px-1.5" placeholder="Cab"
                      value={line.mode_of_transport} onChange={(e) => updateLine(index, "mode_of_transport", e.target.value)}
                    />
                    <Input
                      className="h-8 text-xs px-1.5" placeholder="Description"
                      value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)}
                    />
                    <Input
                      type="number" className="h-8 text-xs px-1.5" placeholder="0.00"
                      value={line.local_conveyance} onChange={(e) => updateLine(index, "local_conveyance", e.target.value)}
                    />
                    <Input
                      type="number" className="h-8 text-xs px-1.5" placeholder="0.00"
                      value={line.event_expense} onChange={(e) => updateLine(index, "event_expense", e.target.value)}
                    />
                    <Input
                      type="number" className="h-8 text-xs px-1.5" placeholder="0.00"
                      value={line.refreshment} onChange={(e) => updateLine(index, "refreshment", e.target.value)}
                    />
                    <Input
                      type="number" className="h-8 text-xs px-1.5" placeholder="0.00"
                      value={line.other_expense} onChange={(e) => updateLine(index, "other_expense", e.target.value)}
                    />
                    <div className="flex items-center justify-center">
                      <input
                        type="file" id={`project-line-file-${index}`} className="sr-only"
                        accept="image/*,.pdf"
                        onChange={(e) => setLineFile(index, e.target.files?.[0])}
                      />
                      <label
                        htmlFor={`project-line-file-${index}`}
                        title={line.file?.name || "Attach supporting document"}
                        className={`h-8 w-8 flex items-center justify-center rounded border cursor-pointer hover:bg-muted ${line.file ? "border-primary text-primary" : "text-muted-foreground"}`}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </label>
                    </div>
                    <span className="text-xs font-semibold text-right pr-1">₹{lineTotal(line).toLocaleString("en-IN")}</span>
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
              <Plus className="h-4 w-4 mr-2" /> Add Expense Line
            </Button>
          </div>

          {/* Travel log */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Travel Log (optional)</Label>
            {travelLogs.map((log, index) => (
              <div key={index} className="grid grid-cols-6 gap-2 items-end border rounded-lg p-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" className="h-9" value={log.travel_date} onChange={(e) => updateTravelLog(index, "travel_date", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input className="h-9" value={log.from_place} onChange={(e) => updateTravelLog(index, "from_place", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input className="h-9" value={log.to_place} onChange={(e) => updateTravelLog(index, "to_place", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mode</Label>
                  <Input className="h-9" value={log.mode} onChange={(e) => updateTravelLog(index, "mode", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Place</Label>
                  <Input className="h-9" value={log.place} onChange={(e) => updateTravelLog(index, "place", e.target.value)} />
                </div>
                <div className="flex items-end gap-1">
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Total</Label>
                    <Input type="number" className="h-9" value={log.total} onChange={(e) => updateTravelLog(index, "total", e.target.value)} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeTravelLog(index)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTravelLog}>
              <Plus className="h-4 w-4 mr-2" /> Add Travel Log Row
            </Button>
          </div>

          {/* Summary */}
          <div className="space-y-1 p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span>Advance Received</span>
              <span className="font-medium">₹{advanceAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Actual Expense Incurred</span>
              <span className="font-medium">₹{actualTotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between font-semibold pt-1 border-t">
              <span>Net Balance {netBalance >= 0 ? "Left" : "Payable"}</span>
              <span className={netBalance < 0 ? "text-destructive" : ""}>₹{Math.abs(netBalance).toLocaleString("en-IN")}</span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={submitting || !project || !travellerName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Draft
              </Button>
              <Button onClick={() => handleSubmit(false)} disabled={submitting || !canSubmit}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Submit for Approval
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
