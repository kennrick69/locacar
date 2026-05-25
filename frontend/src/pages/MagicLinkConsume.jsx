import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Car, Loader2, CheckCircle2, XCircle, Mail } from 'lucide-react';

/**
 * /admin/magic?token=XXX
 * Recebe o clique do magic link. Chama consume no backend,
 * persiste JWT, redireciona pro painel admin.
 *
 * Estados:
 *  - validating: carregando
 *  - success: redirecionando pra /admin
 *  - error: token inválido/expirado/usado → mostra erro + botão pedir novo
 */
export default function MagicLinkConsume() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { magicLinkConsume } = useAuth();
  const [status, setStatus] = useState('validating'); // validating | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const ran = useRef(false); // protege contra StrictMode dupla execução em dev

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = params.get('token');
    if (!token) {
      setErrorMsg('Link inválido (token não encontrado na URL).');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const user = await magicLinkConsume(token);
        setStatus('success');
        // Pequeno delay pra UX (vê o ✅ antes de navegar)
        setTimeout(() => {
          navigate(user.role === 'admin' ? '/admin' : '/motorista', { replace: true });
        }, 800);
      } catch (err) {
        const status = err.response?.status;
        const apiMsg = err.response?.data?.error || '';
        if (status === 401) {
          setErrorMsg(apiMsg || 'Link inválido, expirado ou já usado.');
        } else if (status === 400) {
          setErrorMsg(apiMsg || 'Link mal formado.');
        } else {
          setErrorMsg('Erro de conexão. Tente novamente.');
        }
        setStatus('error');
      }
    })();
  }, [params, navigate, magicLinkConsume]);

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

        <div className="card text-center py-8">
          {status === 'validating' && (
            <>
              <Loader2 className="w-12 h-12 text-brand-600 animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Validando seu acesso</h2>
              <p className="text-sm text-gray-500">Só um instante…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Bem-vindo!</h2>
              <p className="text-sm text-gray-500">Levando você ao painel…</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-full mb-4">
                <XCircle className="w-7 h-7 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Não consegui te logar</h2>
              <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
              <Link
                to="/login"
                className="btn-primary inline-flex items-center gap-2 px-6 py-3"
              >
                <Mail className="w-4 h-4" />
                Pedir novo link
              </Link>
              <p className="text-xs text-gray-400 mt-4">
                Links de acesso expiram em 15 minutos e funcionam uma única vez.
              </p>
            </>
          )}
        </div>

        <div className="text-center mt-4">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← Voltar para vitrine
          </Link>
        </div>
      </div>
    </div>
  );
}
