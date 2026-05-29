import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { Loader2, UserCircle, Save, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { getRoleDisplayName, getRoleVariant } from "@/lib/rolePermissions";

export default function MyProfile() {
  const [profile, setProfile] = useState<{ full_name: string; email: string; phone: string; manager_name?: string; roles: string[] } | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: p } = await supabase
        .from("profiles" as never)
        .select("id, full_name, email, phone, reports_to")
        .eq("id", session.user.id)
        .single();

      const { data: roles } = await supabase
        .from("user_roles" as never)
        .select("role")
        .eq("user_id", session.user.id);

      let managerName: string | undefined;
      if ((p as unknown as { reports_to?: string })?.reports_to) {
        const { data: mgr } = await supabase
          .from("profiles" as never)
          .select("full_name")
          .eq("id", (p as unknown as { reports_to: string }).reports_to)
          .single();
        managerName = (mgr as unknown as { full_name: string })?.full_name;
      }

      const profile = p as unknown as { full_name: string; email: string; phone: string };
      const roleList = (roles ?? []).map((r: { role: string }) => r.role);
      setProfile({ ...profile, roles: roleList, manager_name: managerName });
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    };
    load();
  }, []);

  const saveProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles" as never)
        .update({ full_name: fullName, phone: phone || null })
        .eq("id", session.user.id);
      if (error) throw error;
      toast.success("Profile updated!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password changed successfully!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPw(false);
    }
  };

  if (!profile) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserCircle className="h-7 w-7" /> My Profile
        </h1>
        <p className="text-muted-foreground">View and update your account details</p>
      </div>

      {/* Info */}
      <Card>
        <CardHeader><CardTitle>Account Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{profile.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Roles</span>
            <div className="flex gap-1">
              {profile.roles.map((r) => (
                <Badge key={r} variant={getRoleVariant(r)} className="text-xs">{getRoleDisplayName(r)}</Badge>
              ))}
            </div>
          </div>
          {profile.manager_name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Manager</span>
              <span className="font-medium">{profile.manager_name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <Button onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
          </div>
          <div className="space-y-2">
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button variant="outline" onClick={changePassword} disabled={changingPw}>
            {changingPw && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
