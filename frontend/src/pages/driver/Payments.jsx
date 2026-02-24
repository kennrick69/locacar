import { useState, useEffect, useRef } from 'react';
import { driversAPI, paymentsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  CreditCard, QrCode, Banknote, CheckCircle2, Clock,
  AlertCircle, ChevronDown, ChevronUp, Upload, Receipt,
  Shield, ArrowRight, X, Copy
} from 'lucide-react';

const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

export default function DriverPayments() {
  const [profile, setProfile] = useState(null);
  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCharge, setExpandedCharge] = useState(null);

  // Payment modal state
  const [payModal, setPayModal] = useState(null); // { type: 'caucao'|'weekly', chargeId, valor }
  const [payMethod, setPayMethod] = useState('pix');
  const [parcelas, setParcelas] = useState(1);
  const [simulacao, setSimulacao] = useState([]);
  const [paymentResult, setPaymentResult] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Abatimento modal
  const [abatModal, setAbatModal] = useState(null); // chargeId
  const [abatForm, setAbatForm] = useState({ descricao: '', valor: '' });
  const [abatUploading, setAbatUploading] = useState(false);
  const notaInput = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [profileRes, chargesRes, paymentsRes] = await Promise.all([
        driversAPI.me(),
        driversAPI.myCharges().catch(() => ({ data: [] })),
        driversAPI.myPayments().catch(() => ({ data: [] })),
      ]);
      setProfile(profileRes.data);
      setCharges(chargesRes.data);
      setPayments(paymentsRes.data);
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  // ========== SIMULAÇÃO DE PARCELAS ==========
  const openPayModal = async (type, chargeId, valor) => {
    setPayModal({ type, chargeId, valor });
    setPayMethod('pix');
    setParcelas(1);
    setPaymentResult(null);

    try {
      const res = await paymentsAPI.simulate(valor);
      setSimulacao(res.data);
    } catch (err) {
      console.error('Erro na simulação:', err);
    }
  };

  // ========== PROCESSAR PAGAMENTO ==========
  const processPayment = async () => {
    if (!payModal) return;
    setProcessing(true);

    try {
      let res;
      if (payModal.type === 'caucao') {
        res = await paymentsAPI.payCaucao({ metodo: payMethod, parcelas });
      } else {
        res = await paymentsAPI.payWeekly(payModal.chargeId, { metodo: payMethod, parcelas });
      }

      setPaymentResult(res.data);

      if (payMethod === 'pix') {
        toast.info('QR Code Pix gerado! Pague em até 30 minutos.');
      } else {
        toast.success('Pagamento processado!');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao processar pagamento');
    } finally {
      setProcessing(false);
    }
  };

  // ========== CONFIRMAR PAGAMENTO (simulação) ==========
  const confirmPayment = async (paymentId) => {
    try {
      await paymentsAPI.confirm(paymentId);
      toast.success('Pagamento confirmado!');
      setPayModal(null);
      setPaymentResult(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao confirmar');
    }
  };

  // ========== ABATIMENTO ==========
  const submitAbatimento = async () => {
    if (!abatModal) return;
    if (!abatForm.valor || parseFloat(abatForm.valor) <= 0) {
      return toast.warning('Informe o valor do abatimento');
    }

    setAbatUploading(true);
    try {
      const formData = new FormData();
      formData.append('descricao', abatForm.descricao);
      formData.append('valor', abatForm.valor);

      const file = notaInput.current?.files?.[0];
      if (file) {
        formData.append('nota', file);
      }

      await driversAPI.submitAbatimento(abatModal, formData);
      toast.success('Abatimento solicitado! Aguarde aprovação.');
      setAbatModal(null);
      setAbatForm({ descricao: '', valor: '' });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao solicitar abatimento');
    } finally {
      setAbatUploading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Código copiado!');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  const selectedSim = simulacao.find(s => s.parcelas === parcelas);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Pagamentos</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie seus pagamentos e cobranças semanais</p>
      </div>

      {/* CAUÇÃO */}
      {profile?.status === 'aprovado' && !profile?.caucao_pago && (
        <div className="card border-2 border-brand-200">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-brand-600" />
            <div>
              <h2 className="font-semibold text-gray-800">Pagamento do Caução</h2>
              <p className="text-sm text-gray-500">Obrigatório para ativar sua conta</p>
            </div>
          </div>

          <div className="bg-brand-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">Valor do caução</p>
            <p className="text-3xl font-bold text-brand-700">R$ {fmt(profile.car_valor_caucao)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {profile.car_marca} {profile.car_modelo} ({profile.car_placa})
            </p>
          </div>

          <button
            onClick={() => openPayModal('caucao', null, profile.car_valor_caucao)}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            Pagar Caução
          </button>
        </div>
      )}

      {profile?.caucao_pago && (
        <div className="card flex items-center gap-3 bg-green-50 border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-sm text-green-800 font-medium">Caução pago ✓</p>
        </div>
      )}

      {/* COBRANÇAS SEMANAIS */}
      {charges.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Cobranças Semanais</h2>

          {charges.map(charge => {
            const isOpen = expandedCharge === charge.id;
            const abatList = charge.abatimentos_lista || [];
            const isPaid = charge.pago;

            return (
              <div key={charge.id} className="card">
                {/* Header */}
                <button
                  onClick={() => setExpandedCharge(isOpen ? null : charge.id)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isPaid ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {isPaid ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">
                        Semana {new Date(charge.semana_ref).toLocaleDateString('pt-BR')}
                      </p>
                      <p className={`text-xs ${isPaid ? 'text-green-600' : 'text-red-600'}`}>
                        {isPaid ? 'Pago' : 'Pendente'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isPaid ? 'text-green-700' : 'text-gray-800'}`}>
                      R$ {fmt(charge.valor_final)}
                    </span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Detalhes expandidos */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Valor base</span>
                        <span>R$ {fmt(charge.valor_base)}</span>
                      </div>

                      {parseFloat(charge.abatimentos) > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Abatimentos aprovados</span>
                          <span>- R$ {fmt(charge.abatimentos)}</span>
                        </div>
                      )}

                      {parseFloat(charge.credito_anterior) !== 0 && (
                        <div className="flex justify-between text-blue-600">
                          <span>Crédito anterior</span>
                          <span>R$ {fmt(charge.credito_anterior)}</span>
                        </div>
                      )}

                      {parseFloat(charge.multa) > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Multa por atraso</span>
                          <span>+ R$ {fmt(charge.multa)}</span>
                        </div>
                      )}

                      <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
                        <span>Total</span>
                        <span>R$ {fmt(charge.valor_final)}</span>
                      </div>
                    </div>

                    {/* Lista de abatimentos */}
                    {abatList.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">Abatimentos solicitados:</p>
                        {abatList.map((abat, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${abat.aprovado ? 'bg-green-500' : 'bg-yellow-500'}`} />
                              <span className="text-gray-600">{abat.descricao || 'Sem descrição'}</span>
                            </div>
                            <span className="font-medium">R$ {fmt(abat.valor)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ações */}
                    {!isPaid && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => openPayModal('weekly', charge.id, charge.valor_final)}
                          className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                        >
                          <CreditCard className="w-4 h-4" /> Pagar
                        </button>
                        <button
                          onClick={() => setAbatModal(charge.id)}
                          className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                        >
                          <Receipt className="w-4 h-4" /> Abatimento
                        </button>
                      </div>
                    )}

                    {charge.observacoes && (
                      <p className="text-xs text-gray-400 italic">Obs: {charge.observacoes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* HISTÓRICO DE PAGAMENTOS */}
      {payments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Histórico de Pagamentos</h2>

          <div className="card divide-y divide-gray-100">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    p.status === 'pago' ? 'bg-green-100' : p.status === 'pendente' ? 'bg-yellow-100' : 'bg-gray-100'
                  }`}>
                    {p.status === 'pago' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : p.status === 'pendente' ? (
                      <Clock className="w-4 h-4 text-yellow-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {p.tipo === 'caucao' ? 'Caução' : `Semana ${p.semana_ref ? new Date(p.semana_ref).toLocaleDateString('pt-BR') : ''}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {p.metodo?.toUpperCase()} {p.parcelas > 1 ? `· ${p.parcelas}x` : ''} · {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800">R$ {fmt(p.valor_total)}</p>
                  <p className={`text-xs ${
                    p.status === 'pago' ? 'text-green-600' : p.status === 'pendente' ? 'text-yellow-600' : 'text-gray-400'
                  }`}>
                    {p.status === 'pago' ? 'Pago' : p.status === 'pendente' ? 'Pendente' : p.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {charges.length === 0 && payments.length === 0 && profile?.status !== 'aprovado' && (
        <div className="card text-center py-10 text-gray-400">
          <Banknote className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma cobrança ou pagamento ainda</p>
        </div>
      )}

      {/* ========== MODAL DE PAGAMENTO ========== */}
      {payModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={() => { setPayModal(null); setPaymentResult(null); }}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">
                {payModal.type === 'caucao' ? 'Pagar Caução' : 'Pagar Cobrança Semanal'}
              </h3>
              <button onClick={() => { setPayModal(null); setPaymentResult(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {!paymentResult ? (
                <>
                  {/* Valor */}
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500">Valor</p>
                    <p className="text-3xl font-bold text-gray-800">R$ {fmt(payModal.valor)}</p>
                  </div>

                  {/* Método */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Forma de pagamento</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setPayMethod('pix'); setParcelas(1); }}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          payMethod === 'pix'
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <QrCode className={`w-5 h-5 mx-auto mb-1 ${payMethod === 'pix' ? 'text-brand-600' : 'text-gray-400'}`} />
                        <p className="text-sm font-medium">Pix</p>
                        <p className="text-xs text-gray-400">Sem juros</p>
                      </button>
                      <button
                        onClick={() => setPayMethod('cartao')}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          payMethod === 'cartao'
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <CreditCard className={`w-5 h-5 mx-auto mb-1 ${payMethod === 'cartao' ? 'text-brand-600' : 'text-gray-400'}`} />
                        <p className="text-sm font-medium">Cartão</p>
                        <p className="text-xs text-gray-400">Até 12x</p>
                      </button>
                    </div>
                  </div>

                  {/* Parcelas (cartão) */}
                  {payMethod === 'cartao' && simulacao.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Parcelas</p>
                      <div className="space-y-1 max-h-48 overflow-auto">
                        {simulacao.map(s => (
                          <button
                            key={s.parcelas}
                            onClick={() => setParcelas(s.parcelas)}
                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-sm ${
                              parcelas === s.parcelas
                                ? 'border-brand-600 bg-brand-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <span className="font-medium">{s.parcelas}x de R$ {fmt(s.valor_parcela)}</span>
                            <span className="text-xs text-gray-400">
                              {s.taxa_percentual > 0 ? `Total R$ ${fmt(s.valor_total)} (+${s.taxa_percentual}%)` : 'Sem juros'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resumo */}
                  {selectedSim && payMethod === 'cartao' && (
                    <div className="bg-yellow-50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Valor original</span>
                        <span>R$ {fmt(payModal.valor)}</span>
                      </div>
                      {selectedSim.taxa_percentual > 0 && (
                        <div className="flex justify-between text-yellow-700">
                          <span>Juros ({selectedSim.taxa_percentual}%)</span>
                          <span>+ R$ {fmt(selectedSim.valor_total - payModal.valor)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold border-t border-yellow-200 pt-1 mt-1">
                        <span>Total</span>
                        <span>R$ {fmt(selectedSim.valor_total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Botão pagar */}
                  <button
                    onClick={processPayment}
                    disabled={processing}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        {payMethod === 'pix' ? 'Gerar QR Code Pix' : `Pagar ${parcelas}x no Cartão`}
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  {/* Resultado do pagamento */}
                  {payMethod === 'pix' && paymentResult.payment?.mp_qr_code && (
                    <div className="text-center space-y-4">
                      <div className="bg-green-50 rounded-lg p-4">
                        <QrCode className="w-12 h-12 text-green-600 mx-auto mb-2" />
                        <p className="font-semibold text-green-800">QR Code Pix Gerado</p>
                        <p className="text-xs text-gray-500 mt-1">Expira em 30 minutos</p>
                      </div>

                      {/* Código Pix copia e cola */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Código Pix (copia e cola)</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={paymentResult.payment.mp_qr_code}
                            readOnly
                            className="input-field text-xs flex-1"
                          />
                          <button
                            onClick={() => copyToClipboard(paymentResult.payment.mp_qr_code)}
                            className="btn-secondary p-2"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Botão simular confirmação (dev) */}
                      <div className="bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
                        <p className="font-medium">⚠️ Modo desenvolvimento</p>
                        <p className="mt-1">Na Etapa 4, o pagamento será confirmado automaticamente via webhook do Mercado Pago.</p>
                        <button
                          onClick={() => confirmPayment(paymentResult.payment.id)}
                          className="btn-primary text-xs mt-2"
                        >
                          Simular confirmação
                        </button>
                      </div>
                    </div>
                  )}

                  {payMethod === 'cartao' && (
                    <div className="text-center space-y-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <CreditCard className="w-12 h-12 text-blue-600 mx-auto mb-2" />
                        <p className="font-semibold text-blue-800">Pagamento Gerado</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {paymentResult.calculo?.parcelas}x de R$ {fmt(paymentResult.calculo?.valor_parcela)}
                        </p>
                      </div>

                      <div className="bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
                        <p className="font-medium">⚠️ Modo desenvolvimento</p>
                        <p className="mt-1">Na Etapa 4, será gerado um link de checkout do Mercado Pago.</p>
                        <button
                          onClick={() => confirmPayment(paymentResult.payment.id)}
                          className="btn-primary text-xs mt-2"
                        >
                          Simular confirmação
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL DE ABATIMENTO ========== */}
      {abatModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={() => setAbatModal(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">Solicitar Abatimento</h3>
              <button onClick={() => setAbatModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={abatForm.descricao}
                  onChange={e => setAbatForm({ ...abatForm, descricao: e.target.value })}
                  className="input-field"
                  placeholder="Ex: Reparo do pneu"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={abatForm.valor}
                  onChange={e => setAbatForm({ ...abatForm, valor: e.target.value })}
                  className="input-field"
                  placeholder="0,00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nota fiscal / comprovante (opcional)
                </label>
                <input
                  type="file"
                  ref={notaInput}
                  accept="image/*,application/pdf"
                  className="input-field text-sm"
                />
              </div>

              <button
                onClick={submitAbatimento}
                disabled={abatUploading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {abatUploading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Solicitar Abatimento
              </button>

              <p className="text-xs text-gray-400 text-center">
                O abatimento será analisado pelo administrador antes de ser aplicado.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
