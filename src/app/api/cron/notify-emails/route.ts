import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { startOfWeek, subDays, format } from "date-fns";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://folhas.eqx.pt";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço";
const emailAccent = process.env.NEXT_PUBLIC_EMAIL_ACCENT || process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F1C411";

export async function GET(request: Request) { return handleCron(request, "GET"); }
export async function POST(request: Request) { return handleCron(request, "POST"); }

async function handleCron(request: Request, method: string) {
  // Vercel Cron calls with GET + x-vercel-cron header. pg_net trigger calls with POST.
  // Gate GET (public HTTP) but allow POST (server-to-server from Supabase pg_net).
  if (method === "GET") {
    const isVercelCron = request.headers.get("x-vercel-cron") === "1";
    const cronSecret = process.env.CRON_SECRET;
    if (!isVercelCron) {
      const authHeader = request.headers.get("authorization");
      if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Não autorizado. Use POST ou configure CRON_SECRET." }, { status: 401 });
      }
    }
  }
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL;
  const emailFrom = process.env.EMAIL_FROM || gmailUser;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!gmailUser || !gmailPass || !adminEmail || !serviceRoleKey) {
    return NextResponse.json({ skipped: true, reason: "missing env vars" });
  }

  const supabase = createClient(supabaseUrl!, serviceRoleKey);
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
  const logoUrl = process.env.NEXT_PUBLIC_LOGO_URL || `${APP_URL}/logo.png`;
  // Modo digest: ADMIN_DIGEST=1 → o admin recebe UM email agrupado por execução do cron
  // (em vez de 1 email por folha submetida). O POST em tempo real (pg_net) não envia.
  const digestMode = process.env.ADMIN_DIGEST === "1";

  // Em modo digest, a chamada em tempo real (POST do pg_net) não envia email —
  // o cron agendado agrupa tudo num só email.
  if (digestMode && method === "POST") {
    return NextResponse.json({ skipped: true, reason: "digest mode — o cron envia o resumo" });
  }

  const results: any = {};

  // ── 1. Notificações → admin ──
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, message, created_at")
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(digestMode ? 100 : 10);

  if (notifications && notifications.length > 0) {
    if (digestMode) {
      // UM email com a lista de tudo o que aconteceu
      const list = notifications
        .map((n) => `<li style="margin:0 0 6px">${n.message} <span style="color:#999;font-size:11px">(${new Date(n.created_at).toLocaleString("pt-PT")})</span></li>`)
        .join("");
      try {
        await transporter.sendMail({
          from: `${APP_NAME} <${emailFrom}>`,
          to: adminEmail,
          subject: `${APP_NAME} — ${notifications.length} notificação(ões) nova(s)`,
          html: emailTemplate(
            "Resumo de atividade",
            `<strong>${notifications.length}</strong> nova(s) notificação(ões) desde o último resumo:<ul style="padding-left:18px;margin:10px 0">${list}</ul>`,
            `Ver tudo: ${APP_URL}/hr/notifications`
          ),
        });
        const ids = notifications.map((n) => n.id);
        await supabase.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
        console.log(`[cron] Digest — 1 email com ${notifications.length} notificações`);
        results.notifications = { sent: 1, grouped: notifications.length };
      } catch (err: any) {
        console.error("[cron] digest error:", err?.message);
        results.notifications = { sent: 0, failed: notifications.length };
      }
    } else {
      let sent = 0, failed = 0;
      for (const n of notifications) {
        try {
          await transporter.sendMail({
            from: `${APP_NAME} <${emailFrom}>`,
            to: adminEmail,
            subject: `${APP_NAME}: ${n.message}`,
            html: emailTemplate("Nova folha submetida", n.message, `Ver: ${APP_URL}/hr/notifications`),
          });
          await supabase.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id);
          sent++;
        } catch (err: any) { console.error("[cron] notify error:", err?.message); failed++; }
      }
      console.log(`[cron] Notifications — Sent: ${sent}, Failed: ${failed}`);
      results.notifications = { sent, failed };
    }
  }

  // ── 2. Sunday reminder to workers without sheet ──
  const today = new Date();
  if (today.getDay() === 0) { // Sunday
    const lastMonday = format(startOfWeek(subDays(today, 7), { weekStartsOn: 1 }), "yyyy-MM-dd");

    // Get already-sent reminders for this week
    const { data: sentReminders } = await supabase
      .from("weekly_email_log")
      .select("worker_id")
      .eq("week_start", lastMonday)
      .eq("email_type", "reminder");

    const alreadyReminded = new Set((sentReminders || []).map(r => r.worker_id));

    // Get all workers
    const { data: workers } = await supabase.from("profiles").select("id, full_name, email").eq("role", "worker");
    // Get workers who already submitted for last week
    const { data: submitted } = await supabase.from("work_sheets").select("worker_id").eq("week_start", lastMonday);

    const submittedIds = new Set((submitted || []).map(s => s.worker_id));
    const missing = (workers || []).filter(w => !submittedIds.has(w.id) && !alreadyReminded.has(w.id) && w.email);

    let reminded = 0, remindFailed = 0;
    for (const w of missing) {
      try {
        await transporter.sendMail({
          from: `${process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço"} <${emailFrom}>`,
          to: w.email,
          subject: `${APP_NAME} — Folha de serviço pendente`,
          html: emailTemplate(
            `Olá ${w.full_name}`,
            `A folha de serviço da semana passada ainda não foi submetida. Por favor, submeta a sua folha.`,
            `Aceda: ${APP_URL}/worker/dashboard`
          ),
        });
        // Log the reminder
        await supabase.from("weekly_email_log").insert({
          worker_id: w.id, week_start: lastMonday, email_type: "reminder",
        });
        reminded++;
      } catch (err: any) { console.error("[cron] reminder error:", err?.message); remindFailed++; }
    }
    console.log(`[cron] Sunday reminders — Sent: ${reminded}, Failed: ${remindFailed}`);
    results.reminders = { sent: reminded, failed: remindFailed };

    // ── 3. Weekly stats to ALL workers ──
    // Check which workers already received stats for this week
    const { data: sentStats } = await supabase
      .from("weekly_email_log")
      .select("worker_id")
      .eq("week_start", lastMonday)
      .eq("email_type", "stats");

    const alreadyGotStats = new Set((sentStats || []).map(s => s.worker_id));

    const { data: allWorkers } = await supabase.from("profiles").select("id, full_name, email").eq("role", "worker");
    const { data: weekSheets } = await supabase.from("work_sheets").select("worker_id, work_entries(*)").eq("week_start", lastMonday);

    let statsSent = 0, statsFailed = 0;
    for (const w of (allWorkers || [])) {
      if (!w.email || alreadyGotStats.has(w.id)) continue;
      const workerSheets = (weekSheets || []).filter((s: any) => s.worker_id === w.id);
      const mins = workerSheets.reduce((sum: number, s: any) => {
        return sum + (s.work_entries || []).reduce((s2: number, e: any) => {
          if (e.start_time && e.end_time) {
            const [sh, sm] = e.start_time.split(":").map(Number);
            const [eh, em] = e.end_time.split(":").map(Number);
            return s2 + (eh * 60 + em) - (sh * 60 + sm);
          }
          return s2;
        }, 0);
      }, 0);
      const hours = Math.floor(mins / 60);
      const minsRem = mins % 60;
      const totalHours = minsRem > 0 ? `${hours}h ${minsRem}m` : `${hours}h`;

      try {
        await transporter.sendMail({
          from: `${process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço"} <${emailFrom}>`,
          to: w.email,
          subject: `${APP_NAME} — Resumo da semana`,
          html: emailTemplate(
            `Olá ${w.full_name}`,
            `Resumo da semana passada:<br><br><strong>${totalHours}</strong> trabalhadas<br><strong>${workerSheets.length}</strong> folha(s) submetida(s)<br><br>Veja o seu histórico: ${APP_URL}/worker/dashboard`,
            `Veja o seu histórico em: ${APP_URL}/worker/dashboard`
          ),
        });
        // Log the stats email
        await supabase.from("weekly_email_log").insert({
          worker_id: w.id, week_start: lastMonday, email_type: "stats",
        });
        statsSent++;
      } catch (err: any) { console.error("[cron] stats error:", err?.message); statsFailed++; }
    }
    console.log(`[cron] Weekly stats — Sent: ${statsSent}, Failed: ${statsFailed}`);
    results.stats = { sent: statsSent, failed: statsFailed };
  }

  // ── 4. Friday reminder for the CURRENT week ──
  if (today.getDay() === 5) { // Friday
    const thisMonday = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

    const { data: sentFri } = await supabase
      .from("weekly_email_log")
      .select("worker_id")
      .eq("week_start", thisMonday)
      .eq("email_type", "reminder_friday");
    const alreadyFri = new Set((sentFri || []).map(r => r.worker_id));

    const { data: workers } = await supabase.from("profiles").select("id, full_name, email").eq("role", "worker");
    const { data: submitted } = await supabase.from("work_sheets").select("worker_id").eq("week_start", thisMonday);
    const submittedIds = new Set((submitted || []).map(s => s.worker_id));
    const missing = (workers || []).filter(w => !submittedIds.has(w.id) && !alreadyFri.has(w.id) && w.email);

    let friSent = 0, friFailed = 0;
    for (const w of missing) {
      try {
        await transporter.sendMail({
          from: `${process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço"} <${emailFrom}>`,
          to: w.email,
          subject: `${APP_NAME} — Lembrete: folha de serviço desta semana`,
          html: emailTemplate(
            `Olá ${w.full_name}`,
            `Ainda não submeteu a folha de serviço desta semana. Lembre-se de a preencher até ao fim de semana.`,
            `Aceda: ${APP_URL}/worker/dashboard`
          ),
        });
        await supabase.from("weekly_email_log").insert({
          worker_id: w.id, week_start: thisMonday, email_type: "reminder_friday",
        });
        friSent++;
      } catch (err: any) { console.error("[cron] friday reminder error:", err?.message); friFailed++; }
    }
    console.log(`[cron] Friday reminders — Sent: ${friSent}, Failed: ${friFailed}`);
    results.fridayReminders = { sent: friSent, failed: friFailed };
  }

  return NextResponse.json(results);
}

function emailTemplate(title: string, body: string, footer: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#F7F7F7">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:20px 0">
<tr><td align="center">
<table width="500" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
  <tr><td style="background:#fff;padding:24px 30px 16px;text-align:center;border-bottom:3px solid ${emailAccent}">
    <img src="${APP_URL}/logo.png" alt="logo" style="height:36px" />
  </td></tr>
  <tr><td style="padding:30px">
    <h2 style="margin:0 0 10px;color:#1a1a1a;font-size:18px">${title}</h2>
    <p style="margin:0 0 15px;color:#54595F;font-size:14px;line-height:1.6">${body}</p>
    <p style="margin:0;color:#7A7A7A;font-size:12px">${footer}</p>
  </td></tr>
  <tr><td style="background:#F7F7F7;padding:15px 30px;border-top:1px solid #eee">
    <p style="margin:0;color:#aaa;font-size:11px;font-style:italic">Enviado automaticamente pela plataforma ${APP_NAME}.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}
