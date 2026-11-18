/**
 * FormRunner — desenha o formulário de uma pergunta por tela.
 * Usado na página pública (/f/agencia/formulario) e na prévia do construtor.
 * Mantenha leve: a página pública carrega só este componente + schema.ts.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Answers, FormConfig, Outcome, Question } from '../../lib/forms/schema';
import {
  COUNTRIES, computeOutcome, disqualifyingOption, fontFamily, isChoice,
  maskPhoneBR, onlyDigits, safeUrl, validateAnswer,
} from '../../lib/forms/schema';

type Screen = { kind: 'welcome' } | { kind: 'question'; index: number } | { kind: 'ending'; endingId: string };

export interface FormRunnerProps {
  config: FormConfig;
  mode: 'live' | 'preview';
  /** Prévia: abre direto nesta pergunta (-1 = abertura, 'end:<id>' = tela de obrigado) */
  previewTarget?: number | string;
  onStart?: () => void;
  onStep?: (answeredCount: number) => void;
  onSubmit?: (answers: Answers, outcome: Outcome, honeypot: string) => Promise<{ error?: string }>;
  /** Altura fixa (prévia dentro do celular) em vez de tela cheia */
  embedded?: boolean;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const FormRunner = ({ config, mode, previewTarget, onStart, onStep, onSubmit, embedded }: FormRunnerProps) => {
  const questions = config.questions;
  const initial: Screen = config.welcome.enabled ? { kind: 'welcome' } : { kind: 'question', index: 0 };
  const [screen, setScreen] = useState<Screen>(initial);
  const [answers, setAnswersState] = useState<Answers>({});
  // Cópia sempre atual das respostas: Enter logo depois de digitar não pode
  // usar uma versão anterior (acontece com renderização assíncrona).
  const answersRef = useRef<Answers>({});
  const setAnswers = (v: Answers | ((a: Answers) => Answers)) => {
    const nextVal = typeof v === 'function' ? v(answersRef.current) : v;
    answersRef.current = nextVal;
    setAnswersState(nextVal);
  };
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [country, setCountry] = useState('55');
  const [phoneMasked, setPhoneMasked] = useState('');
  const honeypot = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const { theme } = config;

  // Prévia do construtor: pula para a tela selecionada.
  useEffect(() => {
    if (mode !== 'preview' || previewTarget === undefined) return;
    setError(null);
    if (typeof previewTarget === 'string' && previewTarget.startsWith('end:')) {
      setScreen({ kind: 'ending', endingId: previewTarget.slice(4) });
    } else if (previewTarget === -1) {
      setScreen(config.welcome.enabled ? { kind: 'welcome' } : { kind: 'question', index: 0 });
    } else if (typeof previewTarget === 'number' && previewTarget < questions.length) {
      setScreen({ kind: 'question', index: previewTarget });
    }
  }, [previewTarget, mode, questions.length, config.welcome.enabled]);

  const current: Question | null = screen.kind === 'question' ? questions[screen.index] ?? null : null;

  useEffect(() => {
    if (current?.type === 'phone') setPhoneMasked('');
    if (current && !isChoice(current.type) && current.type !== 'statement' && mode === 'live') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [current, mode]);

  const setAnswer = (q: Question, value: string | string[]) => {
    setError(null);
    setAnswers(a => ({ ...a, [q.id]: value }));
  };

  const markStarted = () => {
    if (!started.current) { started.current = true; onStart?.(); }
  };

  const finish = async (final: Answers) => {
    const outcome = computeOutcome(config, final);
    if (mode === 'preview' || !onSubmit) {
      setScreen({ kind: 'ending', endingId: outcome.endingId });
      return;
    }
    setSubmitting(true);
    const res = await onSubmit(final, outcome, honeypot.current?.value ?? '');
    setSubmitting(false);
    if (res.error) { setError(res.error); return; }
    setScreen({ kind: 'ending', endingId: outcome.endingId });
  };

  const next = (override?: Answers) => {
    if (screen.kind === 'welcome') { setScreen({ kind: 'question', index: 0 }); return; }
    if (screen.kind !== 'question' || !current) return;
    const final = override ?? answersRef.current;
    const err = validateAnswer(current, final[current.id]);
    if (err) { setError(err); return; }
    markStarted();
    onStep?.(screen.index + 1);
    if (disqualifyingOption(current, final[current.id]) || screen.index >= questions.length - 1) {
      void finish(final);
      return;
    }
    setScreen({ kind: 'question', index: screen.index + 1 });
  };

  const back = () => {
    setError(null);
    if (screen.kind === 'question' && screen.index > 0) setScreen({ kind: 'question', index: screen.index - 1 });
    else if (screen.kind === 'question' && config.welcome.enabled) setScreen({ kind: 'welcome' });
  };

  const pickOption = (q: Question, optionId: string) => {
    if (q.type === 'multi_choice') {
      const cur = answersRef.current;
      const prev = Array.isArray(cur[q.id]) ? cur[q.id] as string[] : [];
      setAnswer(q, prev.includes(optionId) ? prev.filter(x => x !== optionId) : [...prev, optionId]);
      return;
    }
    const updated = { ...answersRef.current, [q.id]: optionId };
    setAnswers(updated);
    setError(null);
    setTimeout(() => next(updated), 220);
  };

  // Teclado: Enter continua; letras escolhem opções. O ouvinte é registrado
  // uma vez e sempre lê o estado mais recente (sem versão antiga presa).
  const latest = useRef({ next, pickOption, current, screen, submitting });
  useLayoutEffect(() => { latest.current = { next, pickOption, current, screen, submitting }; });
  useEffect(() => {
    if (mode !== 'live') return;
    const onKey = (e: KeyboardEvent) => {
      const L = latest.current;
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox');
      if (e.key === 'Enter' && !e.shiftKey && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (L.screen.kind !== 'ending' && !L.submitting) L.next();
        return;
      }
      if (typing || !L.current || !isChoice(L.current.type)) return;
      const idx = LETTERS.indexOf(e.key.toUpperCase());
      const opt = L.current.options?.[idx];
      if (opt) L.pickOption(L.current, opt.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const ending = screen.kind === 'ending' ? config.endings.find(e => e.id === screen.endingId) ?? config.endings[0] : null;

  // Redirecionamento automático na tela de obrigado.
  useEffect(() => {
    if (mode !== 'live' || !ending?.autoRedirect) return;
    const url = safeUrl(ending.buttonUrl);
    if (!url) return;
    const t = setTimeout(() => { window.location.href = url; }, 3000);
    return () => clearTimeout(t);
  }, [ending, mode]);

  const progress = screen.kind === 'question' ? Math.round(((screen.index) / Math.max(1, questions.length)) * 100) : screen.kind === 'ending' ? 100 : 0;

  const bgImage = safeUrl(theme.backgroundImage);
  const logo = safeUrl(theme.logoUrl);
  const rootStyle: React.CSSProperties = {
    fontFamily: fontFamily(theme.font),
    color: theme.text,
    background: bgImage ? `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)), url("${bgImage}") center/cover` : theme.background,
  };
  const btnStyle: React.CSSProperties = { background: theme.primary, color: '#fff' };
  const muted: React.CSSProperties = { opacity: 0.65 };

  const fontLink = useMemo(() => theme.font === 'system' ? null
    : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.font)}:wght@400;600;700&display=swap`, [theme.font]);

  return (
    <div className={`${embedded ? 'h-full' : 'min-h-[100dvh]'} w-full flex flex-col relative`} style={rootStyle}>
      {fontLink && <link rel="stylesheet" href={fontLink} />}
      {/* Barra de progresso */}
      <div className="h-1 w-full bg-black/10">
        <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: theme.primary }} />
      </div>

      <div className="flex items-center justify-between px-5 pt-4 min-h-[56px]">
        {screen.kind === 'question' && (screen.index > 0 || config.welcome.enabled) ? (
          <button onClick={back} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 text-xl">←</button>
        ) : <span />}
        {logo && <img src={logo} alt="" className="h-8 max-w-[140px] object-contain" />}
        <span className="w-9" />
      </div>

      <div className={`flex-1 flex flex-col justify-center w-full max-w-xl mx-auto px-6 ${embedded ? 'py-4' : 'py-10'}`}>
        {screen.kind === 'welcome' && (
          <div className="space-y-5">
            {safeUrl(config.welcome.imageUrl) && <img src={safeUrl(config.welcome.imageUrl)} alt="" className="w-full max-h-48 object-cover rounded-2xl" />}
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight whitespace-pre-line">{config.welcome.title}</h1>
            {config.welcome.subtitle && <p className="text-base whitespace-pre-line" style={muted}>{config.welcome.subtitle}</p>}
            {config.welcome.bullets.filter(Boolean).length > 0 && (
              <ul className="space-y-2">
                {config.welcome.bullets.filter(Boolean).map((b, i) => <li key={i} className="text-base">{b}</li>)}
              </ul>
            )}
            <button onClick={() => next()} className="px-6 py-3.5 rounded-xl font-semibold text-base shadow-sm" style={btnStyle}>
              {config.welcome.buttonText || 'Começar'}
            </button>
          </div>
        )}

        {current && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: theme.primary }}>
                {screen.kind === 'question' ? `${screen.index + 1} → ` : ''}
              </p>
              <h2 className="text-xl sm:text-2xl font-bold leading-snug whitespace-pre-line">
                {current.title || 'Pergunta sem título'}{current.required && current.type !== 'statement' && <span style={{ color: theme.primary }}> *</span>}
              </h2>
              {current.description && <p className="text-sm mt-2 whitespace-pre-line" style={muted}>{current.description}</p>}
            </div>

            {(current.type === 'short_text' || current.type === 'name' || current.type === 'email' || current.type === 'number') && (
              <input
                ref={inputRef}
                type={current.type === 'email' ? 'email' : current.type === 'number' ? 'text' : 'text'}
                inputMode={current.type === 'number' ? 'decimal' : current.type === 'email' ? 'email' : 'text'}
                autoComplete={current.type === 'name' ? 'name' : current.type === 'email' ? 'email' : 'off'}
                value={String(answers[current.id] ?? '')}
                onChange={e => setAnswer(current, e.target.value)}
                placeholder={current.placeholder}
                maxLength={300}
                className="w-full bg-transparent border-0 border-b-2 text-xl py-2 focus:outline-none placeholder:opacity-40"
                style={{ borderColor: theme.primary, color: theme.text }}
              />
            )}

            {current.type === 'long_text' && (
              <textarea
                ref={inputRef}
                value={String(answers[current.id] ?? '')}
                onChange={e => setAnswer(current, e.target.value)}
                placeholder={current.placeholder}
                rows={4}
                maxLength={4000}
                className="w-full bg-transparent border-2 rounded-xl text-base p-3 focus:outline-none placeholder:opacity-40"
                style={{ borderColor: theme.primary, color: theme.text }}
              />
            )}

            {current.type === 'phone' && (
              <div className="flex items-end gap-2">
                <select
                  value={country}
                  onChange={e => { setCountry(e.target.value); const m = phoneMasked; setAnswer(current, onlyDigits(m) ? `+${e.target.value} ${m}` : ''); }}
                  className="bg-transparent border-0 border-b-2 text-lg py-2 focus:outline-none"
                  style={{ borderColor: theme.primary, color: theme.text }}
                  aria-label="País"
                >
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
                </select>
                <input
                  ref={inputRef}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phoneMasked}
                  onChange={e => {
                    const m = country === '55' ? maskPhoneBR(e.target.value) : onlyDigits(e.target.value).slice(0, 13);
                    setPhoneMasked(m);
                    setAnswer(current, onlyDigits(m) ? `+${country} ${m}` : '');
                  }}
                  placeholder={country === '55' ? '(00) 00000-0000' : 'Número'}
                  className="flex-1 min-w-0 bg-transparent border-0 border-b-2 text-xl py-2 focus:outline-none placeholder:opacity-40"
                  style={{ borderColor: theme.primary, color: theme.text }}
                />
              </div>
            )}

            {current.type === 'date' && (
              <input
                ref={inputRef}
                type="date"
                value={String(answers[current.id] ?? '')}
                onChange={e => setAnswer(current, e.target.value)}
                className="bg-transparent border-0 border-b-2 text-xl py-2 focus:outline-none"
                style={{ borderColor: theme.primary, color: theme.text }}
              />
            )}

            {(current.type === 'single_choice' || current.type === 'multi_choice') && (
              <div className="space-y-2.5">
                {(current.options ?? []).map((o, i) => {
                  const val = answers[current.id];
                  const selected = Array.isArray(val) ? val.includes(o.id) : val === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => pickOption(current, o.id)}
                      className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border-2 transition-all"
                      style={{
                        borderColor: selected ? theme.primary : 'rgba(127,127,127,.3)',
                        background: selected ? `${theme.primary}1a` : 'transparent',
                      }}
                    >
                      <span className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-sm font-bold border"
                        style={{ borderColor: theme.primary, background: selected ? theme.primary : 'transparent', color: selected ? '#fff' : theme.primary }}>
                        {LETTERS[i]}
                      </span>
                      <span className="text-base">{o.label}</span>
                    </button>
                  );
                })}
                {current.type === 'multi_choice' && <p className="text-xs" style={muted}>Escolha quantas quiser</p>}
              </div>
            )}

            {current.type === 'image_choice' && (
              <div className="grid grid-cols-2 gap-3">
                {(current.options ?? []).map((o, i) => {
                  const selected = answers[current.id] === o.id;
                  const img = safeUrl(o.imageUrl);
                  return (
                    <button
                      key={o.id}
                      onClick={() => pickOption(current, o.id)}
                      className="rounded-xl border-2 overflow-hidden text-left transition-all"
                      style={{ borderColor: selected ? theme.primary : 'rgba(127,127,127,.3)' }}
                    >
                      <div className="aspect-square bg-black/5 flex items-center justify-center">
                        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl opacity-30">🖼</span>}
                      </div>
                      <div className="px-3 py-2 text-sm flex items-center gap-2">
                        <span className="font-bold" style={{ color: theme.primary }}>{LETTERS[i]}</span>{o.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            {!(current.type === 'single_choice' || current.type === 'image_choice') && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => next()}
                  disabled={submitting}
                  className="px-6 py-3 rounded-xl font-semibold text-base shadow-sm disabled:opacity-60"
                  style={btnStyle}
                >
                  {submitting ? 'Enviando…' : screen.kind === 'question' && screen.index === questions.length - 1 ? 'Enviar' : (theme.buttonText || 'Continuar')}
                </button>
                {current.type !== 'long_text' && !embedded && <span className="text-xs hidden sm:inline" style={muted}>ou pressione <b>Enter ↵</b></span>}
              </div>
            )}

            {screen.kind === 'question' && screen.index === questions.length - 1 && config.privacyText && (
              <p className="text-xs" style={muted}>{config.privacyText}</p>
            )}
          </div>
        )}

        {screen.kind === 'question' && !current && (
          <p className="text-center" style={muted}>Adicione perguntas ao formulário.</p>
        )}

        {ending && (
          <div className="space-y-5 text-center">
            {safeUrl(ending.imageUrl) && <img src={safeUrl(ending.imageUrl)} alt="" className="w-full max-h-52 object-cover rounded-2xl" />}
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight whitespace-pre-line">{ending.title}</h2>
            {ending.text && <p className="text-base whitespace-pre-line" style={muted}>{ending.text}</p>}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {ending.whatsappNumber && onlyDigits(ending.whatsappNumber).length >= 10 && (
                <a
                  href={`https://wa.me/${onlyDigits(ending.whatsappNumber)}${ending.whatsappMessage ? `?text=${encodeURIComponent(ending.whatsappMessage)}` : ''}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl font-semibold text-base text-white" style={{ background: '#16a34a' }}
                >
                  Falar no WhatsApp
                </a>
              )}
              {safeUrl(ending.buttonUrl) && ending.buttonText && (
                <a href={safeUrl(ending.buttonUrl)} target="_blank" rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl font-semibold text-base" style={btnStyle}>
                  {ending.buttonText}
                </a>
              )}
            </div>
            {ending.autoRedirect && safeUrl(ending.buttonUrl) && <p className="text-xs" style={muted}>Redirecionando…</p>}
          </div>
        )}
      </div>

      {/* Campo isca invisível (antispam): pessoas não veem; robôs preenchem. */}
      {mode === 'live' && (
        <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
      )}
    </div>
  );
};
