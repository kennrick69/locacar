import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { driversAPI, carsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  Users, Search, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, UserCheck, Shield, Car, Plus, X, KeyRound,
  Calendar, Zap, Banknote
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_analise', label: 'Em Análise' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'inadimplente', label: 'Inadimplente' },
  { value: 'rescindido', label: 'Rescindido' },
  { value: 'recolhido', label: 'Recolhido' },
];

const STATUS_BADGE = {
  pendente: 'bg-gray-100 text-gray-700', em_analise: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800', reprovado: 'bg-red-100 text-red-800',
  ativo: 'bg-green-100 text-green-800', inadimplente: 'bg-red-100 text-red-800',
  rescindido: 'bg-gray-200 text-gray-600', recolhido: 'bg-gray-200 text-gray-600',
};

const DIAS_SEMANA = [
  { value: 'segunda', label: 'Segunda' }, { value: 'terca', label: 'Terça' },
  { value: 'quarta', label: 'Quarta' }, { value: 'quinta', label: 'Quinta' },
  { value: 'sexta', label: 'Sexta' }, { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
];

const EMPTY_DRIVER = { nome: '', email: '', cpf: '', telefone: '', car_id: '', dia_cobranca: 'segunda', data_inicio: '', observacoes: '' };

export default function AdminDrivers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');

  // Novo motorista
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_DRIVER);
  const [cars, setCars] = useState([]);
  const [saving, setSaving] = useState(false);
  const [createdToken, setCreatedToken] = useState(null);

  // Gerar cobranças
  const [genModal, setGenModal] = useState(false);
  const [genDay, setGenDay] = useState('');
  const [genDate, setGenDate] = useState(new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);

  useEffect(() => { loadDrivers(); }, [statusFilter]);

  const loadDrivers = async () => {
    setLoading(true);
    try { const res = await driversAPI.list(statusFilter || undefined); setDrivers(res.data); }
    catch { toast.error('Erro ao carregar motoristas'); }
    finally { setLoading(false); }
  };

  const openNewDriver = async () => {
    setForm(EMPTY_DRIVER); setCreatedToken(null);
    try { const res = await carsAPI.listAll(); setCars(res.data.filter(c => c.disponivel)); } catch {}
    setModal(true);
  };

  const handleCpfInput = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    setForm({ ...form, cpf: v });
  };

  const handleSaveDriver = async () => {
    if (!form.nome || !form.cpf) return toast.warning('Nome e CPF são obrigatórios');
    setSaving(true);
    try {
      const res = await driversAPI.adminCreate({
        ...form, car_id: form.car_id || null,
        data_inicio: form.data_inicio || new Date().toISOString().split('T')[0],
      });
      setCreatedToken(res.data.token);
      toast.success('Motorista cadastrado!');
      loadDrivers();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao cadastrar'); }
    finally { setSaving(false); }
  };

  const openGenCharges = () => {
    // Detecta dia da semana atual
    const diasMap = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };
    setGenDay(diasMap[new Date().getDay()]);
    setGenDate(new Date().toISOString().split('T')[0]);
    setGenResult(null);
    setGenModal(true);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await driversAPI.autoGenerateCharges({ dia_cobranca: genDay, semana_ref: genDate });
      setGenResult(res.data);
      if (res.data.geradas > 0) toast.success(`${res.data.geradas} cobrança(s) gerada(s)!`);
      else toast.info('Nenhuma nova cobrança para gerar');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao gerar'); }
    finally { setGenerating(false); }
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status);
    if (status) { setSearchParams({ status }); } else { setSearchParams({}); }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const filtered = drivers.filter(d =>
    `${d.nome} ${d.email} ${d.cpf} ${d.telefone}`.toLowerCase().includes(search.toLowerCase())
  );

  // Contagem por dia de cobrança (motoristas ativos)
  const ativos = drivers.filter(d => d.status === 'ativo');
  const countByDay = {};
  DIAS_SEMANA.forEach(d => { countByDay[d.value] = ativos.filter(drv => (drv.dia_cobranca || 'segunda') === d.value).length; });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Motoristas</h1>
          <p className="text-gray-500 text-sm mt-1">{drivers.length} motoristas · {ativos.length} ativos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openGenCharges} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors">
            <Zap className="w-4 h-4" /> Gerar Cobranças
          </button>
          <button onClick={openNewDriver} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Motorista
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-10" placeholder="Buscar por nome, email, CPF..." />
        </div>
        <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className="input-field w-full sm:w-48">
          {STATUS_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(opt => {
          const count = opt.value ? drivers.filter(d => d.status === opt.value).length : drivers.length;
          return (
            <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                statusFilter === opt.value ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{opt.label} ({count})</button>
          );
        })}
      </div>

      {/* Cobrança por dia - resumo visual */}
      {ativos.length > 0 && (
        <div className="card bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-amber-600" /> Calendário de Cobranças
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA.map(d => (
              <div key={d.value} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                countByDay[d.value] > 0 ? 'bg-amber-500 text-white' : 'bg-white/80 text-gray-400'
              }`}>
                {d.label.substring(0, 3)} <span className="font-bold">{countByDay[d.value]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{search ? 'Nenhum resultado' : 'Nenhum motorista encontrado'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(driver => (
            <Link key={driver.id} to={`/admin/motoristas/${driver.id}`}
              className="card flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-brand-700">{driver.nome?.charAt(0)?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{driver.nome}</p>
                <p className="text-xs text-gray-400 truncate">
                  {driver.cpf}{driver.telefone && ` · ${driver.telefone}`}
                  {driver.dia_cobranca && driver.status === 'ativo' && (
                    <span className="ml-1 text-amber-600">· {DIAS_SEMANA.find(d => d.value === driver.dia_cobranca)?.label || driver.dia_cobranca}</span>
                  )}
                </p>
              </div>
              {driver.car_marca && (
                <div className="hidden md:flex items-center gap-1 text-xs text-gray-400">
                  <Car className="w-3.5 h-3.5" /> {driver.car_marca} {driver.car_modelo}
                </div>
              )}
              <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[driver.status] || 'bg-gray-100 text-gray-600'}`}>
                {driver.status?.replace('_', ' ')}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* ========== MODAL NOVO MOTORISTA ========== */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={() => { setModal(false); setCreatedToken(null); }}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-800">Novo Motorista</h3>
              <button onClick={() => { setModal(false); setCreatedToken(null); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>

            {createdToken ? (
              <div className="p-6 text-center space-y-4">
                <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
                <h3 className="text-lg font-bold text-gray-800">Motorista cadastrado!</h3>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500 mb-1">Token de acesso:</p>
                  <div className="flex items-center justify-center gap-2">
                    <KeyRound className="w-5 h-5 text-brand-600" />
                    <span className="text-3xl font-mono font-bold text-brand-700 tracking-widest">{createdToken}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Informe ao motorista para acessar o sistema</p>
                </div>
                <button onClick={() => { setModal(false); setCreatedToken(null); }} className="btn-primary w-full py-3">Fechar</button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                    <input type="text" value={form.nome} onChange={set('nome')} className="input-field" placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                    <input type="text" value={form.cpf} onChange={handleCpfInput} className="input-field" placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                    <input type="text" value={form.telefone} onChange={set('telefone')} className="input-field" placeholder="(00) 00000-0000" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
                    <input type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="email@exemplo.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Carro atribuído</label>
                  <select value={form.car_id} onChange={set('car_id')} className="input-field">
                    <option value="">Nenhum (atribuir depois)</option>
                    {cars.map(c => (
                      <option key={c.id} value={c.id}>{c.marca} {c.modelo} — {c.placa} (R$ {parseFloat(c.valor_semanal).toFixed(2)})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dia da cobrança *</label>
                    <select value={form.dia_cobranca} onChange={set('dia_cobranca')} className="input-field">
                      {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
                    <input type="date" value={form.data_inicio} onChange={set('data_inicio')} className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea value={form.observacoes} onChange={set('observacoes')} className="input-field" rows={2} placeholder="Opcional" />
                </div>

                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  <strong>Token de acesso</strong> = 6 primeiros dígitos do CPF
                </div>

                <button onClick={handleSaveDriver} disabled={saving} className="btn-primary w-full py-3">
                  {saving ? 'Cadastrando...' : 'Cadastrar Motorista'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== MODAL GERAR COBRANÇAS ========== */}
      {genModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={() => setGenModal(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" /> Gerar Cobranças Automáticas
              </h3>
              <button onClick={() => setGenModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-4">
              {!genResult ? (
                <>
                  <p className="text-sm text-gray-500">
                    Gera cobranças para todos os motoristas <strong>ativos com carro</strong> cujo dia de cobrança seja o selecionado.
                    Não duplica cobranças já existentes para a mesma semana.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dia da cobrança</label>
                    <select value={genDay} onChange={e => setGenDay(e.target.value)} className="input-field">
                      {DIAS_SEMANA.map(d => (
                        <option key={d.value} value={d.value}>
                          {d.label} ({countByDay[d.value]} motorista{countByDay[d.value] !== 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Semana de referência</label>
                    <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} className="input-field" />
                  </div>

                  <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                    <strong>{countByDay[genDay] || 0}</strong> motorista(s) com cobrança na <strong>{DIAS_SEMANA.find(d => d.value === genDay)?.label}</strong>.
                    O valor base será o <strong>valor semanal do carro</strong> de cada motorista.
                  </div>

                  <button onClick={handleGenerate} disabled={generating || countByDay[genDay] === 0}
                    className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2">
                    {generating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando...</>
                      : <><Banknote className="w-4 h-4" /> Gerar Cobranças</>}
                  </button>
                </>
              ) : (
                <div className="text-center space-y-3">
                  <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center ${genResult.geradas > 0 ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {genResult.geradas > 0 ? <CheckCircle2 className="w-7 h-7 text-green-600" /> : <AlertCircle className="w-7 h-7 text-gray-400" />}
                  </div>
                  <h3 className="font-bold text-lg text-gray-800">
                    {genResult.geradas > 0 ? `${genResult.geradas} cobrança(s) gerada(s)!` : 'Nenhuma nova cobrança'}
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-left space-y-1">
                    <p>Dia: <strong className="capitalize">{genResult.dia}</strong></p>
                    <p>Semana: <strong>{new Date(genResult.semana_ref).toLocaleDateString('pt-BR')}</strong></p>
                    <p>Motoristas elegíveis: <strong>{genResult.total_motoristas}</strong></p>
                    <p className="text-green-700">Cobranças geradas: <strong>{genResult.geradas}</strong></p>
                    {genResult.puladas > 0 && <p className="text-gray-400">Já existiam: {genResult.puladas}</p>}
                  </div>
                  <button onClick={() => setGenModal(false)} className="btn-primary w-full py-3">Fechar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
