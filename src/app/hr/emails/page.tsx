import { createClient } from "@/lib/supabase/server";
import EmailClient from "./EmailClient";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const supabase = await createClient();
  const { data: workers } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "worker")
    .order("full_name");
  const { data: assignments } = await supabase
    .from("worker_projects")
    .select("worker_id, project_id, project:projects(name)");

  // Mapa: worker_id → nomes das obras
  const obrasByWorker: Record<string, string[]> = {};
  for (const a of assignments || []) {
    const p = a.project as any;
    const nome = p?.name || "";
    if (!nome) continue;
    if (!obrasByWorker[a.worker_id]) obrasByWorker[a.worker_id] = [];
    if (!obrasByWorker[a.worker_id].includes(nome)) obrasByWorker[a.worker_id].push(nome);
  }

  return <EmailClient workers={workers || []} obrasByWorker={obrasByWorker} />;
}