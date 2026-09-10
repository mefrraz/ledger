import { createClient } from "@/lib/supabase/server";
import WorkerSettingsClient from "./WorkerSettingsClient";
import { calcMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WorkerSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: sheets } = await supabase.from("work_sheets").select("work_entries(*)").eq("worker_id", user.id);

  // As obras do trabalhador vêm das ATRIBUIÇÕES (não das folhas)
  const { data: assignments } = await supabase
    .from("worker_projects")
    .select("project:projects(name, client:clients(name))")
    .eq("worker_id", user.id)
    .eq("status", "approved");
  const uniqueProjects = (assignments || []).map((a: any) => a.project).filter(Boolean);

  const totalMins = (sheets || []).reduce((s, sh) => s + calcMinutes(sh.work_entries || []), 0);

  return (
    <WorkerSettingsClient
      userId={user.id}
      profile={profile}
      totalMins={totalMins}
      sheetsCount={sheets?.length || 0}
      projects={uniqueProjects as any[]}
    />
  );
}