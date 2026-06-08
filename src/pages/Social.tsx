import { useState, useEffect, useMemo } from 'react';
import {
  Camera, Plus, X, Trash2, Pencil, Bell, CheckCircle,
  ChevronLeft, ChevronRight, CalendarDays, Clock, Loader2,
} from 'lucide-react';
import { useSocialStore } from '../store/socialStore';
import { useAuthStore } from '../store/authStore';
import { getZApiConfig } from '../utils/whatsapp';
import type { SocialAccount, ScheduledPost, PostStatus } from '../types';

/* ─── SQL for setup banner ─────────────────────────────────────────────────── */
const SQL_SETUP = `create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  username text not null,
  platform text not null default 'instagram',
  avatar_color text not null default 'pink',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  account_id uuid not null,
  caption text not null default '',
  hashtags text not null default '',
  image_url text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  notify_whatsapp boolean not null default false,
  notify_phone text,
  notified_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);`;

/* ─── Color helpers ─────────────────────────────────────────────────────────── */
const AVATAR_COLORS = ['pink', 'purple', 'blue', 'orange', 'green', 'yellow'] as const;
type AvatarColor = (typeof AVATAR_COLORS)[number];

const colorClasses: Record<string, { bg: string; text: string; border: string; stripe: string; pill: string }> = {
  pink:   { bg: 'bg-pink-500/20',   text: 'text-pink-400',   border: 'border-pink-500/40',   stripe: 'bg-pink-500',   pill: 'bg-pink-500/15 border-pink-500/30 text-pink-300' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40', stripe: 'bg-purple-500', pill: 'bg-purple-500/15 border-purple-500/30 text-purple-300' },
  blue:   { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/40',   stripe: 'bg-blue-500',   pill: 'bg-blue-500/15 border-blue-500/30 text-blue-300' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40', stripe: 'bg-orange-500', pill: 'bg-orange-500/15 border-orange-500/30 text-orange-300' },
  green:  { bg: 'bg-emerald-500/20',text: 'text-emerald-400',border: 'border-emerald-500/40',stripe: 'bg-emerald-500',pill: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', stripe: 'bg-yellow-500', pill: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300' },
};

const colorDotClass: Record<string, string> = {
  pink:   'bg-pink-500',
  purple: 'bg-purple-500',
  blue:   'bg-blue-500',
  orange: 'bg-orange-500',
  green:  'bg-emerald-500',
  yellow: 'bg-yellow-500',
};

const getColor = (c: string) => colorClasses[c] ?? colorClasses.blue;

/* ─── Date helpers ──────────────────────────────────────────────────────────── */
const toDateKey = (iso: string) => iso.slice(0, 10); // 'YYYY-MM-DD'

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatDateLabel = (dateKey: string): string => {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  if (dateKey === todayKey) return 'Hoje';
  if (dateKey === tomorrowKey) return 'Amanhã';
  return new Date(dateKey + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

const formatShortDay = (date: Date) =>
  date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });

/* ─── Status badge ──────────────────────────────────────────────────────────── */
const statusConfig: Record<PostStatus, { label: string; cls: string }> = {
  scheduled:  { label: 'Agendado',  cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  published:  { label: 'Publicado', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  cancelled:  { label: 'Cancelado', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

/* ─── Common input class ─────────────────────────────────────────────────────── */
const inputCls = 'w-full bg-[#21262d] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

/* ─── Modal wrapper ─────────────────────────────────────────────────────────── */
const Modal = ({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div className={`bg-[#161b22] border border-white/[0.08] rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto shadow-2xl`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

/* ─── Field ──────────────────────────────────────────────────────────────────── */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
    {children}
  </div>
);

/* ─── Manage accounts modal ─────────────────────────────────────────────────── */
interface ManageAccountsModalProps {
  onClose: () => void;
}

const ManageAccountsModal = ({ onClose }: ManageAccountsModalProps) => {
  const { accounts, addAccount, updateAccount, deleteAccount } = useSocialStore();
  const [username, setUsername] = useState('');
  const [color, setColor] = useState<AvatarColor>('pink');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = username.trim().replace(/^@/, '');
    if (!trimmed) return;
    setAdding(true);
    await addAccount({ username: trimmed, platform: 'instagram', avatarColor: color, active: true });
    setUsername('');
    setColor('pink');
    setAdding(false);
  };

  return (
    <Modal title="Gerenciar Contas" onClose={onClose}>
      {/* Existing accounts */}
      {accounts.length > 0 && (
        <div className="mb-6 space-y-2">
          {accounts.map(acc => {
            const c = getColor(acc.avatarColor);
            return (
              <div key={acc.id} className="flex items-center gap-3 p-3 bg-[#21262d] rounded-lg border border-white/[0.05]">
                <div className={`w-8 h-8 rounded-full ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <Camera className={`w-4 h-4 ${c.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">@{acc.username}</p>
                  <span className="text-xs text-slate-500 capitalize">{acc.platform}</span>
                </div>
                {/* Active toggle */}
                <button
                  onClick={() => updateAccount(acc.id, { active: !acc.active })}
                  title={acc.active ? 'Desativar' : 'Ativar'}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors ${
                    acc.active
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/25'
                  }`}
                >
                  {acc.active ? 'Ativa' : 'Inativa'}
                </button>
                <button
                  onClick={() => deleteAccount(acc.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new */}
      <div className="border-t border-white/[0.08] pt-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Nova Conta</p>
        <Field label="Username (Camera)">
          <div className="flex">
            <span className="inline-flex items-center px-3 bg-[#21262d] border border-r-0 border-white/[0.08] rounded-l-lg text-slate-400 text-sm">@</span>
            <input
              className={`${inputCls} rounded-l-none`}
              placeholder="seuusername"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
        </Field>
        <Field label="Cor">
          <div className="flex gap-2">
            {AVATAR_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${colorDotClass[c]} ${color === c ? 'ring-2 ring-offset-2 ring-offset-[#161b22] ring-white scale-110' : 'hover:scale-110'}`}
              />
            ))}
          </div>
        </Field>
        <button
          onClick={handleAdd}
          disabled={adding || !username.trim()}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Adicionar Conta
        </button>
      </div>
    </Modal>
  );
};

/* ─── Post form modal ────────────────────────────────────────────────────────── */
interface PostFormModalProps {
  post?: ScheduledPost | null;
  onClose: () => void;
}

const PostFormModal = ({ post, onClose }: PostFormModalProps) => {
  const { accounts, addPost, updatePost } = useSocialStore();
  const { currentUser } = useAuthStore();

  const activeAccounts = accounts.filter(a => a.active);

  const [form, setForm] = useState({
    accountId: post?.accountId ?? (activeAccounts[0]?.id ?? ''),
    caption: post?.caption ?? '',
    hashtags: post?.hashtags ?? '',
    imageUrl: post?.imageUrl ?? '',
    date: post?.scheduledAt ? post.scheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    time: post?.scheduledAt ? post.scheduledAt.slice(11, 16) : '09:00',
    notifyWhatsapp: post?.notifyWhatsapp ?? false,
    notifyPhone: post?.notifyPhone ?? '',
  });

  const setField = <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.date || !form.time) return;
    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();

    const data = {
      accountId: form.accountId,
      caption: form.caption,
      hashtags: form.hashtags,
      imageUrl: form.imageUrl || undefined,
      scheduledAt,
      status: (post?.status ?? 'scheduled') as PostStatus,
      notifyWhatsapp: form.notifyWhatsapp,
      notifyPhone: form.notifyPhone || undefined,
      notifiedAt: post?.notifiedAt,
      createdBy: currentUser?.name ?? 'Sistema',
    };

    if (post) {
      updatePost(post.id, data);
    } else {
      addPost(data);
    }
    onClose();
  };

  const captionLen = form.caption.length;

  return (
    <Modal title={post ? 'Editar Post' : 'Novo Post'} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <Field label="Conta">
          <select className={inputCls} value={form.accountId} onChange={setField('accountId')} required>
            <option value="">Selecione uma conta...</option>
            {activeAccounts.map(a => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
        </Field>

        <Field label={`Legenda (${captionLen}/2200)`}>
          <textarea
            className={`${inputCls} resize-none`}
            rows={4}
            maxLength={2200}
            placeholder="Escreva a legenda do post..."
            value={form.caption}
            onChange={setField('caption')}
          />
        </Field>

        <Field label="Hashtags">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="#tag1 #tag2 #tag3"
            value={form.hashtags}
            onChange={setField('hashtags')}
          />
          <p className="text-xs text-slate-500 mt-1">Separe por espaços: #tag1 #tag2</p>
        </Field>

        <Field label="URL da imagem (opcional)">
          <input
            type="url"
            className={inputCls}
            placeholder="https://..."
            value={form.imageUrl}
            onChange={setField('imageUrl')}
          />
          {form.imageUrl && (
            <div className="mt-2">
              <img
                src={form.imageUrl}
                alt="Preview"
                className="h-20 w-20 object-cover rounded-lg border border-white/[0.08]"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Data">
            <input type="date" className={inputCls} value={form.date} onChange={setField('date')} required />
          </Field>
          <Field label="Hora">
            <input type="time" className={inputCls} value={form.time} onChange={setField('time')} required />
          </Field>
        </div>

        {/* WhatsApp notify */}
        <div className="mb-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setForm(f => ({ ...f, notifyWhatsapp: !f.notifyWhatsapp }))}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.notifyWhatsapp ? 'bg-blue-600' : 'bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.notifyWhatsapp ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-slate-300">Notificar via WhatsApp</span>
          </label>
        </div>

        {form.notifyWhatsapp && (
          <Field label="Telefone para notificação">
            <input
              type="tel"
              className={inputCls}
              placeholder="(11) 99999-9999"
              value={form.notifyPhone}
              onChange={setField('notifyPhone')}
            />
          </Field>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
            {post ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {post ? 'Salvar alterações' : 'Criar post'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/* ─── Post card ──────────────────────────────────────────────────────────────── */
interface PostCardProps {
  post: ScheduledPost;
  account?: SocialAccount;
  onEdit: () => void;
  onDelete: () => void;
  onMarkPublished: () => void;
}

const PostCard = ({ post, account, onEdit, onDelete, onMarkPublished }: PostCardProps) => {
  const c = getColor(account?.avatarColor ?? 'blue');
  const status = statusConfig[post.status];
  const tags = post.hashtags.split(' ').filter(Boolean);

  return (
    <div className="bg-[#161b22] border border-white/[0.08] rounded-xl overflow-hidden flex">
      {/* Color stripe */}
      <div className={`w-1 flex-shrink-0 ${c.stripe}`} />

      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Camera className={`w-4 h-4 flex-shrink-0 ${c.text}`} />
            <span className={`text-sm font-medium ${c.text} truncate`}>@{account?.username ?? 'conta'}</span>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="w-3 h-3" />
              {formatTime(post.scheduledAt)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {post.notifyWhatsapp && <Bell className="w-3.5 h-3.5 text-emerald-400" />}
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.cls}`}>{status.label}</span>
          </div>
        </div>

        {post.caption && (
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            {post.caption.length > 80 ? post.caption.slice(0, 80) + '...' : post.caption}
          </p>
        )}

        {tags.length > 0 && (
          <p className="text-xs text-slate-500 mt-1">{tags.slice(0, 3).join(' ')}{tags.length > 3 ? ` +${tags.length - 3}` : ''}</p>
        )}

        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt="thumb"
            className="mt-2 h-12 w-12 object-cover rounded-lg border border-white/[0.08]"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        <div className="flex items-center gap-2 mt-3">
          {post.status === 'scheduled' && (
            <button
              onClick={onMarkPublished}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Marcar publicado
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export const Social = () => {
  const { accounts, posts, loading, setupNeeded, updatePost, deletePost, markNotified } = useSocialStore();

  const [tab, setTab] = useState<'upcoming' | 'calendar'>('upcoming');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  /* ─── WhatsApp notification engine ─── */
  useEffect(() => {
    const checkNotifications = async () => {
      const now = new Date();
      const windowMs = 5 * 60 * 1000;
      const postsToNotify = posts.filter(p =>
        p.status === 'scheduled' &&
        p.notifyWhatsapp &&
        !p.notifiedAt &&
        p.notifyPhone &&
        new Date(p.scheduledAt).getTime() - now.getTime() <= windowMs &&
        new Date(p.scheduledAt).getTime() > now.getTime() - windowMs
      );
      for (const post of postsToNotify) {
        const account = accounts.find(a => a.id === post.accountId);
        const cfg = getZApiConfig();
        if (cfg && post.notifyPhone) {
          const phone = post.notifyPhone.replace(/\D/g, '');
          const formattedPhone = phone.startsWith('55') ? phone : '55' + phone;
          const scheduledTime = new Date(post.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const message = `⏰ *Hora de publicar!*\n\n📱 @${account?.username || 'conta'}\n📝 ${post.caption.slice(0, 100)}${post.caption.length > 100 ? '...' : ''}\n${post.hashtags ? `🏷️ ${post.hashtags.split(' ').slice(0, 3).join(' ')}\n` : ''}🕐 Agendado para ${scheduledTime}\n\nAcesse o Growth Expert para ver os detalhes.`;
          await fetch(`https://api.z-api.io/instances/${cfg.instance}/token/${cfg.token}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'client-token': cfg.clientToken },
            body: JSON.stringify({ phone: formattedPhone, message }),
          }).catch(err => console.error('[social.notify]', err));
        }
        markNotified(post.id);
      }
    };
    const interval = setInterval(checkNotifications, 60000);
    checkNotifications();
    return () => clearInterval(interval);
  }, [posts, accounts, markNotified]);

  /* ─── Filtered posts ─── */
  const filteredPosts = useMemo(() =>
    selectedAccountId ? posts.filter(p => p.accountId === selectedAccountId) : posts,
    [posts, selectedAccountId]
  );

  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;

  /* ─── Grouped by date (upcoming tab) ─── */
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of filteredPosts) {
      const key = toDateKey(p.scheduledAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredPosts]);

  /* ─── Week view ─── */
  const weekDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    monday.setDate(today.getDate() - dow + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const postsByDayKey = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of filteredPosts) {
      const key = toDateKey(p.scheduledAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [filteredPosts]);

  const activeAccounts = accounts.filter(a => a.active);
  const todayKey = new Date().toISOString().slice(0, 10);

  const handleEdit = (post: ScheduledPost) => {
    setEditingPost(post);
    setShowPostForm(true);
  };

  const handleCloseForm = () => {
    setShowPostForm(false);
    setEditingPost(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendário Editorial</h1>
          <p className="text-sm text-slate-400 mt-1">{scheduledCount} post{scheduledCount !== 1 ? 's' : ''} agendado{scheduledCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAccounts(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white bg-[#21262d] hover:bg-white/5 border border-white/[0.08] rounded-lg transition-colors"
          >
            <Camera className="w-4 h-4" />
            Gerenciar Contas
          </button>
          <button
            onClick={() => { setEditingPost(null); setShowPostForm(true); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Post
          </button>
        </div>
      </div>

      {/* Setup banner */}
      {setupNeeded && (
        <div className="bg-[#161b22] border border-red-500/40 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <CalendarDays className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-red-400 mb-1">Configuração necessária</h2>
              <p className="text-xs text-slate-400">
                As tabelas <code className="text-emerald-400 font-mono">social_accounts</code> e{' '}
                <code className="text-emerald-400 font-mono">scheduled_posts</code> não existem ainda.
                Execute o SQL abaixo no <strong className="text-slate-300">SQL Editor</strong> do Supabase.
              </p>
            </div>
          </div>
          <pre className="bg-[#0d1117] border border-white/[0.08] rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap">
            {SQL_SETUP}
          </pre>
          <p className="text-xs text-slate-500 mt-2">Após rodar o SQL, faça logout e login novamente para recarregar.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      )}

      {!loading && !setupNeeded && (
        <>
          {/* Account filter pills */}
          {activeAccounts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <button
                onClick={() => setSelectedAccountId(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedAccountId === null
                    ? 'bg-white/10 text-white border-white/20'
                    : 'bg-transparent text-slate-400 border-white/[0.08] hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                Todos
              </button>
              {activeAccounts.map(acc => {
                const c = getColor(acc.avatarColor);
                const isSelected = selectedAccountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccountId(isSelected ? null : acc.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isSelected ? c.pill : 'bg-transparent text-slate-400 border-white/[0.08] hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <Camera className="w-3 h-3" />
                    @{acc.username}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-[#161b22] border border-white/[0.08] rounded-lg w-fit mb-6">
            {(['upcoming', 'calendar'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === t ? 'bg-[#21262d] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'upcoming' ? 'Próximos' : 'Calendário'}
              </button>
            ))}
          </div>

          {/* ── Upcoming tab ── */}
          {tab === 'upcoming' && (
            <div className="space-y-8">
              {grouped.length === 0 ? (
                <div className="text-center py-20">
                  <CalendarDays className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Nenhum post agendado</p>
                  <button
                    onClick={() => setShowPostForm(true)}
                    className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                  >
                    Criar primeiro post
                  </button>
                </div>
              ) : (
                grouped.map(([dateKey, dayPosts]) => (
                  <div key={dateKey}>
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-sm font-semibold text-white capitalize">{formatDateLabel(dateKey)}</h2>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                      <span className="text-xs text-slate-500">{dayPosts.length} post{dayPosts.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-3">
                      {dayPosts.map(post => (
                        <PostCard
                          key={post.id}
                          post={post}
                          account={accounts.find(a => a.id === post.accountId)}
                          onEdit={() => handleEdit(post)}
                          onDelete={() => deletePost(post.id)}
                          onMarkPublished={() => updatePost(post.id, { status: 'published' })}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Calendar tab ── */}
          {tab === 'calendar' && (
            <div>
              {/* Week nav */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setWeekOffset(0)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-[#21262d] hover:bg-white/5 border border-white/[0.08] rounded-lg transition-colors"
                >
                  Hoje
                </button>
                <button
                  onClick={() => setWeekOffset(o => o - 1)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setWeekOffset(o => o + 1)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-sm text-slate-400">
                  {weekDays[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {weekDays[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {/* 7-day grid */}
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map(day => {
                  const key = day.toISOString().slice(0, 10);
                  const dayPosts = postsByDayKey.get(key) ?? [];
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={`min-h-[180px] bg-[#161b22] border rounded-xl p-2 flex flex-col gap-1.5 ${
                        isToday ? 'border-blue-500/40' : 'border-white/[0.08]'
                      }`}
                    >
                      {/* Day header */}
                      <div className={`text-center mb-1 ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>
                        <p className="text-xs font-medium capitalize">{formatShortDay(day)}</p>
                      </div>

                      {/* Posts */}
                      {dayPosts.map(post => {
                        const acc = accounts.find(a => a.id === post.accountId);
                        const c = getColor(acc?.avatarColor ?? 'blue');
                        return (
                          <button
                            key={post.id}
                            onClick={() => handleEdit(post)}
                            className={`w-full text-left p-1.5 rounded-lg border ${c.border} ${c.bg} hover:brightness-110 transition-all`}
                          >
                            <p className={`text-xs font-medium ${c.text} truncate`}>{formatTime(post.scheduledAt)}</p>
                            <p className="text-xs text-slate-400 truncate">@{acc?.username ?? '?'}</p>
                            {post.caption && (
                              <p className="text-xs text-slate-500 truncate">{post.caption.slice(0, 25)}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAccounts && <ManageAccountsModal onClose={() => setShowAccounts(false)} />}
      {showPostForm && <PostFormModal post={editingPost} onClose={handleCloseForm} />}
    </div>
  );
};
