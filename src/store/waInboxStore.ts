import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseData as supabase } from '../lib/supabase';
import { fromDb } from '../lib/dbMapper';
import type { WaChat, WaMessage } from '../types';
import { getCompanyId, companyRow, companyUpdate, companyFetchAll, assertCompanyData } from '../lib/companyIsolation';
import { scheduleInitRetry } from '../lib/initRetry';
import { waSend } from '../lib/waGateway';

interface WaInboxState {
  chats: WaChat[];
  messages: WaMessage[];
  loading: boolean;
  dbError: string | null;
  realtimeUp: boolean;
  init: () => Promise<void>;
  teardown: () => void;
  sendText: (chatKey: string, text: string) => Promise<string | null>;
  markChatRead: (chatId: string) => void;
  startChat: (phone: string, name?: string) => WaChat | null;
  totalUnread: () => number;
}

// Canal Realtime fora do estado (não serializável / não deve causar re-render)
let channel: RealtimeChannel | null = null;

const byId = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some(x => x.id === item.id) ? list : [...list, item];

export const useWaInboxStore = create<WaInboxState>()((set, get) => ({
  chats: [],
  messages: [],
  loading: false,
  dbError: null,
  realtimeUp: false,

  init: async () => {
    const cid = getCompanyId();
    if (!cid) { set({ chats: [], messages: [], loading: false, dbError: null }); return; }
    set({ loading: true });

    const [chatsRes, msgsRes] = await Promise.all([
      companyFetchAll('wa_chats', cid, 'last_message_at', false),
      companyFetchAll('wa_messages', cid, 'sent_at', true),
    ]);

    if (chatsRes.rows === null || msgsRes.rows === null) {
      // Falha mesmo após retries — MANTÉM os dados atuais e tenta de novo em 30s.
      set({ loading: false, dbError: chatsRes.error || msgsRes.error });
      scheduleInitRetry('wa_inbox', () => useWaInboxStore.getState().init());
      return;
    }

    const chats = assertCompanyData(chatsRes.rows.map(r => fromDb<WaChat>(r)), cid, 'wa_chats');
    const messages = assertCompanyData(msgsRes.rows.map(r => fromDb<WaMessage>(r)), cid, 'wa_messages');
    set({ chats, messages, loading: false, dbError: null });

    // ── Realtime: mensagens e conversas chegam ao vivo ─────────────────────
    // Recria o canal a cada init (o token pode ter mudado); nunca duplica.
    if (channel) { supabase.removeChannel(channel); channel = null; }
    channel = supabase
      .channel(`wa-inbox-${cid}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wa_messages', filter: `company_id=eq.${cid}` },
        (payload) => {
          const msg = fromDb<WaMessage>(payload.new as Record<string, unknown>);
          set(state => ({ messages: byId(state.messages, msg) }));
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wa_messages', filter: `company_id=eq.${cid}` },
        (payload) => {
          const msg = fromDb<WaMessage>(payload.new as Record<string, unknown>);
          set(state => ({ messages: state.messages.map(m => m.id === msg.id ? msg : m) }));
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'wa_chats', filter: `company_id=eq.${cid}` },
        (payload) => {
          const chat = fromDb<WaChat>(payload.new as Record<string, unknown>);
          if (!chat?.id) return;
          set(state => ({
            chats: state.chats.some(c => c.id === chat.id)
              ? state.chats.map(c => c.id === chat.id ? chat : c)
              : [chat, ...state.chats],
          }));
        })
      .subscribe((status) => {
        set({ realtimeUp: status === 'SUBSCRIBED' });
      });
  },

  teardown: () => {
    if (channel) { supabase.removeChannel(channel); channel = null; }
    set({ realtimeUp: false });
  },

  // Envio otimista: grava no banco (aparece para todos os atendentes via
  // Realtime), envia pelo provider, atualiza status. Falha NUNCA trava a UI.
  sendText: async (chatKey, text) => {
    const cid = getCompanyId();
    const trimmed = text.trim();
    if (!cid || !trimmed) return 'mensagem vazia';

    const now = new Date().toISOString();
    const msg: WaMessage = {
      id: uuidv4(),
      chatKey,
      direction: 'out',
      body: trimmed,
      msgType: 'text',
      status: 'sending',
      sentAt: now,
    };
    set(state => ({ messages: byId(state.messages, msg) }));

    // Persiste a mensagem (RLS garante isolamento)
    supabase.from('wa_messages').insert(companyRow({
      id: msg.id, chat_key: chatKey, direction: 'out', body: trimmed,
      msg_type: 'text', status: 'sending', sent_at: now,
    }, cid)).then(({ error }) => { if (error) console.error('[wa_inbox.insert]', error.message); });

    // Atualiza a conversa localmente + no banco
    const existing = get().chats.find(c => c.chatKey === chatKey);
    if (existing) {
      const patch = { lastMessage: trimmed.slice(0, 200), lastMessageAt: now, lastDirection: 'out' as const };
      set(state => ({ chats: state.chats.map(c => c.chatKey === chatKey ? { ...c, ...patch } : c) }));
      companyUpdate('wa_chats', existing.id, {
        last_message: trimmed.slice(0, 200), last_message_at: now, last_direction: 'out',
      }, cid).then(({ error }) => { if (error) console.error('[wa_inbox.chat]', error.message); });
    }

    // Envia pelo gateway central do WAHA (isolado por company_id no servidor)
    const { providerMessageId, error } = await waSend(chatKey, trimmed);
    const newStatus = error ? 'error' : 'sent';

    set(state => ({
      messages: state.messages.map(m =>
        m.id === msg.id ? { ...m, status: newStatus, provider: 'waha', providerMessageId: providerMessageId ?? undefined } : m),
    }));
    companyUpdate('wa_messages', msg.id, {
      status: newStatus, provider: 'waha', provider_message_id: providerMessageId,
    }, cid).then(({ error: e }) => { if (e) console.error('[wa_inbox.update]', e.message); });

    return error;
  },

  markChatRead: (chatId) => {
    const cid = getCompanyId();
    const chat = get().chats.find(c => c.id === chatId);
    if (!cid || !chat || chat.unreadCount === 0) return;
    set(state => ({ chats: state.chats.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c) }));
    companyUpdate('wa_chats', chatId, { unread_count: 0 }, cid)
      .then(({ error }) => { if (error) console.error('[wa_inbox.read]', error.message); });
  },

  // Inicia conversa nova por telefone (a agência aborda primeiro)
  startChat: (phone, name) => {
    const cid = getCompanyId();
    const digits = phone.replace(/\D/g, '');
    if (!cid || digits.length < 8) return null;
    const chatKey = digits.startsWith('55') || digits.length > 11 ? digits : '55' + digits;

    const found = get().chats.find(c => c.chatKey === chatKey);
    if (found) return found;

    const chat: WaChat = {
      id: uuidv4(), chatKey, name: name?.trim() || undefined,
      unreadCount: 0, createdAt: new Date().toISOString(),
    };
    set(state => ({ chats: [chat, ...state.chats] }));
    supabase.from('wa_chats').insert(companyRow({
      id: chat.id, chat_key: chatKey, name: chat.name ?? null, unread_count: 0,
    }, cid)).then(({ error }) => { if (error) console.error('[wa_inbox.start]', error.message); });
    return chat;
  },

  totalUnread: () => get().chats.reduce((s, c) => s + (c.unreadCount || 0), 0),
}));
