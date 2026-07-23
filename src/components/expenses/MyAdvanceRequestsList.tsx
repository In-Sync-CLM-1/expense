import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HandCoins } from "lucide-react";
import { format } from "date-fns";
import { useMyAdvanceRequests } from "@/hooks/useAdvanceRequests";

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

const statusVariant = (status: string) =>
  status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";

/** The signed-in maker's own advance requests, most recent first. */
export function MyAdvanceRequestsList({ orgId, userId }: { orgId?: string; userId?: string }) {
  const { data: requests } = useMyAdvanceRequests(orgId, userId);
  if (!requests || requests.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <HandCoins className="h-5 w-5" /> My Advance Requests
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.purpose}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(r.amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(r.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>
                      {r.status === "pending" ? "Pending" : r.status === "approved" ? "Approved" : "Rejected"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                    {r.status === "rejected" ? (r.review_comments || "—") : (r.project_name || "—")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
