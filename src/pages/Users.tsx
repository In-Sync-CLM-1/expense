import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Search, Users as UsersIcon, Edit, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrg } from "@/contexts/OrgContext";
import { getRoleDisplayName, getRoleVariant } from "@/lib/rolePermissions";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  reports_to: string | null;
  is_active: boolean;
  roles: string[];
  manager_name?: string;
}

function useUsers(orgId?: string) {
  return useQuery({
    queryKey: ["users-list", orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data: profiles, error } = await supabase
        .from("profiles" as never)
        .select("id, email, full_name, phone, reports_to, is_active")
        .order("full_name");
      if (error) throw error;

      // Get roles from org_memberships
      const { data: memberships } = await supabase
        .from("org_memberships" as never)
        .select("user_id, role")
        .eq("org_id", orgId)
        .eq("is_active", true);

      const rolesMap = new Map<string, string[]>();
      for (const m of (memberships ?? []) as { user_id: string; role: string }[]) {
        rolesMap.set(m.user_id, [m.role]);
      }

      const profileList = (profiles ?? []) as Omit<Profile, "roles" | "manager_name">[];
      const profileMap = new Map(profileList.map((p) => [p.id, p]));

      // Only return users who are members of this org
      const orgUserIds = new Set(rolesMap.keys());
      return profileList
        .filter((p) => orgUserIds.has(p.id))
        .map((p) => ({
          ...p,
          roles: rolesMap.get(p.id) ?? [],
          manager_name: p.reports_to ? (profileMap.get(p.reports_to)?.full_name ?? null) : null,
        })) as Profile[];
    },
    enabled: !!orgId,
  });
}

export default function Users() {
  const { permissions } = useUserPermissions();
  const { currentOrg } = useOrg();
  const { data: users, isLoading } = useUsers(currentOrg?.id);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);

  if (!permissions.canManageUsers) {
    return (
      <div className="container mx-auto p-6">
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          You do not have permission to manage users.
        </CardContent></Card>
      </div>
    );
  }

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.full_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <UsersIcon className="h-7 w-7" /> Users
          </h1>
          <p className="text-muted-foreground">
            Manage employees, roles, and reporting hierarchy for {currentOrg?.name}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add User
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} users</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {user.roles.map((r) => (
                          <Badge key={r} variant={getRoleVariant(r)} className="text-xs">
                            {getRoleDisplayName(r)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.manager_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? "default" : "outline"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditUser(user)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        allUsers={users ?? []}
        mode="create"
        orgId={currentOrg?.id ?? ""}
      />
      {editUser && (
        <UserFormDialog
          open={!!editUser}
          onOpenChange={(o) => { if (!o) setEditUser(null); }}
          allUsers={(users ?? []).filter((u) => u.id !== editUser.id)}
          mode="edit"
          user={editUser}
          orgId={currentOrg?.id ?? ""}
        />
      )}
    </div>
  );
}

// ── User Form Dialog ───────────────────────────────────────────────────────────

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  allUsers: Profile[];
  mode: "create" | "edit";
  user?: Profile;
  orgId: string;
}

function UserFormDialog({ open, onOpenChange, allUsers, mode, user, orgId }: UserFormDialogProps) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState(user?.roles[0] ?? "employee");
  const [reportsTo, setReportsTo] = useState(user?.reports_to ?? "none");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fullName || !email || !role) { toast.error("Name, email, and role are required"); return; }
    setSaving(true);
    try {
      if (mode === "create") {
        if (!password) { toast.error("Password is required for new users"); setSaving(false); return; }
        const { error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email, password, full_name: fullName, phone: phone || undefined,
            role, reports_to: reportsTo !== "none" ? reportsTo : undefined,
            org_id: orgId,
          },
        });
        if (error) throw error;
        toast.success("User created successfully!");
      } else if (user) {
        // Update profile
        await supabase.from("profiles" as never).update({
          full_name: fullName, phone: phone || null,
          reports_to: reportsTo !== "none" ? reportsTo : null,
          is_active: isActive,
        }).eq("id", user.id);
        // Update role in org_memberships
        await supabase.from("org_memberships" as never)
          .update({ role })
          .eq("user_id", user.id)
          .eq("org_id", orgId);
        toast.success("User updated!");
      }
      qc.invalidateQueries({ queryKey: ["users-list"] });
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add New User" : "Edit User"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" disabled={mode === "edit"} />
          </div>
          {mode === "create" && (
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reports To (Manager)</Label>
            <Select value={reportsTo} onValueChange={setReportsTo}>
              <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No manager —</SelectItem>
                {allUsers.filter((u) => u.roles.includes("manager") || u.roles.includes("admin")).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name ?? u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "edit" && (
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
              <Label htmlFor="active" className="flex items-center gap-1.5">
                {isActive ? <UserCheck className="h-4 w-4 text-green-500" /> : <UserX className="h-4 w-4 text-muted-foreground" />}
                {isActive ? "Active" : "Inactive"}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Create User" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
