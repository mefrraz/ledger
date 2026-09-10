import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Atribui as obras de um convite a um trabalhador (status approved).
 * Usa o service role para evitar bloqueios de RLS no cliente browser.
 */
export async function POST(request: Request) {
  const { inviteId, userId } = await request.json();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !inviteId || !userId) {
    return NextResponse.json({ error: "Parâmetros em falta." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("project_ids")
    .eq("id", inviteId)
    .maybeSingle();

  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 400 });
  const projectIds: string[] = invite?.project_ids || [];
  if (projectIds.length === 0) {
    return NextResponse.json({ success: true, assigned: 0 });
  }

  const rows = projectIds.map((pid: string) => ({ worker_id: userId, project_id: pid, status: "approved" }));
  const { error } = await supabase.from("worker_projects").upsert(rows, { onConflict: "worker_id,project_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, assigned: projectIds.length });
}