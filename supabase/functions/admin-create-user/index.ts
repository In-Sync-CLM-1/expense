import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

const ALLOWED_ROLES = ["admin", "manager", "employee"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !caller) throw new Error("Unauthorized");

    const {
      email, password, full_name, phone, role, reports_to, org_id,
    }: {
      email: string; password: string; full_name: string;
      phone?: string; role: string; reports_to?: string; org_id: string;
    } = await req.json();

    if (!email || !password || !full_name || !role || !org_id) {
      throw new Error("email, password, full_name, role, and org_id are required");
    }
    if (!ALLOWED_ROLES.includes(role)) {
      throw new Error(`role must be one of: ${ALLOWED_ROLES.join(", ")}`);
    }

    // Caller must be org admin OR platform admin
    const isPlatformAdmin = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (!isPlatformAdmin.data) {
      const orgMembership = await supabaseAdmin
        .from("org_memberships")
        .select("role")
        .eq("user_id", caller.id)
        .eq("org_id", org_id)
        .eq("role", "admin")
        .eq("is_active", true)
        .maybeSingle();
      if (!orgMembership.data) throw new Error("Insufficient permissions");
    }

    // Create auth user
    const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) throw createErr;

    const newUserId = userData.user.id;

    // Create org membership
    const { error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .insert({ org_id, user_id: newUserId, role });
    if (memErr) throw new Error("Failed to create org membership: " + memErr.message);

    // Update profile with phone and reports_to
    const profileUpdate: Record<string, unknown> = {};
    if (phone) profileUpdate.phone = phone;
    if (reports_to) profileUpdate.reports_to = reports_to;

    if (Object.keys(profileUpdate).length > 0) {
      await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", newUserId);
    }

    return new Response(
      JSON.stringify({ success: true, user: userData.user }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin-create-user]", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
