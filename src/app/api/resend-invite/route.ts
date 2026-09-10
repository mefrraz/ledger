import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import crypto from "crypto";
import nodemailer from "nodemailer";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Folha de Serviço";
const emailAccent = process.env.NEXT_PUBLIC_EMAIL_ACCENT || process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#F1C411";
const emailButtonText = process.env.NEXT_PUBLIC_EMAIL_BUTTON_TEXT || "#1a1a1a";

export async function POST(request: Request) {
  try {
    // Verify admin
    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { data: profile } = await serverClient.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || (profile.role !== "admin" && profile.role !== "hr")) {
      return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: "userId obrigatório." }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user profile
    const { data: targetProfile } = await supabase.from("profiles").select("full_name, email").eq("id", userId).single();
    if (!targetProfile || !targetProfile.email) {
      return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
    }

    // Check if already onboarded
    const { data: onboarded } = await supabase.from("profiles").select("onboarded").eq("id", userId).single();
    if (onboarded?.onboarded) {
      return NextResponse.json({ error: "Utilizador já ativou a conta." }, { status: 400 });
    }

    // Generate new token
    const inviteToken = crypto.randomBytes(32).toString("hex");

    const { error: tokenError } = await supabase.from("invite_tokens").insert({
      email: targetProfile.email,
      full_name: targetProfile.full_name,
      token: inviteToken,
      created_by: user.id,
    });

    if (tokenError) {
      return NextResponse.json({ error: tokenError.message }, { status: 500 });
    }

    // Send email
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailUser && gmailPass) {
      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://folhas.eqx.pt";
      const setPasswordUrl = `${appUrl}/auth/set-password?token=${inviteToken}`;

      await transporter.sendMail({
        from: gmailUser,
        to: targetProfile.email,
        subject: `${APP_NAME} — Convite para a plataforma (reenvio)`,
        html: inviteEmailTemplate(targetProfile.full_name, setPasswordUrl),
      });
    }

    return NextResponse.json({ success: true, message: "Convite reenviado." });
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
      O administrador reenviou o seu convite para a plataforma ${APP_NAME}.<br><br>
      Clique no botão abaixo para definir a sua palavra-passe:
    </p>
    <div style="text-align:center;margin:20px 0">
      <a href="${link}" style="display:inline-block;background:${emailAccent};color:${emailButtonText};padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Definir palavra-passe</a>
    </div>
    <p style="margin:0;color:#888;font-size:12px">
      Ou copie este link:<br><a href="${link}" style="color:${emailAccent}">${link}</a>
    </p>
  </td></tr>
  <tr><td style="background:#F7F7F7;padding:15px 30px;border-top:1px solid #eee">
    <p style="margin:0;color:#aaa;font-size:11px;font-style:italic">Este link expira em 7 dias.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}
