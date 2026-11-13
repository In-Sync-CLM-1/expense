import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface FileLink {
  name: string;
  url: string | null;
}

interface Submission {
  id: string;
  created_at: string;
  expense_category: string[];
  total_amount: number | null;
  excel: FileLink | null;
  invoices: FileLink[];
}

function FileButton({ file, icon }: { file: FileLink; icon: React.ReactNode }) {
  if (!file.url) {
    return <span className="inline-flex items-center gap-1 text-muted-foreground">{icon}{file.name} (unavailable)</span>;
  }
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
      {icon}{file.name}
    </a>
  );
}

// The break-up cost sheet and supporting invoices the project team submitted
// in OPM for this claim's project, shown to the approver next to the claim.
export function RmplExpenseFiles({ claimId }: { claimId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["rmpl-expense-files", claimId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-rmpl-expense-files", { body: { claim_id: claimId } });
      if (error) throw error;
      return (data?.submissions ?? []) as Submission[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Project team's expense break-up &amp; supporting (from OPM)</p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      ) : error ? (
        <p className="text-xs text-destructive">Could not load the project's expense files.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No break-up or supporting files uploaded for this project.</p>
      ) : (
        data.map((s) => (
          <div key={s.id} className="text-xs space-y-0.5">
            <div className="text-muted-foreground">
              {format(new Date(s.created_at), "dd MMM yyyy")}
              {s.expense_category.length > 0 && ` · ${s.expense_category.join(", ")}`}
              {s.total_amount ? ` · ₹${Number(s.total_amount).toLocaleString("en-IN")}` : ""}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {s.excel && <FileButton file={s.excel} icon={<FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />} />}
              {s.invoices.map((f, i) => <FileButton key={i} file={f} icon={<FileText className="h-3.5 w-3.5 text-blue-600" />} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
