import { useState, useEffect, useRef, useCallback } from 'react';
import { driversAPI, paymentsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  CreditCard, QrCode, Banknote, CheckCircle2, Clock,
  AlertCircle, ChevronDown, ChevronUp, Upload, Receipt,
  Shield, ArrowRight, X, Copy, Lock
} from 'lucide-react';

const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

export default function DriverPayments() {
  const [profile, setProfile] = useState(null);
  const [charges, setCharges] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCharge, setExpandedCharge] = useState(null);

  // Payment modal state
  const [payModal, setPayModal] = useState(null); // { type, chargeId, valor, restante }
  const [payMethod, setPayMethod] = useState('pix');
  const [parcelas, setParcelas] = useState(1);
  const [simulacao, setSimulacao] = useState([]);
  const [paymentResult, setPaymentResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [valorCustom, setValorCustom] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [showParcial, setShowParcial] = useState(false);

  // Polling Pix
  const pollIntervalRef = useRef(null);

  // Secure Fields (cartão)
  const [cardReady, setCardReady] = useState(false);
  const [cardError, setCardError] = useState(null);
  // Ref para valores atuais — evita closure stale nos callbacks do CardForm
  const cardContextRef = useRef({ payModal: null, parcelas: 1, payerMode: 'meus-dados', payerForm: {} });

  // Dados do pagador (pode ser o próprio motorista ou terceiro)
  const [payerMode, setPayerMode] = useState('meus-dados'); // 'meus-dados' | 'outro'
  const [payerForm, setPayerForm] = useState({ nome: '', cpf: '', email: '', endereco: '', numero: '', bairro: '', cidade: '', estado: '', cep: '' });

  // Abatimento modal
  const [abatModal, setAbatModal] = useState(null); // chargeId
  const [abatForm, setAbatForm] = useState({ descricao: '', valor: '' });
  const [abatUploading, setAbatUploading] = useState(false);
  const notaInput = useRef(null);

  // Modo do MP (test ou production) — controla exibição dos helpers de teste
  const [mpModo, setMpModo] = useState('test');

  useEffect(() => {
    loadData();
    // Busca modo do MP pra saber se exibe helpers de teste
    paymentsAPI.publicKey().then(res => {
      if (res.data?.modo) setMpModo(res.data.modo);
    }).catch(() => {});
  }, []);

  // Inicia polling quando QR Code Pix é gerado (pagamento real, não simulação)
  useEffect(() => {
    const paymentId = paymentResult?.payment?.id;
    const isRealPix = payMethod === 'pix' && paymentId && !paymentResult?.payment?.mp_payment_id?.startsWith('SIM_');

    if (isRealPix) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await paymentsAPI.getPayment(paymentId);
          if (res.data?.status === 'pago') {
            clearInterval(pollIntervalRef.current);
            toast.success('Pagamento confirmado! ✓');
            setPayModal(null);
            setPaymentResult(null);
            await loadData();
          }
        } catch (_) {}
      }, 4000);
    }

    return () => clearInterval(pollIntervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentResult?.payment?.id]);

  // Para polling quando modal fecha
  useEffect(() => {
    if (!payModal) clearInterval(pollIntervalRef.current);
  }, [payModal]);

  // Mantém ref com valores atuais para callbacks do CardForm (evita stale closure)
  useEffect(() => {
    cardContextRef.current = { payModal, parcelas, payerMode, payerForm };
  }, [payModal, parcelas, payerMode, payerForm]);

  // Monta/desmonta CardForm quando método cartão é selecionado
  useEffect(() => {
    if (payMethod === 'cartao' && payModal && !paymentResult) {
      setCardReady(true);
    } else {
      setCardReady(false);
      setCardError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payMethod, payModal?.type, payModal?.chargeId]);

  const destroyCardForm = () => {
    setCardReady(false);
    setCardError(null);
  };

  const handleCardSubmit = async () => {
    const { payModal: modal, parcelas: parc, payerMode: pMode, payerForm: pForm } = cardContextRef.current;
    if (!modal) return;

    const cardNumber = document.getElementById('mp-card-number-input')?.value?.trim();
    const cardholderName = document.getElementById('mp-card-name')?.value?.trim();
    const expiry = document.getElementById('mp-card-expiry-input')?.value?.trim();
    const cvv = document.getElementById('mp-card-cvv-input')?.value?.trim();

    if (!cardNumber || cardNumber.replace(/\D/g,'').length < 13) { toast.error('Número do cartão inválido.'); return; }
    if (!cardholderName) { toast.error('Informe o nome do titular.'); return; }
    if (!expiry || !/^\d{2}\/\d{2,4}$/.test(expiry)) { toast.error('Data de validade inválida (MM/AA).'); return; }
    if (!cvv || cvv.length < 3) { toast.error('CVV inválido.'); return; }

    const [expMonth, expYear] = expiry.split('/');
    const cpf = pMode === 'outro' ? (pForm.cpf || '') : (profile?.cpf || '');

    setProcessing(true);
    try {
      const tokenRes = await paymentsAPI.tokenizeCard({
        cardNumber, expMonth, expYear, securityCode: cvv, cardholderName, cpf,
      });
      const token = tokenRes.data.token;

      const payload = {
        tipo: modal.type,
        charge_id: modal.chargeId || undefined,
        token,
        parcelas: parc || 1,
      };
      if (pMode === 'outro') {
        payload.payer_data = {
          nome: pForm.nome, cpf: pForm.cpf, email: pForm.email,
          endereco: pForm.endereco, numero: pForm.numero,
          bairro: pForm.bairro, cidade: pForm.cidade,
          estado: pForm.estado, cep: pForm.cep,
        };
      }

      const res = await paymentsAPI.cardToken(payload);
      setPaymentResult({ ...res.data, metodo: 'cartao' });

      if (res.data.mp_status === 'approved') {
        toast.success('Pagamento aprovado!');
        setPayModal(null);
        await loadData();
      } else if (res.data.mp_status === 'in_process') {
        toast.info('Pagamento em análise pelo banco.');
      } else {
        const erros = {
          cc_rejected_bad_filled_card_number: 'Número do cartão inválido',
          cc_rejected_bad_filled_date: 'Data de validade inválida',
          cc_rejected_bad_filled_security_code: 'CVV inválido',
          cc_rejected_call_for_authorize: 'Ligue para sua operadora e autorize',
          cc_rejected_card_disabled: 'Cartão desabilitado',
          cc_rejected_duplicated_payment: 'Pagamento duplicado',
          cc_rejected_high_risk: 'Recusado por segurança',
          cc_rejected_insufficient_amount: 'Saldo insuficiente',
          cc_rejected_max_attempts: 'Limite de tentativas atingido',
          cc_rejected_other_reason: 'Recusado pela operadora',
        };
        toast.error(erros[res.data.mp_status_detail] || res.data.mp_status_detail || 'Pagamento recusado');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Erro ao processar cartão');
    } finally {
      setProcessing(false);
    }
  };

  const initCardForm = () => { setCardReady(true); };

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
  const openPayModal = async (type, chargeId, valor, totalPago = 0) => {
    const restante = parseFloat(valor) - parseFloat(totalPago);
    setPayModal({ type, chargeId, valor: restante, valorOriginal: valor, totalPago });
    setPayMethod('pix');
    setParcelas(1);
    setPaymentResult(null);
    setValorCustom(restante.toFixed(2));
    setJustificativa('');
    setShowParcial(false);
    setPayerMode('meus-dados');
    setPayerForm({ nome: '', cpf: '', email: '', endereco: '', numero: '', bairro: '', cidade: '', estado: '', cep: '' });

    try {
      const res = await paymentsAPI.simulate(restante);
      setSimulacao(res.data);
    } catch (err) {
      console.error('Erro na simulação:', err);
    }
  };

  // ========== PROCESSAR PAGAMENTO ==========
  const processPayment = async () => {
    if (!payModal) return;
    const valorPagar = showParcial ? parseFloat(valorCustom) : payModal.valor;
    if (!valorPagar || valorPagar <= 0) return toast.warning('Informe um valor válido');
    if (valorPagar > payModal.valor + 0.01) return toast.warning(`Valor máximo: R$ ${fmt(payModal.valor)}`);
    if (showParcial && !justificativa.trim()) {
      return toast.warning('Informe uma justificativa para pagamento parcial');
    }

    setProcessing(true);

    try {
      let res;
      if (payModal.type === 'caucao') {
        res = await paymentsAPI.payCaucao({ metodo: payMethod, parcelas });
      } else {
        res = await paymentsAPI.payWeekly(payModal.chargeId, {
          metodo: payMethod,
          parcelas,
          valor_pago: showParcial ? valorPagar : undefined,
          justificativa: showParcial ? justificativa : undefined,
        });
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

      {/* CAUÇÃO — visível para motoristas com carro atribuído + contrato confirmado */}
      {!profile?.caucao_pago && profile?.car_id && profile?.contrato_confirmado && (
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

      {/* RESUMO FINANCEIRO */}
      {charges.length > 0 && (() => {
        const getPago = (c) => Math.max(parseFloat(c.total_pago || 0), parseFloat(c.valor_pago_total || 0));
        const totalCobrado = charges.reduce((s, c) => s + parseFloat(c.valor_final || 0), 0);
        const totalPagoGeral = charges.reduce((s, c) => s + getPago(c), 0);
        const saldoDevedor = charges.filter(c => !c.pago).reduce((s, c) => s + Math.max(parseFloat(c.valor_final || 0) - getPago(c), 0), 0);

        if (saldoDevedor <= 0.01) return null;
        return (
          <div className="card border-2 border-red-200 bg-red-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-red-600 font-medium">Saldo Devedor</p>
                <p className="text-3xl font-bold text-red-700">R$ {fmt(saldoDevedor)}</p>
              </div>
            </div>
            <button
              onClick={() => {
                const oldestUnpaid = charges.find(c => !c.pago);
                if (oldestUnpaid) openPayModal('weekly', oldestUnpaid.id, saldoDevedor, 0);
              }}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base"
            >
              <CreditCard className="w-5 h-5" /> Pagar Total em Aberto
            </button>
          </div>
        );
      })()}

      {/* COBRANÇAS SEMANAIS */}
      {charges.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Cobranças Semanais</h2>

          {[...charges].sort((a, b) => {
            const aDevendo = !a.pago;
            const bDevendo = !b.pago;
            if (aDevendo && !bDevendo) return -1;
            if (!aDevendo && bDevendo) return 1;
            return new Date(b.semana_ref) - new Date(a.semana_ref);
          }).map(charge => {
            const isOpen = expandedCharge === charge.id;
            const abatList = charge.abatimentos_lista || [];
            const isPaid = charge.pago;
            const totalPago = Math.max(
              parseFloat(charge.total_pago || 0),
              parseFloat(charge.valor_pago_total || 0)
            );
            const restante = Math.max(parseFloat(charge.valor_final) - totalPago, 0);
            const isParcial = !isPaid && totalPago > 0;

            return (
              <div key={charge.id} className={`card ${!isPaid ? 'ring-2 ring-red-300 animate-pulse-subtle border-red-200 bg-red-50/30' : ''}`}>
                {/* Header */}
                <button
                  onClick={() => setExpandedCharge(isOpen ? null : charge.id)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isPaid ? 'bg-green-100' : isParcial ? 'bg-yellow-100' : 'bg-red-100'
                    }`}>
                      {isPaid ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : isParcial ? (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">
                        {charge.titulo || `Semana ${new Date(charge.semana_ref).toLocaleDateString('pt-BR')}`}
                      </p>
                      <p className={`text-xs ${isPaid ? 'text-green-600' : isParcial ? 'text-yellow-600' : 'text-red-600'}`}>
                        {isPaid ? 'Pago' : isParcial ? `Parcial — falta R$ ${fmt(restante)}` : 'Pendente'}
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

                      {totalPago > 0 && (
                        <div className="flex justify-between text-green-600 text-sm">
                          <span>Já pago</span>
                          <span>- R$ {fmt(totalPago)}</span>
                        </div>
                      )}

                      {!isPaid && totalPago > 0 && (
                        <div className="flex justify-between font-bold text-red-600 pt-1 border-t border-gray-100">
                          <span>Restante</span>
                          <span>R$ {fmt(restante)}</span>
                        </div>
                      )}
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
                          onClick={() => openPayModal('weekly', charge.id, charge.valor_final, totalPago)}
                          className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                        >
                          <CreditCard className="w-4 h-4" /> {isParcial ? 'Pagar Restante' : 'Pagar'}
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

      {/* EXTRATO DE PAGAMENTOS */}
      {payments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Extrato de Pagamentos</h2>

          <div className="card divide-y divide-gray-100">
            {payments.map((p, idx) => {
              const dataPag = p.data_pagamento ? new Date(p.data_pagamento).toLocaleDateString('pt-BR') : new Date(p.created_at).toLocaleDateString('pt-BR');
              const isManual = p.origem === 'admin';
              const metodoLabel = isManual ? 'Registrado' : p.metodo === 'pix' ? 'Pix' : p.metodo === 'cartao' ? 'Cartão' : (p.metodo || '').toUpperCase();

              return (
                <div key={`${p.origem || 'mp'}-${p.id}-${idx}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
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
                        {metodoLabel} {p.parcelas > 1 ? `· ${p.parcelas}x` : ''} · {dataPag}
                      </p>
                      {p.justificativa && (
                        <p className="text-xs text-gray-500 italic mt-0.5">"{p.justificativa}"</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">R$ {fmt(p.valor_pago || p.valor_total)}</p>
                    <p className={`text-xs ${
                      p.status === 'pago' ? 'text-green-600' : p.status === 'pendente' ? 'text-yellow-600' : 'text-gray-400'
                    }`}>
                      {p.status === 'pago' ? 'Confirmado' : p.status === 'pendente' ? 'Pendente' : p.status}
                    </p>
                  </div>
                </div>
              );
            })}
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
                    <p className="text-sm text-gray-500">{showParcial ? 'Valor total devido' : 'Valor a pagar'}</p>
                    <p className="text-3xl font-bold text-gray-800">R$ {fmt(showParcial ? payModal.valor : payModal.valor)}</p>
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
                  {payMethod === 'cartao' && simulacao.length > 0 && (() => {
                    const sel = simulacao.find(s => s.parcelas === parcelas) || simulacao[0];
                    return (
                      <details className="rounded-lg border border-gray-200 overflow-hidden">
                        <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none bg-white hover:bg-gray-50 text-sm">
                          <span className="text-gray-500">Parcelas</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">{sel.parcelas}x de R$ {fmt(sel.valor_parcela)}</span>
                            <span className="text-xs text-gray-400">{sel.taxa_percentual > 0 ? `+${sel.taxa_percentual}%` : 'sem juros'}</span>
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          </div>
                        </summary>
                        <div className="border-t border-gray-100 divide-y divide-gray-100">
                          {simulacao.map(s => (
                            <button
                              key={s.parcelas}
                              onClick={() => { setParcelas(s.parcelas); document.querySelector('details')?.removeAttribute('open'); }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors text-sm ${
                                parcelas === s.parcelas ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <span className="font-medium">{s.parcelas}x de R$ {fmt(s.valor_parcela)}</span>
                              <span className="text-xs text-gray-400">
                                {s.taxa_percentual > 0 ? `Total R$ ${fmt(s.valor_total)} (+${s.taxa_percentual}%)` : 'Sem juros'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </details>
                    );
                  })()}

                  {/* Resumo cartão */}
                  {selectedSim && payMethod === 'cartao' && !showParcial && (
                    <div className="bg-yellow-50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Valor</span>
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

                  {/* Resumo pagamento parcial */}
                  {showParcial && parseFloat(valorCustom) > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pagando agora</span>
                        <span className="font-bold">R$ {fmt(valorCustom)}</span>
                      </div>
                      {parseFloat(valorCustom) < payModal.valor && (
                        <div className="flex justify-between text-yellow-700">
                          <span>Restante para depois</span>
                          <span>R$ {fmt(payModal.valor - parseFloat(valorCustom))}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dados do pagador (cartão) */}
                  {payMethod === 'cartao' && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Dados do pagador</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPayerMode('meus-dados')}
                          className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                            payerMode === 'meus-dados'
                              ? 'border-brand-600 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          Usar meus dados
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayerMode('outro')}
                          className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                            payerMode === 'outro'
                              ? 'border-brand-600 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          Cartão de terceiro
                        </button>
                      </div>

                      {payerMode === 'meus-dados' ? (
                        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                          <div className="flex justify-between"><span className="text-gray-400">Nome</span><span>{profile?.nome || '—'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">CPF</span><span>{profile?.cpf || '—'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">E-mail</span><span>{profile?.email || '—'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Endereço</span><span className="text-right max-w-[180px]">{profile?.endereco_completo || '—'}</span></div>
                        </div>
                      ) : (
                        <div className="space-y-2 border border-yellow-200 bg-yellow-50 rounded-lg p-3">
                          <p className="text-xs text-yellow-700 font-medium">Informe os dados do titular do cartão</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">Nome completo *</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="Nome como no cadastro do cartão"
                                value={payerForm.nome}
                                onChange={e => setPayerForm(f => ({ ...f, nome: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">CPF *</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="000.000.000-00"
                                maxLength={14}
                                value={payerForm.cpf}
                                onChange={e => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                                  setPayerForm(f => ({ ...f, cpf: v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) => d ? `${a}.${b}.${c}-${d}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a) }));
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
                              <input
                                type="email"
                                className="input-field text-sm"
                                placeholder="email@exemplo.com"
                                value={payerForm.email}
                                onChange={e => setPayerForm(f => ({ ...f, email: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">CEP</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="00000-000"
                                maxLength={9}
                                value={payerForm.cep}
                                onChange={e => {
                                  const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                                  setPayerForm(f => ({ ...f, cep: v.replace(/(\d{5})(\d{0,3})/, (_, a, b) => b ? `${a}-${b}` : a) }));
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Número</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="123"
                                value={payerForm.numero}
                                onChange={e => setPayerForm(f => ({ ...f, numero: e.target.value }))}
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">Rua / Logradouro</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="Rua Exemplo"
                                value={payerForm.endereco}
                                onChange={e => setPayerForm(f => ({ ...f, endereco: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Bairro</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="Centro"
                                value={payerForm.bairro}
                                onChange={e => setPayerForm(f => ({ ...f, bairro: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Cidade</label>
                              <input
                                type="text"
                                className="input-field text-sm"
                                placeholder="São Paulo"
                                value={payerForm.cidade}
                                onChange={e => setPayerForm(f => ({ ...f, cidade: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Estado (UF)</label>
                              <select
                                className="input-field text-sm"
                                value={payerForm.estado}
                                onChange={e => setPayerForm(f => ({ ...f, estado: e.target.value }))}
                              >
                                <option value="">Selecione</option>
                                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                                  <option key={uf} value={uf}>{uf}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Helper de dados de teste MP — só aparece em modo sandbox */}
                  {payMethod === 'cartao' && mpModo !== 'production' && (
                    <details className="rounded-lg border border-dashed border-yellow-400 bg-yellow-50">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-yellow-700 select-none">
                        🧪 Dados de teste (Mercado Pago)
                      </summary>
                      <div className="px-3 pb-3 space-y-2">
                        {[
                          { label: 'Mastercard (aprovado)', number: '5031 4332 1540 6351', cvv: '123', exp: '11/30' },
                          { label: 'Visa (aprovado)', number: '4235 6477 2802 5682', cvv: '123', exp: '11/30' },
                        ].map(card => (
                          <div key={card.number} className="bg-white rounded-lg border border-yellow-200 p-2 space-y-1">
                            <p className="text-xs font-semibold text-gray-600">{card.label}</p>
                            <div className="grid grid-cols-3 gap-1 text-xs">
                              {[
                                { l: 'Número', v: card.number },
                                { l: 'Validade', v: card.exp },
                                { l: 'CVV', v: card.cvv },
                              ].map(({ l, v }) => (
                                <button
                                  key={l}
                                  type="button"
                                  onClick={() => navigator.clipboard.writeText(v.replace(/\s/g, ''))}
                                  className="flex flex-col items-center bg-gray-50 hover:bg-yellow-100 border border-gray-200 rounded p-1 transition-colors"
                                  title={`Copiar ${l}`}
                                >
                                  <span className="text-gray-400" style={{ fontSize: '10px' }}>{l}</span>
                                  <span className="font-mono font-bold text-gray-700">{v}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const set = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } };
                            set('mp-card-number-input', '5031 4332 1540 6351');
                            set('mp-card-name', 'APRO');
                            set('mp-card-expiry-input', '11/30');
                            set('mp-card-cvv-input', '123');
                            setPayerForm(f => ({ ...f, nome: 'APRO', cpf: '123.456.789-09', email: f.email || 'teste@teste.com' }));
                          }}
                          className="w-full py-1.5 text-xs font-medium bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg transition-colors"
                        >
                          ✨ Auto-preencher tudo (Mastercard APRO aprovado)
                        </button>
                      </div>
                    </details>
                  )}

                  {/* Formulário Secure Fields (cartão) — iframes PCI do MP */}
                  {payMethod === 'cartao' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Número do cartão</label>
                        <input
                          id="mp-card-number-input"
                          type="text"
                          className="input-field"
                          placeholder="0000 0000 0000 0000"
                          maxLength={19}
                          inputMode="numeric"
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g,'').slice(0,16);
                            e.target.value = v.replace(/(.{4})/g,'$1 ').trim();
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nome no cartão</label>
                        <input id="mp-card-name" type="text" className="input-field" placeholder="Nome como no cartão" style={{ textTransform: 'uppercase' }} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Validade (MM/AA)</label>
                          <input
                            id="mp-card-expiry-input"
                            type="text"
                            className="input-field"
                            placeholder="MM/AA"
                            maxLength={5}
                            inputMode="numeric"
                            onChange={e => {
                              const v = e.target.value.replace(/\D/g,'').slice(0,4);
                              e.target.value = v.length > 2 ? `${v.slice(0,2)}/${v.slice(2)}` : v;
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">CVV</label>
                          <input
                            id="mp-card-cvv-input"
                            type="text"
                            className="input-field"
                            placeholder="123"
                            maxLength={4}
                            inputMode="numeric"
                            onChange={e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,4); }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCardSubmit}
                        disabled={processing}
                        className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                      >
                        {processing ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <><CreditCard className="w-4 h-4" /> Pagar com Cartão</>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Botão pagar (Pix) */}
                  {payMethod === 'pix' && (
                  <button
                    onClick={processPayment}
                    disabled={processing || (showParcial && (!valorCustom || parseFloat(valorCustom) <= 0))}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        {showParcial && parseFloat(valorCustom) > 0
                          ? `Gerar Pix R$ ${fmt(valorCustom)}`
                          : 'Gerar QR Code Pix'
                        }
                      </>
                    )}
                  </button>
                  )}

                  {/* Link pagamento parcial (exceção) */}
                  {payModal.type !== 'caucao' && (
                    <div className="pt-1">
                      {!showParcial ? (
                        <button
                          onClick={() => { setShowParcial(true); setValorCustom(''); }}
                          className="text-xs text-gray-400 hover:text-brand-600 underline w-full text-center"
                        >
                          Não consigo pagar o valor total
                        </button>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 space-y-3 border border-gray-200">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-700">Pagamento parcial</p>
                            <button onClick={() => { setShowParcial(false); setValorCustom(payModal.valor.toFixed(2)); setJustificativa(''); }}
                              className="text-xs text-gray-400 hover:text-gray-600 underline">Cancelar</button>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Valor que consigo pagar</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={payModal.valor}
                                value={valorCustom}
                                onChange={e => {
                                  setValorCustom(e.target.value);
                                  const val = parseFloat(e.target.value);
                                  if (val > 0) paymentsAPI.simulate(val).then(r => setSimulacao(r.data)).catch(() => {});
                                }}
                                className="input-field pl-10 font-bold"
                                placeholder="0,00"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Justificativa *</label>
                            <textarea
                              value={justificativa}
                              onChange={e => setJustificativa(e.target.value)}
                              className="input-field text-sm"
                              rows={2}
                              placeholder="Ex: Semana fraca, pago o restante na próxima..."
                            />
                          </div>
                          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 flex gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>O valor restante continuará pendente e poderá gerar <strong>juros e multa por atraso</strong>. Quite o saldo o mais rápido possível para evitar encargos adicionais.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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

                      {/* QR Code imagem (se disponível do MP) */}
                      {paymentResult.payment.mp_qr_code_base64 && (
                        <div className="flex justify-center">
                          <img
                            src={`data:image/png;base64,${paymentResult.payment.mp_qr_code_base64}`}
                            alt="QR Code Pix"
                            className="w-48 h-48 rounded-lg border"
                          />
                        </div>
                      )}

                      {paymentResult.payment.mp_ticket_url && (
                        <a
                          href={paymentResult.payment.mp_ticket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                        >
                          <QrCode className="w-4 h-4" /> Ver página de pagamento
                        </a>
                      )}

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                        <p>Após o pagamento via Pix, a confirmação será automática em alguns instantes.</p>
                      </div>

                      {/* Simular confirmação: só aparece quando é simulação (sem integração real) */}
                      {paymentResult.payment.mp_payment_id?.startsWith('SIM_') && (
                        <div className="bg-yellow-50 rounded-lg p-3 text-xs text-yellow-700">
                          <p className="font-medium">Modo Simulação</p>
                          <p className="mt-1">Mercado Pago não está configurado. Use o botão abaixo para simular.</p>
                          <button
                            onClick={() => confirmPayment(paymentResult.payment.id)}
                            className="btn-primary text-xs mt-2"
                          >
                            Simular confirmação
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resultado cartão Secure Fields (transparente) */}
                  {(paymentResult?.metodo === 'cartao' || payMethod === 'cartao') && paymentResult?.mp_status && (
                    <div className="text-center space-y-4">
                      {paymentResult.mp_status === 'approved' ? (
                        <div className="bg-green-50 rounded-lg p-4">
                          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
                          <p className="font-semibold text-green-800">Pagamento Aprovado!</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {paymentResult.calculo?.parcelas}x de R$ {fmt(paymentResult.calculo?.valor_parcela)}
                          </p>
                        </div>
                      ) : paymentResult.mp_status === 'in_process' ? (
                        <div className="bg-yellow-50 rounded-lg p-4">
                          <Clock className="w-12 h-12 text-yellow-600 mx-auto mb-2" />
                          <p className="font-semibold text-yellow-800">Em análise pelo banco</p>
                          <p className="text-xs text-gray-500 mt-1">A confirmação será automática assim que aprovado.</p>
                        </div>
                      ) : (
                        <div className="bg-red-50 rounded-lg p-4">
                          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                          <p className="font-semibold text-red-700">Pagamento recusado</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentResult.mp_status_detail}</p>
                          <button onClick={() => { setPaymentResult(null); setTimeout(() => initCardForm(), 300); }}
                            className="btn-primary text-xs mt-3">Tentar novamente</button>
                        </div>
                      )}
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
