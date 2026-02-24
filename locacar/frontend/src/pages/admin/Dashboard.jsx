import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { driversAPI, carsAPI } from '../../services/api';
import {
  Users, Car, AlertCircle, CheckCircle2, Clock, DollarSign,
  ChevronRight, TrendingUp, UserCheck, UserX, Banknote
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [allDrivers, allCars] = await Promise.all([
        driversAPI.list(),
        carsAPI.listAll(),
      ]);

      const drivers = allDrivers.data;
      const cars = allCars.data;

      const pending = drivers.filter(d => d.status === 'em_analise');
      const active = drivers.filter(d => d.status === 'ativo');
      const defaulting = drivers.filter(d => d.status === 'inadimplente');
      const availableCars = cars.filter(c => c.disponivel);

      setStats({
        totalDrivers: drivers.length,
        pendingCount: pending.length,
        activeCount: active.length,
        defaultingCount: defaulting.length,
        totalCars: cars.length,
        availableCars: availableCars.length,
        occupiedCars: cars.length - availableCars.length,
      });

      setPendingDrivers(pending.slice(0, 5));
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral da plataforma</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{stats?.totalDrivers || 0}</p>
              <p className="text-xs text-gray-400">Motoristas</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{stats?.activeCount || 0}</p>
              <p className="text-xs text-gray-400">Ativos</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700">{stats?.pendingCount || 0}</p>
              <p className="text-xs text-gray-400">Pendentes</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">{stats?.defaultingCount || 0}</p>
              <p className="text-xs text-gray-400">Inadimplentes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cars stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card flex items-center gap-3">
          <Car className="w-5 h-5 text-brand-600" />
          <div className="flex-1">
            <p className="text-sm text-gray-500">Total de Carros</p>
            <p className="text-xl font-bold">{stats?.totalCars || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <p className="text-sm text-gray-500">Disponíveis</p>
            <p className="text-xl font-bold text-green-700">{stats?.availableCars || 0}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-purple-600" />
          <div className="flex-1">
            <p className="text-sm text-gray-500">Ocupados</p>
            <p className="text-xl font-bold text-purple-700">{stats?.occupiedCars || 0}</p>
          </div>
        </div>
      </div>

      {/* Pendentes de aprovação */}
      {pendingDrivers.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <h2 className="font-semibold text-gray-800">Aguardando Aprovação</h2>
            </div>
            <Link to="/admin/motoristas?status=em_analise" className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Ver todos <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {pendingDrivers.map(driver => (
              <Link
                key={driver.id}
                to={`/admin/motoristas/${driver.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-4 px-4 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-yellow-700">
                      {driver.nome?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{driver.nome}</p>
                    <p className="text-xs text-gray-400">{driver.email} · CPF: {driver.cpf || '—'}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link to="/admin/carros" className="card flex flex-col items-center gap-2 py-6 hover:shadow-md transition-shadow text-center">
          <Car className="w-6 h-6 text-brand-600" />
          <span className="text-sm font-medium text-gray-700">Gerenciar Carros</span>
        </Link>
        <Link to="/admin/motoristas" className="card flex flex-col items-center gap-2 py-6 hover:shadow-md transition-shadow text-center">
          <Users className="w-6 h-6 text-brand-600" />
          <span className="text-sm font-medium text-gray-700">Motoristas</span>
        </Link>
        <Link to="/admin/motoristas?status=em_analise" className="card flex flex-col items-center gap-2 py-6 hover:shadow-md transition-shadow text-center">
          <UserCheck className="w-6 h-6 text-yellow-600" />
          <span className="text-sm font-medium text-gray-700">Aprovações</span>
        </Link>
        <Link to="/admin/config" className="card flex flex-col items-center gap-2 py-6 hover:shadow-md transition-shadow text-center">
          <Banknote className="w-6 h-6 text-green-600" />
          <span className="text-sm font-medium text-gray-700">Configurações</span>
        </Link>
      </div>
    </div>
  );
}
