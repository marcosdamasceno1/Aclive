import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfessionalsStore } from '../store/professionalsStore';
import { useCompanySettingsStore } from '../store/companySettingsStore';
import { PAGE_PERMISSIONS } from '../utils/permissions';
import { getProfessionLabel } from '../utils/formatters';
import { getZApiConfig, saveZApiConfig, clearZApiConfig } from '../utils/whatsapp';
import { requestGoogleToken, revokeGoogleToken } from '../lib/googleDrive';
import type { UserRole, ProfessionType } from '../types';
import type { WhatsAppProvider } from '../utils/whatsapp';
import { Plus, Trash2, X, Shield, Users, Info, Lock, Briefcase, Pencil, Zap, Eye, EyeOff, CheckCircle, AlertTriangle, HardDrive, Link2, Link2Off, Loader2, MessageCircle, Target, Copy, RefreshCw, Globe } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gestor de Projetos',
  professional: 'Profissional',
  financial: 'Financeiro',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-500/[0.1] text-purple-400',
  manager: 'bg-blue-500/[0.1] text-blue-400',
  professional: 'bg-green-500/[0.1] text-green-400',
  financial: 'bg-orange-500/[0.1] text-orange-400',
};

const PROFESSIONS: ProfessionType[] = [
  'editor_video', 'designer', 'social_media', 'traffic_manager',
  'copywriter', 'account_manager', 'financial', 'manager', 'other',
];

const emptyUserForm = {
  name: '',
  email: '',
  role: 'professional' as UserRole,
  password: '',
  permissions: [] as string[],
  createProfessional: true,
  profession: 'designer' as ProfessionType,
  phone: '',
  pixKey: '',
};

export const Settings = () => {
  const { users, usersError, currentUser, addUser, updateUser, deleteUser } = useAuthStore();
  const { addProfessional } = useProfessionalsStore();

  // Store state (must come before any references to its values)
  const {
    googleClientId, googleAccessToken, init: initSettings,
    saveClientId, saveToken, clearToken, isConnected,
    whatsappProvider, metaAccessToken, metaPhoneNumberId, metaTemplateName,
    saveWhatsappProvider, saveMetaConfig, clearMetaConfig,
    metaLeadsPageId, metaLeadsPageToken, metaLeadsVerifyToken,
    saveMetaLeadsConfig, clearMetaLeadsConfig,
  } = useCompanySettingsStore();

  // Z-API config state
  const existingZApi = getZApiConfig();
  const [zapiInstance,     setZapiInstance]     = useState(existingZApi?.instance     || '');
  const [zapiToken,        setZapiToken]        = useState(existingZApi?.token        || '');
  const [zapiClientToken,  setZapiClientToken]  = useState(existingZApi?.clientToken  || '');
  const [zapiShowToken,    setZapiShowToken]    = useState(false);
  const [zapiSaved,        setZapiSaved]        = useState(false);

  const handleSaveZApi = () => {
    saveZApiConfig({ instance: zapiInstance.trim(), token: zapiToken.trim(), clientToken: zapiClientToken.trim() });
    setZapiSaved(true);
    setTimeout(() => setZapiSaved(false), 2500);
  };

  // Meta API state
  const [metaToken,    setMetaToken]    = useState('');
  const [metaPhoneId,  setMetaPhoneId]  = useState('');
  const [metaTemplate, setMetaTemplate] = useState('nova_demanda');
  const [metaShowToken, setMetaShowToken] = useState(false);
  const [metaSaved,    setMetaSaved]    = useState(false);

  useEffect(() => {
    setMetaToken(metaAccessToken || '');
    setMetaPhoneId(metaPhoneNumberId || '');
    setMetaTemplate(metaTemplateName || 'nova_demanda');
  }, [metaAccessToken, metaPhoneNumberId, metaTemplateName]);

  const handleSaveMeta = async () => {
    await saveMetaConfig(metaToken.trim(), metaPhoneId.trim(), metaTemplate.trim() || 'nova_demanda');
    setMetaSaved(true);
    setTimeout(() => setMetaSaved(false), 2500);
  };

  const handleProviderChange = async (p: WhatsAppProvider) => {
    await saveWhatsappProvider(p);
  };

  // Meta Lead Ads state
  const [leadsPageId, setLeadsPageId] = useState('');
  const [leadsPageToken, setLeadsPageToken] = useState('');
  const [leadsShowPageToken, setLeadsShowPageToken] = useState(false);
  const [leadsSaved, setLeadsSaved] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false);
  const [copiedSiteUrl, setCopiedSiteUrl] = useState(false);

  useEffect(() => {
    setLeadsPageId(metaLeadsPageId || '');
    setLeadsPageToken(metaLeadsPageToken || '');
  }, [metaLeadsPageId, metaLeadsPageToken]);

  const WEBHOOK_URL = 'https://nkxyecdxgaxpnezfjkap.supabase.co/functions/v1/meta-leads-webhook';

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveLeadsConfig = async () => {
    const verifyToken = metaLeadsVerifyToken || crypto.randomUUID();
    await saveMetaLeadsConfig(leadsPageId.trim(), leadsPageToken.trim(), verifyToken);
    setLeadsSaved(true);
    setTimeout(() => setLeadsSaved(false), 2500);
  };

  const zapiIsConfigured = !!getZApiConfig();
  const metaIsConfigured = !!(metaAccessToken && metaPhoneNumberId);
  const [driveClientId, setDriveClientId] = useState('');
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [driveSaved, setDriveSaved] = useState(false);

  useEffect(() => { initSettings(); }, []);
  useEffect(() => { setDriveClientId(googleClientId); }, [googleClientId]);

  const handleSaveClientId = async () => {
    await saveClientId(driveClientId.trim());
    setDriveSaved(true);
    setTimeout(() => setDriveSaved(false), 2500);
  };

  const handleConnectDrive = () => {
    if (!driveClientId.trim()) { setDriveError('Insira o Client ID antes de conectar.'); return; }
    setDriveError('');
    setDriveConnecting(true);
    requestGoogleToken(
      driveClientId.trim(),
      async (token, expiresIn) => {
        await saveToken(token, expiresIn);
        setDriveConnecting(false);
      },
      (msg) => { setDriveError(msg); setDriveConnecting(false); },
    );
  };

  const handleDisconnectDrive = async () => {
    if (googleAccessToken) revokeGoogleToken(googleAccessToken);
    await clearToken();
  };

  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'system' | 'integrations'>('users');
  const [integrationTab, setIntegrationTab] = useState<'whatsapp' | 'drive' | 'meta-leads' | 'site'>('whatsapp');

  const SITE_WEBHOOK_BASE = 'https://nkxyecdxgaxpnezfjkap.supabase.co/functions/v1/site-leads-webhook';
  const siteCompanyId = currentUser?.companyId ?? '';
  const siteWebhookFullUrl = siteCompanyId ? `${SITE_WEBHOOK_BASE}?company_id=${siteCompanyId}` : '';
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'professional' as UserRole, permissions: [] as string[], newPassword: '' });
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const togglePermission = (key: string) => {
    setUserForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(k => k !== key)
        : [...f.permissions, key],
    }));
  };

  const handleRoleChange = (role: UserRole) => {
    setUserForm(f => ({
      ...f,
      role,
      permissions: [],
      createProfessional: role === 'professional',
    }));
  };

  const { loadUsers } = useAuthStore();

  const handleCreateUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) return;
    setSubmitting(true);
    setFormError('');
    try {
      const newUser = await addUser(
        {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          permissions: userForm.role === 'admin' ? undefined : userForm.permissions,
        },
        userForm.password
      );

      if (userForm.createProfessional) {
        const newPro = addProfessional({
          name: userForm.name,
          email: userForm.email,
          profession: userForm.profession,
          phone: userForm.phone,
          pixKey: userForm.pixKey,
          status: 'active',
          defaultValues: {},
          userId: newUser.id,
        });
        // Fire-and-forget: don't block modal close on a second Edge Function call.
        // updateUser syncs professionalId to Auth metadata + user_profiles in the background.
        updateUser(newUser.id, { professionalId: newPro.id });
      }

      setUserForm(emptyUserForm);
      setShowUserModal(false);
      await loadUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditUser = (user: (typeof users)[number]) => {
    setEditUserId(user.id);
    setEditForm({ name: user.name, role: user.role, permissions: user.permissions ?? [], newPassword: '' });
    setEditError('');
  };

  const handleEditRoleChange = (role: UserRole) => {
    setEditForm(f => ({ ...f, role, permissions: [] }));
  };

  const toggleEditPermission = (key: string) => {
    setEditForm(f => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter(k => k !== key) : [...f.permissions, key],
    }));
  };

  const handleEditUser = async () => {
    if (!editUserId || !editForm.name.trim()) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      await updateUser(
        editUserId,
        { name: editForm.name, role: editForm.role, permissions: editForm.role === 'admin' ? undefined : editForm.permissions },
        editForm.newPassword.trim() || undefined,
      );
      setEditUserId(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar alterações.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteUserId && deleteUserId !== currentUser?.id) {
      try {
        await deleteUser(deleteUserId);
        await loadUsers();
      } catch {
        // ignore
      }
      setDeleteUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Configurações</h1>
        <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Gerenciamento do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0d1117] p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'users' ? 'bg-[#21262d] text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Usuários
          </div>
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'system' ? 'bg-[#21262d] text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Sistema
          </div>
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'integrations' ? 'bg-[#21262d] text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Integrações
          </div>
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-4">
          {usersError && (
            <div className="flex items-start gap-3 bg-[#161b22] border border-red-500/30 rounded-xl p-4">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400 mb-0.5">Edge Function não está respondendo</p>
                <p className="text-xs text-slate-400">
                  A lista de usuários não pôde ser carregada e novos usuários não podem ser criados.
                  Publique a função <code className="text-emerald-400 font-mono">admin-users</code> no Supabase.
                  Acesse o <strong className="text-slate-300">Painel Master</strong> para ver as instruções completas.
                </p>
                <p className="text-xs text-slate-500 mt-1">Detalhe: {usersError}</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">Usuários do sistema</h2>
            {isAdmin ? (
              <button
                onClick={() => { setUserForm(emptyUserForm); setFormError(''); setShowUserModal(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Novo usuário
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Lock className="w-3.5 h-3.5" />
                Apenas administradores podem criar usuários
              </div>
            )}
          </div>

          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Função</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Criado em</th>
                  {isAdmin && (
                    <th className="text-center px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">Ação</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {users.map(user => (
                  <tr key={user.id} className={`hover:bg-white/[0.04] transition-colors ${user.id === currentUser?.id ? 'bg-blue-500/[0.08]' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-slate-100">
                            {user.name}
                            {user.id === currentUser?.id && (
                              <span className="ml-2 text-xs text-blue-600 font-normal">(você)</span>
                            )}
                          </span>
                          {user.professionalId && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Briefcase className="w-3 h-3 text-slate-400" />
                              <span className="text-xs text-slate-400">Profissional vinculado</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ROLE_COLORS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditUser(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-600/[0.12] rounded-lg transition-colors"
                            title="Editar usuário"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {user.id !== currentUser?.id ? (
                            <button
                              onClick={() => setDeleteUserId(user.id)}
                              className="p-1.5 text-red-400 hover:text-red-400 hover:bg-red-600/[0.12] rounded-lg transition-colors"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 px-1.5">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Permission matrix */}
          <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08]">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-100">Matriz de permissões padrão</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-semibold text-slate-500">Recurso</th>
                    <th className="text-center py-2 px-3 font-semibold text-purple-600">Admin</th>
                    <th className="text-center py-2 px-3 font-semibold text-blue-600">Gestor</th>
                    <th className="text-center py-2 px-3 font-semibold text-green-600">Profissional</th>
                    <th className="text-center py-2 px-3 font-semibold text-orange-600">Financeiro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {[
                    { label: 'Dashboard completo', admin: true, manager: true, professional: true, financial: true },
                    { label: 'Gerenciar clientes', admin: true, manager: true, professional: false, financial: false },
                    { label: 'Gerenciar profissionais', admin: true, manager: false, professional: false, financial: false },
                    { label: 'Criar/editar demandas', admin: true, manager: true, professional: false, financial: false },
                    { label: 'Ver próprias demandas', admin: true, manager: true, professional: true, financial: false },
                    { label: 'Mover no Kanban', admin: true, manager: true, professional: true, financial: false },
                    { label: 'Ver financeiro completo', admin: true, manager: false, professional: false, financial: true },
                    { label: 'Ver relatórios', admin: true, manager: false, professional: false, financial: true },
                    { label: 'Configurações', admin: true, manager: false, professional: false, financial: false },
                  ].map(row => (
                    <tr key={row.label} className="hover:bg-white/[0.04]">
                      <td className="py-2 pr-4 text-slate-500">{row.label}</td>
                      {(['admin', 'manager', 'professional', 'financial'] as const).map(role => (
                        <td key={role} className="py-2 px-3 text-center">
                          {row[role] ? (
                            <span className="text-green-500 font-bold">✓</span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08] space-y-4">
            <h3 className="text-base font-bold text-slate-100">Informações do sistema</h3>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Nome do sistema', value: 'Gestão Operacional de Agência de Marketing' },
                { label: 'Versão', value: '1.0.0' },
                { label: 'Banco de dados', value: 'Supabase (PostgreSQL)' },
                { label: 'Tecnologia', value: 'React + TypeScript + Tailwind CSS' },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 bg-[#161b22] rounded-xl">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-200">{value}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-white/[0.05] pt-4">
              <p className="text-sm font-semibold text-slate-200 mb-2">Regras do sistema</p>
              <ul className="space-y-2 text-sm text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500/[0.1]0 rounded-full flex-shrink-0 mt-1.5" />
                  Uma tarefa só gera valor financeiro uma única vez (ao ser movida para "Concluído").
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500/[0.1]0 rounded-full flex-shrink-0 mt-1.5" />
                  O saldo do profissional aumenta automaticamente ao concluir uma tarefa.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500/[0.1]0 rounded-full flex-shrink-0 mt-1.5" />
                  Apenas administradores podem criar novos usuários e definir seus acessos.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500/[0.1]0 rounded-full flex-shrink-0 mt-1.5" />
                  Profissionais visualizam apenas suas próprias tarefas e valores.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500/[0.1]0 rounded-full flex-shrink-0 mt-1.5" />
                  Pagamentos duplicados são bloqueados automaticamente pelo sistema.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="space-y-4">

          {/* ── Integration sub-tabs ── */}
          <div className="flex gap-2">
            {([
              {
                key: 'whatsapp',
                icon: <MessageCircle className="w-4 h-4" />,
                label: 'WhatsApp',
                color: 'green',
                configured: zapiIsConfigured || metaIsConfigured,
              },
              {
                key: 'drive',
                icon: <HardDrive className="w-4 h-4" />,
                label: 'Google Drive',
                color: 'blue',
                configured: isConnected(),
              },
              {
                key: 'meta-leads',
                icon: <Target className="w-4 h-4" />,
                label: 'Meta Lead Ads',
                color: 'blue',
                configured: !!(metaLeadsPageId && metaLeadsPageToken),
              },
              {
                key: 'site',
                icon: <Globe className="w-4 h-4" />,
                label: 'Formulário do Site',
                color: 'purple',
                configured: !!siteCompanyId,
              },
            ] as { key: string; icon: React.ReactNode; label: string; color: string; configured: boolean }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setIntegrationTab(tab.key as typeof integrationTab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  integrationTab === tab.key
                    ? 'bg-[#21262d] border-white/[0.15] text-slate-100 shadow-sm'
                    : 'border-white/[0.05] text-slate-500 hover:text-slate-300 hover:border-white/[0.1]'
                }`}
              >
                <span className={integrationTab === tab.key ? (tab.color === 'green' ? 'text-green-400' : tab.color === 'purple' ? 'text-purple-400' : 'text-blue-400') : 'text-slate-500'}>
                  {tab.icon}
                </span>
                {tab.label}
                {tab.configured && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* ── WhatsApp ── */}
          {integrationTab === 'whatsapp' && (
            <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08] space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">WhatsApp — Notificações</h3>
                  <p className="text-xs text-slate-500">Notificações automáticas para profissionais ao criar demandas</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Provedor ativo</label>
                <div className="flex gap-2">
                  {([
                    { id: 'zapi', label: 'Z-API', desc: 'Não oficial · SaaS gerenciado' },
                    { id: 'meta', label: 'Meta Oficial', desc: 'API oficial da Meta' },
                  ] as { id: WhatsAppProvider; label: string; desc: string }[]).map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleProviderChange(p.id)}
                      className={`flex-1 flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-all ${
                        whatsappProvider === p.id
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                          : 'border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className={`w-2 h-2 rounded-full ${whatsappProvider === p.id ? 'bg-blue-400' : 'bg-slate-600'}`} />
                        <span className="text-sm font-semibold">{p.label}</span>
                        {p.id === 'zapi' && zapiIsConfigured && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                        {p.id === 'meta' && metaIsConfigured && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                      </div>
                      <span className="text-xs text-slate-500 pl-4">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {whatsappProvider === 'zapi' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Instance ID</label>
                    <input
                      type="text"
                      value={zapiInstance}
                      onChange={e => setZapiInstance(e.target.value)}
                      className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: 3C56F5B73..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Token</label>
                    <div className="relative">
                      <input
                        type={zapiShowToken ? 'text' : 'password'}
                        value={zapiToken}
                        onChange={e => setZapiToken(e.target.value)}
                        className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Token da instância"
                      />
                      <button onClick={() => setZapiShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {zapiShowToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Client Token</label>
                    <input
                      type="password"
                      value={zapiClientToken}
                      onChange={e => setZapiClientToken(e.target.value)}
                      className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Client-Token da conta Z-API"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveZApi}
                      disabled={!zapiInstance.trim() || !zapiToken.trim()}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {zapiSaved ? <CheckCircle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {zapiSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                    {zapiIsConfigured && (
                      <button onClick={() => { clearZApiConfig(); setZapiInstance(''); setZapiToken(''); setZapiClientToken(''); }} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
                        Remover configuração
                      </button>
                    )}
                  </div>
                  <div className="border-t border-white/[0.05] pt-3 text-xs text-slate-500 space-y-1">
                    <p>• Instance ID e Token no painel da instância em <strong className="text-slate-400">app.z-api.io</strong></p>
                    <p>• Client Token em Conta → Security no painel Z-API</p>
                  </div>
                </div>
              )}

              {whatsappProvider === 'meta' && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-300">
                      Requer conta no <strong>Meta Business Manager</strong> com WhatsApp Business API ativado e um template de mensagem aprovado pela Meta.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Access Token</label>
                    <div className="relative">
                      <input
                        type={metaShowToken ? 'text' : 'password'}
                        value={metaToken}
                        onChange={e => setMetaToken(e.target.value)}
                        className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="EAAxxxxxxxx..."
                      />
                      <button onClick={() => setMetaShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {metaShowToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Phone Number ID</label>
                    <input
                      type="text"
                      value={metaPhoneId}
                      onChange={e => setMetaPhoneId(e.target.value)}
                      className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                      Nome do Template
                      <span className="ml-1 text-slate-600 font-normal normal-case tracking-normal">(aprovado pela Meta)</span>
                    </label>
                    <input
                      type="text"
                      value={metaTemplate}
                      onChange={e => setMetaTemplate(e.target.value)}
                      className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="nova_demanda"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveMeta}
                      disabled={!metaToken.trim() || !metaPhoneId.trim()}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {metaSaved ? <CheckCircle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {metaSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                    {metaIsConfigured && (
                      <button onClick={() => { clearMetaConfig(); setMetaToken(''); setMetaPhoneId(''); setMetaTemplate('nova_demanda'); }} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
                        Remover configuração
                      </button>
                    )}
                  </div>
                  <div className="border-t border-white/[0.05] pt-3 text-xs text-slate-500 space-y-1">
                    <p>• Access Token e Phone Number ID em <strong className="text-slate-400">business.facebook.com</strong> → WhatsApp → API Setup</p>
                    <p>• O template deve ter 5 variáveis: profissional, demanda, cliente, prazo, prioridade</p>
                    <p>• Crie e aprove o template em WhatsApp Manager → Message Templates</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Google Drive ── */}
          {integrationTab === 'drive' && (
            <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08] space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <HardDrive className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Google Drive</h3>
                    <p className="text-xs text-slate-500">Armazene e organize arquivos da agência diretamente no Drive</p>
                  </div>
                </div>
                {isConnected() && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5" /> Conectado
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Client ID (Google Cloud)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={driveClientId}
                    onChange={e => setDriveClientId(e.target.value)}
                    placeholder="xxxxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com"
                    className="flex-1 bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSaveClientId}
                    disabled={!driveClientId.trim() || driveClientId === googleClientId}
                    className="px-3 py-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    {driveSaved ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : 'Salvar'}
                  </button>
                </div>
              </div>

              {driveError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{driveError}</p>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                {!isConnected() ? (
                  <button
                    onClick={handleConnectDrive}
                    disabled={driveConnecting || !googleClientId}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {driveConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {driveConnecting ? 'Conectando...' : 'Conectar Drive'}
                  </button>
                ) : (
                  <button
                    onClick={handleDisconnectDrive}
                    className="flex items-center gap-2 text-slate-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Link2Off className="w-4 h-4" />
                    Desconectar
                  </button>
                )}
              </div>

              <div className="border-t border-white/[0.05] pt-4 text-xs text-slate-500 space-y-1">
                <p>• Acesse <strong className="text-slate-400">console.cloud.google.com</strong> → crie um projeto → ative a <strong className="text-slate-400">Google Drive API</strong></p>
                <p>• Em Credenciais → crie OAuth 2.0 → tipo <strong className="text-slate-400">Aplicativo da Web</strong> → adicione o domínio do app em "Origens autorizadas"</p>
                <p>• Copie o <strong className="text-slate-400">Client ID</strong> gerado e cole acima</p>
              </div>
            </div>
          )}

          {/* ── Meta Lead Ads ── */}
          {integrationTab === 'site' && (
            <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08] space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Formulário do Site — Webhook</h3>
                  <p className="text-xs text-slate-500">Leads enviados pelo formulário do seu site chegam automaticamente na aba Leads</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">URL do Webhook</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={siteWebhookFullUrl}
                      className="flex-1 bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-slate-400 font-mono focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(siteWebhookFullUrl, setCopiedSiteUrl)}
                      className="px-3 py-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
                    >
                      {copiedSiteUrl ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedSiteUrl ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Envie um <strong className="text-slate-400">POST</strong> com JSON para esta URL a partir do formulário do seu site</p>
                </div>

                <div className="rounded-lg bg-[#161b22] border border-white/[0.06] p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Campos aceitos no body (JSON)</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-white/[0.05]">
                        <th className="pb-1.5 font-medium">Campo</th>
                        <th className="pb-1.5 font-medium">Tipo</th>
                        <th className="pb-1.5 font-medium">Obrigatório</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300 divide-y divide-white/[0.03]">
                      <tr><td className="py-1 font-mono text-purple-300">name</td><td className="py-1 text-slate-500">string</td><td className="py-1 text-red-400">sim</td></tr>
                      <tr><td className="py-1 font-mono text-purple-300">email</td><td className="py-1 text-slate-500">string</td><td className="py-1 text-slate-500">não</td></tr>
                      <tr><td className="py-1 font-mono text-purple-300">phone</td><td className="py-1 text-slate-500">string</td><td className="py-1 text-slate-500">não</td></tr>
                      <tr><td className="py-1 font-mono text-purple-300">notes</td><td className="py-1 text-slate-500">string</td><td className="py-1 text-slate-500">não</td></tr>
                      <tr><td className="py-1 font-mono text-purple-300">message</td><td className="py-1 text-slate-500">string</td><td className="py-1 text-slate-500">não (alias de notes)</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg bg-[#0d1117] border border-white/[0.06] p-4 overflow-x-auto">
                  <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Exemplo — fetch JavaScript</p>
                  <pre className="text-xs text-slate-300 whitespace-pre font-mono leading-relaxed">{`fetch("${siteWebhookFullUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: formData.name,
    email: formData.email,
    phone: formData.phone,
    notes: formData.message,
  }),
});`}</pre>
                </div>
              </div>

              <div className="border-t border-white/[0.05] pt-3 text-xs text-slate-500 space-y-1">
                <p>• O lead entra com status <strong className="text-slate-400">Novo</strong> e badge <strong className="text-slate-400">Site</strong></p>
                <p>• A URL já está pronta — não precisa de configuração adicional</p>
              </div>
            </div>
          )}

          {integrationTab === 'meta-leads' && (
            <div className="bg-[#21262d] rounded-xl p-6 border border-white/[0.08] space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Meta Lead Ads — Captação automática</h3>
                  <p className="text-xs text-slate-500">Leads dos formulários do Facebook/Instagram chegam automaticamente na aba Leads</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">URL do Webhook</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={WEBHOOK_URL}
                    className="flex-1 bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-slate-400 font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(WEBHOOK_URL, setCopiedWebhook)}
                    className="px-3 py-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
                  >
                    {copiedWebhook ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedWebhook ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Page ID</label>
                  <input
                    type="text"
                    value={leadsPageId}
                    onChange={e => setLeadsPageId(e.target.value)}
                    className="w-full bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ID da sua Página do Facebook"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Page Access Token</label>
                  <div className="relative">
                    <input
                      type={leadsShowPageToken ? 'text' : 'password'}
                      value={leadsPageToken}
                      onChange={e => setLeadsPageToken(e.target.value)}
                      className="w-full bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="EAAxxxxxxxx..."
                    />
                    <button onClick={() => setLeadsShowPageToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {leadsShowPageToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {metaLeadsVerifyToken && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Verify Token</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={metaLeadsVerifyToken}
                        className="flex-1 bg-[#161b22] border border-white/[0.08] rounded-lg px-3 py-2.5 text-xs text-slate-400 font-mono focus:outline-none"
                      />
                      <button
                        onClick={() => copyToClipboard(metaLeadsVerifyToken, setCopiedVerifyToken)}
                        className="px-3 py-2 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
                      >
                        {copiedVerifyToken ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedVerifyToken ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Use este token ao configurar o webhook no Meta Business Manager</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveLeadsConfig}
                  disabled={!leadsPageId.trim() || !leadsPageToken.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  {leadsSaved ? <CheckCircle className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                  {leadsSaved ? 'Salvo!' : 'Salvar configuração'}
                </button>
                {(metaLeadsPageId || metaLeadsPageToken) && (
                  <button
                    onClick={() => { clearMetaLeadsConfig(); setLeadsPageId(''); setLeadsPageToken(''); }}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >
                    Remover configuração
                  </button>
                )}
              </div>

              <div className="border-t border-white/[0.05] pt-3 text-xs text-slate-500 space-y-1">
                <p>• Acesse <strong className="text-slate-400">business.facebook.com</strong> → Configurações → Webhooks → adicione a URL acima</p>
                <p>• Inscreva-se no objeto <strong className="text-slate-400">page</strong>, campo <strong className="text-slate-400">leadgen</strong>, usando o Verify Token gerado</p>
                <p>• Page ID e Page Access Token: <strong className="text-slate-400">Meta Business Manager → Configurações → Páginas</strong></p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] sticky top-0 bg-[#21262d] z-10">
              <h2 className="text-lg font-bold text-slate-100">Novo usuário</h2>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-500 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Basic info */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Nome completo *</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome do usuário"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">E-mail *</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@agencia.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Função *</label>
                <select
                  value={userForm.role}
                  onChange={e => handleRoleChange(e.target.value as UserRole)}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm bg-[#21262d] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <option key={role} value={role}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Senha *</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-slate-400" />
                    Acessos permitidos
                  </div>
                </label>
                {userForm.role === 'admin' ? (
                  <div className="bg-purple-500/[0.1] border border-purple-500/[0.3] rounded-lg px-3 py-2.5 text-sm text-purple-400 flex items-center gap-2">
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    Administradores têm acesso completo a todos os módulos.
                  </div>
                ) : (
                  <div className="border border-white/[0.08] rounded-lg p-3 grid grid-cols-2 gap-2">
                    {PAGE_PERMISSIONS.filter(p => p.key !== 'settings').map(p => (
                      <label key={p.key} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.includes(p.key)}
                          onChange={() => togglePermission(p.key)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-sm text-slate-200 group-hover:text-white">{p.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Professional profile */}
              <div className="border-t border-white/[0.05] pt-4">
                <label className="flex items-center gap-2.5 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={userForm.createProfessional}
                    onChange={e => setUserForm({ ...userForm, createProfessional: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-200">Criar perfil de profissional vinculado</span>
                  </div>
                </label>

                {userForm.createProfessional && (
                  <div className="space-y-3 pl-6 border-l-2 border-white/[0.05]">
                    <div>
                      <label className="block text-sm font-medium text-slate-200 mb-1.5">Profissão *</label>
                      <select
                        value={userForm.profession}
                        onChange={e => setUserForm({ ...userForm, profession: e.target.value as ProfessionType })}
                        className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm bg-[#21262d] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {PROFESSIONS.map(p => (
                          <option key={p} value={p}>{getProfessionLabel(p)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-200 mb-1.5">Telefone</label>
                      <input
                        type="text"
                        value={userForm.phone}
                        onChange={e => setUserForm({ ...userForm, phone: e.target.value })}
                        className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-200 mb-1.5">Chave PIX</label>
                      <input
                        type="text"
                        value={userForm.pixKey}
                        onChange={e => setUserForm({ ...userForm, pixKey: e.target.value })}
                        className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="CPF, e-mail ou telefone"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {formError && (
              <div className="px-6 pb-2">
                <p className="text-sm text-red-600 bg-red-500/[0.1] border border-red-500/[0.3] rounded-lg px-3 py-2">{formError}</p>
              </div>
            )}

            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05] sticky bottom-0 bg-[#21262d]">
              <button onClick={() => setShowUserModal(false)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={handleCreateUser}
                disabled={submitting || !userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                {submitting ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserId && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] sticky top-0 bg-[#21262d] z-10">
              <h2 className="text-lg font-bold text-slate-100">Editar usuário</h2>
              <button onClick={() => setEditUserId(null)} className="text-slate-400 hover:text-slate-500 p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Nome completo *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Função</label>
                <select
                  value={editForm.role}
                  onChange={e => handleEditRoleChange(e.target.value as UserRole)}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm bg-[#21262d] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <option key={role} value={role}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-slate-400" />
                    Acessos permitidos
                  </div>
                </label>
                {editForm.role === 'admin' ? (
                  <div className="bg-purple-500/[0.1] border border-purple-500/[0.3] rounded-lg px-3 py-2.5 text-sm text-purple-400 flex items-center gap-2">
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    Administradores têm acesso completo a todos os módulos.
                  </div>
                ) : (
                  <div className="border border-white/[0.08] rounded-lg p-3 grid grid-cols-2 gap-2">
                    {PAGE_PERMISSIONS.filter(p => p.key !== 'settings').map(p => (
                      <label key={p.key} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={editForm.permissions.includes(p.key)}
                          onChange={() => toggleEditPermission(p.key)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-sm text-slate-200 group-hover:text-white">{p.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.05] pt-4">
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-slate-400" />
                    Nova senha
                    <span className="text-xs text-slate-500 font-normal">(deixe em branco para não alterar)</span>
                  </div>
                </label>
                <input
                  type="password"
                  value={editForm.newPassword}
                  onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                  className="w-full border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            {editError && (
              <div className="px-6 pb-2">
                <p className="text-sm text-red-600 bg-red-500/[0.1] border border-red-500/[0.3] rounded-lg px-3 py-2">{editError}</p>
              </div>
            )}

            <div className="flex gap-3 px-6 py-4 border-t border-white/[0.05] sticky bottom-0 bg-[#21262d]">
              <button onClick={() => setEditUserId(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">
                Cancelar
              </button>
              <button
                onClick={handleEditUser}
                disabled={editSubmitting || !editForm.name.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                {editSubmitting ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user confirmation */}
      {deleteUserId && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#21262d] rounded-xl border border-white/[0.08] shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Confirmar exclusão</h3>
            <p className="text-slate-500 text-sm mb-6">Deseja excluir este usuário? O acesso ao sistema será revogado imediatamente.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteUserId(null)} className="flex-1 border border-white/[0.08] text-slate-500 py-2.5 rounded-lg text-sm font-medium hover:bg-white/[0.04]">Cancelar</button>
              <button onClick={handleDeleteUser} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
