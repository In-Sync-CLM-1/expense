import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export interface OrgRow {
  id: string;
  name: string;
  industry: string | null;
  is_active: boolean;
  created_at: string;
  memberCount: number;
  claimCount: number;
  pendingCount: number;
  totalAmount: number;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function PlatformOrgsTable({ organizations, isLoading }: { organizations: OrgRow[]; isLoading: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleToggleOrg = async (org: OrgRow) => {
    const { error } = await supabase
      .from("organizations" as never)
      .update({ is_active: !org.is_active })
      .eq("id", org.id);
    if (error) {
      toast.error("Failed to update organisation");
      return;
    }
    toast.success(org.is_active ? "Organisation deactivated" : "Organisation activated");
    queryClient.invalidateQueries({ queryKey: ["platform-orgs"] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Organisations
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate("/platform/orgs")}>
            Manage
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
          </div>
        ) : organizations.length === 0 ? (
          <div className="text-center text-muted-foreground py-10">
            No organisations yet. <button className="underline text-primary" onClick={() => navigate("/platform/orgs")}>Create one</button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Claims</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Total Claimed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="font-medium">{org.name}</div>
                    {org.industry && (
                      <div className="text-xs text-muted-foreground">{org.industry}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{org.memberCount}</TableCell>
                  <TableCell className="text-right">{org.claimCount}</TableCell>
                  <TableCell className="text-right">
                    {org.pendingCount > 0 ? (
                      <span className="text-yellow-600 font-semibold">{org.pendingCount}</span>
                    ) : 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmt(org.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={org.is_active ? "default" : "outline"}>
                      {org.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleOrg(org)}>
                          {org.is_active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
