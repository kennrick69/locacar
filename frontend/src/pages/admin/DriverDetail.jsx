import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { driversAPI, carsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Car, FileText,
  Eye, X, Shield, UserCheck, AlertCircle, Plus, Banknote,
  Check, Download
} from 'lucide-react';

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

export default function AdminDriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Approve modal
  const [approveModal, setApproveModal] = useState(false);
  const [selectedCar, setSelectedCar] = useState('');

  // Reject modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Create charge modal
  const [chargeModal, setChargeModal] = useState(false);
  const [chargeForm, setChargeForm] = useState({ semana_ref: '', valor_base: '', observacoes: '' });

  // Settlement modal
  const [settlementModal, setSettlementModal] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    debitos_pendentes: 0, multas_acumuladas: 0, danos: 0, outros_descontos: 0, observacoes: ''
  });

  // Acréscimo
  const [acrescimoChargeId, setAcrescimoChargeId] = useState(null);
  const [acrescimoForm, setAcrescimoForm] = useState({ descricao: '', valor: '' });

  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [driverRes, carsRes] = await Promise.all([
        driversAPI.get(id),
        carsAPI.listAll(),
      ]);
      setDriver(driverRes.data);
      setCars(carsRes.data.filter(c => c.disponivel));

      // Preenche settlement com dados reais
      if (driverRes.data.charges) {
        const pending = driverRes.data.charges.filter(c => !c.pago);
        const totalDebitos = pending.reduce((s, c) => s + parseFloat(c.valor_final || 0), 0);
        const totalMultas = pending.reduce((s, c) => s + parseFloat(c.multa || 0), 0);
        setSettlementForm(prev => ({
          ...prev,
          debitos_pendentes: totalDebitos.toFixed(2),
          multas_acumuladas: totalMultas.toFixed(2),
        }));
      }
    } catch (err) {
      toast.error('Erro ao carregar motorista');
      navigate('/admin/motoristas');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      await driversAPI.approve(id, { car_id: selectedCar || null });
      toast.success('Motorista aprovado!');
      setApproveModal(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      await driversAPI.reject(id, { motivo: rejectReason });
      toast.success('Motorista reprovado');
      setRejectModal(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reprovar');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmContract = async () => {
    try {
      await driversAPI.confirmContract(id);
      toast.success('Contrato confirmado!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  const handleActivate = async () => {
    try {
      await driversAPI.activate(id);
      toast.success('Motorista ativado!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao ativar');
    }
  };

  const handleCreateCharge = async () => {
    if (!chargeForm.semana_ref || !chargeForm.valor_base) {
      return toast.warning('Preencha semana e valor base');
    }
    setProcessing(true);
    try {
      await driversAPI.createCharge(id, chargeForm);
      toast.success('Cobrança criada!');
      setChargeModal(false);
      setChargeForm({ semana_ref: '', valor_base: '', observacoes: '' });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveAbatimento = async (abatId) => {
    try {
      await driversAPI.approveAbatimento(id, abatId);
      toast.success('Abatimento aprovado!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  const handleAddAcrescimo = async () => {
    if (!acrescimoForm.descricao || !acrescimoForm.valor) {
      return toast.warning('Preencha descrição e valor');
    }
    try {
      await driversAPI.addAcrescimo(id, {
        charge_id: acrescimoChargeId,
        descricao: acrescimoForm.descricao,
        valor: parseFloat(acrescimoForm.valor)
      });
      toast.success('Acréscimo adicionado!');
      setAcrescimoChargeId(null);
      setAcrescimoForm({ descricao: '', valor: '' });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  const handleRemoveAcrescimo = async (acrescimoId) => {
    try {
      await driversAPI.removeAcrescimo(id, acrescimoId);
      toast.success('Acréscimo removido!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  const handleSettlement = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/drivers/${id}/settlement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('locacar_token')}`,
        },
        body: JSON.stringify(settlementForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Acerto final gerado!');
      setSettlementModal(false);
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Erro ao gerar acerto');
    } finally {
      setProcessing(false);
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

  if (!driver) return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/motoristas')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">{driver.nome}</h1>
          <p className="text-sm text-gray-400">{driver.email} · CPF: {driver.cpf || '—'} · Tel: {driver.telefone || '—'}</p>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_BADGE[driver.status] || ''}`}>
          {driver.status?.replace('_', ' ')}
        </span>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Veículo */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Car className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-700 text-sm">Veículo Atribuído</h3>
          </div>
          {driver.car_marca ? (
            <div>
              <p className="font-medium">{driver.car_marca} {driver.car_modelo}</p>
              <p className="text-sm text-gray-400">{driver.car_placa} · R$ {fmt(driver.car_valor_semanal)}/sem · Caução: R$ {fmt(driver.car_valor_caucao)}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Nenhum veículo atribuído</p>
          )}
        </div>

        {/* Status flags */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-gray-700 text-sm">Progresso</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {driver.cnh_url ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>CNH</span>
            </div>
            <div className="flex items-center gap-2">
              {driver.comprovante_url ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>Comprovante</span>
            </div>
            <div className="flex items-center gap-2">
              {driver.selfie_url ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>Selfie</span>
            </div>
            <div className="flex items-center gap-2">
              {driver.caucao_pago ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>Caução pago</span>
            </div>
            <div className="flex items-center gap-2">
              {driver.contrato_confirmado ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : driver.contrato_url ? <Clock className="w-4 h-4 text-yellow-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
              <span>Contrato {driver.contrato_confirmado ? 'confirmado' : driver.contrato_url ? '(aguardando)' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========== AÇÕES POR STATUS ========== */}

      {/* Aprovar / Reprovar */}
      {driver.status === 'em_analise' && (
        <div className="card border-l-4 border-yellow-400">
          <h3 className="font-semibold text-gray-800 mb-3">Ação Necessária: Aprovação de Cadastro</h3>
          <div className="flex gap-3">
            <button onClick={() => setApproveModal(true)} className="btn-primary flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> Aprovar
            </button>
            <button onClick={() => setRejectModal(true)} className="btn-danger flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Reprovar
            </button>
          </div>
        </div>
      )}

      {/* Confirmar contrato */}
      {driver.status === 'aprovado' && driver.contrato_url && !driver.contrato_confirmado && (
        <div className="card border-l-4 border-purple-400">
          <h3 className="font-semibold text-gray-800 mb-2">Validar Contrato Gov.br</h3>
          <p className="text-sm text-gray-500 mb-3">O motorista enviou o contrato assinado. Verifique e confirme.</p>
          <div className="flex gap-3">
            <button onClick={() => setPreviewUrl(driver.contrato_url)} className="btn-secondary flex items-center gap-2">
              <Eye className="w-4 h-4" /> Ver Contrato
            </button>
            <button onClick={handleConfirmContract} className="btn-primary flex items-center gap-2">
              <Check className="w-4 h-4" /> Confirmar Contrato
            </button>
          </div>
        </div>
      )}

      {/* Ativar */}
      {driver.status === 'aprovado' && driver.caucao_pago && driver.contrato_confirmado && (
        <div className="card border-l-4 border-green-400">
          <h3 className="font-semibold text-gray-800 mb-2">Ativar Motorista</h3>
          <p className="text-sm text-gray-500 mb-3">Caução pago e contrato confirmado. O motorista está pronto para ser ativado.</p>
          <button onClick={handleActivate} className="btn-primary flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Ativar Motorista
          </button>
        </div>
      )}

      {/* ========== DOCUMENTOS ========== */}
      {driver.documents && driver.documents.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-600" /> Documentos Enviados
          </h3>
          <div className="divide-y divide-gray-100">
            {driver.documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">{doc.tipo.toUpperCase()}</p>
                  <p className="text-xs text-gray-400">{doc.nome_arquivo} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <button onClick={() => setPreviewUrl(doc.caminho)} className="text-brand-600 hover:text-brand-700">
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== COBRANÇAS ========== */}
      {(driver.status === 'ativo' || driver.status === 'inadimplente' || driver.charges?.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-brand-600" /> Cobranças Semanais
            </h3>
            <button onClick={() => {
              setChargeForm({
                semana_ref: new Date().toISOString().split('T')[0],
                valor_base: driver.car_valor_semanal || '',
                observacoes: '',
              });
              setChargeModal(true);
            }} className="btn-primary text-sm flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Nova Cobrança
            </button>
          </div>

          {driver.charges && driver.charges.length > 0 ? (
            <div className="space-y-2 max-h-[500px] overflow-auto">
              {driver.charges.map(charge => {
                const abats = charge.abatimentos_lista || [];
                const pendingAbats = abats.filter(a => !a.aprovado);
                const acrescimos = charge.acrescimos_lista || [];
                const totalAcrescimos = acrescimos.reduce((s, a) => s + parseFloat(a.valor), 0);
                const totalPago = parseFloat(charge.total_pago || 0);
                const restante = parseFloat(charge.valor_final) - totalPago;
                const isParcial = !charge.pago && totalPago > 0;
                return (
                  <div key={charge.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Semana {new Date(charge.semana_ref).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-xs text-gray-400">
                          Base: R$ {fmt(charge.valor_base)}
                          {parseFloat(charge.abatimentos) > 0 && ` | Abat: -R$ ${fmt(charge.abatimentos)}`}
                          {parseFloat(charge.multa) > 0 && ` | Multa: +R$ ${fmt(charge.multa)}`}
                          {totalAcrescimos > 0 && ` | Acrés: +R$ ${fmt(totalAcrescimos)}`}
                          {totalPago > 0 && ` | Pago: R$ ${fmt(totalPago)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">R$ {fmt(charge.valor_final)}</p>
                        <span className={`text-xs ${charge.pago ? 'text-green-600' : isParcial ? 'text-yellow-600' : 'text-red-600'}`}>
                          {charge.pago ? '✓ Pago' : isParcial ? `◐ Parcial (falta R$ ${fmt(restante)})` : '● Pendente'}
                        </span>
                      </div>
                    </div>

                    {/* Acréscimos existentes */}
                    {acrescimos.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                        <p className="text-xs font-medium text-red-700">Acréscimos:</p>
                        {acrescimos.map(acr => (
                          <div key={acr.id} className="flex items-center justify-between bg-red-50 rounded px-2 py-1">
                            <span className="text-xs text-gray-700">{acr.descricao} — <strong>+R$ {fmt(acr.valor)}</strong></span>
                            {!charge.pago && (
                              <button onClick={() => handleRemoveAcrescimo(acr.id)}
                                className="text-xs text-red-500 hover:text-red-700 px-1">✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Botão adicionar acréscimo */}
                    {!charge.pago && (
                      <div className="mt-2">
                        {acrescimoChargeId === charge.id ? (
                          <div className="bg-white rounded-lg p-2 border border-gray-200 space-y-2">
                            <select value={acrescimoForm.descricao}
                              onChange={e => setAcrescimoForm({ ...acrescimoForm, descricao: e.target.value })}
                              className="input-field text-xs py-1.5">
                              <option value="">Tipo do acréscimo...</option>
                              <option value="Multa de trânsito">Multa de trânsito</option>
                              <option value="Danos ao veículo">Danos ao veículo</option>
                              <option value="Guincho / Reboque">Guincho / Reboque</option>
                              <option value="Manutenção">Manutenção</option>
                              <option value="Seguro">Seguro</option>
                              <option value="Outro">Outro</option>
                            </select>
                            {acrescimoForm.descricao === 'Outro' && (
                              <input type="text" placeholder="Descreva..."
                                onChange={e => setAcrescimoForm({ ...acrescimoForm, descricao: e.target.value })}
                                className="input-field text-xs py-1.5" />
                            )}
                            <input type="number" step="0.01" placeholder="Valor R$" value={acrescimoForm.valor}
                              onChange={e => setAcrescimoForm({ ...acrescimoForm, valor: e.target.value })}
                              className="input-field text-xs py-1.5" />
                            <div className="flex gap-2">
                              <button onClick={handleAddAcrescimo}
                                className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 flex-1">Adicionar</button>
                              <button onClick={() => setAcrescimoChargeId(null)}
                                className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded hover:bg-gray-300">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setAcrescimoChargeId(charge.id); setAcrescimoForm({ descricao: '', valor: '' }); }}
                            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Adicionar acréscimo
                          </button>
                        )}
                      </div>
                    )}

                    {/* Abatimentos pendentes de aprovação */}
                    {pendingAbats.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                        <p className="text-xs font-medium text-yellow-700">Abatimentos pendentes:</p>
                        {pendingAbats.map(abat => (
                          <div key={abat.id} className="flex items-center justify-between bg-yellow-50 rounded px-2 py-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-600">{abat.descricao || 'S/ descrição'}</span>
                              <span className="font-medium">R$ {fmt(abat.valor)}</span>
                              {abat.nota_url && (
                                <button onClick={() => setPreviewUrl(abat.nota_url)} className="text-brand-600">
                                  <Eye className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => handleApproveAbatimento(abat.id)}
                              className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700"
                            >
                              Aprovar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Nenhuma cobrança registrada</p>
          )}
        </div>
      )}

      {/* ========== RESCISÃO / ACERTO FINAL ========== */}
      {(driver.status === 'ativo' || driver.status === 'inadimplente') && (
        <div className="card border-l-4 border-orange-400">
          <h3 className="font-semibold text-gray-800 mb-2">Rescisão e Acerto Final</h3>
          <p className="text-sm text-gray-500 mb-3">
            Gera relatório PDF de retenção do caução com todos os débitos, multas e danos.
          </p>
          <button onClick={() => setSettlementModal(true)} className="btn-danger flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Iniciar Rescisão
          </button>
        </div>
      )}

      {/* ========== MODAIS ========== */}

      {/* Modal Aprovar */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setApproveModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">Aprovar Motorista</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Atribuir veículo (opcional)</label>
              <select value={selectedCar} onChange={e => setSelectedCar(e.target.value)} className="input-field">
                <option value="">Sem veículo</option>
                {cars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.marca} {c.modelo} ({c.placa}) — R$ {fmt(c.valor_semanal)}/sem
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setApproveModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleApprove} disabled={processing} className="btn-primary flex-1">
                {processing ? 'Aprovando...' : 'Confirmar Aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reprovar */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">Reprovar Motorista</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da reprovação</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="input-field"
                rows={3}
                placeholder="Informe o motivo..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setRejectModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleReject} disabled={processing} className="btn-danger flex-1">
                {processing ? 'Reprovando...' : 'Confirmar Reprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Cobrança */}
      {chargeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setChargeModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">Nova Cobrança Semanal</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semana referência *</label>
                <input type="date" value={chargeForm.semana_ref} onChange={e => setChargeForm({ ...chargeForm, semana_ref: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor base (R$) *</label>
                <input type="number" step="0.01" value={chargeForm.valor_base} onChange={e => setChargeForm({ ...chargeForm, valor_base: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={chargeForm.observacoes} onChange={e => setChargeForm({ ...chargeForm, observacoes: e.target.value })} className="input-field" rows={2} />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setChargeModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreateCharge} disabled={processing} className="btn-primary flex-1">
                {processing ? 'Criando...' : 'Criar Cobrança'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Acerto Final / Rescisão */}
      {settlementModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSettlementModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-1">Acerto Final — Rescisão</h3>
            <p className="text-sm text-gray-500 mb-4">O relatório PDF será gerado com todos os valores abaixo.</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Débitos pendentes (R$)</label>
                  <input type="number" step="0.01" value={settlementForm.debitos_pendentes} onChange={e => setSettlementForm({ ...settlementForm, debitos_pendentes: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Multas acumuladas (R$)</label>
                  <input type="number" step="0.01" value={settlementForm.multas_acumuladas} onChange={e => setSettlementForm({ ...settlementForm, multas_acumuladas: e.target.value })} className="input-field" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Danos ao veículo (R$)</label>
                  <input type="number" step="0.01" value={settlementForm.danos} onChange={e => setSettlementForm({ ...settlementForm, danos: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Outros descontos (R$)</label>
                  <input type="number" step="0.01" value={settlementForm.outros_descontos} onChange={e => setSettlementForm({ ...settlementForm, outros_descontos: e.target.value })} className="input-field" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-500">Valor do caução:</p>
                <p className="text-xl font-bold text-gray-800">R$ {fmt(driver.car_valor_caucao)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Saldo final = Caução - Débitos - Multas - Danos - Outros
                </p>
                <p className="text-lg font-bold mt-1">
                  {(() => {
                    const saldo = parseFloat(driver.car_valor_caucao || 0)
                      - parseFloat(settlementForm.debitos_pendentes || 0)
                      - parseFloat(settlementForm.multas_acumuladas || 0)
                      - parseFloat(settlementForm.danos || 0)
                      - parseFloat(settlementForm.outros_descontos || 0);
                    return (
                      <span className={saldo >= 0 ? 'text-green-700' : 'text-red-700'}>
                        {saldo >= 0 ? `Devolver R$ ${fmt(saldo)}` : `Motorista deve R$ ${fmt(Math.abs(saldo))}`}
                      </span>
                    );
                  })()}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={settlementForm.observacoes} onChange={e => setSettlementForm({ ...settlementForm, observacoes: e.target.value })} className="input-field" rows={2} />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setSettlementModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSettlement} disabled={processing} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {processing ? 'Processando...' : (
                  <><Download className="w-4 h-4" /> Gerar Acerto e Rescindir</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Documento</h3>
              <button onClick={() => setPreviewUrl(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              {previewUrl.endsWith('.pdf') ? (
                <iframe src={previewUrl} className="w-full h-[70vh] rounded" title="PDF" />
              ) : (
                <img src={previewUrl} alt="Documento" className="w-full rounded" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
