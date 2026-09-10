"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { formatName } from "@/lib/utils";
import { brand } from "@/lib/brand";

export default function SignupPage() {
  const [fullName,setFullName]=useState("");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [inviteCode,setInviteCode]=useState("");const [inviteId,setInviteId]=useState<string|null>(null);const [loading,setLoading]=useState(false);
  const router=useRouter();const supabase=createClient();
  const handle=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);
    // Validate invite code server-side
    const check=await fetch("/api/check-invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:inviteCode})});
    const checkData=await check.json();
    if(checkData.disabled){toast.error("O registo está desativado. Contacte o administrador para criar a sua conta.");setLoading(false);return;}
    if(!checkData.valid){toast.error(checkData.reason==="expired"?"Este convite expirou.":checkData.reason==="used"?"Este convite já foi usado.":"Código de convite inválido.");setLoading(false);return;}
    const formattedName=formatName(fullName);
    const{data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:formattedName}}});
    if(error){toast.error(error.message?.includes("already registered")?"Este email já está registado.":"Erro: "+error.message);setLoading(false);return;}
    if(!data.user){toast.error("Erro ao criar conta.");setLoading(false);return;}
    // Mark invite as used
    if(checkData.inviteId){await fetch("/api/use-invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inviteId:checkData.inviteId,userId:data.user.id})});}
    // Set profile role + approval permission from the invite
    const profileUpdate: Record<string, unknown> = { full_name: formattedName };
    if (checkData.role) profileUpdate.role = checkData.role;
    if (typeof checkData.requiresApproval === "boolean") profileUpdate.requires_approval = checkData.requiresApproval;
    await supabase.from("profiles").update(profileUpdate).eq("id", data.user.id);
    // Atribuir as obras do convite via SERVICE ROLE (evita bloqueios de RLS)
    if (checkData.inviteId) {
      const r = await fetch("/api/assign-invite-obras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteId: checkData.inviteId, userId: data.user.id }) });
      const assignData = await r.json();
      if (assignData.error) toast.error("Erro ao atribuir obras: " + assignData.error);
    }
    await supabase.from("profiles").update({ onboarded: true }).eq("id", data.user.id);
    if(data.session){toast.success("Conta criada!");router.push("/");router.refresh();}
    else{toast.success("Conta criada! Verifique o email antes de entrar.");router.push("/auth/login");}
  };

  return(<div className="flex min-h-screen items-center justify-center bg-page px-4">
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center"><Image src={brand.logoUrl} alt="logo" width={134} height={40} className="h-10 w-auto mx-auto mb-4"/><h2 className="text-lg font-semibold text-brand-dark">Criar conta</h2><p className="text-sm text-brand-soft mt-1">Registo de trabalhador</p></div>
      <form onSubmit={handle} className="card space-y-4">
        <div><label htmlFor="inviteCode" className="label-field">Código de convite</label><input id="inviteCode" type="text" required value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} className="input-field" placeholder="Código fornecido pela EQX"/></div>
        <div><label htmlFor="fullName" className="label-field">Nome completo</label><input id="fullName" type="text" required value={fullName} onChange={e=>setFullName(e.target.value)} onBlur={()=>setFullName(formatName(fullName))} className="input-field" placeholder="João Silva"/></div>
        <div><label htmlFor="email" className="label-field">Email</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="input-field" placeholder="o.seu@email.com"/></div>
        <div><label htmlFor="password" className="label-field">Password</label><input id="password" type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} className="input-field" placeholder="Mínimo 6 caracteres"/></div>
        <button type="submit" disabled={loading} className="btn-primary w-full">{loading?"A criar conta…":"Criar conta"}</button>
        <p className="text-center text-xs text-brand-muted">Já tem conta? <Link href="/auth/login" className="font-semibold text-brand-dark hover:text-brand-gold transition-colors">Entrar</Link></p>
      </form>
    </div>
  </div>);
}
