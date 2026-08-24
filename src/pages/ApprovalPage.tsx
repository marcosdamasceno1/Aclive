import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getApproval, submitApproval, type PublicApproval } from '../lib/approvalPublic';
import { drivePreviewUrl } from '../lib/driveEmbed';
import type { ApprovalStatus } from '../types';
import { CheckCircle2, MessageSquareWarning, Loader2, ExternalLink, PartyPopper } from 'lucide-react';

const Logo = () => (
  <svg width="150" viewBox="0 0 490 100" xmlns="http://www.w3.org/2000/svg" aria-label="Growth Expert">
    <defs><linearGradient id="ge" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2563EB" /><stop offset="1" stopColor="#38BDF8" /></linearGradient></defs>
    <g transform="translate(4,8) scale(0.86)" fill="none">
      <path d="M74 34 A32 32 0 1 0 74 66 L74 51 L60 51" stroke="url(#ge)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 64 L50 40" stroke="#1D4ED8" strokeWidth="8" strokeLinecap="round" />
      <path d="M39 50 L50 39 L61 50" stroke="#1D4ED8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <text x="100" y="66" fontFamily="Inter,system-ui,sans-serif" fontSize="46" fontWeight="700" fill="white">Growth</text>
    <text x="320" y="66" fontFamily="Inter,system-ui,sans-serif" fontSize="46" fontWeight="600" fill="#2563EB">Expert</text>
  </svg>
);

const ChoiceBtn = ({ active, tone, onClick, children }: { active: boolean; tone: 'ok' | 'warn'; onClick: () => void; children: React.ReactNode }) => {
  const base = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-colors';
  const on = tone === 'ok' ? 'bg-green-600 border-green-500 text-white' : 'bg-amber-600 border-amber-500 text-white';
  const off = 'bg-transparent border-white/[0.12] text-slate-300 hover:border-white/30';
  return <button onClick={onClick} className={`${base} ${active ? on : off}`}>{children}</button>;
};

export const ApprovalPage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<PublicApproval | null>(null);

  const [videoDecision, setVideoDecision] = useState<ApprovalStatus | null>(null);
  const [videoObs, setVideoObs] = useState('');
  const [captionChoice, setCaptionChoice] = useState<string>('');
  const [captionDecision, setCaptionDecision] = useState<ApprovalStatus | null>(null);
  const [captionObs, setCaptionObs] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError('Link inválido.'); setLoading(false); return; }
    let alive = true;
    getApproval(token).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setError(error || 'Não encontrado.'); setLoading(false); return; }
      setData(data);
      // pré-preenche com a resposta anterior (se houver)
      if (data.videoStatus !== 'pending') { setVideoDecision(data.videoStatus); setVideoObs(data.videoFeedback || ''); }
      if (data.captionStatus !== 'pending') { setCaptionDecision(data.captionStatus); setCaptionObs(data.captionFeedback || ''); }
      if (data.captionChoice) setCaptionChoice(data.captionChoice);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  const handleSubmit = async () => {
    setSubmitError('');
    if (!videoDecision) { setSubmitError('Escolha se aprova o vídeo ou pede alteração.'); return; }
    if (!captionDecision) { setSubmitError('Escolha se aprova a legenda ou pede alteração.'); return; }
    if (captionDecision === 'approved' && (data?.captions?.length ?? 0) > 0 && !captionChoice) {
      setSubmitError('Selecione qual legenda você aprova.'); return;
    }
    setSubmitting(true);
    const err = await submitApproval(token!, {
      videoStatus: videoDecision,
      videoFeedback: videoObs.trim() || undefined,
      captionStatus: captionDecision,
      captionChoice: captionDecision === 'approved' ? captionChoice : undefined,
      captionFeedback: captionObs.trim() || undefined,
    });
    setSubmitting(false);
    if (err) { setSubmitError(err); return; }
    setDone(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const preview = drivePreviewUrl(data?.videoUrl);

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <header className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between">
        <Logo />
        {data?.agencyName && <span className="text-sm text-slate-400 font-medium truncate ml-3">{data.agencyName}</span>}
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin" /> Carregando…
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-24">
            <p className="text-lg font-semibold text-slate-200">{error}</p>
            <p className="text-sm text-slate-500 mt-2">Verifique o link com a agência.</p>
          </div>
        )}

        {!loading && !error && data && done && (
          <div className="text-center py-20">
            <PartyPopper className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Resposta enviada!</h1>
            <p className="text-slate-400 mt-2">Obrigado. A agência já foi avisada e cuidará do próximo passo.</p>
          </div>
        )}

        {!loading && !error && data && !done && (
          <div className="space-y-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">Aprovação</p>
              <h1 className="text-2xl font-bold">{data.title || 'Revisão de conteúdo'}</h1>
              <p className="text-sm text-slate-400 mt-1">Revise o vídeo e a legenda abaixo e envie sua resposta.</p>
            </div>

            {/* Vídeo */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-200">🎬 Vídeo</h2>
              <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black aspect-video">
                {preview
                  ? <iframe src={preview} className="w-full h-full" allow="autoplay" allowFullScreen title="Vídeo" />
                  : <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">Vídeo indisponível</div>}
              </div>
              {data.videoUrl && (
                <a href={data.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
                  <ExternalLink className="w-3 h-3" /> Abrir no Google Drive
                </a>
              )}
              <div className="flex gap-2">
                <ChoiceBtn active={videoDecision === 'approved'} tone="ok" onClick={() => setVideoDecision('approved')}>
                  <CheckCircle2 className="w-4 h-4" /> Aprovar vídeo
                </ChoiceBtn>
                <ChoiceBtn active={videoDecision === 'changes'} tone="warn" onClick={() => setVideoDecision('changes')}>
                  <MessageSquareWarning className="w-4 h-4" /> Solicitar alteração
                </ChoiceBtn>
              </div>
              <textarea value={videoObs} onChange={e => setVideoObs(e.target.value)} rows={2}
                placeholder="Observações sobre o vídeo (opcional)"
                className="w-full bg-[#161b22] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </section>

            {/* Legenda */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-200">📝 Legenda</h2>
              <p className="text-xs text-slate-500">Escolha a legenda que você prefere:</p>
              <div className="space-y-2">
                {data.captions.map((c, i) => (
                  <button key={c.id} onClick={() => setCaptionChoice(c.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${captionChoice === c.id ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.08] bg-[#161b22] hover:border-white/20'}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${captionChoice === c.id ? 'border-blue-500 bg-blue-500' : 'border-slate-500'}`}>
                        {captionChoice === c.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500">Opção {i + 1}</span>
                        <p className="text-sm text-slate-200 whitespace-pre-wrap">{c.text}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <ChoiceBtn active={captionDecision === 'approved'} tone="ok" onClick={() => setCaptionDecision('approved')}>
                  <CheckCircle2 className="w-4 h-4" /> Aprovar legenda
                </ChoiceBtn>
                <ChoiceBtn active={captionDecision === 'changes'} tone="warn" onClick={() => setCaptionDecision('changes')}>
                  <MessageSquareWarning className="w-4 h-4" /> Solicitar alteração
                </ChoiceBtn>
              </div>
              <textarea value={captionObs} onChange={e => setCaptionObs(e.target.value)} rows={2}
                placeholder="Observações sobre a legenda (opcional)"
                className="w-full bg-[#161b22] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </section>

            {submitError && <p className="text-sm text-red-400">{submitError}</p>}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3.5 rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando…</> : 'Enviar resposta'}
            </button>
            <p className="text-center text-[11px] text-slate-600">Você não precisa de conta. Sua resposta vai direto para a agência.</p>
          </div>
        )}
      </main>
    </div>
  );
};
