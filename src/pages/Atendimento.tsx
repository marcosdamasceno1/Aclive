import { useState, useMemo, useEffect, useRef } from 'react';
import { useWaInboxStore } from '../store/waInboxStore';
import { useCompanySettingsStore } from '../store/companySettingsStore';
import { getWahaSessionStatus, isMetaWindowOpen } from '../lib/waInboxProvider';
import type { WaChat } from '../types';
import {
  MessageCircle, Search, Send, Plus, X, AlertTriangle, ChevronLeft, RefreshCw, Clock,
} from 'lucide-react';

const fmtTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const fmtPhone = (digits: string): string => {
  const d = digits.replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${digits}`;
};

export const Atendimento = () => {
  const { chats, messages, dbError, realtimeUp, init, sendText, markChatRead, startChat } = useWaInboxStore();
  const { whatsappProvider } = useCompanySettingsStore();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [wahaStatus, setWahaStatus] = useState<string>('WORKING');
  const threadRef = useRef<HTMLDivElement>(null);

  // Saúde da sessão WAHA (banner quando não está WORKING)
  useEffect(() => {
    if (whatsappProvider !== 'waha') return;
    let alive = true;
    const check = async () => {
      const { status } = await getWahaSessionStatus();
      if (alive) setWahaStatus(status);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [whatsappProvider]);

  // Fallback do Realtime: se o canal cair, ressincroniza a cada 60s
  useEffect(() => {
    if (realtimeUp) return;
    const id = setInterval(() => { init(); }, 60_000);
    return () => clearInterval(id);
  }, [realtimeUp, init]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...chats].sort((a, b) =>
      new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime());
    if (!q) return sorted;
    return sorted.filter(c =>
      (c.name || '').toLowerCase().includes(q) || c.chatKey.includes(q.replace(/\D/g, '') || q));
  }, [chats, search]);

  const selectedChat = chats.find(c => c.chatKey === selectedKey) || null;
  const thread = useMemo(
    () => messages
      .filter(m => m.chatKey === selectedKey)
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
    [messages, selectedKey],
  );

  // Auto-scroll para a última mensagem
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [thread.length, selectedKey]);

  // Janela de 24h (só relevante na Meta)
  const metaWindowOpen = whatsappProvider !== 'meta' || isMetaWindowOpen(selectedChat?.lastInboundAt);

  const openChat = (c: WaChat) => {
    setSelectedKey(c.chatKey);
    setSendError(null);
    markChatRead(c.id);
  };

  const handleSend = async () => {
    if (!selectedKey || !draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    const text = draft;
    setDraft('');
    const err = await sendText(selectedKey, text);
    if (err) { setSendError(err); }
    setSending(false);
  };

  const handleStartChat = () => {
    const chat = startChat(newPhone, newName);
    if (chat) {
      setShowNew(false);
      setNewPhone('');
      setNewName('');
      openChat(chat);
    }
  };

  const statusIcon: Record<string, string> = {
    sending: '🕓', sent: '✓', delivered: '✓✓', read: '✓✓', error: '⚠', received: '',
  };

  return (
    <div className="flex flex-col h-full -mx-6 -mt-6">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.05] bg-[#0d1117] flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-100 leading-none">Atendimento</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            WhatsApp via {whatsappProvider === 'meta' ? 'Meta (API oficial)' : 'WAHA'} · {chats.length} conversa(s)
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nova conversa
        </button>
      </div>

      {/* ── Banners de saúde ── */}
      {dbError && (
        <div className="mx-6 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Não foi possível carregar o atendimento. Verifique se a migração <strong>wa_inbox.sql</strong> foi executada no banco. O sistema tentará de novo sozinho.
          </p>
        </div>
      )}
      {whatsappProvider === 'waha' && wahaStatus !== 'WORKING' && wahaStatus !== 'NOT_CONFIGURED' && (
        <div className="mx-6 mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">
            Sessão do WAHA fora do ar (status: {wahaStatus}). Novas mensagens não chegam até reconectar — abra o painel do WAHA e escaneie o QR Code se necessário.
          </p>
        </div>
      )}
      {whatsappProvider === 'waha' && wahaStatus === 'NOT_CONFIGURED' && (
        <div className="mx-6 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            WAHA não configurado. Configure em Configurações → Integrações → WhatsApp (URL do servidor + webhook do atendimento).
          </p>
        </div>
      )}

      {/* ── Corpo: lista + thread ── */}
      <div className="flex-1 flex min-h-0">
        {/* Lista de conversas */}
        <div className={`w-full md:w-80 border-r border-white/[0.05] flex flex-col min-h-0 ${selectedKey ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 flex-shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="w-full bg-[#161b22] border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredChats.length === 0 && (
              <div className="text-center px-6 py-12">
                <MessageCircle className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Nenhuma conversa ainda.</p>
                <p className="text-xs text-slate-600 mt-1.5">
                  Configure o webhook do atendimento em Configurações → Integrações para receber mensagens aqui.
                </p>
              </div>
            )}
            {filteredChats.map(c => (
              <button
                key={c.id}
                onClick={() => openChat(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] text-left transition-colors ${
                  selectedKey === c.chatKey ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-green-600/20 border border-green-500/20 flex items-center justify-center text-green-400 text-sm font-bold flex-shrink-0">
                  {(c.name || c.chatKey).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100 truncate">{c.name || fmtPhone(c.chatKey)}</p>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">{fmtTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-slate-500 truncate">
                      {c.lastDirection === 'out' && <span className="text-slate-600">Você: </span>}
                      {c.lastMessage || fmtPhone(c.chatKey)}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="bg-green-500 text-black text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center flex-shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex-1 flex-col min-h-0 ${selectedKey ? 'flex' : 'hidden md:flex'}`}>
          {!selectedChat ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Selecione uma conversa</p>
              </div>
            </div>
          ) : (
            <>
              {/* Cabeçalho da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] flex-shrink-0">
                <button onClick={() => setSelectedKey(null)} className="md:hidden text-slate-500 hover:text-slate-300">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-green-600/20 border border-green-500/20 flex items-center justify-center text-green-400 text-sm font-bold">
                  {(selectedChat.name || selectedChat.chatKey).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{selectedChat.name || fmtPhone(selectedChat.chatKey)}</p>
                  <p className="text-[11px] text-slate-600">{fmtPhone(selectedChat.chatKey)}</p>
                </div>
                <div className="flex-1" />
                {!realtimeUp && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400" title="Tempo real indisponível — sincronizando a cada 60s">
                    <RefreshCw className="w-3 h-3" /> sync 60s
                  </span>
                )}
              </div>

              {/* Mensagens */}
              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {thread.map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      m.direction === 'out'
                        ? 'bg-green-600/25 border border-green-500/20 text-slate-100 rounded-br-md'
                        : 'bg-[#161b22] border border-white/[0.06] text-slate-200 rounded-bl-md'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10px] mt-1 text-right ${m.status === 'error' ? 'text-red-400' : m.status === 'read' ? 'text-sky-400' : 'text-slate-500'}`}>
                        {fmtTime(m.sentAt)} {m.direction === 'out' && (statusIcon[m.status] ?? '')}
                        {m.status === 'error' && ' falhou'}
                      </p>
                    </div>
                  </div>
                ))}
                {thread.length === 0 && (
                  <p className="text-center text-xs text-slate-600 py-10">Sem mensagens nesta conversa ainda.</p>
                )}
              </div>

              {/* Composer */}
              <div className="px-4 py-3 border-t border-white/[0.05] flex-shrink-0">
                {sendError && (
                  <p className="text-xs text-red-400 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {sendError}
                  </p>
                )}
                {!metaWindowOpen ? (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                    <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">
                      Janela de 24h da Meta expirada: só é possível enviar texto livre até 24h após a última mensagem do cliente.
                      Para iniciar contato, use um template aprovado pelo WhatsApp Manager.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      rows={1}
                      placeholder="Escreva uma mensagem…"
                      className="flex-1 bg-[#161b22] border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 resize-none max-h-32"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!draft.trim() || sending}
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors flex-shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Nova conversa ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-[#21262d] rounded-2xl w-full max-w-sm border border-white/[0.08] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-100">Nova conversa</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Telefone (com DDD)</label>
                <input
                  autoFocus
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  placeholder="(11) 99999-8888"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Nome (opcional)</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleStartChat(); }}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  placeholder="Nome do contato"
                />
              </div>
              {whatsappProvider === 'meta' && (
                <p className="text-[11px] text-amber-400/90">
                  Na API oficial, iniciar conversa exige template aprovado — texto livre só depois que o contato responder.
                </p>
              )}
              <button
                onClick={handleStartChat}
                disabled={newPhone.replace(/\D/g, '').length < 8}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Abrir conversa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
