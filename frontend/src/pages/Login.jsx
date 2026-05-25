import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { Car, Mail, CheckCircle2 } from 'lucide-react';

/**
 * Login Admin — MAGIC LINK (sem senha).
 * Tela pede só o email. Se autorizado (ADMIN_EMAILS no Railway),
 * backend manda link único de 15min pro email do admin. JOs clica
 * no link → vai pra /admin/magic?token=XXX → consume → painel.
 *
 * IMPORTANTE: motoristas NÃO entram aqui. Motorista usa "Área do
 * Motorista" na vitrine (cartão azul na home, login por CPF).
 *
 * Fallback: /admin/login-senha (email+senha antigo) continua disponível
 * até o JOs confirmar magic link 100%.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { magicLinkRequest } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = (email || '').trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return toast.warning('Digite um email válido');
    }

    setLoading(true);
    try {
      const res = await magicLinkRequest(cleanEmail);
      // Backend sempre responde 200 com mensagem genérica
      setSent(true);
      toast.info(res?.message || 'Verifique sua caixa de entrada');
    } catch (err) {
      // Backend não retorna erro real aqui (anti-enumeração);
      // se chegou aqui é problema de rede / rate-limit (429).
      const status = err.response?.status;
      if (status === 429) {
        toast.error('Muitas solicitações. Aguarde 15 minutos.');
      } else {
        toast.error(err.response?.data?.error || 'Erro ao solicitar link');
      }
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

        {/* Form */}
        <div className="card">
          {!sent ? (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Entrar com link mágico</h2>
              <p className="text-sm text-gray-500 mb-6">
                Digite o email do admin. Vamos enviar um link único pra você entrar
                — sem precisar de senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email do admin</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field pl-10"
                      placeholder="seu@email.com"
                      autoComplete="email"
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn-primary w-full py-3 disabled:opacity-50"
                >
                  {loading ? 'Enviando link...' : 'Receber link de acesso'}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
                <p className="mb-1">
                  💡 <strong>É motorista?</strong> Volte à vitrine e use a "Área do Motorista"
                  (entrada com os 6 primeiros dígitos do CPF).
                </p>
                <p>
                  🔐 O link expira em <strong>15 minutos</strong> e funciona uma única vez.
                  Se o email não estiver autorizado, nada acontece.
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Verifique seu email</h2>
              <p className="text-sm text-gray-600 mb-2">
                Se <strong>{email}</strong> é um admin autorizado, você vai receber um link
                em alguns segundos.
              </p>
              <p className="text-xs text-gray-500 mb-6">
                Não chegou? Cheque a caixa de spam. O link expira em 15 minutos.
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                ← Pedir com outro email
              </button>
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">← Voltar para vitrine</Link>
        </div>
      </div>
    </div>
  );
}
