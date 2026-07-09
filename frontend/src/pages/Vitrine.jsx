import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { carsAPI, propertiesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Car, Calendar, DollarSign, ArrowRight, Lock, User, KeyRound, AlertCircle, CheckCircle2, Building2, Bed, Bath, Ruler, Home, Phone, ShieldAlert, FileWarning, Camera, Video, ClipboardList, Ban, ChevronDown, TriangleAlert, MapPin, IdCard, Eye, Siren } from 'lucide-react';

const FEATURE_LABELS = {
  ar_condicionado: 'A/C', vidro_eletrico: 'Vidros El.', trava_eletrica: 'Travas El.',
  airbag: 'Airbag', freio_abs: 'ABS', sensor_estacionamento: 'Sensor Est.',
  camera_re: 'Câm. Ré', multimidia: 'Multimídia', bluetooth: 'Bluetooth',
  gps_nativo: 'GPS', banco_couro: 'Couro', teto_solar: 'Teto Solar',
  sensor_chuva: 'Sensor Chuva', farol_neblina: 'Farol Neblina', rodas_liga: 'Rodas Liga',
  alarme: 'Alarme', controle_tracao: 'Contr. Tração', piloto_automatico: 'Piloto Auto.',
};

export default function Vitrine() {
  const [cars, setCars] = useState([]);
  const [properties, setProperties] = useState([]);
  const [activeTab, setActiveTab] = useState('veiculos');
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [openSinistro, setOpenSinistro] = useState({});
  const navigate = useNavigate();
  const { tokenLogin } = useAuth();

  useEffect(() => {
    Promise.all([
      carsAPI.list().then(res => setCars(res.data)).catch(err => console.error('Erro ao carregar carros:', err)),
      propertiesAPI.list().then(res => setProperties(res.data)).catch(err => console.error('Erro ao carregar imoveis:', err)),
    ]).finally(() => setLoading(false));
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
      await tokenLogin(cleaned);
      navigate('/motorista');
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
            <span className="text-xl font-bold text-brand-800">IMP Locadora</span>
          </div>
          <Link to="/login" className="text-sm text-gray-600 hover:text-brand-600 font-medium">
            Admin
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Alugue veiculos e imoveis
              </h1>
              <p className="text-brand-200 text-lg mb-6">
                Carros prontos para rodar em apps de transporte e imoveis para morar.
                Sem burocracia, sem fiador.
              </p>
              <p className="text-brand-300 text-sm">
                Escolha abaixo e clique em <strong>"Tenho Interesse"</strong> para comecar
              </p>
            </div>

            {/* Login do motorista */}
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
                      type="text" value={token} onChange={handleTokenInput}
                      placeholder="6 primeiros dígitos do CPF"
                      className="w-full pl-10 pr-4 py-3 bg-white rounded-lg text-gray-800 placeholder-gray-400 text-lg tracking-widest font-mono focus:ring-2 focus:ring-brand-400 outline-none"
                      maxLength={6} inputMode="numeric"
                    />
                  </div>
                  {tokenError && (
                    <div className="flex items-center gap-1.5 mt-2 text-red-300 text-sm">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{tokenError}</span>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={tokenLoading || token.length < 6}
                  className="w-full py-3 bg-white text-brand-700 font-semibold rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {tokenLoading ? (
                    <div className="w-5 h-5 border-2 border-brand-300 border-t-brand-700 rounded-full animate-spin" />
                  ) : (
                    <><User className="w-4 h-4" /> Acessar Minha Conta</>
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

      {/* Tabs */}
      <section className="max-w-6xl mx-auto px-4 pt-8">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('veiculos')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              activeTab === 'veiculos'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <Car className="w-4 h-4" /> Veiculos ({cars.length})
          </button>
          <button
            onClick={() => setActiveTab('imoveis')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              activeTab === 'imoveis'
                ? 'bg-brand-600 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <Building2 className="w-4 h-4" /> Imoveis ({properties.length})
          </button>
        </div>
      </section>

      {/* Listing */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : activeTab === 'veiculos' ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Carros Disponiveis</h2>
              <span className="text-sm text-gray-400">{cars.length} veiculos</span>
            </div>
            {cars.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Car className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Nenhum carro disponivel no momento</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {cars.map(car => (
                  <Link key={car.id} to={`/carro/${car.id}`}
                    className="card hover:shadow-lg transition-all duration-200 cursor-pointer group">
                    <div className="aspect-video bg-gray-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                      {car.foto_url ? (
                        <img src={car.foto_url} alt={`${car.marca} ${car.modelo}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Car className="w-12 h-12 text-gray-300" />
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-gray-800">{car.marca} {car.modelo}</h3>

                    <div className="flex flex-wrap gap-1.5 mt-2 text-sm text-gray-500">
                      {car.ano && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {car.ano}</span>}
                      {car.cor && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{car.cor}</span>}
                      {Object.entries(FEATURE_LABELS).map(([key, label]) =>
                        car[key] ? <span key={key} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">{label}</span> : null
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                      <div>
                        <span className="text-xs text-gray-400">Valor semanal</span>
                        <p className="text-xl font-bold text-brand-700">
                          R$ {parseFloat(car.valor_semanal).toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                      <span className="text-sm text-brand-600 font-medium group-hover:text-brand-700 flex items-center gap-1">
                        Ver detalhes <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Imoveis Disponiveis</h2>
              <span className="text-sm text-gray-400">{properties.length} imoveis</span>
            </div>
            {properties.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Home className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>Nenhum imovel disponivel no momento</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map(property => (
                  <Link key={property.id} to={`/imovel/${property.id}`}
                    className="card hover:shadow-lg transition-all duration-200 cursor-pointer group">
                    <div className="aspect-video bg-gray-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden relative">
                      {property.foto_url ? (
                        <img src={property.foto_url} alt={property.titulo || property.tipo}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Home className="w-12 h-12 text-gray-300" />
                      )}
                      <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                        {property.tipo}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-800">
                      {property.titulo || `${property.tipo} - ${property.bairro || ''}`}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {property.bairro}{property.cidade ? `, ${property.cidade}` : ''}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-500">
                      {property.quartos > 0 && (
                        <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" /> {property.quartos} qto(s)</span>
                      )}
                      {property.banheiros > 0 && (
                        <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {property.banheiros} ban</span>
                      )}
                      {property.area_m2 > 0 && (
                        <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5" /> {property.area_m2} m2</span>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                      <div>
                        <span className="text-xs text-gray-400">Valor mensal</span>
                        <p className="text-xl font-bold text-brand-700">
                          R$ {parseFloat(property.valor_mensal).toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                      <span className="text-sm text-brand-600 font-medium group-hover:text-brand-700 flex items-center gap-1">
                        Ver detalhes <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Sinistro / Emergência */}
      <section id="sinistro" className="bg-red-50 border-t-4 border-red-500">
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7 text-red-600" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Em caso de Sinistro</h2>
            <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
              Acidente, colisao, roubo ou pane mecanica? Siga rigorosamente os passos abaixo.
              <strong className="text-red-600"> NAO mova os veiculos antes de documentar tudo.</strong>
            </p>
          </div>

          {/* Telefone da Seguradora */}
          <div className="bg-white rounded-2xl shadow-md border border-red-200 p-6 max-w-lg mx-auto mb-10">
            <p className="text-sm text-gray-500 text-center mb-2 font-medium">Guincho / Seguradora — Ligue imediatamente</p>
            <a href="tel:08006476475"
              className="flex items-center justify-center gap-3 bg-red-600 text-white px-6 py-4 rounded-xl text-2xl font-bold hover:bg-red-700 transition-colors">
              <Phone className="w-7 h-7" />
              0800-647-6475
            </a>
            <p className="text-xs text-gray-400 text-center mt-2">Atendimento 24 horas — Guincho gratuito pelo seguro</p>
          </div>

          {/* ===== PASSO 1 ===== */}
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, s1: !p.s1 }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Passo 1</span>
                  <h3 className="font-bold text-gray-800 text-lg">Garanta sua seguranca e sinalize</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.s1 ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.s1 && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">1.</span> Desligue o motor imediatamente e ligue o <strong>pisca-alerta</strong>.</li>
                    <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">2.</span> Coloque o <strong>triangulo de sinalizacao</strong> a pelo menos <strong>30 metros</strong> do veiculo (em rodovias: 60 a 100 metros).</li>
                    <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">3.</span> Se for seguro, permaneca <strong>fora do veiculo</strong>, atras de guard-rails ou no acostamento.</li>
                    <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">4.</span> Verifique se ha feridos em <strong>todos</strong> os veiculos envolvidos.</li>
                    <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">5.</span> Se houver feridos, ligue imediatamente: <strong>SAMU (192)</strong> ou <strong>Bombeiros (193)</strong>.</li>
                  </ul>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                    <p className="text-xs text-red-700 font-bold">NAO MOVA OS VEICULOS antes de concluir TODOS os passos de documentacao abaixo, exceto se houver risco iminente de vida, incendio ou explosao.</p>
                  </div>
                </div>
              )}
            </div>

            {/* ===== PASSO 2 ===== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, s2: !p.s2 }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <Camera className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wide">Passo 2</span>
                  <h3 className="font-bold text-gray-800 text-lg">Fotografe TUDO antes de mover qualquer veiculo</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.s2 ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.s2 && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  <p className="text-sm text-gray-500 font-medium">Tire no minimo <strong>30 fotos</strong>. Mais e melhor — depois voce descarta. Ative a <strong>geolocalizacao (GPS)</strong> e <strong>data/hora</strong> na camera do celular.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs font-bold text-blue-700 mb-2 uppercase">Visao geral da cena</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Foto <strong>panoramica dos 4 cantos</strong> do cruzamento/local</li>
                        <li>• <strong>Posicao dos veiculos</strong> na via (de longe, mostrando contexto)</li>
                        <li>• A rua em <strong>ambas as direcoes</strong> de onde os veiculos vieram</li>
                        <li>• Vista de cima se possivel (passarela, ponto elevado)</li>
                      </ul>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4">
                      <p className="text-xs font-bold text-amber-700 mb-2 uppercase">Sinalizacao e via</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• <strong>Placas de sinalizacao</strong> (pare, velocidade, preferencial)</li>
                        <li>• <strong>Semaforos</strong> e seu estado (se possivel, filme o ciclo)</li>
                        <li>• <strong>Faixas no chao</strong> (setas, faixa de pedestres, linha continua)</li>
                        <li>• <strong>Nome das ruas</strong> (placas de identificacao)</li>
                      </ul>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-xs font-bold text-red-700 mb-2 uppercase">Danos nos veiculos</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Cada veiculo: <strong>frente, traseira, lateral esquerda e direita</strong></li>
                        <li>• <strong>Close-up de cada area danificada</strong> (use moeda/caneta como referencia de tamanho)</li>
                        <li>• <strong>Placa de todos os veiculos</strong> envolvidos</li>
                        <li>• Interior do veiculo se houver danos</li>
                      </ul>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs font-bold text-green-700 mb-2 uppercase">Marcas e evidencias</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• <strong>Marcas de frenagem</strong> no asfalto (de perto E de longe)</li>
                        <li>• <strong>Fragmentos</strong> de vidro, plastico ou pecas no chao</li>
                        <li>• <strong>Condicao do pavimento</strong> (buracos, oleo, agua)</li>
                        <li>• <strong>Cameras de seguranca</strong> visiveis na regiao</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                    <p className="font-bold text-gray-700 mb-1">Dicas para as fotos:</p>
                    <p>Comece de <strong>longe</strong> (panoramico) e va <strong>aproximando</strong> (detalhe). Tire 3 distancias de cada angulo. Fotografe <strong>com e sem flash</strong>. Limpe a lente antes de comecar. Nao use zoom digital — aproxime-se fisicamente. Salve em nuvem imediatamente.</p>
                  </div>
                </div>
              )}
            </div>

            {/* ===== PASSO 3 ===== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, s3: !p.s3 }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                  <Video className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-purple-500 uppercase tracking-wide">Passo 3</span>
                  <h3 className="font-bold text-gray-800 text-lg">Filme um video completo da cena</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.s3 ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.s3 && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex gap-2"><span className="text-purple-500 font-bold shrink-0">1.</span> Grave um video de <strong>2 a 3 minutos</strong>, andando ao redor de toda a cena em <strong>360 graus</strong>.</li>
                    <li className="flex gap-2"><span className="text-purple-500 font-bold shrink-0">2.</span> <strong>Narre no video:</strong> data, hora, local (nome da rua), e descreva o que aconteceu.</li>
                    <li className="flex gap-2"><span className="text-purple-500 font-bold shrink-0">3.</span> Filme de perto os <strong>danos em cada veiculo</strong>.</li>
                    <li className="flex gap-2"><span className="text-purple-500 font-bold shrink-0">4.</span> Filme as <strong>placas de sinalizacao, semaforos e nome das ruas</strong>.</li>
                    <li className="flex gap-2"><span className="text-purple-500 font-bold shrink-0">5.</span> Filme as <strong>marcas de frenagem</strong> e fragmentos no chao.</li>
                    <li className="flex gap-2"><span className="text-purple-500 font-bold shrink-0">6.</span> Se houver cameras de seguranca na regiao, <strong>filme a localizacao delas</strong>.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* ===== PASSO 4 ===== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, s4: !p.s4 }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <IdCard className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wide">Passo 4</span>
                  <h3 className="font-bold text-gray-800 text-lg">Colete os dados de todos os envolvidos</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.s4 ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.s4 && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-amber-50 rounded-lg p-4">
                      <p className="text-xs font-bold text-amber-700 mb-2 uppercase">De cada motorista</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Nome completo</li>
                        <li>• CPF e RG</li>
                        <li>• CNH (numero, categoria, validade) — <strong>fotografe</strong></li>
                        <li>• Telefone(s) de contato</li>
                        <li>• Endereco</li>
                      </ul>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs font-bold text-blue-700 mb-2 uppercase">De cada veiculo</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Placa — <strong>fotografe</strong></li>
                        <li>• Marca, modelo, cor e ano</li>
                        <li>• RENAVAM (consta no CRLV)</li>
                        <li>• Nome do proprietario (se diferente do condutor)</li>
                        <li>• Seguradora e numero da apolice</li>
                      </ul>
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-xs font-bold text-green-700 mb-2 uppercase">Testemunhas</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Pergunte a pedestres e motoristas se viram o acidente.</li>
                      <li>• Anote: <strong>nome, telefone e breve relato</strong> do que a pessoa viu.</li>
                      <li>• Verifique comercios proximos — podem ter <strong>cameras de seguranca</strong>. Peca as imagens ou anote o nome do estabelecimento.</li>
                    </ul>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                    <strong>Dica:</strong> A maneira mais rapida e <strong>fotografar a CNH e o CRLV</strong> de todos os envolvidos — assim voce garante todos os dados de uma vez.
                  </div>
                </div>
              )}
            </div>

            {/* ===== PASSO 5 ===== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, s5: !p.s5 }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                  <Phone className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-wide">Passo 5</span>
                  <h3 className="font-bold text-gray-800 text-lg">Ligue para a seguradora e para a locadora</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.s5 ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.s5 && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-600 mb-2">Guincho / Seguradora</p>
                    <a href="tel:08006476475" className="text-2xl font-bold text-red-600 hover:text-red-700">0800-647-6475</a>
                    <p className="text-xs text-gray-400 mt-1">24 horas — Guincho gratuito pelo seguro</p>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex gap-2"><span className="text-orange-500 font-bold shrink-0">1.</span> Ligue para a seguradora e informe: <strong>placa, local exato e o que aconteceu</strong>.</li>
                    <li className="flex gap-2"><span className="text-orange-500 font-bold shrink-0">2.</span> Anote o <strong>numero do protocolo</strong> de atendimento.</li>
                    <li className="flex gap-2"><span className="text-orange-500 font-bold shrink-0">3.</span> Aguarde o guincho — <strong>nao autorize reparos</strong> por conta propria.</li>
                    <li className="flex gap-2"><span className="text-orange-500 font-bold shrink-0">4.</span> <strong>Nao abandone o veiculo</strong>. Aguarde em local seguro, fora da via.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* ===== PASSO 6 ===== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, s6: !p.s6 }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <ClipboardList className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-green-500 uppercase tracking-wide">Passo 6</span>
                  <h3 className="font-bold text-gray-800 text-lg">Registre o Boletim de Ocorrencia (B.O.)</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.s6 ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.s6 && (
                <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex gap-2"><span className="text-green-500 font-bold shrink-0">•</span> <strong>Sem vitimas:</strong> pode registrar B.O. online (Delegacia Eletronica do seu estado).</li>
                    <li className="flex gap-2"><span className="text-green-500 font-bold shrink-0">•</span> <strong>Com vitimas, roubo ou fuga:</strong> B.O. presencial obrigatorio na delegacia mais proxima.</li>
                    <li className="flex gap-2"><span className="text-green-500 font-bold shrink-0">•</span> <strong>Rodovias federais:</strong> acione a PRF (191).</li>
                    <li className="flex gap-2"><span className="text-green-500 font-bold shrink-0">•</span> Registre o mais rapido possivel — preferencialmente <strong>no mesmo dia</strong>.</li>
                    <li className="flex gap-2"><span className="text-green-500 font-bold shrink-0">•</span> Envie o B.O. e todas as fotos/videos para a locadora assim que possivel.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* ===== O QUE NAO FAZER ===== */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-red-200 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, nao: !p.nao }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-red-50 transition-colors">
                <div className="w-11 h-11 bg-red-600 rounded-lg flex items-center justify-center shrink-0">
                  <Ban className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Atencao</span>
                  <h3 className="font-bold text-red-700 text-lg">O que NAO fazer</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-red-400 transition-transform ${openSinistro.nao ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.nao && (
                <div className="px-5 pb-5 space-y-2 border-t border-red-100 pt-4">
                  {[
                    'NAO mova os veiculos antes de fotografar e filmar tudo.',
                    'NAO admita culpa — relate apenas os fatos. A culpa e determinada pela pericia.',
                    'NAO faca acordo verbal ou "acerto" no local — isso invalida o seguro.',
                    'NAO assine nada que nao seja o B.O. oficial.',
                    'NAO discuta ou brigue com o outro motorista.',
                    'NAO abandone o local antes da autoridade chegar (se houver vitimas, e crime — Art. 305 do CTB).',
                    'NAO consuma alcool ou qualquer substancia apos o acidente.',
                    'NAO altere a cena (nao limpe vidros, nao recolha pecas).',
                    'NAO autorize reparos sem autorizacao da seguradora/locadora.',
                    'NAO tente religar o motor se o veiculo entrar em contato com agua (causa dano irreparavel).',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 bg-red-50 rounded-lg p-2.5">
                      <Ban className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-800">{item}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ===== TELEFONES DE EMERGENCIA ===== */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenSinistro(p => ({ ...p, tel: !p.tel }))}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors">
                <div className="w-11 h-11 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                  <Siren className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Referencia</span>
                  <h3 className="font-bold text-gray-800 text-lg">Telefones de emergencia</h3>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openSinistro.tel ? 'rotate-180' : ''}`} />
              </button>
              {openSinistro.tel && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      { num: '192', label: 'SAMU', desc: 'Emergencias medicas', color: 'red' },
                      { num: '193', label: 'Bombeiros', desc: 'Incendio, resgate', color: 'orange' },
                      { num: '190', label: 'Policia Militar', desc: 'Roubo, crimes', color: 'blue' },
                      { num: '191', label: 'PRF', desc: 'Rodovias federais', color: 'green' },
                      { num: '199', label: 'Defesa Civil', desc: 'Enchentes, desastres', color: 'purple' },
                      { num: '0800-647-6475', label: 'Seguradora', desc: 'Guincho 24h', color: 'red' },
                    ].map(t => (
                      <a key={t.num} href={`tel:${t.num.replace(/-/g, '')}`}
                        className="flex flex-col items-center gap-1 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-center">
                        <span className={`text-lg font-bold text-${t.color}-600`}>{t.num}</span>
                        <span className="text-xs font-semibold text-gray-700">{t.label}</span>
                        <span className="text-[10px] text-gray-400">{t.desc}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      <footer className="bg-white border-t border-gray-200 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} IMP Locadora. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
