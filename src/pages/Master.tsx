import { useState, useEffect } from 'react';
import {
  Building2, Users, Plus, X, Loader2, CheckCircle,
  Trash2, Power, UserPlus, Mail, Phone, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useCompaniesStore } from '../store/companiesStore';
import { useAuthStore } from '../store/authStore';
import { adminApi } from '../lib/supabase';
import type { Company, User, UserRole } from '../types';

/* ─────────────── helpers ─────────────── */
const planLabel: Record<string, string> = {
  basico: 'Básico',
  profissional: 'Profissional',
  empresarial: 'Empresarial',
};

const planBadge: Record<string, string> = {
  basico: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  profissional: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  empresarial: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/* ─────────────── SQL boxes ─────────────── */
const SQL_SETUP = `-- Run in Supabase SQL editor to enable multi-tenancy
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  plan text not null default 'basico',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table professionals add column if not exists company_id uuid references companies(id);
alter table clients add column if not exists company_id uuid references companies(id);
alter table demands add column if not exists company_id uuid references companies(id);
alter table leads add column if not exists company_id uuid references companies(id);
alter table financial_movements add column if not exists company_id uuid references companies(id);
alter table calendar_events add column if not exists company_id uuid references companies(id);`;

const SQL_SUPER_ADMIN = `-- Replace with your actual user email
update auth.users
  set raw_user_meta_data = raw_user_meta_data || '{"super_admin": true}'::jsonb
where email = 'your@email.com';`;

const SQL_MIGRATE = `-- After creating your company, replace COMPANY_ID with the UUID shown in the app
update professionals set company_id = 'COMPANY_ID' where company_id is null;
update clients set company_id = 'COMPANY_ID' where company_id is null;
update demands set company_id = 'COMPANY_ID' where company_id is null;
update leads set company_id = 'COMPANY_ID' where company_id is null;
update financial_movements set company_id = 'COMPANY_ID' where company_id is null;
update calendar_events set company_id = 'COMPANY_ID' where company_id is null;`;

/* ─────────────── SQL block component ─────────────── */
const SqlBlock = ({ title, code }: { title: string; code: string }) => (
  <div className="mb-4">
    <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
    <pre className="bg-[#0d1117] border border-white/[0.08] rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap">
      {code}
    </pre>
  </div>
);

/* ─────────────── modal wrapper ─────────────── */
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div className="bg-[#161b22] border border-white/[0.08] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
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

/* ─────────────── field ─────────────── */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls = 'w-full bg-[#21262d] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

/* ─────────────── new company modal ─────────────── */
interface NewCompanyModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const NewCompanyModal = ({ onClose, onSuccess }: NewCompanyModalProps) => {
  const { addCompany } = useCompaniesStore();
  const { addUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', phone: '', plan: 'basico',
    adminName: '', adminEmail: '', adminPassword: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Nome da agência é obrigatório');
    if (!form.adminName.trim()) return setError('Nome do administrador é obrigatório');
    if (!form.adminEmail.trim()) return setError('E-mail do administrador é obrigatório');
    if (form.adminPassword.length < 6) return setError('Senha deve ter no mínimo 6 caracteres');

    setSaving(true);

    // Step 1: create the company
    let company: Company;
    try {
      company = await addCompany({ name: form.name.trim(), email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, plan: form.plan, active: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar agência');
      setSaving(false);
      return;
    }

    // Step 2: create the admin user — company already exists even if this fails
    try {
      await addUser({
        name: form.adminName.trim(),
        email: form.adminEmail.trim(),
        role: 'admin' as UserRole,
        companyId: company.id,
        active: true,
      }, form.adminPassword);
      onSuccess();
      onClose();
    } catch (err) {
      // Agência criada com sucesso; apenas o usuário falhou.
      // Fecha o modal para mostrar a agência no painel — o admin pode ser criado depois.
      onSuccess();
      onClose();
      // Error is surfaced via the edge status banner; no need to block the flow.
      console.error('[NewCompanyModal] user creation failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nova Agência" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Nome da agência *">
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Ex: Agência XYZ" />
        </Field>
        <Field label="E-mail da agência">
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="contato@agencia.com" />
        </Field>
        <Field label="Telefone da agência">
          <input className={inputCls} type="tel" value={form.phone} onChange={set('phone')} placeholder="(11) 9 9999-9999" />
        </Field>
        <Field label="Plano">
          <select className={inputCls} value={form.plan} onChange={set('plan')}>
            <option value="basico">Básico</option>
            <option value="profissional">Profissional</option>
            <option value="empresarial">Empresarial</option>
          </select>
        </Field>

        <div className="border-t border-white/[0.08] my-5 pt-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Usuário Administrador</p>
          <Field label="Nome *">
            <input className={inputCls} value={form.adminName} onChange={set('adminName')} placeholder="Nome completo" />
          </Field>
          <Field label="E-mail *">
            <input className={inputCls} type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder="admin@agencia.com" />
          </Field>
          <Field label="Senha * (mínimo 6 caracteres)">
            <input className={inputCls} type="password" value={form.adminPassword} onChange={set('adminPassword')} placeholder="••••••••" />
          </Field>
        </div>

        {error && <p className="text-sm text-red-400 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar Agência
          </button>
        </div>
      </form>
    </Modal>
  );
};

/* ─────────────── create user modal ─────────────── */
interface CreateUserModalProps {
  company: Company;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateUserModal = ({ company, onClose, onSuccess }: CreateUserModalProps) => {
  const { addUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' as UserRole });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Nome é obrigatório');
    if (!form.email.trim()) return setError('E-mail é obrigatório');
    if (form.password.length < 6) return setError('Senha deve ter no mínimo 6 caracteres');

    setSaving(true);
    try {
      await addUser({ name: form.name.trim(), email: form.email.trim(), role: form.role, companyId: company.id, active: true }, form.password);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Novo Usuário — ${company.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Nome *">
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Nome completo" />
        </Field>
        <Field label="E-mail *">
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="usuario@agencia.com" />
        </Field>
        <Field label="Senha * (mínimo 6 caracteres)">
          <input className={inputCls} type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
        </Field>
        <Field label="Perfil">
          <select className={inputCls} value={form.role} onChange={set('role')}>
            <option value="admin">Administrador</option>
            <option value="manager">Gestor</option>
            <option value="professional">Profissional</option>
            <option value="financial">Financeiro</option>
          </select>
        </Field>

        {error && <p className="text-sm text-red-400 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Criar Usuário
          </button>
        </div>
      </form>
    </Modal>
  );
};

/* ─────────────── delete confirm modal ─────────────── */
interface DeleteConfirmModalProps {
  company: Company;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteConfirmModal = ({ company, onClose, onConfirm }: DeleteConfirmModalProps) => (
  <Modal title="Excluir Agência" onClose={onClose}>
    <p className="text-sm text-slate-300 mb-2">
      Tem certeza que deseja excluir a agência <span className="font-semibold text-white">{company.name}</span>?
    </p>
    <p className="text-xs text-red-400 mb-6">Esta ação não pode ser desfeita. Os dados da agência permanecerão no banco de dados.</p>
    <div className="flex gap-3 justify-end">
      <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
        Cancelar
      </button>
      <button onClick={onConfirm} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
        <Trash2 className="w-4 h-4" />
        Excluir
      </button>
    </div>
  </Modal>
);

/* ─────────────── SQL info panel ─────────────── */
const [sqlOpen, setSqlOpen] = [false, (_: boolean) => {}]; // placeholder — managed inside component

const EDGE_FN_CODE = `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const res = (d: unknown, s=200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const { action, ...body } = await req.json()
    if (action === 'list')   { const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 }); return res({ users: data?.users ?? [], error }) }
    if (action === 'create') { const { data, error } = await admin.auth.admin.createUser(body); return res({ user: data?.user ?? null, error }) }
    if (action === 'update') { const { id, ...p } = body; const { error } = await admin.auth.admin.updateUserById(id, p); return res({ error }) }
    if (action === 'delete') { const { id } = body; const { error } = await admin.auth.admin.deleteUser(id); return res({ error }) }
    return res({ error: 'Unknown action' }, 400)
  } catch (e) { return res({ error: String(e) }, 500) }
})`;

/* ─────────────── main page ─────────────── */
export const Master = () => {
  const { companies, loading, setupNeeded, loadError: companiesLoadError, updateCompany, deleteCompany, init: initCompanies } = useCompaniesStore();
  const { addUser } = useAuthStore();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [edgeStatus, setEdgeStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [edgeError, setEdgeError] = useState('');
  const [showEdgeDeploy, setShowEdgeDeploy] = useState(false);

  const [loadingUsers, setLoadingUsers] = useState(false);

  const refreshUsers = () => {
    setLoadingUsers(true);
    // Also reload companies from DB so new/deleted agencies appear immediately
    initCompanies();
    adminApi.listUsers().then(({ data, error }) => {
      if (data?.users) {
        setAllUsers(data.users.map(u => ({
          id: u.id,
          name: (u.user_metadata?.name as string) || u.email?.split('@')[0] || 'Usuário',
          email: u.email || '',
          role: ((u.user_metadata?.role as string) || 'admin') as User['role'],
          active: true,
          createdAt: u.created_at || new Date().toISOString(),
          companyId: (u.user_metadata?.company_id as string) || undefined,
          isSuperAdmin: u.user_metadata?.super_admin === true,
        })));
        setEdgeStatus('ok');
      }
      if (error) {
        setEdgeStatus('error');
        setEdgeError(error.message);
      }
      setLoadingUsers(false);
    });
  };

  const checkEdge = () => {
    setEdgeStatus('checking');
    refreshUsers();
  };

  useEffect(() => {
    refreshUsers();
  }, []);

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [createUserFor, setCreateUserFor] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [showSql, setShowSql] = useState(false);

  const usersFor = (companyId: string) => allUsers.filter(u => u.companyId === companyId);
  const activeCount = companies.filter(c => c.active).length;
  const nonSuperUsers = allUsers.filter(u => !u.isSuperAdmin);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Painel Master</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie as agências clientes</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { refreshUsers(); }}
            title="Atualizar lista de usuários"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-[#21262d] hover:bg-white/5 border border-white/[0.08] rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingUsers ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSql(s => !s)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white bg-[#21262d] hover:bg-white/5 border border-white/[0.08] rounded-lg transition-colors"
          >
            SQL
          </button>
          <button
            onClick={() => setShowNewCompany(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Agência
          </button>
        </div>
      </div>

      {/* Edge Function status banner */}
      {edgeStatus === 'error' && (
        <div className="bg-[#161b22] border border-red-500/40 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-400 mb-1">
                Edge Function <code className="font-mono">admin-users</code> não está respondendo
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Sem ela, não é possível criar, listar ou excluir usuários.
                {edgeError && <span className="ml-1 text-slate-500">Erro: {edgeError}</span>}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowEdgeDeploy(s => !s)}
                  className="text-xs px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 rounded-lg transition-colors font-medium"
                >
                  {showEdgeDeploy ? 'Ocultar instruções' : 'Ver como publicar'}
                </button>
                <button
                  onClick={checkEdge}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Testar novamente
                </button>
              </div>
              {showEdgeDeploy && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-300">
                    Opção 1 — Via painel Supabase (mais fácil):
                  </p>
                  <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                    <li>Acesse <span className="text-slate-300 font-mono">supabase.com</span> → seu projeto → <strong className="text-slate-300">Edge Functions</strong></li>
                    <li>Clique em <strong className="text-slate-300">New Function</strong> e nomeie como <code className="text-emerald-400 font-mono">admin-users</code></li>
                    <li>Cole o código abaixo e clique <strong className="text-slate-300">Deploy</strong></li>
                  </ol>
                  <div className="relative">
                    <pre className="bg-[#0d1117] border border-white/[0.06] rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
                      {EDGE_FN_CODE}
                    </pre>
                  </div>
                  <p className="text-xs font-semibold text-slate-300 mt-2">
                    Opção 2 — Via Supabase CLI:
                  </p>
                  <pre className="bg-[#0d1117] border border-white/[0.06] rounded-lg p-3 text-xs text-emerald-300">
{`supabase functions deploy admin-users --project-ref nkxyecdxgaxpnezfjkap`}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {edgeStatus === 'checking' && (
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Verificando Edge Function...
        </div>
      )}

      {/* Connection error banner (Supabase paused/slow — table exists but unreachable) */}
      {companiesLoadError && !setupNeeded && (
        <div className="bg-[#161b22] border border-amber-500/40 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-400 mb-1">Não foi possível carregar as agências</p>
              <p className="text-xs text-slate-400 mb-2">O Supabase pode estar pausado ou com instabilidade. Verifique o painel do Supabase e tente novamente.</p>
              <p className="text-xs text-slate-500">Detalhe: {companiesLoadError}</p>
              <button onClick={() => initCompanies()} className="mt-2 text-xs px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg transition-colors font-medium">
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup required banner */}
      {setupNeeded && (
        <div className="bg-[#161b22] border border-red-500/40 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Building2 className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-red-400 mb-1">Configuração necessária</h2>
              <p className="text-xs text-slate-400">
                A tabela <code className="text-emerald-400 font-mono">companies</code> não existe ainda no Supabase.
                Execute o SQL abaixo no <strong className="text-slate-300">SQL Editor</strong> do Supabase para ativar o multi-tenancy.
              </p>
            </div>
          </div>
          <SqlBlock title="1. Criar tabela companies e adicionar company_id em todas as tabelas:" code={SQL_SETUP} />
          <SqlBlock title="2. Ativar Super Admin (substitua pelo seu e-mail):" code={SQL_SUPER_ADMIN} />
          <SqlBlock title="3. Migrar dados existentes (após criar sua agência aqui):" code={SQL_MIGRATE} />
          <p className="text-xs text-slate-500 mt-2">Após rodar o SQL, faça logout e login novamente para recarregar.</p>
        </div>
      )}

      {/* SQL Info Panel */}
      {showSql && !setupNeeded && (
        <div className="bg-[#161b22] border border-amber-500/30 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-amber-400">Configuração Multi-tenancy — SQL</h2>
            <button onClick={() => setShowSql(false)} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <SqlBlock title="1. Criar tabela companies e adicionar company_id em todas as tabelas:" code={SQL_SETUP} />
          <SqlBlock title="2. Ativar Super Admin para um usuário:" code={SQL_SUPER_ADMIN} />
          <SqlBlock title="3. Migrar dados existentes (após criar sua agência):" code={SQL_MIGRATE} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Agências', value: companies.length, icon: Building2, color: 'text-blue-400' },
          { label: 'Agências Ativas', value: activeCount, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Total Usuários', value: nonSuperUsers.length, icon: Users, color: 'text-violet-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#161b22] border border-white/[0.08] rounded-xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Companies grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-20">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium">Nenhuma agência cadastrada</p>
          <p className="text-slate-600 text-xs mt-1 mb-4">Crie a primeira agência para começar a gerenciar clientes</p>
          <button
            onClick={() => setShowNewCompany(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar primeira agência
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map(company => {
            const companyUsers = usersFor(company.id);
            return (
              <div key={company.id} className="bg-[#161b22] border border-white/[0.08] rounded-xl p-5 flex flex-col gap-4">
                {/* Top */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white truncate">{company.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${planBadge[company.plan] || planBadge.basico}`}>
                        {planLabel[company.plan] || company.plan}
                      </span>
                    </div>
                    {company.email && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Mail className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        <p className="text-xs text-slate-400 truncate">{company.email}</p>
                      </div>
                    )}
                    {company.phone && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        <p className="text-xs text-slate-400 truncate">{company.phone}</p>
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${company.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                    {company.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{companyUsers.length} {companyUsers.length === 1 ? 'usuário' : 'usuários'}</span>
                  </div>
                  <span>Desde {fmt(company.createdAt)}</span>
                </div>

                {/* ID */}
                <div className="bg-[#0d1117] rounded-lg px-3 py-1.5">
                  <p className="text-xs text-slate-500 font-mono truncate" title={company.id}>{company.id}</p>
                </div>

                {/* Cota de prospecção (empresas Google/mês) */}
                <div className="flex items-center justify-between bg-[#0d1117] rounded-lg px-3 py-1.5">
                  <span className="text-xs text-slate-500">Empresas Google/mês</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={company.apifyMonthlyLimit ?? ''}
                    placeholder="100"
                    title="Empresas por mês. Vazio = padrão (100). Preencha para liberar mais a esta agência."
                    onBlur={e => {
                      const raw = e.target.value.trim();
                      const val = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                      updateCompany(company.id, { apifyMonthlyLimit: val });
                    }}
                    className="w-20 bg-transparent border border-white/10 rounded px-2 py-0.5 text-xs text-right text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setCreateUserFor(company)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Criar Usuário
                  </button>
                  <button
                    onClick={() => updateCompany(company.id, { active: !company.active })}
                    title={company.active ? 'Desativar' : 'Ativar'}
                    className={`p-1.5 rounded-lg transition-colors ${company.active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(company)}
                    title="Excluir agência"
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showNewCompany && <NewCompanyModal onClose={() => setShowNewCompany(false)} onSuccess={refreshUsers} />}
      {createUserFor && <CreateUserModal company={createUserFor} onClose={() => setCreateUserFor(null)} onSuccess={refreshUsers} />}
      {deleteTarget && (
        <DeleteConfirmModal
          company={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await deleteCompany(deleteTarget.id);
            setDeleteTarget(null);
            refreshUsers();
          }}
        />
      )}
    </div>
  );
};
