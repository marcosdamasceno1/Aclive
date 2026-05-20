import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Briefcase, Lock, Mail, AlertCircle } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const success = login(email, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('E-mail ou senha incorretos. Verifique os dados e tente novamente.');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Gestão Operacional</h1>
          <p className="text-slate-400 text-sm mt-1">Agência de Marketing</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-slate-800 text-xl font-semibold mb-6">Entrar na plataforma</h2>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="seu@email.com"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Credenciais de acesso</p>
            <div className="space-y-2">
              {[
                { email: 'admin@agencia.com', pass: 'admin123', role: 'Administrador' },
                { email: 'gestor@agencia.com', pass: 'gestor123', role: 'Gestor' },
                { email: 'financeiro@agencia.com', pass: 'fin123', role: 'Financeiro' },
              ].map(({ email: e, pass, role }) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { setEmail(e); setPassword(pass); }}
                  className="w-full text-left p-2 rounded-lg hover:bg-white transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-mono">{e}</span>
                    <span className="text-xs text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">usar</span>
                  </div>
                  <span className="text-xs text-slate-400">{role} • senha: {pass}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
