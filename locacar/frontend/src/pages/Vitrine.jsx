import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { carsAPI, authAPI } from '../services/api';
import { Car, Calendar, DollarSign, ArrowRight, Lock, User, KeyRound, AlertCircle } from 'lucide-react';

export default function Vitrine() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    carsAPI.list()
      .then(res => setCars(res.data))
      .catch(err => console.error('Erro ao carregar carros:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleTokenLogin = async (e) => {
    e.preventDefault();
    setTokenError('');

    const cleaned = token.replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setTokenError('Digite os 6 primeiros números do seu CPF');
      return;
    }

    setTokenLoading(true);
    try {
      const res = await authAPI.tokenLogin(cleaned);
      localStorage.setItem('locacar_token', res.data.token);
      localStorage.setItem('locacar_user', JSON.stringify(res.data.user));
      navigate('/driver');
    } catch (err) {
      setTokenError(err.response?.data?.error || 'Token não encontrado');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleTokenInput = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setToken(val);
    setTokenError('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-7 h-7 text-brand-600" />
            <span className="text-xl font-bold text-brand-800">LocaCar</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-600 hover:text-brand-600 font-medium">
              Admin
            </Link>
            <Link to="/register" className="btn-primary text-sm py-2 px-4">
              Cadastre-se
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Lado esquerdo — texto */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Alugue seu veículo de trabalho
              </h1>
              <p className="text-brand-200 text-lg mb-6">
                Carros prontos para rodar em apps de transporte. 
                Sem burocracia, sem fiador, pagamento semanal.
              </p>
              <Link to="/register" className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-6 py-3 rounded-lg hover:bg-brand-50 transition-colors">
                Quero alugar <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Lado direito — Login do motorista */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">Área do Motorista</h3>
                  <p className="text-brand-200 text-sm">Acesse seus débitos e pagamentos</p>
                </div>
              </div>

              <form onSubmit={handleTokenLogin} className="space-y-3">
                <div>
                  <label className="block text-sm text-brand-200 mb-1">Seu Token de Acesso</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={token}
                      onChange={handleTokenInput}
                      placeholder="6 primeiros dígitos do CPF"
                      className="w-full pl-10 pr-4 py-3 bg-white rounded-lg text-gray-800 placeholder-gray-400 text-lg tracking-widest font-mono focus:ring-2 focus:ring-brand-400 outline-none"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </div>
                  {tokenError && (
                    <div className="flex items-center gap-1.5 mt-2 text-red-300 text-sm">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{tokenError}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={tokenLoading || token.length < 6}
                  className="w-full py-3 bg-white text-brand-700 font-semibold rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {tokenLoading ? (
                    <div className="w-5 h-5 border-2 border-brand-300 border-t-brand-700 rounded-full animate-spin" />
                  ) : (
                    <>
                      <User className="w-4 h-4" /> Acessar Minha Conta
                    </>
                  )}
                </button>
              </form>

              <p className="text-brand-300 text-xs mt-3 text-center">
                Seu token é composto pelos 6 primeiros números do seu CPF
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Carros */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-800">Carros Disponíveis</h2>
          <span className="text-sm text-gray-400">{cars.length} veículos</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : cars.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum carro disponível no momento</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cars.map(car => (
              <div key={car.id} className="card hover:shadow-md transition-shadow">
                {/* Foto */}
                <div className="aspect-video bg-gray-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  {car.foto_url ? (
                    <img src={car.foto_url} alt={`${car.marca} ${car.modelo}`} className="w-full h-full object-cover" />
                  ) : (
                    <Car className="w-12 h-12 text-gray-300" />
                  )}
                </div>

                {/* Info — SEM PLACA */}
                <h3 className="text-lg font-semibold text-gray-800">
                  {car.marca} {car.modelo}
                </h3>

                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                  {car.ano && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {car.ano}
                    </span>
                  )}
                  {car.cor && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                      {car.cor}
                    </span>
                  )}
                </div>

                {/* Preço */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                  <div>
                    <span className="text-xs text-gray-400">Valor semanal</span>
                    <p className="text-xl font-bold text-brand-700">
                      R$ {parseFloat(car.valor_semanal).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <Link to="/register" className="text-sm text-brand-600 font-medium hover:text-brand-700 flex items-center gap-1">
                    Tenho interesse <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} LocaCar. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
