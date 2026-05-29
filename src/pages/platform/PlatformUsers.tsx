import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { getRoleVariant, getRoleDisplayName } from "@/lib/rolePermissions";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  org_name: string | null;
  org_role: string | null;
}

function useAllUsers() {
  return useQuery({
    queryKey: ["platform-all-users"],
    queryFn: async () => {
      const [profilesRes, membershipsRes] = await Promise.all([
        supabase.from("profiles" as never).select("id, email, full_name, is_active").order("full_name"),
        supabase.from("org_memberships" as never)
          .select("user_id, role, is_active, organizations(name)")
          .eq("is_active", true),
      ]);

      const profiles = (profilesRes.data ?? []) as {
        id: string; email: string; full_name: string | null; is_active: boolean;
      }[];
      const memberships = (membershipsRes.data ?? []) as {
        user_id: string; role: string; is_active: boolean;
        organizations: { name: string } | null;
      }[];

      const memMap = new Map(memberships.map((m) => [m.user_id, m]));

      return profiles.map((p): UserRow => {
        const mem = memMap.get(p.id);
        return {
          ...p,
          org_name: mem?.organizations?.name ?? null,
          org_role: mem?.role ?? null,
        };
      });
    },
  });
}

export default function PlatformUsers() {
  const { data: users, isLoading } = useAllUsers();
  const [search, setSearch] = useState("");

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.org_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> All Users
        </h1>
        <p className="text-muted-foreground text-sm">Platform-wide user directory across all organisations</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or organisation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} users</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.org_name ?? <span className="italic">No org</span>}</TableCell>
                    <TableCell>
                      {u.org_role ? (
                        <Badge variant={getRoleVariant(u.org_role)} className="text-xs">
                          {getRoleDisplayName(u.org_role)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "default" : "outline"}>
                        {u.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
