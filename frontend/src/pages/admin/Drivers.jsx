import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { driversAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  Users, Search, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, UserCheck, Shield, Car
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
  pendente: 'bg-gray-100 text-gray-700',
  em_analise: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800',
  reprovado: 'bg-red-100 text-red-800',
  ativo: 'bg-green-100 text-green-800',
  inadimplente: 'bg-red-100 text-red-800',
  rescindido: 'bg-gray-200 text-gray-600',
  recolhido: 'bg-gray-200 text-gray-600',
};

export default function AdminDrivers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');

  useEffect(() => {
    loadDrivers();
  }, [statusFilter]);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const res = await driversAPI.list(statusFilter || undefined);
      setDrivers(res.data);
    } catch (err) {
      toast.error('Erro ao carregar motoristas');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status);
    if (status) {
      setSearchParams({ status });
    } else {
      setSearchParams({});
    }
  };

  const filtered = drivers.filter(d =>
    `${d.nome} ${d.email} ${d.cpf} ${d.telefone}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Motoristas</h1>
        <p className="text-gray-500 text-sm mt-1">{drivers.length} motoristas encontrados</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10"
            placeholder="Buscar por nome, email, CPF..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => handleStatusChange(e.target.value)}
          className="input-field w-full sm:w-48"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(opt => {
          const count = opt.value
            ? drivers.filter(d => d.status === opt.value).length
            : drivers.length;
          return (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

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
            <Link
              key={driver.id}
              to={`/admin/motoristas/${driver.id}`}
              className="card flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-brand-700">
                  {driver.nome?.charAt(0)?.toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{driver.nome}</p>
                <p className="text-xs text-gray-400 truncate">
                  {driver.email}
                  {driver.cpf && ` · CPF: ${driver.cpf}`}
                  {driver.telefone && ` · ${driver.telefone}`}
                </p>
              </div>

              {driver.car_marca && (
                <div className="hidden md:flex items-center gap-1 text-xs text-gray-400">
                  <Car className="w-3.5 h-3.5" />
                  {driver.car_marca} {driver.car_modelo}
                </div>
              )}

              <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                STATUS_BADGE[driver.status] || 'bg-gray-100 text-gray-600'
              }`}>
                {driver.status?.replace('_', ' ')}
              </span>

              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
