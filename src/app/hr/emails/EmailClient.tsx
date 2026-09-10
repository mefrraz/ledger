"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import ComposerModal from "./ComposerModal";

interface Worker {
  id: string;
  full_name: string;
  email: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://folhas.eqx.pt";

const PREDEFINED = [
  {
    id: "welcome",
    title: "Boas-vindas",
    trigger: "Quando um trabalhador cria conta",
    subject: "Bem-vindo à plataforma",
    body: `Olá {name},

A sua conta na plataforma foi criada com sucesso.

Aceda à plataforma e seleccione as suas obras: ${APP_URL}`,
  },
  {
    id: "admin_notify",
    title: "Notificação de submissão",
    trigger: "Quando um trabalhador submete uma folha",
    subject: "Folha submetida",
    body: `{name} submeteu a folha da semana {week_start} a {week_end}.

Cliente: Ver na plataforma
Total de horas: Ver na plataforma

Ver notificações: ${APP_URL}/hr/notifications`,
  },
  {
    id: "weekly_reminder",
    title: "Lembrete semanal",
    trigger: "Domingo as 9h — trabalhadores sem folha na semana anterior",
    subject: "Folha de serviço pendente",
    body: `Olá {name},

A folha de serviço da semana passada ainda não foi submetida.

Por favor, submeta a sua folha o mais breve possível.`,
  },
  {
    id: "weekly_stats",
    title: "Resumo semanal",
    trigger: "Domingo as 9h — para todos os trabalhadores",
    subject: "Resumo da semana",
    body: `Olá {name},

Resumo da semana {week_start} a {week_end}:

Total de horas: {total_hours}
Folhas submetidas: {sheets_count}

Continue o bom trabalho!`,
  },
];

export default function EmailClient({ workers, obrasByWorker }: { workers: Worker[]; obrasByWorker?: Record<string, string[]> }) {
  const [showComposer, setShowComposer] = useState(false);
  const [presetSubject, setPresetSubject] = useState("");
  const [presetBody, setPresetBody] = useState("");
  const [composerMode, setComposerMode] = useState<"send" | "edit">("send");
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (id: string) => {
    const t = PREDEFINED.find(t => t.id === id);
    if (t) { setPresetSubject(t.subject); setPresetBody(t.body); setEditingId(id); setComposerMode("edit"); setShowComposer(true); }
  };

  const startSend = (id: string) => {
    const t = PREDEFINED.find(t => t.id === id);
    if (t) { setPresetSubject(t.subject); setPresetBody(t.body); setEditingId(null); setComposerMode("send"); setShowComposer(true); }
  };

  const resetComposer = () => {
    setShowComposer(false); setPresetSubject(""); setPresetBody(""); setEditingId(null); setComposerMode("send");
  };

  return (<div className="space-y-8 max-w-5xl">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold text-brand-dark">Emails</h2>
        <p className="text-sm text-brand-soft mt-0.5">Gerir templates automáticos e enviar emails manuais</p>
      </div>
      <button onClick={() => { setComposerMode("send"); setEditingId(null); setPresetSubject(""); setPresetBody(""); setShowComposer(true); }} className="btn-primary text-sm !py-2 !px-4">Novo email</button>
    </div>

    <div>
      <h3 className="text-sm font-semibold text-brand-soft tracking-wide uppercase mb-3">Emails automáticos</h3>
      <p className="text-xs text-brand-muted mb-4">Estes emails são enviados automaticamente. Pode editar o assunto e o corpo.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PREDEFINED.map(t => (
          <div key={t.id} className="card flex flex-col justify-between gap-3">
            <div>
              <p className="font-semibold text-brand-dark text-sm">{t.title}</p>
              <p className="text-xs text-brand-gold font-medium mt-0.5">{t.subject}</p>
              <p className="text-xs text-brand-muted mt-1">{t.trigger}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(t.id)} className="btn-ghost text-xs !py-1.5 flex-1">Editar</button>
              <button onClick={() => startSend(t.id)} className="btn-primary text-xs !py-1.5 flex-1">Enviar</button>
            </div>
          </div>
        ))}
      </div>
    </div>

    {showComposer && (
      <ComposerModal
        workers={workers}
        onClose={resetComposer}
        presetSubject={presetSubject}
        presetBody={presetBody}
        mode={composerMode}
        onSave={(subject, body) => {
          if (editingId) {
            localStorage.setItem(`email_template_${editingId}_subject`, subject);
            localStorage.setItem(`email_template_${editingId}_body`, body);
            toast.success("Template guardado."); resetComposer();
          }
        }}
      />
    )}
  </div>);
}
