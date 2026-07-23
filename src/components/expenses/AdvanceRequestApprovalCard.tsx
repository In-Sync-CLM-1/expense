import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { User, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { RmplProjectCombobox } from "./RmplProjectCombobox";
import type { AdvanceRequest } from "@/hooks/useAdvanceRequests";

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

interface Props {
  request: AdvanceRequest;
  onDecide: (approve: boolean, projectId: string | null, projectName: string | null, comments: string) => void;
  deciding: boolean;
}

export function AdvanceRequestApprovalCard({ request, onDecide, deciding }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [comments, setComments] = useState("");

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg">{request.purpose}</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {request.profiles?.full_name}
              </span>
              <span>requested {format(new Date(request.created_at), "MMM d, yyyy")}</span>
            </div>
            {request.employee_remarks && (
              <p className="text-sm text-muted-foreground mt-1 italic">"{request.employee_remarks}"</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold">{inr(request.amount)}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Assign to project (required to approve)</Label>
          <RmplProjectCombobox
            value={projectId}
            valueName={projectName}
            onChange={(id, name) => { setProjectId(id); setProjectName(name); }}
            disabled={deciding}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Comment (shown to the maker if rejected)</Label>
          <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Optional" disabled={deciding} />
        </div>

        <Separator />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={deciding} onClick={() => onDecide(false, null, null, comments)}>
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button size="sm" disabled={deciding || !projectId} onClick={() => onDecide(true, projectId, projectName, comments)}>
            <CheckCircle className="h-4 w-4 mr-1" /> Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
