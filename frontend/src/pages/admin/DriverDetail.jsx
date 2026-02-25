import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { driversAPI, carsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Car, FileText,
  Eye, X, Shield, UserCheck, AlertCircle, Plus, Banknote,
  Check, Download, Upload, Pencil, Save, Calendar, User, Trash2,
  RefreshCw, ArrowRightLeft, History, DollarSign, ChevronDown, ChevronUp,
  Lock, Unlock
} from 'lucide-react';

const STATUS_BADGE = {
  pendente: 'bg-gray-100 text-gray-700', em_analise: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800', reprovado: 'bg-red-100 text-red-800',
  ativo: 'bg-green-100 text-green-800', inadimplente: 'bg-red-100 text-red-800',
  rescindido: 'bg-gray-200 text-gray-600', recolhido: 'bg-gray-200 text-gray-600',
};

const DIAS_SEMANA = [
  { value: 'segunda', label: 'Segunda-feira' }, { value: 'terca', label: 'Terça-feira' },
  { value: 'quarta', label: 'Quarta-feira' }, { value: 'quinta', label: 'Quinta-feira' },
  { value: 'sexta', label: 'Sexta-feira' }, { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
];

const DOC_TYPES = [
  { tipo: 'cnh', label: 'CNH-e (Digital)' }, { tipo: 'comprovante', label: 'Comprovante End.' },
  { tipo: 'selfie', label: 'Selfie c/ Doc' }, { tipo: 'perfil_app', label: 'Print Uber/99' },
  { tipo: 'contrato', label: 'Contrato Locação' }, { tipo: 'nota_fiscal', label: 'Nota Fiscal' },
  { tipo: 'outro', label: 'Outro Doc' },
];

const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export default function AdminDriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [allCars, setAllCars] = useState([]);
  const [adminDocs, setAdminDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Charge modal
  const [chargeModal, setChargeModal] = useState(false);
  const [chargeForm, setChargeForm] = useState({ semana_ref: '', valor_base: '', observacoes: '' });

  // Acréscimo
  const [acrescimoChargeId, setAcrescimoChargeId] = useState(null);
  const [acrescimoForm, setAcrescimoForm] = useState({ descricao: '', valor: '' });

  // Approve/Reject
  const [approveModal, setApproveModal] = useState(false);
  const [selectedCar, setSelectedCar] = useState('');
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Settlement
  const [settlementModal, setSettlementModal] = useState(false);
  const [settlementForm, setSettlementForm] = useState({ debitos_pendentes: 0, multas_acumuladas: 0, danos: 0, outros_descontos: 0, observacoes: '' });

  // Upload doc
  const [uploading, setUploading] = useState(false);
  const docInputRef = useRef(null);
  const [uploadTipo, setUploadTipo] = useState('');

  // Contract
  const [contractModal, setContractModal] = useState(false);
  const [contractForm, setContractForm] = useState({});
  const [generatingContract, setGeneratingContract] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // === NEW: Car Swap ===
  const [swapModal, setSwapModal] = useState(false);
  const [swapCarId, setSwapCarId] = useState('');
  const [swapMotivo, setSwapMotivo] = useState('');
  const [swapHistory, setSwapHistory] = useState([]);
  const [showSwapHistory, setShowSwapHistory] = useState(false);

  // === NEW: Generate Charges ===
  const [genChargesModal, setGenChargesModal] = useState(false);
  const [genForm, setGenForm] = useState({ data_inicio: '', dia_cobranca: 'segunda', valor_semanal: '', juros_diario: '0.5' });

  // === NEW: Payment Entry ===
  const [paymentEntryModal, setPaymentEntryModal] = useState(null); // charge object
  const [paymentForm, setPaymentForm] = useState({ valor_pago: '', data_pagamento: '', observacoes: '' });
  const [paymentEntries, setPaymentEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // === NEW: Expanded charge ===
  const [expandedCharge, setExpandedCharge] = useState(null);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const [driverRes, carsRes] = await Promise.all([driversAPI.get(id), carsAPI.listAll()]);
      setDriver(driverRes.data);
      setAllCars(carsRes.data);
      initEditForm(driverRes.data);
      if (driverRes.data.car_swaps) setSwapHistory(driverRes.data.car_swaps);
      if (driverRes.data.charges) {
        const pending = driverRes.data.charges.filter(c => !c.pago);
        setSettlementForm(prev => ({
          ...prev,
          debitos_pendentes: pending.reduce((s, c) => s + parseFloat(c.valor_final || 0), 0).toFixed(2),
          multas_acumuladas: pending.reduce((s, c) => s + parseFloat(c.multa || 0), 0).toFixed(2),
        }));
      }
      // Carregar documentos com status fixado
      try {
        const docsRes = await driversAPI.getDocuments(id);
        setAdminDocs(docsRes.data);
      } catch (e) { /* fallback: docs já vêm no driver.documents */ }
    } catch (err) {
      toast.error('Erro ao carregar motorista');
      navigate('/admin/motoristas');
    } finally { setLoading(false); }
  };

  const initEditForm = (d) => {
    setEditForm({
      nome: d.nome || '', cpf: d.cpf || '', telefone: d.telefone || '', email: d.email || '',
      rg: d.rg || '', endereco_completo: d.endereco_completo || '',
      car_id: d.car_id || '', dia_cobranca: d.dia_cobranca || 'segunda', observacoes: d.motivo_reprovacao || '',
    });
  };

  // ========== SAVE EDIT ==========
  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await driversAPI.updateDriver(id, {
        nome: editForm.nome, cpf: editForm.cpf, telefone: editForm.telefone, email: editForm.email,
        rg: editForm.rg, endereco_completo: editForm.endereco_completo,
        car_id: editForm.car_id || null, dia_cobranca: editForm.dia_cobranca, observacoes: editForm.observacoes,
      });
      toast.success('Dados atualizados!');
      setEditing(false);
      await loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  // ========== EXISTING ACTIONS ==========
  const handleApprove = async () => { setProcessing(true); try { await driversAPI.approve(id, { car_id: selectedCar || null }); toast.success('Aprovado!'); setApproveModal(false); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } finally { setProcessing(false); } };
  const handleReject = async () => { setProcessing(true); try { await driversAPI.reject(id, { motivo: rejectReason }); toast.success('Reprovado'); setRejectModal(false); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } finally { setProcessing(false); } };
  const handleConfirmContract = async () => { try { await driversAPI.confirmContract(id); toast.success('Contrato confirmado!'); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };
  const handleActivate = async () => { try { await driversAPI.activate(id); toast.success('Ativado!'); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };
  const handleLockDoc = async (docId, fixado) => {
    try {
      await driversAPI.lockDocument(id, docId, fixado);
      toast.success(fixado ? 'Documento fixado!' : 'Documento desfixado');
      await loadData();
    } catch (e) { toast.error('Erro ao fixar documento'); }
  };
  const handleCreateCharge = async () => { if (!chargeForm.semana_ref || !chargeForm.valor_base) return toast.warning('Preencha semana e valor'); setProcessing(true); try { await driversAPI.createCharge(id, chargeForm); toast.success('Cobrança criada!'); setChargeModal(false); setChargeForm({ semana_ref: '', valor_base: '', observacoes: '' }); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } finally { setProcessing(false); } };
  const handleApproveAbatimento = async (abatId) => { try { await driversAPI.approveAbatimento(id, abatId); toast.success('Abatimento aprovado!'); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };
  const handleAddAcrescimo = async () => { if (!acrescimoForm.descricao || !acrescimoForm.valor) return toast.warning('Preencha'); try { await driversAPI.addAcrescimo(id, { charge_id: acrescimoChargeId, descricao: acrescimoForm.descricao, valor: parseFloat(acrescimoForm.valor) }); toast.success('Acréscimo adicionado!'); setAcrescimoChargeId(null); setAcrescimoForm({ descricao: '', valor: '' }); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };
  const handleRemoveAcrescimo = async (acrescimoId) => { try { await driversAPI.removeAcrescimo(id, acrescimoId); toast.success('Removido!'); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };

  const triggerDocUpload = (tipo) => { setUploadTipo(tipo); setTimeout(() => docInputRef.current?.click(), 50); };
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file || !uploadTipo) return;
    setUploading(true);
    try { const fd = new FormData(); fd.append('arquivo', file); await driversAPI.adminUploadDoc(id, uploadTipo, fd); toast.success(`${uploadTipo.toUpperCase()} enviado!`); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setUploading(false); setUploadTipo(''); if (docInputRef.current) docInputRef.current.value = ''; }
  };

  const handleSettlement = async () => { setProcessing(true); try { await fetch(`/api/drivers/${id}/settlement`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('locacar_token')}` }, body: JSON.stringify(settlementForm) }); toast.success('Rescisão processada!'); setSettlementModal(false); await loadData(); } catch (e) { toast.error('Erro na rescisão'); } finally { setProcessing(false); } };

  const openContractModal = () => {
    setContractForm({ locatario_rg: driver.rg || '', locatario_endereco: driver.endereco_completo || '', valor_semanal_extenso: '', valor_caucao_extenso: '', data_contrato: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) });
    setContractModal(true);
  };

  const handleGenerateContract = async () => {
    setGeneratingContract(true);
    try {
      const res = await driversAPI.generateContract(id, contractForm);
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `contrato_${driver.nome?.replace(/\s+/g, '_')}.docx`; a.click();
      URL.revokeObjectURL(url); toast.success('Contrato gerado!'); setContractModal(false);
    } catch (err) { toast.error('Erro ao gerar contrato'); }
    finally { setGeneratingContract(false); }
  };

  const handleDeleteDriver = async () => {
    setProcessing(true);
    try { await driversAPI.deleteDriver(id); toast.success('Motorista excluído!'); navigate('/admin/motoristas'); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro ao excluir'); }
    finally { setProcessing(false); setDeleteConfirm(false); }
  };

  // ========== NEW: CAR SWAP ==========
  const handleSwapCar = async () => {
    if (!swapCarId) return toast.warning('Selecione o novo carro');
    setProcessing(true);
    try {
      await driversAPI.swapCar(id, { new_car_id: parseInt(swapCarId), motivo: swapMotivo });
      toast.success('Carro trocado! Novo contrato necessário.');
      setSwapModal(false); setSwapCarId(''); setSwapMotivo('');
      await loadData();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao trocar carro'); }
    finally { setProcessing(false); }
  };

  // ========== NEW: GENERATE CHARGES ==========
  const handleGenerateCharges = async () => {
    if (!genForm.data_inicio || !genForm.dia_cobranca || !genForm.valor_semanal) return toast.warning('Preencha todos os campos');
    setProcessing(true);
    try {
      const res = await driversAPI.generateCharges(id, genForm);
      toast.success(`${res.data.geradas} cobranças geradas!`);
      setGenChargesModal(false);
      await loadData();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao gerar'); }
    finally { setProcessing(false); }
  };

  // ========== NEW: PAYMENT ENTRY ==========
  const openPaymentEntry = async (charge) => {
    setPaymentEntryModal(charge);
    setPaymentForm({ valor_pago: '', data_pagamento: new Date().toISOString().split('T')[0], observacoes: '' });
    // Load existing entries
    setLoadingEntries(true);
    try {
      const res = await driversAPI.getPaymentEntries(id, charge.id);
      setPaymentEntries(res.data);
    } catch { setPaymentEntries([]); }
    finally { setLoadingEntries(false); }
  };

  const handleAddPaymentEntry = async () => {
    if (!paymentForm.valor_pago || !paymentForm.data_pagamento) return toast.warning('Informe valor e data');
    setProcessing(true);
    try {
      await driversAPI.addPaymentEntry(id, paymentEntryModal.id, paymentForm);
      toast.success('Pagamento registrado!');
      // Reload entries
      const res = await driversAPI.getPaymentEntries(id, paymentEntryModal.id);
      setPaymentEntries(res.data);
      setPaymentForm({ valor_pago: '', data_pagamento: paymentForm.data_pagamento, observacoes: '' });
      await loadData();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setProcessing(false); }
  };

  const handleDeletePaymentEntry = async (entryId) => {
    try {
      await driversAPI.deletePaymentEntry(id, paymentEntryModal.id, entryId);
      toast.success('Removido');
      const res = await driversAPI.getPaymentEntries(id, paymentEntryModal.id);
      setPaymentEntries(res.data);
      await loadData();
    } catch (e) { toast.error('Erro ao remover'); }
  };

  // ========== NEW: RECALCULATE INTEREST ==========
  const handleRecalculateInterest = async () => {
    setProcessing(true);
    try {
      await driversAPI.recalculateInterest(id, { juros_diario: genForm.juros_diario || '0.5' });
      toast.success('Juros recalculados!');
      await loadData();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    finally { setProcessing(false); }
  };

  const availableCars = allCars.filter(c => c.disponivel || (driver && c.id === driver.car_id));
  const swapAvailableCars = allCars.filter(c => c.disponivel && c.id !== driver?.car_id);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;
  if (!driver) return null;

  // Totals
  const totalDevido = (driver.charges || []).reduce((s, c) => s + parseFloat(c.valor_final || 0), 0);
  const totalPagoGlobal = (driver.charges || []).reduce((s, c) => s + parseFloat(c.valor_pago_total || c.total_pago || 0), 0);
  const saldoGlobal = totalDevido - totalPagoGlobal;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/motoristas')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-800">{driver.nome}</h1>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[driver.status]}`}>{driver.status?.replace('_', ' ')}</span>
          </div>
          <p className="text-sm text-gray-400">{driver.email} · CPF: {driver.cpf}{driver.telefone ? ` · Tel: ${driver.telefone}` : ''}</p>
          {driver.token_externo && <p className="text-xs text-brand-600 font-mono">Token: {driver.token_externo}</p>}
          {driver.interesse_marca && !driver.car_id && (
            <p className="text-xs text-amber-600 mt-0.5">⭐ Interesse: {driver.interesse_marca} {driver.interesse_modelo}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setEditing(!editing); if (editing) initEditForm(driver); }} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${editing ? 'bg-gray-200 text-gray-700' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
            {editing ? <><X className="w-4 h-4" /> Cancelar</> : <><Pencil className="w-4 h-4" /> Editar</>}
          </button>
          <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ========== EDIT FORM ========== */}
      {editing && (
        <div className="card border-2 border-brand-200 space-y-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><User className="w-4 h-4 text-brand-600" /> Editar Dados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Nome *</label><input type="text" value={editForm.nome} onChange={e => setEditForm({...editForm, nome: e.target.value})} className="input-field" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">CPF *</label><input type="text" value={editForm.cpf} onChange={e => setEditForm({...editForm, cpf: e.target.value})} className="input-field" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">RG</label><input type="text" value={editForm.rg} onChange={e => setEditForm({...editForm, rg: e.target.value})} className="input-field" placeholder="0000000 SSP/SC" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Telefone</label><input type="text" value={editForm.telefone} onChange={e => setEditForm({...editForm, telefone: e.target.value})} className="input-field" /></div>
            <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Email</label><input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="input-field" /></div>
            <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Endereço completo</label><input type="text" value={editForm.endereco_completo} onChange={e => setEditForm({...editForm, endereco_completo: e.target.value})} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Carro atribuído</label>
              <select value={editForm.car_id} onChange={e => setEditForm({...editForm, car_id: e.target.value})} className="input-field">
                <option value="">Nenhum</option>
                {availableCars.map(c => (<option key={c.id} value={c.id}>{c.marca} {c.modelo} — {c.placa} (R$ {fmt(c.valor_semanal)}/sem){c.id === driver.car_id ? ' ← atual' : ''}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Dia da cobrança</label>
              <select value={editForm.dia_cobranca} onChange={e => setEditForm({...editForm, dia_cobranca: e.target.value})} className="input-field">
                {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Observações</label><textarea value={editForm.observacoes} onChange={e => setEditForm({...editForm, observacoes: e.target.value})} className="input-field" rows={2} /></div>
          <button onClick={handleSaveEdit} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
        </div>
      )}

      {/* ========== INFO CARDS ========== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Veículo */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><Car className="w-4 h-4 text-brand-600" /><h3 className="font-semibold text-gray-700 text-sm">Veículo</h3></div>
            {driver.car_marca && (driver.status === 'ativo' || driver.status === 'inadimplente') && (
              <button onClick={() => setSwapModal(true)} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-100 flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3" /> Trocar
              </button>
            )}
          </div>
          {driver.car_marca ? (
            <div>
              <p className="font-medium">{driver.car_marca} {driver.car_modelo}</p>
              <p className="text-xs text-gray-400">{driver.car_placa} · R$ {fmt(driver.car_valor_semanal)}/sem</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Nenhum — <button onClick={() => setEditing(true)} className="text-brand-600 underline">atribuir</button></p>
          )}
          {swapHistory.length > 0 && (
            <button onClick={() => setShowSwapHistory(!showSwapHistory)} className="text-xs text-gray-400 mt-2 flex items-center gap-1 hover:text-gray-600">
              <History className="w-3 h-3" /> {swapHistory.length} troca(s)
              {showSwapHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {showSwapHistory && swapHistory.map(s => (
            <div key={s.id} className="text-xs bg-gray-50 rounded p-1.5 mt-1">
              <p className="font-medium">{s.carro_anterior || '—'} → {s.carro_novo}</p>
              <p className="text-gray-400">{fmtDate(s.created_at)}{s.motivo ? ` · ${s.motivo}` : ''}</p>
            </div>
          ))}
        </div>

        {/* Financeiro resumo */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-brand-600" /><h3 className="font-semibold text-gray-700 text-sm">Financeiro</h3></div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total cobrado:</span><span className="font-medium">R$ {fmt(totalDevido)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total pago:</span><span className="font-medium text-green-600">R$ {fmt(totalPagoGlobal)}</span></div>
            <div className="flex justify-between border-t pt-1"><span className="text-gray-500 font-medium">Saldo devedor:</span><span className={`font-bold ${saldoGlobal > 0 ? 'text-red-600' : 'text-green-600'}`}>R$ {fmt(saldoGlobal)}</span></div>
          </div>
        </div>

        {/* Progresso */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2"><Shield className="w-4 h-4 text-brand-600" /><h3 className="font-semibold text-gray-700 text-sm">Progresso</h3></div>
          <div className="space-y-1 text-xs">
            {[
              { ok: driver.cnh_url, label: 'CNH-e' }, { ok: driver.comprovante_url, label: 'Comprovante' },
              { ok: driver.selfie_url, label: 'Selfie' }, { ok: driver.perfil_app_url, label: 'Print Uber/99' },
              { ok: driver.contrato_url, label: 'Contrato' }, { ok: driver.caucao_pago, label: 'Caução' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {item.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                <span className={item.ok ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== STATUS ACTIONS ========== */}
      {driver.status === 'em_analise' && (
        <div className="card border-l-4 border-yellow-400">
          <h3 className="font-semibold text-gray-800 mb-3">Aprovação de Cadastro</h3>
          <div className="flex gap-3">
            <button onClick={() => setApproveModal(true)} className="btn-primary flex items-center gap-2"><UserCheck className="w-4 h-4" /> Aprovar</button>
            <button onClick={() => setRejectModal(true)} className="btn-danger flex items-center gap-2"><XCircle className="w-4 h-4" /> Reprovar</button>
          </div>
        </div>
      )}

      {driver.status === 'aprovado' && driver.contrato_url && !driver.contrato_confirmado && (
        <div className="card border-l-4 border-purple-400">
          <h3 className="font-semibold text-gray-800 mb-2">Confirmar Contrato</h3>
          <button onClick={handleConfirmContract} className="btn-primary flex items-center gap-2"><Check className="w-4 h-4" /> Confirmar Contrato</button>
        </div>
      )}

      {driver.status === 'aprovado' && driver.caucao_pago && driver.contrato_confirmado && (
        <div className="card border-l-4 border-green-400">
          <h3 className="font-semibold text-gray-800 mb-2">Ativar Motorista</h3>
          <button onClick={handleActivate} className="btn-primary flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Ativar</button>
        </div>
      )}

      {/* ========== DOCUMENTOS ========== */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-brand-600" /> Documentos</h3>
        <input type="file" ref={docInputRef} onChange={handleDocUpload} accept="image/*,application/pdf,.doc,.docx" className="hidden" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {DOC_TYPES.map(doc => {
            const urlField = { cnh: 'cnh_url', comprovante: 'comprovante_url', selfie: 'selfie_url', perfil_app: 'perfil_app_url', contrato: 'contrato_url' };
            const hasFile = urlField[doc.tipo] ? driver[urlField[doc.tipo]] : false;
            // Verificar se o último doc deste tipo está fixado
            const latestDoc = adminDocs.find(d => d.tipo === doc.tipo);
            const isFixed = latestDoc?.fixado;
            return (
              <div key={doc.tipo} className={`rounded-lg border p-2.5 text-center ${isFixed ? 'border-amber-300 bg-amber-50' : hasFile ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-xs font-medium text-gray-700 mb-1">{doc.label}</p>
                {isFixed && <span className="text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">🔒 Fixado</span>}
                <div className="flex items-center justify-center gap-1 mt-1">
                  {hasFile && (
                    <button onClick={() => setPreviewUrl(driver[urlField[doc.tipo]])} className="text-[11px] bg-white border text-brand-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Eye className="w-3 h-3" /> Ver
                    </button>
                  )}
                  <button onClick={() => triggerDocUpload(doc.tipo)} disabled={uploading}
                    className={`text-[11px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${hasFile ? 'bg-white border text-gray-500' : 'bg-brand-600 text-white'}`}>
                    <Upload className="w-3 h-3" /> {hasFile ? 'Trocar' : 'Enviar'}
                  </button>
                  {hasFile && latestDoc && (
                    <button onClick={() => handleLockDoc(latestDoc.id, !isFixed)}
                      title={isFixed ? 'Desfixar documento' : 'Fixar documento (impede motorista de substituir)'}
                      className={`text-[11px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${isFixed ? 'bg-amber-200 text-amber-800 hover:bg-amber-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {isFixed ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {isFixed ? 'Desfixar' : 'Fixar'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {uploading && <p className="text-sm text-brand-600 animate-pulse mb-2">Enviando...</p>}
        {(adminDocs.length > 0 || driver.documents?.length > 0) && (
          <details className="text-sm">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Histórico ({(adminDocs.length || driver.documents?.length || 0)} arquivos)</summary>
            <div className="mt-2 divide-y divide-gray-100 max-h-48 overflow-auto">
              {(adminDocs.length > 0 ? adminDocs : driver.documents || []).map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-gray-600 truncate">{doc.tipo.toUpperCase()} — {doc.nome_arquivo} · {fmtDate(doc.created_at)}</span>
                    {doc.fixado && <span className="text-[9px] bg-amber-200 text-amber-800 px-1 py-0.5 rounded shrink-0">🔒</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setPreviewUrl(doc.caminho)} className="text-brand-600"><Eye className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleLockDoc(doc.id, !doc.fixado)}
                      title={doc.fixado ? 'Desfixar' : 'Fixar'}
                      className={`${doc.fixado ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'}`}>
                      {doc.fixado ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ========== GERAR CONTRATO ========== */}
      {driver.car_marca && (
        <div className="card border border-purple-200 bg-purple-50/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><FileText className="w-4 h-4 text-purple-600" /> Contrato de Locação</h3>
              <p className="text-sm text-gray-500 mt-1">Gera DOCX com dados do motorista e veículo</p>
            </div>
            <button onClick={openContractModal} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Gerar Contrato
            </button>
          </div>
        </div>
      )}

      {/* ========== COBRANÇAS SEMANAIS ========== */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Banknote className="w-4 h-4 text-brand-600" /> Cobranças Semanais</h3>
          <div className="flex items-center gap-2">
            {driver.charges?.length > 0 && (
              <button onClick={handleRecalculateInterest} disabled={processing}
                className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${processing ? 'animate-spin' : ''}`} /> Recalcular Juros
              </button>
            )}
            <button onClick={() => {
              setGenForm({ data_inicio: driver.data_inicio?.split('T')[0] || '', dia_cobranca: driver.dia_cobranca || 'segunda', valor_semanal: driver.car_valor_semanal || '', juros_diario: '0.5' });
              setGenChargesModal(true);
            }} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Gerar Cobranças
            </button>
            <button onClick={() => { setChargeForm({ semana_ref: new Date().toISOString().split('T')[0], valor_base: driver.car_valor_semanal || '', observacoes: '' }); setChargeModal(true); }}
              className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Avulsa
            </button>
          </div>
        </div>

        {driver.charges?.length > 0 ? (
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {driver.charges.map(charge => {
              const abats = charge.abatimentos_lista || [];
              const pendingAbats = abats.filter(a => !a.aprovado);
              const acrescimos = charge.acrescimos_lista || [];
              const totalAcrescimos = acrescimos.reduce((s, a) => s + parseFloat(a.valor), 0);
              const pagManuais = charge.pagamentos_manuais || [];
              const totalPago = parseFloat(charge.valor_pago_total || charge.total_pago || 0);
              const saldoDev = parseFloat(charge.saldo_devedor || (parseFloat(charge.valor_final) - totalPago));
              const juros = parseFloat(charge.juros_acumulados || 0);
              const isParcial = !charge.pago && totalPago > 0;
              const isExpanded = expandedCharge === charge.id;

              return (
                <div key={charge.id} className={`bg-gray-50 rounded-lg p-3 border transition-all ${charge.pago ? 'border-green-200' : saldoDev > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedCharge(isExpanded ? null : charge.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">📅 {fmtDate(charge.semana_ref)}</p>
                        {charge.observacoes && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{charge.observacoes}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Base: R$ {fmt(charge.valor_base)}
                        {juros > 0 && <span className="text-red-500"> + Juros: R$ {fmt(juros)}</span>}
                        {totalAcrescimos > 0 && ` | Acrés: +R$ ${fmt(totalAcrescimos)}`}
                        {totalPago > 0 && <span className="text-green-600"> | Pago: R$ {fmt(totalPago)}</span>}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="font-bold text-sm">R$ {fmt(charge.valor_final)}</p>
                        <span className={`text-xs font-medium ${charge.pago ? 'text-green-600' : isParcial ? 'text-yellow-600' : 'text-red-600'}`}>
                          {charge.pago ? '✓ Pago' : isParcial ? `◐ Falta R$ ${fmt(saldoDev)}` : `● R$ ${fmt(saldoDev)}`}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                      {/* Pagamentos manuais */}
                      {pagManuais.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-green-700 mb-1">💰 Pagamentos registrados:</p>
                          {pagManuais.map((p, i) => (
                            <div key={p.id || i} className="flex items-center justify-between bg-green-50 rounded px-2 py-1 mb-0.5">
                              <span className="text-xs">{fmtDate(p.data_pagamento)} — <strong>R$ {fmt(p.valor_pago)}</strong>{p.observacoes ? ` (${p.observacoes})` : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Acréscimos */}
                      {acrescimos.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-700">Acréscimos:</p>
                          {acrescimos.map(acr => (
                            <div key={acr.id} className="flex items-center justify-between bg-red-50 rounded px-2 py-1">
                              <span className="text-xs">{acr.descricao} — <strong>+R$ {fmt(acr.valor)}</strong></span>
                              {!charge.pago && <button onClick={() => handleRemoveAcrescimo(acr.id)} className="text-xs text-red-500 px-1">✕</button>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Abatimentos */}
                      {pendingAbats.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-yellow-700">Abatimentos pendentes:</p>
                          {pendingAbats.map(abat => (
                            <div key={abat.id} className="flex items-center justify-between bg-yellow-50 rounded px-2 py-1">
                              <span className="text-xs">{abat.descricao || 'S/ desc'} — R$ {fmt(abat.valor)}</span>
                              <button onClick={() => handleApproveAbatimento(abat.id)} className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Aprovar</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openPaymentEntry(charge)}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-green-700">
                          <DollarSign className="w-3 h-3" /> Registrar Pagamento
                        </button>
                        {!charge.pago && (
                          <button onClick={() => { setAcrescimoChargeId(charge.id); setAcrescimoForm({ descricao: '', valor: '' }); }}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-red-100">
                            <Plus className="w-3 h-3" /> Acréscimo
                          </button>
                        )}
                      </div>

                      {/* Inline add acréscimo */}
                      {acrescimoChargeId === charge.id && (
                        <div className="bg-white rounded-lg p-2 border space-y-2">
                          <select value={acrescimoForm.descricao} onChange={e => setAcrescimoForm({...acrescimoForm, descricao: e.target.value})} className="input-field text-xs py-1.5">
                            <option value="">Tipo...</option>
                            <option>Multa de trânsito</option><option>Danos ao veículo</option>
                            <option>Guincho / Reboque</option><option>Manutenção</option>
                            <option>Seguro</option><option>Outro</option>
                          </select>
                          {acrescimoForm.descricao === 'Outro' && <input type="text" placeholder="Descreva..." onChange={e => setAcrescimoForm({...acrescimoForm, descricao: e.target.value})} className="input-field text-xs py-1.5" />}
                          <input type="number" step="0.01" placeholder="Valor R$" value={acrescimoForm.valor} onChange={e => setAcrescimoForm({...acrescimoForm, valor: e.target.value})} className="input-field text-xs py-1.5" />
                          <div className="flex gap-2">
                            <button onClick={handleAddAcrescimo} className="text-xs bg-red-600 text-white px-3 py-1 rounded flex-1">Adicionar</button>
                            <button onClick={() => setAcrescimoChargeId(null)} className="text-xs bg-gray-200 px-3 py-1 rounded">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-gray-400">Nenhuma cobrança registrada. Use "Gerar Cobranças" para criar retroativamente.</p>}
      </div>

      {/* ========== RESCISÃO ========== */}
      {(driver.status === 'ativo' || driver.status === 'inadimplente') && (
        <div className="card border border-red-200">
          <h3 className="font-semibold text-gray-800 mb-1">Rescisão e Acerto Final</h3>
          <p className="text-sm text-gray-500 mb-3">Gera relatório de retenção do caução.</p>
          <button onClick={() => setSettlementModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 text-sm">
            <AlertCircle className="w-4 h-4" /> Iniciar Rescisão
          </button>
        </div>
      )}

      {/* =============== MODAIS =============== */}

      {/* Preview doc */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b"><span className="text-sm font-medium">Documento</span><button onClick={() => setPreviewUrl(null)}><X className="w-5 h-5" /></button></div>
            <div className="p-2">
              {previewUrl.toLowerCase().endsWith('.pdf') || previewUrl.toLowerCase().includes('.pdf') ? (
                <div className="p-8 text-center space-y-3">
                  <FileText className="w-12 h-12 text-red-500 mx-auto" />
                  <p className="text-gray-700 font-medium">Arquivo PDF</p>
                  <a href={previewUrl} download target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700">
                    <Download className="w-4 h-4" /> Baixar PDF
                  </a>
                </div>
              ) : (
                <img src={previewUrl} alt="Doc" className="w-full rounded" onError={e => { e.target.onerror=null; e.target.parentNode.innerHTML='<div class="p-8 text-center text-gray-400"><p>Não foi possível exibir. <a href="'+previewUrl+'" target="_blank" class="text-brand-600 underline">Abrir em nova aba</a></p></div>'; }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Aprovar */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setApproveModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Aprovar Motorista</h3>
            {driver.interesse_marca && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 text-sm">
                ⭐ Interesse: <strong>{driver.interesse_marca} {driver.interesse_modelo}</strong>
              </div>
            )}
            <label className="block text-sm mb-1">Atribuir carro:</label>
            <select value={selectedCar} onChange={e => setSelectedCar(e.target.value)} className="input-field mb-4">
              <option value="">Nenhum (atribuir depois)</option>
              {availableCars.map(c => <option key={c.id} value={c.id}>{c.marca} {c.modelo} ({c.placa}) — R$ {fmt(c.valor_semanal)}/sem</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setApproveModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleApprove} disabled={processing} className="btn-primary flex-1">Aprovar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reprovar */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Reprovar Motorista</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="input-field mb-4" rows={3} placeholder="Motivo da reprovação" />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleReject} disabled={processing} className="btn-danger flex-1">Reprovar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Cobrança Avulsa */}
      {chargeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setChargeModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Nova Cobrança Avulsa</h3>
            <div className="space-y-3">
              <div><label className="block text-sm mb-1">Semana de referência *</label><input type="date" value={chargeForm.semana_ref} onChange={e => setChargeForm({...chargeForm, semana_ref: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm mb-1">Valor base (R$) *</label><input type="number" step="0.01" value={chargeForm.valor_base} onChange={e => setChargeForm({...chargeForm, valor_base: e.target.value})} className="input-field" /></div>
              <div><label className="block text-sm mb-1">Observações</label><textarea value={chargeForm.observacoes} onChange={e => setChargeForm({...chargeForm, observacoes: e.target.value})} className="input-field" rows={2} /></div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setChargeModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreateCharge} disabled={processing} className="btn-primary flex-1">Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Modal Gerar Cobranças Retroativas ========== */}
      {genChargesModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setGenChargesModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-600" /> Gerar Cobranças Retroativas</h3>
            <p className="text-sm text-gray-500 mb-4">Gera todas as cobranças desde a data de início até hoje, com a primeira semana proporcional.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Data de início do contrato *</label>
                <input type="date" value={genForm.data_inicio} onChange={e => setGenForm({...genForm, data_inicio: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dia de vencimento semanal *</label>
                <select value={genForm.dia_cobranca} onChange={e => setGenForm({...genForm, dia_cobranca: e.target.value})} className="input-field">
                  {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor semanal (R$) *</label>
                <input type="number" step="0.01" value={genForm.valor_semanal} onChange={e => setGenForm({...genForm, valor_semanal: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Juros diário (%)</label>
                <input type="number" step="0.01" value={genForm.juros_diario} onChange={e => setGenForm({...genForm, juros_diario: e.target.value})} className="input-field" placeholder="0.5" />
                <p className="text-xs text-gray-400 mt-1">Padrão: 0,5% ao dia sobre saldo devedor</p>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 mt-3">
              A primeira semana será <strong>proporcional</strong> (dias entre início e o primeiro vencimento). Cobranças já existentes não serão duplicadas.
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setGenChargesModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleGenerateCharges} disabled={processing} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Calendar className="w-4 h-4" />}
                Gerar Cobranças
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Modal Registrar Pagamento ========== */}
      {paymentEntryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPaymentEntryModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" /> Registrar Pagamento</h3>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between"><span>Semana:</span><strong>{fmtDate(paymentEntryModal.semana_ref)}</strong></div>
              <div className="flex justify-between"><span>Valor cobrado:</span><strong>R$ {fmt(paymentEntryModal.valor_final)}</strong></div>
              <div className="flex justify-between"><span>Já pago:</span><strong className="text-green-600">R$ {fmt(paymentEntryModal.valor_pago_total || paymentEntryModal.total_pago || 0)}</strong></div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-medium">Saldo devedor:</span>
                <strong className="text-red-600">R$ {fmt(paymentEntryModal.saldo_devedor || (parseFloat(paymentEntryModal.valor_final) - parseFloat(paymentEntryModal.valor_pago_total || paymentEntryModal.total_pago || 0)))}</strong>
              </div>
            </div>

            {/* Pagamentos já registrados */}
            {loadingEntries ? (
              <div className="text-center py-2"><div className="w-5 h-5 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin mx-auto" /></div>
            ) : paymentEntries.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 mb-1 uppercase">Pagamentos desta semana</p>
                <div className="space-y-1">
                  {paymentEntries.map(pe => (
                    <div key={pe.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-green-800">R$ {fmt(pe.valor_pago)}</p>
                        <p className="text-xs text-green-600">{fmtDate(pe.data_pagamento)}{pe.observacoes ? ` · ${pe.observacoes}` : ''}</p>
                      </div>
                      <button onClick={() => handleDeletePaymentEntry(pe.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Novo pagamento */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Adicionar pagamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor pago (R$) *</label>
                  <input type="number" step="0.01" value={paymentForm.valor_pago} onChange={e => setPaymentForm({...paymentForm, valor_pago: e.target.value})} className="input-field" placeholder="350.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data do pagamento *</label>
                  <input type="date" value={paymentForm.data_pagamento} onChange={e => setPaymentForm({...paymentForm, data_pagamento: e.target.value})} className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Observações</label>
                <input type="text" value={paymentForm.observacoes} onChange={e => setPaymentForm({...paymentForm, observacoes: e.target.value})} className="input-field" placeholder="Ex: PIX parcial, dinheiro..." />
              </div>
              <div className="bg-amber-50 rounded-lg p-2 text-xs text-amber-700">
                💡 Pode registrar múltiplos pagamentos na mesma semana (parcelas). Se o total pago for menor que o cobrado, o saldo devedor acumulará juros na próxima semana.
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setPaymentEntryModal(null)} className="btn-secondary flex-1">Fechar</button>
              <button onClick={handleAddPaymentEntry} disabled={processing || !paymentForm.valor_pago}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white flex-1 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Registrar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Modal Trocar Carro ========== */}
      {swapModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSwapModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-amber-600" /> Trocar Carro do Motorista</h3>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <p><strong>Motorista:</strong> {driver.nome}</p>
              <p><strong>Carro atual:</strong> {driver.car_marca} {driver.car_modelo} ({driver.car_placa})</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Novo carro *</label>
                <select value={swapCarId} onChange={e => setSwapCarId(e.target.value)} className="input-field">
                  <option value="">Selecione...</option>
                  {swapAvailableCars.map(c => (
                    <option key={c.id} value={c.id}>{c.marca} {c.modelo} ({c.placa}) — R$ {fmt(c.valor_semanal)}/sem</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Motivo da troca</label>
                <textarea value={swapMotivo} onChange={e => setSwapMotivo(e.target.value)} className="input-field" rows={2} placeholder="Ex: Manutenção, upgrade, pedido do motorista..." />
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2 text-xs text-amber-700 mt-3">
              ⚠️ A troca libera o carro antigo e atribui o novo. Será necessário gerar um <strong>novo contrato</strong> para o motorista assinar.
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setSwapModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSwapCar} disabled={processing || !swapCarId}
                className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white flex-1 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                Confirmar Troca
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rescisão */}
      {settlementModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSettlementModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4 text-red-700">Rescisão e Acerto Final</h3>
            <div className="space-y-3">
              {[{ k: 'debitos_pendentes', l: 'Débitos pendentes' }, { k: 'multas_acumuladas', l: 'Multas acumuladas' }, { k: 'danos', l: 'Danos' }, { k: 'outros_descontos', l: 'Outros descontos' }].map(f => (
                <div key={f.k}><label className="block text-sm mb-1">{f.l} (R$)</label><input type="number" step="0.01" value={settlementForm[f.k]} onChange={e => setSettlementForm({...settlementForm, [f.k]: e.target.value})} className="input-field" /></div>
              ))}
              <div><label className="block text-sm mb-1">Observações</label><textarea value={settlementForm.observacoes} onChange={e => setSettlementForm({...settlementForm, observacoes: e.target.value})} className="input-field" rows={2} /></div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setSettlementModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSettlement} disabled={processing} className="btn-danger flex-1">Processar Rescisão</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerar Contrato */}
      {contractModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setContractModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-purple-600" /> Gerar Contrato de Locação</h3>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <p><strong>Motorista:</strong> {driver.nome} — CPF: {driver.cpf}</p>
              <p><strong>Veículo:</strong> {driver.car_marca} {driver.car_modelo} — {driver.car_placa}</p>
              <p><strong>Valor semanal:</strong> R$ {fmt(driver.car_valor_semanal)} | <strong>Caução:</strong> R$ {fmt(driver.car_valor_caucao || 0)}</p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">RG do locatário</label><input type="text" value={contractForm.locatario_rg} onChange={e => setContractForm({...contractForm, locatario_rg: e.target.value})} className="input-field" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Data do contrato</label><input type="text" value={contractForm.data_contrato} onChange={e => setContractForm({...contractForm, data_contrato: e.target.value})} className="input-field" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Endereço completo do locatário</label><input type="text" value={contractForm.locatario_endereco} onChange={e => setContractForm({...contractForm, locatario_endereco: e.target.value})} className="input-field" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">Valor semanal por extenso</label><input type="text" value={contractForm.valor_semanal_extenso} onChange={e => setContractForm({...contractForm, valor_semanal_extenso: e.target.value})} className="input-field" placeholder="seiscentos e vinte e cinco reais" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Caução por extenso</label><input type="text" value={contractForm.valor_caucao_extenso} onChange={e => setContractForm({...contractForm, valor_caucao_extenso: e.target.value})} className="input-field" /></div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-700">Os dados do <strong>LOCADOR</strong> vêm das Configurações (Admin → Config).</div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setContractModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleGenerateContract} disabled={generatingContract}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white flex-1 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                {generatingContract ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando...</> : <><Download className="w-4 h-4" /> Baixar DOCX</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Delete */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-7 h-7 text-red-600" /></div>
              <h3 className="font-semibold text-lg text-gray-800 mb-2">Excluir motorista?</h3>
              <p className="text-sm text-gray-500 mb-1"><strong>{driver.nome}</strong></p>
              <p className="text-xs text-red-500 mb-4">Todos os dados serão removidos permanentemente.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleDeleteDriver} disabled={processing} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />} Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
