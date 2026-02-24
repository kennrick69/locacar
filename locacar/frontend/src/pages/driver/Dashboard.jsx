import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { driversAPI } from '../../services/api';
import {
  Car, FileText, CreditCard, AlertCircle, CheckCircle2,
  Clock, XCircle, Upload, ChevronRight, Shield, Banknote
} from 'lucide-react';

const STATUS_MAP = {
  pendente: { label: 'Pendente', color: 'bg-gray-100 text-gray-700', icon: Clock, desc: 'Envie seus documentos para análise' },
  em_analise: { label: 'Em Análise', color: 'bg-yellow-100 text-yellow-800', icon: Clock, desc: 'Seus documentos estão sendo analisados' },
  aprovado: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800', icon: CheckCircle2, desc: 'Pague o caução e envie o contrato' },
  reprovado: { label: 'Reprovado', color: 'bg-red-100 text-red-800', icon: XCircle, desc: 'Verifique o motivo da reprovação' },
  ativo: { label: 'Ativo', color: 'bg-green-100 text-green-800', icon: CheckCircle2, desc: 'Tudo certo! Confira seus débitos semanais' },
  inadimplente: { label: 'Inadimplente', color: 'bg-red-100 text-red-800', icon: AlertCircle, desc: 'Você possui pagamentos pendentes' },
  rescindido: { label: 'Rescindido', color: 'bg-gray-100 text-gray-600', icon: XCircle, desc: 'Contrato rescindido' },
  recolhido: { label: 'Recolhido', color: 'bg-gray-100 text-gray-600', icon: XCircle, desc: 'Veículo recolhido' },
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [balance, setBalance] = useState(null);
  const [currentCharge, setCurrentCharge] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [profileRes, balanceRes, chargeRes] = await Promise.all([
        driversAPI.me(),
        driversAPI.myBalance().catch(() => ({ data: null })),
        driversAPI.currentCharge().catch(() => ({ data: null })),
      ]);
      setProfile(profileRes.data);
      setBalance(balanceRes.data);
      setCurrentCharge(chargeRes.data);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <div className="card text-center py-10">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">Erro ao carregar perfil. Tente novamente.</p>
        </div>
      </div>
    );
  }

  const status = STATUS_MAP[profile.status] || STATUS_MAP.pendente;
  const StatusIcon = status.icon;

  const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Saudação */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Olá, {user?.nome?.split(' ')[0]}!</h1>
        <p className="text-gray-500 text-sm mt-1">{status.desc}</p>
      </div>

      {/* Status Card */}
      <div className="card flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status.color}`}>
          <StatusIcon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500">Status da conta</p>
          <p className="text-lg font-semibold">{status.label}</p>
        </div>
        {profile.status === 'reprovado' && profile.motivo_reprovacao && (
          <div className="text-sm text-red-600 max-w-xs">
            Motivo: {profile.motivo_reprovacao}
          </div>
        )}
      </div>

      {/* Carro atribuído */}
      {profile.car_marca && (
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
            <Car className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-500">Veículo</p>
            <p className="font-semibold">{profile.car_marca} {profile.car_modelo}</p>
            <p className="text-xs text-gray-400">{profile.car_placa} · R$ {fmt(profile.car_valor_semanal)}/sem</p>
          </div>
        </div>
      )}

      {/* Ações por status */}
      {profile.status === 'pendente' && (
        <div className="card border-l-4 border-yellow-400 bg-yellow-50">
          <div className="flex items-start gap-3">
            <Upload className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">Envie seus documentos</p>
              <p className="text-sm text-gray-600 mt-1">
                Precisamos da sua CNH, comprovante de endereço e uma selfie para análise.
              </p>
              <Link to="/motorista/documentos" className="inline-flex items-center gap-1 text-sm text-brand-600 font-medium mt-3 hover:text-brand-700">
                Enviar documentos <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {profile.status === 'aprovado' && (
        <div className="space-y-4">
          {!profile.caucao_pago && (
            <div className="card border-l-4 border-blue-400 bg-blue-50">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-800">Pague o caução</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Caução de R$ {fmt(profile.car_valor_caucao)} via Pix ou cartão (até 12x).
                  </p>
                  <Link to="/motorista/pagamentos" className="inline-flex items-center gap-1 text-sm text-brand-600 font-medium mt-3 hover:text-brand-700">
                    Pagar caução <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {profile.caucao_pago && !profile.contrato_url && (
            <div className="card border-l-4 border-purple-400 bg-purple-50">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-800">Envie o contrato Gov.br</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Faça upload do contrato assinado em PDF para finalizar.
                  </p>
                  <Link to="/motorista/documentos" className="inline-flex items-center gap-1 text-sm text-brand-600 font-medium mt-3 hover:text-brand-700">
                    Enviar contrato <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {profile.caucao_pago && profile.contrato_url && !profile.contrato_confirmado && (
            <div className="card border-l-4 border-green-400 bg-green-50">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-800">Aguardando confirmação</p>
                  <p className="text-sm text-gray-600 mt-1">
                    O administrador está validando seu contrato. Em breve sua conta será ativada!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Painel de débitos (ativo/inadimplente) */}
      {(profile.status === 'ativo' || profile.status === 'inadimplente') && (
        <>
          {/* Resumo financeiro */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card text-center">
              <p className="text-xs text-gray-400">Total Pago</p>
              <p className="text-lg font-bold text-green-600">R$ {fmt(balance?.total_pago)}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-gray-400">Pendente</p>
              <p className="text-lg font-bold text-red-600">R$ {fmt(balance?.total_pendente)}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-gray-400">Abatimentos</p>
              <p className="text-lg font-bold text-blue-600">R$ {fmt(balance?.total_abatimentos)}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-gray-400">Multas</p>
              <p className="text-lg font-bold text-orange-600">R$ {fmt(balance?.total_multas)}</p>
            </div>
          </div>

          {/* Cobrança atual */}
          {currentCharge && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-brand-600" />
                  <h3 className="font-semibold text-gray-800">Cobrança Atual</h3>
                </div>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                  Em aberto
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Semana ref.</span>
                  <span>{new Date(currentCharge.semana_ref).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor base</span>
                  <span>R$ {fmt(currentCharge.valor_base)}</span>
                </div>
                {parseFloat(currentCharge.abatimentos) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Abatimentos</span>
                    <span>- R$ {fmt(currentCharge.abatimentos)}</span>
                  </div>
                )}
                {parseFloat(currentCharge.credito_anterior) !== 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Crédito anterior</span>
                    <span>R$ {fmt(currentCharge.credito_anterior)}</span>
                  </div>
                )}
                {parseFloat(currentCharge.multa) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Multa</span>
                    <span>+ R$ {fmt(currentCharge.multa)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span className="text-brand-700">R$ {fmt(currentCharge.valor_final)}</span>
                </div>
              </div>

              <Link to="/motorista/pagamentos" className="btn-primary w-full mt-4 text-center block">
                Pagar agora
              </Link>
            </div>
          )}
        </>
      )}

      {/* Links rápidos */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/motorista/documentos" className="card flex items-center gap-3 hover:shadow-md transition-shadow">
          <FileText className="w-5 h-5 text-brand-600" />
          <span className="text-sm font-medium text-gray-700">Documentos</span>
          <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
        </Link>
        <Link to="/motorista/pagamentos" className="card flex items-center gap-3 hover:shadow-md transition-shadow">
          <CreditCard className="w-5 h-5 text-brand-600" />
          <span className="text-sm font-medium text-gray-700">Pagamentos</span>
          <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
        </Link>
      </div>
    </div>
  );
}
