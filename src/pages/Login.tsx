import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { AlertCircle } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      console.log('[login] iniciando...');
      const ok = await login(email, password);
      console.log('[login] resultado:', ok);
      if (ok) {
        navigate('/dashboard');
      } else {
        setError('E-mail ou senha incorretos.');
      }
    } catch (err) {
      console.error('[login] erro:', err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0f172a] flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-black">A</span>
          </div>
          <span className="text-white font-bold text-lg">Aclive</span>
        </div>
        <div>
          <h1 className="text-white text-5xl font-extrabold leading-tight tracking-tight mb-4">
            Operação<br />sem<br />fricção.
          </h1>
          <p className="text-slate-400 text-base max-w-xs leading-relaxed">
            Gerencie demandas, profissionais e financeiro da sua agência em um único lugar.
          </p>
        </div>
        <div className="flex items-center gap-6">
          {[['Demandas', 'Kanban completo'], ['Financeiro', 'Automático'], ['Relatórios', 'Em tempo real']].map(([t, s]) => (
            <div key={t}>
              <p className="text-white text-sm font-semibold">{t}</p>
              <p className="text-slate-500 text-xs">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-[#0d1117] px-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-black">A</span>
            </div>
            <span className="text-white font-bold text-lg">Aclive</span>
          </div>

          <h2 className="text-2xl font-extrabold text-white mb-1 tracking-tight">Entrar</h2>
          <p className="text-slate-400 text-sm mb-8">Acesse o painel da sua agência.</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/[0.1] border border-red-500/[0.3] text-red-400 rounded-lg px-4 py-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="seu@email.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-white/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-2"
            >
              {loading ? 'Verificando...' : 'Entrar na plataforma'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
