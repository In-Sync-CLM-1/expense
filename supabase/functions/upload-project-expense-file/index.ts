import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors-headers.ts";

// Uploads a single supporting-document file for a Project Expense claim
// line item to Cloudflare R2 (via the expense-project-expense-store
// worker), and returns the public file URL. RMPL-only feature — every
// storage bucket in this org's newer features goes to R2, not Supabase
// Storage (see project memory: "No Supabase storage").
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const workerUrl = Deno.env.get("R2_PROJECT_EXPENSE_WORKER_URL");
    const uploadSecret = Deno.env.get("R2_PROJECT_EXPENSE_UPLOAD_SECRET");
    if (!workerUrl || !uploadSecret) {
      return new Response(JSON.stringify({ error: "R2 storage is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const claimId = form.get("claim_id") as string | null;
    if (!file || !claimId) {
      return new Response(JSON.stringify({ error: "file and claim_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: `File exceeds the 5 MB limit (${(file.size / 1024 / 1024).toFixed(2)} MB).` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `${user.id}/${claimId}/${Date.now()}-${rand}.${ext}`;
    const buf = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const uploadRes = await fetch(`${workerUrl}/upload?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "x-upload-secret": uploadSecret, "content-type": mimeType },
      body: buf,
    });
    if (!uploadRes.ok) {
      console.error("R2 upload failed:", uploadRes.status, await uploadRes.text());
      throw new Error(`R2 upload failed: ${uploadRes.status}`);
    }
    const { url } = await uploadRes.json() as { key: string; url: string };

    return new Response(JSON.stringify({ url, name: file.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("upload-project-expense-file failed:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
