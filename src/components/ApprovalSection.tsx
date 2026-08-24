import { useState } from 'react';
import { useApprovalsStore } from '../store/approvalsStore';
import { useCompanySettingsStore } from '../store/companySettingsStore';
import { driveFileId } from '../lib/driveEmbed';
import type { Approval, ApprovalStatus, CaptionOption } from '../types';
import {
  CheckCircle2, Clock, MessageSquareWarning, Copy, Plus, Trash2, Pencil, X, ExternalLink, ClipboardCheck,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const statusPill = (s: ApprovalStatus) => {
  if (s === 'approved') return { cls: 'bg-green-500/15 text-green-400 border-green-500/30', icon: CheckCircle2, label: 'Aprovado' };
  if (s === 'changes')  return { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: MessageSquareWarning, label: 'Pediu alteração' };
  return { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: Clock, label: 'Aguardando' };
};

const StatusBadge = ({ status }: { status: ApprovalStatus }) => {
  const p = statusPill(status);
  const Icon = p.icon;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${p.cls}`}><Icon className="w-3 h-3" />{p.label}</span>;
};

export const ApprovalSection = ({ demandId, demandTitle }: { demandId: string; demandTitle: string }) => {
  const { forDemand, createApproval, updateApproval, deleteApproval } = useApprovalsStore();
  const { agencyName, approvalNotifyPhone, saveApprovalDefaults } = useCompanySettingsStore();
  const existing = forDemand(demandId);

  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // form
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? '');
  const [captions, setCaptions] = useState<CaptionOption[]>(existing?.captions?.length ? existing.captions : [{ id: uuidv4(), text: '' }]);
  const [agency, setAgency] = useState(existing?.agencyName || agencyName || '');
  const [phone, setPhone] = useState(existing?.notifyPhone || approvalNotifyPhone || '');
  const [formError, setFormError] = useState('');

  const publicLink = existing ? `${window.location.origin}/aprovar/${existing.token}` : '';
  const chosenCaption = existing?.captions.find(c => c.id === existing.captionChoice);

  const startCreate = () => {
    setVideoUrl(''); setCaptions([{ id: uuidv4(), text: '' }]);
    setAgency(agencyName || ''); setPhone(approvalNotifyPhone || '');
    setFormError(''); setEditing(true);
  };
  const startEdit = () => {
    if (!existing) return;
    setVideoUrl(existing.videoUrl ?? '');
    setCaptions(existing.captions?.length ? existing.captions : [{ id: uuidv4(), text: '' }]);
    setAgency(existing.agencyName || agencyName || '');
    setPhone(existing.notifyPhone || approvalNotifyPhone || '');
    setFormError(''); setEditing(true);
  };

  const save = async () => {
    const cleanCaptions = captions.map(c => ({ ...c, text: c.text.trim() })).filter(c => c.text);
    if (!videoUrl.trim()) { setFormError('Cole o link do vídeo no Google Drive.'); return; }
    if (!driveFileId(videoUrl)) { setFormError('Link do Drive inválido. Use o link de compartilhamento do arquivo.'); return; }
    if (cleanCaptions.length === 0) { setFormError('Adicione ao menos uma opção de legenda.'); return; }

    // lembra agência + telefone para a próxima vez
    saveApprovalDefaults(agency.trim(), phone.trim());

    if (existing) {
      // nova versão no MESMO link: volta tudo para "aguardando"
      updateApproval(existing.id, {
        videoUrl: videoUrl.trim(), captions: cleanCaptions, agencyName: agency.trim() || undefined,
        notifyPhone: phone.trim() || undefined,
        videoStatus: 'pending', videoFeedback: undefined,
        captionStatus: 'pending', captionChoice: undefined, captionFeedback: undefined,
      });
    } else {
      createApproval({ demandId, title: demandTitle, videoUrl: videoUrl.trim(), captions: cleanCaptions, agencyName: agency.trim(), notifyPhone: phone.trim() });
    }
    setEditing(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicLink);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  // ── Form (criar / nova versão) ─────────────────────────────────────────────
  if (editing) {
    return (
      <div className="border border-white/[0.08] rounded-xl p-4 bg-[#161b22] space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{existing ? 'Nova versão para aprovação' : 'Criar link de aprovação'}</p>
          <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Link do vídeo (Google Drive)</label>
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/.../view"
            className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-[11px] text-slate-500 mt-1">O arquivo precisa estar como <strong>"qualquer pessoa com o link pode ver"</strong> no Drive.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Opções de legenda (o cliente escolhe uma)</label>
          <div className="space-y-2">
            {captions.map((c, i) => (
              <div key={c.id} className="flex gap-2">
                <textarea value={c.text} rows={2}
                  onChange={e => setCaptions(prev => prev.map(x => x.id === c.id ? { ...x, text: e.target.value } : x))}
                  placeholder={`Opção ${i + 1}`}
                  className="flex-1 border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                {captions.length > 1 && (
                  <button onClick={() => setCaptions(prev => prev.filter(x => x.id !== c.id))} className="text-slate-500 hover:text-red-400 self-start mt-1"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setCaptions(prev => [...prev, { id: uuidv4(), text: '' }])}
            className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold">
            <Plus className="w-3.5 h-3.5" /> Adicionar opção de legenda
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Nome da sua agência</label>
            <input value={agency} onChange={e => setAgency(e.target.value)} placeholder="Sua Agência"
              className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">WhatsApp para aviso</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 9 9999-9999"
              className="w-full border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {formError && <p className="text-xs text-red-400">{formError}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(false)} className="flex-1 border border-white/[0.08] text-slate-400 py-2 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
          <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold">
            {existing ? 'Salvar nova versão' : 'Gerar link'}
          </button>
        </div>
      </div>
    );
  }

  // ── Vazio: botão para criar ────────────────────────────────────────────────
  if (!existing) {
    return (
      <button onClick={startCreate}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-white/[0.12] text-slate-300 hover:border-white/25 hover:text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
        <ClipboardCheck className="w-4 h-4" /> Criar link de aprovação do cliente
      </button>
    );
  }

  // ── Existe: link + status + resposta do cliente ────────────────────────────
  const decided = existing.videoStatus !== 'pending' || existing.captionStatus !== 'pending';
  return (
    <div className="border border-white/[0.08] rounded-xl p-4 bg-[#161b22] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-100 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-blue-400" /> Aprovação do cliente</p>
        <div className="flex items-center gap-2">
          <button onClick={startEdit} title="Nova versão" className="text-slate-500 hover:text-blue-400 p-1"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => setConfirmDelete(true)} title="Excluir" className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Link público */}
      <div className="flex gap-2">
        <input readOnly value={publicLink} className="flex-1 bg-[#0d1117] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-slate-400 font-mono" />
        <button onClick={copyLink} className="flex items-center gap-1.5 border border-white/[0.08] text-slate-300 hover:border-white/20 px-3 rounded-lg text-xs font-semibold">
          {copied ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
        </button>
      </div>

      {/* Vídeo */}
      <div className="bg-[#0d1117] rounded-lg p-3 border border-white/[0.05]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-300">🎬 Vídeo</span>
          <StatusBadge status={existing.videoStatus} />
        </div>
        {existing.videoFeedback && (
          <p className="text-xs text-slate-400 mt-1.5"><span className="text-slate-500">Obs. do cliente:</span> {existing.videoFeedback}</p>
        )}
      </div>

      {/* Legenda */}
      <div className="bg-[#0d1117] rounded-lg p-3 border border-white/[0.05]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-300">📝 Legenda</span>
          <StatusBadge status={existing.captionStatus} />
        </div>
        {chosenCaption && (
          <p className="text-xs text-slate-300 mt-1.5 bg-white/[0.03] rounded p-2 border border-white/[0.05]">
            <span className="text-slate-500">Escolhida:</span> {chosenCaption.text}
          </p>
        )}
        {existing.captionFeedback && (
          <p className="text-xs text-slate-400 mt-1.5"><span className="text-slate-500">Obs. do cliente:</span> {existing.captionFeedback}</p>
        )}
      </div>

      <p className="text-[11px] text-slate-600">
        {decided
          ? `Cliente respondeu${existing.decidedAt ? ' em ' + new Date(existing.decidedAt).toLocaleString('pt-BR') : ''}. Envie uma nova versão se precisar de ajustes.`
          : 'Aguardando o cliente abrir o link e responder.'}
      </p>

      {confirmDelete && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          <p className="text-xs text-red-300 flex-1">Excluir esta aprovação? O link deixa de funcionar.</p>
          <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 px-2">Cancelar</button>
          <button onClick={() => { deleteApproval(existing.id); setConfirmDelete(false); }} className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg font-semibold">Excluir</button>
        </div>
      )}

      <a href={publicLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
        <ExternalLink className="w-3 h-3" /> Ver a página como o cliente vê
      </a>
    </div>
  );
};
