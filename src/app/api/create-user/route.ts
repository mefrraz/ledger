import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "crypto";
import nodemailer from "nodemailer";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço";
const emailAccent = process.env.NEXT_PUBLIC_EMAIL_ACCENT || process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F1C411";
const emailButtonText = process.env.NEXT_PUBLIC_EMAIL_BUTTON_TEXT || "#1a1a1a";

export async function POST(request: Request) {
  // Rate limit: 20 invites per hour per admin
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const rl = checkRateLimit(`create-user:${ip}`, 20, 3600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiados convites. Tente novamente mais tarde." }, { status: 429 });
  }

  try {
    // Verify the caller is an admin
    const serverClient = await createServerClient();
    const {
      data: { user },
    } = await serverClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile } = await serverClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "hr")) {
      return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
    }

    const body = await request.json();
    const { full_name, email } = body;

    if (!full_name || !email) {
      return NextResponse.json({ error: "Nome e email são obrigatórios." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate random temp password + invite token
    const tempPassword = crypto.randomBytes(16).toString("hex");
    const inviteToken = crypto.randomBytes(32).toString("hex");

    // Create auth user with temp password (email pre-confirmed)
    const { data: userData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      // Check if user already exists
      if (authError.message?.includes("already") || authError.message?.includes("exists")) {
        return NextResponse.json({ error: "Já existe um utilizador com este email." }, { status: 400 });
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Update profile
    if (userData.user) {
      await supabase.from("profiles").update({ full_name, email, onboarded: false }).eq("id", userData.user.id);
    }

    // Store invite token
    const { error: tokenError } = await supabase.from("invite_tokens").insert({
      email,
      full_name,
      token: inviteToken,
      created_by: user.id,
    });

    if (tokenError) {
      console.error("[invite-user] token insert error:", tokenError.message);
      // Non-fatal — user is created, can resend invite later
    }

    // Send invite email
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailUser && gmailPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: gmailUser, pass: gmailPass },
        });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://folhas.eqx.pt";
        const setPasswordUrl = `${appUrl}/auth/set-password?token=${inviteToken}`;

        await transporter.sendMail({
          from: gmailUser,
          to: email,
          subject: `${APP_NAME} — Convite para a plataforma de folhas de serviço`,
          html: inviteEmailTemplate(full_name, setPasswordUrl),
        });
      } catch (mailErr: any) {
        console.error("[invite-user] email error:", mailErr?.message);
        // Non-fatal — user can still use "esqueci password" flow
      }
    }

    return NextResponse.json({ success: true, message: "Utilizador criado e convite enviado." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro interno." }, { status: 500 });
  }
}

function inviteEmailTemplate(fullName: string, link: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#F7F7F7">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:20px 0">
<tr><td align="center">
<table width="500" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
  <tr><td style="background:#fff;padding:24px 30px 16px;text-align:center;border-bottom:3px solid ${emailAccent}">
    <h2 style="margin:0;color:#1a1a1a;font-size:18px">${APP_NAME}</h2>
  </td></tr>
  <tr><td style="padding:30px">
    <h2 style="margin:0 0 10px;color:#1a1a1a;font-size:18px">Bem-vindo, ${fullName}</h2>
    <p style="margin:0 0 15px;color:#54595F;font-size:14px;line-height:1.6">
      Foi criada uma conta para si na plataforma ${APP_NAME}.<br><br>
      Clique no botão abaixo para definir a sua palavra-passe e aceder à plataforma:
    </p>
    <div style="text-align:center;margin:20px 0">
      <a href="${link}" style="display:inline-block;background:${emailAccent};color:${emailButtonText};padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Definir palavra-passe</a>
    </div>
    <p style="margin:0;color:#888;font-size:12px">
      Ou copie este link:<br>
      <a href="${link}" style="color:${emailAccent}">${link}</a>
    </p>
  </td></tr>
  <tr><td style="background:#F7F7F7;padding:15px 30px;border-top:1px solid #eee">
    <p style="margin:0;color:#aaa;font-size:11px;font-style:italic">Este link expira em 7 dias. Se não funcionar, contacte o administrador.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}
