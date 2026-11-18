import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useFormsStore, type FormRecord, type SessionRow, type SubmissionRow } from '../../store/formsStore';
import { answerLabel } from '../../lib/forms/schema';

const RANGES = [{ d: 7, l: '7 dias' }, { d: 30, l: '30 dias' }, { d: 90, l: '90 dias' }];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export const FormResults = ({ form }: { form: FormRecord }) => {
  const loadResults = useFormsStore(s => s.loadResults);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [err, setErr] = useState('');
  const [campaign, setCampaign] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadResults(form.id, new Date(Date.now() - days * 86400_000).toISOString()).then(r => {
      if (!alive) return;
      setSessions(r.sessions); setSubs(r.submissions); setErr(r.error ?? ''); setLoading(false);
    });
    return () => { alive = false; };
  }, [form.id, days, loadResults]);

  const fSessions = useMemo(() => campaign ? sessions.filter(s => (s.tracking?.utm_campaign ?? '(sem campanha)') === campaign) : sessions, [sessions, campaign]);
  const fSubs = useMemo(() => campaign ? subs.filter(s => (s.tracking?.utm_campaign ?? '(sem campanha)') === campaign) : subs, [subs, campaign]);

  const questions = form.config.questions;
  const visits = fSessions.length;
  const started = fSessions.filter(s => s.started).length;
  const completed = fSessions.filter(s => s.completed).length;
  const qualified = fSubs.filter(s => s.outcome !== 'disqualified').length;
  const disq = fSubs.filter(s => s.outcome === 'disqualified').length;

  const medianTime = useMemo(() => {
    const t = fSessions.filter(s => s.completed && s.completed_at)
      .map(s => (new Date(s.completed_at!).getTime() - new Date(s.created_at).getTime()) / 1000).sort((a, b) => a - b);
    if (!t.length) return '—';
    const m = t[Math.floor(t.length / 2)];
    return m < 60 ? `${Math.round(m)}s` : `${Math.floor(m / 60)}min ${Math.round(m % 60)}s`;
  }, [fSessions]);

  // Funil: chegou na pergunta i = respondeu i perguntas antes; respondeu = last_step > i
  const funnel = useMemo(() => questions.map((q, i) => {
    const reached = i === 0 ? started || visits : fSessions.filter(s => s.last_step >= i).length;
    const answered = fSessions.filter(s => s.last_step >= i + 1 || s.completed).length;
    return { q, reached, answered: Math.min(answered, reached), drop: Math.max(0, reached - answered) };
  }), [questions, fSessions, started, visits]);
  const maxDrop = Math.max(0, ...funnel.map(f => f.drop));
  const worst = maxDrop > 0 ? funnel.findIndex(f => f.drop === maxDrop) : -1;

  const campaigns = useMemo(() => {
    const m = new Map<string, { campaign: string; content: Set<string>; visits: number; leads: number; qualified: number }>();
    for (const s of sessions) {
      const k = s.tracking?.utm_campaign ?? '(sem campanha)';
      const e = m.get(k) ?? { campaign: k, content: new Set(), visits: 0, leads: 0, qualified: 0 };
      e.visits++; if (s.tracking?.utm_content) e.content.add(s.tracking.utm_content);
      m.set(k, e);
    }
    for (const s of subs) {
      const k = s.tracking?.utm_campaign ?? '(sem campanha)';
      const e = m.get(k) ?? { campaign: k, content: new Set(), visits: 0, leads: 0, qualified: 0 };
      e.leads++; if (s.outcome !== 'disqualified') e.qualified++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads);
  }, [sessions, subs]);

  const exportCsv = () => {
    const head = ['Data', 'Resultado', ...questions.filter(q => q.type !== 'statement').map(q => q.title), 'utm_source', 'utm_campaign', 'utm_content', 'API de Conversões'];
    const rows = fSubs.map(s => [
      new Date(s.created_at).toLocaleString('pt-BR'),
      s.outcome === 'disqualified' ? 'Desqualificado' : 'Qualificado',
      ...questions.filter(q => q.type !== 'statement').map(q => answerLabel(q, s.answers?.[q.id])),
      s.tracking?.utm_source ?? '', s.tracking?.utm_campaign ?? '', s.tracking?.utm_content ?? '', s.capi_status ?? '',
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `respostas-${form.slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(r => (
          <button key={r.d} onClick={() => setDays(r.d)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${days === r.d ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{r.l}</button>
        ))}
        <select value={campaign} onChange={e => setCampaign(e.target.value)} className="ml-auto border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white max-w-[240px]">
          <option value="">Todas as campanhas</option>
          {campaigns.map(c => <option key={c.campaign} value={c.campaign}>{c.campaign}</option>)}
        </select>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { l: 'Visitas', v: visits },
          { l: 'Começaram', v: `${started}`, s: `${pct(started, visits)}% das visitas` },
          { l: 'Enviaram', v: completed, s: `${pct(completed, visits)}% de conclusão` },
          { l: 'Qualificados', v: qualified, c: 'text-emerald-600' },
          { l: 'Desqualificados', v: disq, c: 'text-red-600' },
          { l: 'Tempo até concluir', v: medianTime, s: 'mediana' },
        ].map(k => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">{k.l}</p>
            <p className={`text-xl font-bold mt-1 ${k.c ?? 'text-slate-900'}`}>{k.v}</p>
            {k.s && <p className="text-[11px] text-slate-400">{k.s}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Funil por pergunta</h3>
        <p className="text-xs text-slate-500 mb-4">Quantos chegaram em cada pergunta e quantos responderam. Em vermelho, onde mais gente desiste.</p>
        <div className="space-y-2.5">
          {funnel.map(({ q, reached, answered, drop }, i) => (
            <div key={q.id}>
              <div className="flex items-center justify-between text-xs mb-1 gap-2">
                <span className="text-slate-700 truncate"><b className="text-slate-400 mr-1">{i + 1}</b>{q.title || 'Sem título'}</span>
                <span className={`whitespace-nowrap ${i === worst ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                  {answered}/{reached} · {pct(answered, reached)}%{drop > 0 ? ` · −${drop}` : ''}
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${i === worst ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct(answered, Math.max(1, visits))}%` }} />
              </div>
            </div>
          ))}
          {funnel.length === 0 && <p className="text-sm text-slate-400">Sem perguntas.</p>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Leads por campanha (UTM)</h3>
        <table className="w-full text-sm min-w-[520px]">
          <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100">
            <th className="py-2 pr-3">Campanha</th><th className="py-2 pr-3">Anúncios</th><th className="py-2 pr-3 text-right">Visitas</th><th className="py-2 pr-3 text-right">Leads</th><th className="py-2 text-right">Qualificados</th>
          </tr></thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.campaign} className="border-b border-slate-50">
                <td className="py-2 pr-3 font-medium text-slate-800 break-all">{c.campaign}</td>
                <td className="py-2 pr-3 text-slate-500 text-xs break-all">{[...c.content].slice(0, 3).join(', ') || '—'}</td>
                <td className="py-2 pr-3 text-right">{c.visits}</td>
                <td className="py-2 pr-3 text-right">{c.leads}</td>
                <td className="py-2 text-right text-emerald-600 font-semibold">{c.qualified}</td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">Sem dados no período.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">Respostas ({fSubs.length})</h3>
          <button onClick={exportCsv} disabled={!fSubs.length} className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
            <Download className="w-4 h-4" />CSV
          </button>
        </div>
        <div className="space-y-2">
          {fSubs.slice(0, 50).map(s => (
            <details key={s.id} className="border border-slate-100 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 text-xs">{new Date(s.created_at).toLocaleString('pt-BR')}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.outcome === 'disqualified' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {s.outcome === 'disqualified' ? 'Desqualificado' : 'Qualificado'}
                </span>
                {s.tracking?.utm_campaign && <span className="text-[11px] text-slate-500">📣 {s.tracking.utm_campaign}</span>}
                {s.capi_status && <span className={`text-[11px] ${s.capi_status === 'enviado' ? 'text-blue-600' : 'text-amber-700'}`}>API: {s.capi_status.slice(0, 60)}</span>}
              </summary>
              <div className="px-3 pb-3 space-y-1 text-sm">
                {questions.filter(q => q.type !== 'statement' && s.answers?.[q.id] != null).map(q => (
                  <p key={q.id}><span className="text-slate-500">{q.title}:</span> <span className="text-slate-900">{answerLabel(q, s.answers[q.id])}</span></p>
                ))}
              </div>
            </details>
          ))}
          {fSubs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nenhuma resposta no período.</p>}
        </div>
      </div>
    </div>
  );
};
