import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { Car, Eye, EyeOff, AlertTriangle } from 'lucide-react';

/**
 * /admin/login-senha — FALLBACK login admin por email+senha.
 *
 * Mantido temporariamente como rede de segurança caso o magic link
 * falhe (provedor de email caiu, JOs sem acesso ao email, etc).
 * Será removido depois que o JOs confirmar que o magic link funciona
 * 100% pra ele.
 *
 * Usa o mesmo endpoint /api/auth/login (que continua intacto no
 * backend). NÃO substitui o login motorista (que é em Vitrine.jsx).
 */
export default function LoginSenha() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !senha) return toast.warning('Preencha todos os campos');

    setLoading(true);
    try {
      const user = await login(email, senha);
      toast.success(`Bem-vindo, ${user.nome}!`);
      navigate(user.role === 'admin' ? '/admin' : '/motorista');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg shadow-brand-200">
            <Car className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">IMP Locadora</h1>
          <p className="text-gray-500 text-sm mt-1">Acesso administrativo</p>
        </div>

        {/* Banner fallback */}
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <strong>Modo emergência:</strong> Esta tela é só pra fallback. Use sempre o{' '}
            <Link to="/login" className="font-semibold underline hover:text-amber-900">
              link mágico
            </Link>{' '}
            quando possível.
          </div>
        </div>

        {/* Form */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Entrar com senha</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <div className="text-center mt-4 space-x-4 text-xs text-gray-400">
          <Link to="/" className="hover:text-gray-600">← Voltar para vitrine</Link>
          <span>·</span>
          <Link to="/login" className="hover:text-gray-600">Usar link mágico</Link>
        </div>
      </div>
    </div>
  );
}
