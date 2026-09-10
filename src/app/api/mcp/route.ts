import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateApiKey, canWrite } from "@/lib/api-auth";

const SERVER_NAME = "eqx-folha-servico-mcp";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";

// ── Definição das ferramentas (tipadas) ──
const TOOLS = [
  {
    name: "listar_trabalhadores",
    description: "Lista os perfis (trabalhadores, admin e RH). Sem filtro lista todos; usa role para filtrar.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["worker", "admin", "hr"], description: "Filtrar por role. Opcional — sem filtro lista todos os perfis." },
      },
    },
  },
  {
    name: "listar_folhas",
    description: "Lista folhas de serviço, com filtro opcional por semana (week_start, formato YYYY-MM-DD) e estado (draft/submitted/reviewed).",
    inputSchema: {
      type: "object",
      properties: {
        week_start: { type: "string", description: "Segunda-feira da semana (YYYY-MM-DD). Opcional." },
        status: { type: "string", enum: ["draft", "submitted", "reviewed"], description: "Estado da folha. Opcional." },
      },
    },
  },
  {
    name: "detalhe_folha",
    description: "Devolve o detalhe completo de uma folha (entradas diárias, turnos, horas).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID da folha (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "listar_clientes",
    description: "Lista todos os clientes.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listar_obras",
    description: "Lista todas as obras (projetos) com cliente associado.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "validar_folha",
    description: "Marca uma folha como validada (reviewed). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID da folha (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "exportar_folha",
    description: "Exporta uma folha como documento Word (.doc). Devolve o conteúdo HTML do documento.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID da folha (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "criar_obra",
    description: "Cria uma obra (projeto). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome da obra." } },
      required: ["nome"],
    },
  },
  {
    name: "apagar_obra",
    description: "Apaga uma obra (projeto). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID da obra (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "criar_cliente",
    description: "Cria um cliente. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome do cliente." } },
      required: ["nome"],
    },
  },
  {
    name: "apagar_cliente",
    description: "Apaga um cliente. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID do cliente (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "apagar_trabalhador",
    description: "Apaga um trabalhador (conta). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID do trabalhador (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "atribuir_obra_folha",
    description: "Atribui obra/cliente a uma folha de serviço. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        folha_id: { type: "string", description: "ID da folha (UUID)." },
        obra_id: { type: "string", description: "ID da obra (UUID)." },
        work_number: { type: "string", description: "Nº da obra. Opcional." },
      },
      required: ["folha_id", "obra_id"],
    },
  },
  {
    name: "apagar_trabalhadores_em_massa",
    description: "Apaga vários trabalhadores de uma vez (uma só chamada). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Lista de IDs (UUID) dos trabalhadores a apagar." },
      },
      required: ["ids"],
    },
  },
  {
    name: "criar_obras_em_massa",
    description: "Cria várias obras de uma vez (uma só chamada). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        nomes: { type: "array", items: { type: "string" }, description: "Lista de nomes das obras a criar." },
      },
      required: ["nomes"],
    },
  },
  {
    name: "atribuir_obra_trabalhador",
    description: "Atribui uma obra a um trabalhador (aprovada de imediato). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        trabalhador_id: { type: "string", description: "ID do trabalhador (UUID)." },
        obra_id: { type: "string", description: "ID da obra (UUID)." },
      },
      required: ["trabalhador_id", "obra_id"],
    },
  },
  {
    name: "resumo_semana",
    description: "Resumo de uma semana: quem submeteu, horas por trabalhador e quem está em falta. Sem chamadas extra.",
    inputSchema: {
      type: "object",
      properties: {
        week_start: { type: "string", description: "Segunda-feira da semana (YYYY-MM-DD). Opcional — por defeito usa a semana atual." },
      },
    },
  },
  {
    name: "listar_convites",
    description: "Lista os convites de acesso (código, prazo, papel, usado por quem).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "criar_convite",
    description: "Cria um código de convite para registo de trabalhadores, com as obras que o trabalhador terá. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Código do convite (ex: EQX2025)." },
        label: { type: "string", description: "Etiqueta opcional (ex: Turma A)." },
        expires_at: { type: "string", description: "Prazo (ISO date). Opcional." },
        role: { type: "string", enum: ["worker", "admin"], description: "Papel da conta criada. Default: worker." },
        requires_approval: { type: "boolean", description: "Se a conta precisa de aprovação ao registar-se. Default: false." },
        obra_ids: { type: "array", items: { type: "string" }, description: "IDs das obras do trabalhador (atribuídas de imediato ao registar). Opcional — convites sem obras dão contas sem obras." },
      },
      required: ["code"],
    },
  },
  {
    name: "apagar_convite",
    description: "Apaga um convite de acesso. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID do convite (UUID)." } },
      required: ["id"],
    },
  },
  {
    name: "criar_trabalhador",
    description: "Cria uma conta de trabalhador, atribui as obras indicadas e envia email com link para definir password. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo." },
        email: { type: "string", description: "Email do trabalhador." },
        obra_ids: { type: "array", items: { type: "string" }, description: "IDs das obras do trabalhador. Opcional." },
      },
      required: ["nome", "email"],
    },
  },
  {
    name: "editar_obra",
    description: "Edita uma obra (nome, número, cliente, localização). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da obra (UUID)." },
        nome: { type: "string", description: "Novo nome. Opcional." },
        numero: { type: "string", description: "Nº da obra. Opcional." },
        cliente_id: { type: "string", description: "ID do cliente. Opcional." },
        localizacao: { type: "string", description: "Localização. Opcional." },
      },
      required: ["id"],
    },
  },
  {
    name: "editar_cliente",
    description: "Edita um cliente (nome, logotipo). Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID do cliente (UUID)." },
        nome: { type: "string", description: "Novo nome. Opcional." },
        logo_url: { type: "string", description: "URL do logotipo. Opcional." },
      },
      required: ["id"],
    },
  },
  {
    name: "remover_obra_trabalhador",
    description: "Remove a atribuição de uma obra a um trabalhador. Requer permissão admin/RH.",
    inputSchema: {
      type: "object",
      properties: {
        trabalhador_id: { type: "string", description: "ID do trabalhador (UUID)." },
        obra_id: { type: "string", description: "ID da obra (UUID)." },
      },
      required: ["trabalhador_id", "obra_id"],
    },
  },
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Execução das ferramentas ──
async function callTool(name: string, args: any, role: "read" | "admin"): Promise<string> {
  const supabase = getSupabase();

  switch (name) {
    case "listar_trabalhadores": {
      let query = supabase
        .from("profiles")
        .select("id, full_name, email, role, created_at")
        .order("full_name");
      if (args?.role) query = query.eq("role", args.role);
      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });
      // Compatibilidade: devolve as duas chaves (perfis inclui admin/RH; trabalhadores = filtro worker)
      const workerOnly = (data || []).filter((p: any) => p.role === "worker");
      return JSON.stringify({ perfis: data, trabalhadores: workerOnly });
    }
    case "listar_folhas": {
      let query = supabase
        .from("work_sheets")
        .select("id, worker_id, week_start, week_end, client, work_number, status, created_at, worker:profiles!work_sheets_worker_id_fkey(full_name, email)")
        .order("week_start", { ascending: false })
        .limit(200);
      if (args?.week_start) query = query.eq("week_start", args.week_start);
      if (args?.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ folhas: data });
    }
    case "detalhe_folha": {
      const { data, error } = await supabase
        .from("work_sheets")
        .select("*, work_entries(*), worker:profiles!work_sheets_worker_id_fkey(full_name, email)")
        .eq("id", args.id)
        .single();
      if (error || !data) return JSON.stringify({ error: "Folha não encontrada." });
      return JSON.stringify({ folha: data });
    }
    case "listar_clientes": {
      const { data, error } = await supabase.from("clients").select("id, name, logo_url, created_at").order("name");
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ clientes: data });
    }
    case "listar_obras": {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, number, location, client_id, client:clients(name)")
        .order("name");
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ obras: data });
    }
    case "validar_folha": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const { error } = await supabase.from("work_sheets").update({ status: "reviewed" }).eq("id", args.id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Folha validada." });
    }
    case "exportar_folha": {
      const { data: sheet } = await supabase
        .from("work_sheets")
        .select("*, work_entries(*), worker:profiles!work_sheets_worker_id_fkey(full_name)")
        .eq("id", args.id)
        .single();
      if (!sheet) return JSON.stringify({ error: "Folha não encontrada." });
      return JSON.stringify({
        success: true,
        filename: `Folha_${sheet.week_start}_${sheet.worker?.full_name?.replace(/\s/g, "_") || "servico"}.doc`,
        week_start: sheet.week_start,
        week_end: sheet.week_end,
        client: sheet.client,
        work_number: sheet.work_number,
        worker: sheet.worker?.full_name,
        entries: sheet.work_entries,
      });
    }
    // ── Ferramentas de escrita (requerem admin/RH) ──
    case "criar_obra": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.nome?.trim()) return JSON.stringify({ error: "Nome da obra é obrigatório." });
      const { data, error } = await supabase.from("projects").insert({ name: args.nome.trim() }).select("id, name").maybeSingle();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, obra: data });
    }
    case "apagar_obra": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const { error } = await supabase.from("projects").delete().eq("id", args.id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Obra apagada." });
    }
    case "criar_cliente": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.nome?.trim()) return JSON.stringify({ error: "Nome do cliente é obrigatório." });
      const { data, error } = await supabase.from("clients").insert({ name: args.nome.trim() }).select("id, name").maybeSingle();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, cliente: data });
    }
    case "apagar_cliente": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const { error } = await supabase.from("clients").delete().eq("id", args.id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Cliente apagado." });
    }
    case "apagar_trabalhador": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) return JSON.stringify({ error: "Configuração em falta." });
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${args.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${serviceRoleKey}`, "apikey": serviceRoleKey },
      });
      if (!res.ok) return JSON.stringify({ error: `Erro ao apagar trabalhador (HTTP ${res.status}).` });
      return JSON.stringify({ success: true, message: "Trabalhador apagado." });
    }
    case "atribuir_obra_folha": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.folha_id || !args?.obra_id) return JSON.stringify({ error: "folha_id e obra_id são obrigatórios." });
      // Buscar a obra para obter o cliente
      const { data: obra } = await supabase
        .from("projects")
        .select("id, name, number, client:clients(name)")
        .eq("id", args.obra_id)
        .maybeSingle();
      if (!obra) return JSON.stringify({ error: "Obra não encontrada." });
      const obraClient = (obra as any).client?.name || obra.name;
      const { error } = await supabase
        .from("work_sheets")
        .update({
          project_id: obra.id,
          client: obraClient,
          work_number: args.work_number || obra.number || "",
        })
        .eq("id", args.folha_id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Obra atribuída à folha." });
    }
    case "atribuir_obra_trabalhador": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.trabalhador_id || !args?.obra_id) return JSON.stringify({ error: "trabalhador_id e obra_id são obrigatórios." });
      const { error } = await supabase
        .from("worker_projects")
        .upsert(
          { worker_id: args.trabalhador_id, project_id: args.obra_id, status: "approved" },
          { onConflict: "worker_id,project_id" }
        );
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Obra atribuída ao trabalhador (aprovada de imediato)." });
    }
    // ── Ferramentas em massa (requerem admin/RH) ──
    case "apagar_trabalhadores_em_massa": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const ids: string[] = Array.isArray(args?.ids) ? args.ids.map(String) : [];
      if (ids.length === 0) return JSON.stringify({ error: "Lista de ids vazia." });
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) return JSON.stringify({ error: "Configuração em falta." });
      let apagados = 0, falhados = 0;
      for (const id of ids) {
        try {
          const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${serviceRoleKey}`, "apikey": serviceRoleKey },
          });
          if (res.ok) apagados++; else falhados++;
        } catch { falhados++; }
      }
      return JSON.stringify({ success: true, apagados, falhados, total: ids.length });
    }
    case "criar_obras_em_massa": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const nomes: string[] = (Array.isArray(args?.nomes) ? args.nomes : [])
        .map((n: any) => String(n).trim())
        .filter(Boolean);
      if (nomes.length === 0) return JSON.stringify({ error: "Lista de nomes vazia." });
      const { data, error } = await supabase.from("projects").insert(nomes.map((n) => ({ name: n }))).select("id, name");
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, criadas: data?.length || 0, obras: data });
    }
    case "resumo_semana": {
      // Segunda-feira da semana atual (ou a passada em args)
      const now = new Date();
      const day = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - day);
      const ws = args?.week_start || monday.toISOString().slice(0, 10);
      const { data: workers } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("role", "worker")
        .order("full_name");
      const { data: sheets } = await supabase
        .from("work_sheets")
        .select("*, work_entries(*), worker:profiles!work_sheets_worker_id_fkey(full_name)")
        .eq("week_start", ws);
      const hoursByWorker = new Map<string, { nome: string; horas: string; status: string }>();
      for (const s of sheets || []) {
        let m = 0;
        for (const e of s.work_entries || []) {
          if (e.start_time && e.end_time) {
            const [sh, sm] = e.start_time.split(":").map(Number);
            const [eh, em] = e.end_time.split(":").map(Number);
            m += (eh * 60 + em) - (sh * 60 + sm);
          }
        }
        const h = Math.floor(m / 60), mm = m % 60;
        hoursByWorker.set(s.worker_id, {
          nome: s.worker?.full_name || "—",
          horas: mm > 0 ? `${h}h ${mm}m` : `${h}h`,
          status: s.status,
        });
      }
      const submeteram = (workers || []).filter((w) => hoursByWorker.has(w.id)).map((w) => ({ id: w.id, nome: w.full_name, ...(hoursByWorker.get(w.id) || {}) }));
      const pendentes = (workers || []).filter((w) => !hoursByWorker.has(w.id)).map((w) => ({ id: w.id, nome: w.full_name, email: w.email }));
      return JSON.stringify({
        semana: ws,
        total_trabalhadores: workers?.length || 0,
        submeteram,
        pendentes,
        resumo: `${submeteram.length}/${workers?.length || 0} submeteram`,
      });
    }
    case "listar_convites": {
      const { data, error } = await supabase
        .from("invites")
        .select("id, code, label, role, requires_approval, expires_at, used_at, used:profiles!invites_used_by_fkey(full_name, email), created_at")
        .order("created_at", { ascending: false });
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ convites: data });
    }
    case "criar_convite": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.code?.trim()) return JSON.stringify({ error: "Código é obrigatório." });
      const code = args.code.trim().toUpperCase();
      const obraIds: string[] = Array.isArray(args?.obra_ids) ? args.obra_ids.map(String) : [];
      const { data, error } = await supabase
        .from("invites")
        .insert({
          code,
          label: args.label?.trim() || null,
          expires_at: args.expires_at || null,
          role: args.role === "admin" ? "admin" : "worker",
          requires_approval: !!args.requires_approval,
          project_ids: obraIds,
        })
        .select("id, code, role, expires_at, project_ids")
        .maybeSingle();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, convite: data, obras_atribuidas: obraIds.length });
    }
    case "apagar_convite": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      const { error } = await supabase.from("invites").delete().eq("id", args.id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Convite apagado." });
    }
    case "criar_trabalhador": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.nome?.trim() || !args?.email?.trim()) return JSON.stringify({ error: "nome e email são obrigatórios." });
      const nome = args.nome.trim();
      const email = args.email.trim().toLowerCase();
      const crypto = await import("crypto");
      const tempPassword = crypto.randomBytes(16).toString("hex");
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const { data: userData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: nome },
      });
      if (authError) return JSON.stringify({ error: authError.message });
      if (userData.user) {
        await supabase.from("profiles").update({ full_name: nome, email, onboarded: true }).eq("id", userData.user.id);
        await supabase.from("invite_tokens").insert({ email, full_name: nome, token: inviteToken, created_by: null });
        // Atribuir as obras indicadas (aprovadas)
        const obraIds: string[] = Array.isArray(args?.obra_ids) ? args.obra_ids.map(String) : [];
        if (obraIds.length > 0) {
          const rows = obraIds.map((pid: string) => ({ worker_id: userData.user!.id, project_id: pid, status: "approved" }));
          await supabase.from("worker_projects").upsert(rows, { onConflict: "worker_id,project_id" });
        }
      }
      // Enviar email com link para definir password
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      let emailEnviado = false;
      if (gmailUser && gmailPass) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://folhas.eqx.pt";
          const link = `${appUrl}/auth/set-password?token=${inviteToken}`;
          const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço";
          const emailAccent = process.env.NEXT_PUBLIC_EMAIL_ACCENT || process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F1C411";
          const emailButtonText = process.env.NEXT_PUBLIC_EMAIL_BUTTON_TEXT || "#1a1a1a";
          const emailFrom = process.env.EMAIL_FROM || gmailUser;
          await transporter.sendMail({
            from: `${APP_NAME} <${emailFrom}>`,
            to: email,
            subject: `${APP_NAME} — Convite para a plataforma`,
            html: `<html><body style="font-family:Arial,sans-serif;background:#F7F7F7;margin:0;padding:20px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="500" style="background:#fff;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 30px;border-bottom:3px solid ${emailAccent}"><h2 style="margin:0;color:#1a1a1a;font-size:18px">${APP_NAME}</h2></td></tr><tr><td style="padding:30px"><h2 style="margin:0 0 10px;color:#1a1a1a;font-size:18px">Bem-vindo, ${nome}</h2><p style="color:#54595F;font-size:14px;line-height:1.6">Foi criada uma conta para si. Clique no botão para definir a sua palavra-passe:</p><div style="text-align:center;margin:20px 0"><a href="${link}" style="background:${emailAccent};color:${emailButtonText};padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold">Definir palavra-passe</a></div><p style="color:#888;font-size:12px">Ou copie: <a href="${link}" style="color:${emailAccent}">${link}</a></p></td></tr></table></td></tr></table></body></html>`,
          });
          emailEnviado = true;
        } catch (err: any) {
          console.error("[mcp] invite email error:", err?.message);
        }
      }
      return JSON.stringify({ success: true, id: userData.user?.id, email, convite_link_definir_password: emailEnviado ? "enviado por email" : "email não configurado — use /auth/set-password com o token", invite_token: inviteToken });
    }
    case "editar_obra": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.id) return JSON.stringify({ error: "id é obrigatório." });
      const updates: any = {};
      if (args.nome !== undefined) updates.name = args.nome.trim();
      if (args.numero !== undefined) updates.number = args.numero;
      if (args.cliente_id !== undefined) updates.client_id = args.cliente_id || null;
      if (args.localizacao !== undefined) updates.location = args.localizacao;
      if (Object.keys(updates).length === 0) return JSON.stringify({ error: "Nada para atualizar." });
      const { error } = await supabase.from("projects").update(updates).eq("id", args.id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Obra atualizada." });
    }
    case "editar_cliente": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.id) return JSON.stringify({ error: "id é obrigatório." });
      const updates: any = {};
      if (args.nome !== undefined) updates.name = args.nome.trim();
      if (args.logo_url !== undefined) updates.logo_url = args.logo_url || null;
      if (Object.keys(updates).length === 0) return JSON.stringify({ error: "Nada para atualizar." });
      const { error } = await supabase.from("clients").update(updates).eq("id", args.id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Cliente atualizado." });
    }
    case "remover_obra_trabalhador": {
      if (!canWrite(role)) return JSON.stringify({ error: "Permissão insuficiente (requer admin/RH)." });
      if (!args?.trabalhador_id || !args?.obra_id) return JSON.stringify({ error: "trabalhador_id e obra_id são obrigatórios." });
      const { error } = await supabase
        .from("worker_projects")
        .delete()
        .eq("worker_id", args.trabalhador_id)
        .eq("project_id", args.obra_id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, message: "Atribuição removida." });
    }
    default:
      return JSON.stringify({ error: `Ferramenta desconhecida: ${name}` });
  }
}

// ── Handler MCP (JSON-RPC sobre HTTP) ──
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Não autorizado." } }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }, { status: 400 });
  }

  const { method, id, params } = body;

  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });

    case "tools/list":
      return NextResponse.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const text = await callTool(toolName, toolArgs, auth.role);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text }] },
      });
    }

    case "ping":
      return NextResponse.json({ jsonrpc: "2.0", id, result: {} });

    default:
      return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Método desconhecido: ${method}` } });
  }
}
