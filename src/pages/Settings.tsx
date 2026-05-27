import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { PAGE_PERMISSIONS } from '../utils/permissions';
import type { UserRole } from '../types';
import { Plus, Trash2, X, Shield, Users, Info, Lock } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gestor de Projetos',
  professional: 'Profissional',
  financial: 'Financeiro',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  professional: 'bg-green-100 text-green-700',
  financial: 'bg-orange-100 text-orange-700',
};

const emptyUserForm = {
  name: '',
  email: '',
  role: 'professional' as UserRole,
  password: '',
  permissions: [] as string[],
};

export const Settings = () => {
  const { users, currentUser, addUser, deleteUser } = useAuthStore();
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'system'>('users');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const togglePermission = (key: string) => {
    setUserForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(k => k !== key)
        : [...f.permissions, key],
    }));
  };

  const handleCreateUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim()) return;
    setSubmitting(true);
    setFormError('');
    try {
      await addUser(
        {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          permissions: userForm.role === 'admin' ? undefined : userForm.permissions,
        },
        userForm.password
      );
      setUserForm(emptyUserForm);
      setShowUserModal(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteUserId && deleteUserId !== currentUser?.id) {
      try {
        await deleteUser(deleteUserId);
      } catch {
        // ignore errors silently
      }
      setDeleteUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Configurações</h1>
        <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Gerenciamento do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'users' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
            activeTab === 'system' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Sistema
          </div>
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Usuários do sistema</h2>
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

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.id} className={`hover:bg-blue-50/50 transition-colors ${user.id === currentUser?.id ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.name.charAt(0)}
                        </div>
                        <span className="text-sm font-semibold text-slate-800">
                          {user.name}
                          {user.id === currentUser?.id && (
                            <span className="ml-2 text-xs text-blue-600 font-normal">(você)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
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
                        {user.id !== currentUser?.id ? (
                          <button
                            onClick={() => setDeleteUserId(user.id)}
                            className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Permission matrix */}
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-800">Matriz de permissões padrão</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-semibold text-slate-600">Recurso</th>
                    <th className="text-center py-2 px-3 font-semibold text-purple-600">Admin</th>
                    <th className="text-center py-2 px-3 font-semibold text-blue-600">Gestor</th>
                    <th className="text-center py-2 px-3 font-semibold text-green-600">Profissional</th>
                    <th className="text-center py-2 px-3 font-semibold text-orange-600">Financeiro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                    <tr key={row.label} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-600">{row.label}</td>
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
          <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-800">Informações do sistema</h3>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Nome do sistema', value: 'Gestão Operacional de Agência de Marketing' },
                { label: 'Versão', value: '1.0.0' },
                { label: 'Banco de dados', value: 'Supabase (PostgreSQL)' },
                { label: 'Tecnologia', value: 'React + TypeScript + Tailwind CSS' },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-700">{value}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Regras do sistema</p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                  Uma tarefa só gera valor financeiro uma única vez (ao ser movida para "Concluído").
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                  O saldo do profissional aumenta automaticamente ao concluir uma tarefa.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                  Apenas administradores podem criar novos usuários e definir seus acessos.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                  Profissionais visualizam apenas suas próprias tarefas e valores.
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                  Pagamentos duplicados são bloqueados automaticamente pelo sistema.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800">Novo usuário</h2>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome completo *</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome do usuário"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail *</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@agencia.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Função *</label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm({ ...userForm, role: e.target.value as UserRole, permissions: [] })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <option key={role} value={role}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha *</label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-slate-400" />
                    Acessos permitidos
                  </div>
                </label>
                {userForm.role === 'admin' ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5 text-sm text-purple-700 flex items-center gap-2">
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    Administradores têm acesso completo a todos os módulos.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2">
                    {PAGE_PERMISSIONS.filter(p => p.key !== 'settings').map(p => (
                      <label key={p.key} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.includes(p.key)}
                          onChange={() => togglePermission(p.key)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">{p.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {formError && (
              <div className="px-6 pb-2">
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
              </div>
            )}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowUserModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">
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

      {/* Delete user confirmation */}
      {deleteUserId && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar exclusão</h3>
            <p className="text-slate-500 text-sm mb-6">Deseja excluir este usuário? O acesso ao sistema será revogado imediatamente.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteUserId(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDeleteUser} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
