import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { driversAPI, carsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Car, FileText,
  Eye, X, Shield, UserCheck, AlertCircle, Plus, Banknote,
  Check, Download, Upload, Pencil, Save, Calendar, User, Trash2
} from 'lucide-react';

const STATUS_BADGE = {
  pendente: 'bg-gray-100 text-gray-700', em_analise: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800', reprovado: 'bg-red-100 text-red-800',
  ativo: 'bg-green-100 text-green-800', inadimplente: 'bg-red-100 text-red-800',
  rescindido: 'bg-gray-200 text-gray-600', recolhido: 'bg-gray-200 text-gray-600',
};

const DIAS_SEMANA = [
  { value: 'segunda', label: 'Segunda-feira' },
  { value: 'terca', label: 'Terça-feira' },
  { value: 'quarta', label: 'Quarta-feira' },
  { value: 'quinta', label: 'Quinta-feira' },
  { value: 'sexta', label: 'Sexta-feira' },
  { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
];

const DOC_TYPES = [
  { tipo: 'cnh', label: 'CNH-e (Digital)' },
  { tipo: 'comprovante', label: 'Comprovante End.' },
  { tipo: 'selfie', label: 'Selfie c/ Doc' },
  { tipo: 'perfil_app', label: 'Print Uber/99' },
  { tipo: 'contrato', label: 'Contrato Locação' },
  { tipo: 'nota_fiscal', label: 'Nota Fiscal' },
  { tipo: 'outro', label: 'Outro Doc' },
];

const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

export default function AdminDriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [allCars, setAllCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);

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

  // Contract generation
  const [contractModal, setContractModal] = useState(false);
  const [contractForm, setContractForm] = useState({});
  const [generatingContract, setGeneratingContract] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const [driverRes, carsRes] = await Promise.all([driversAPI.get(id), carsAPI.listAll()]);
      setDriver(driverRes.data);
      setAllCars(carsRes.data);
      initEditForm(driverRes.data);
      if (driverRes.data.charges) {
        const pending = driverRes.data.charges.filter(c => !c.pago);
        setSettlementForm(prev => ({
          ...prev,
          debitos_pendentes: pending.reduce((s, c) => s + parseFloat(c.valor_final || 0), 0).toFixed(2),
          multas_acumuladas: pending.reduce((s, c) => s + parseFloat(c.multa || 0), 0).toFixed(2),
        }));
      }
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
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  // ========== ACTIONS ==========
  const handleApprove = async () => { setProcessing(true); try { await driversAPI.approve(id, { car_id: selectedCar || null }); toast.success('Aprovado!'); setApproveModal(false); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } finally { setProcessing(false); } };
  const handleReject = async () => { setProcessing(true); try { await driversAPI.reject(id, { motivo: rejectReason }); toast.success('Reprovado'); setRejectModal(false); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } finally { setProcessing(false); } };
  const handleConfirmContract = async () => { try { await driversAPI.confirmContract(id); toast.success('Contrato confirmado!'); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };
  const handleActivate = async () => { try { await driversAPI.activate(id); toast.success('Ativado!'); await loadData(); } catch (e) { toast.error(e.response?.data?.error || 'Erro'); } };
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
    setContractForm({
      locatario_rg: driver.rg || '',
      locatario_endereco: driver.endereco_completo || '',
      valor_semanal_extenso: '',
      valor_caucao_extenso: '',
      data_contrato: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    setContractModal(true);
  };

  const handleGenerateContract = async () => {
    setGeneratingContract(true);
    try {
      const res = await driversAPI.generateContract(id, contractForm);
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato_${driver.nome?.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Contrato gerado e baixado!');
      setContractModal(false);
    } catch (err) {
      toast.error('Erro ao gerar contrato');
    } finally {
      setGeneratingContract(false);
    }
  };

  // Carros disponíveis = disponíveis + o carro atual do motorista
  const availableCars = allCars.filter(c => c.disponivel || (driver && c.id === driver.car_id));

  const handleDeleteDriver = async () => {
    setProcessing(true);
    try {
      await driversAPI.deleteDriver(id);
      toast.success('Motorista excluído!');
      navigate('/admin/motoristas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    } finally {
      setProcessing(false);
      setDeleteConfirm(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;
  if (!driver) return null;

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
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setEditing(!editing); if (editing) initEditForm(driver); }} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${editing ? 'bg-gray-200 text-gray-700' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
            {editing ? <><X className="w-4 h-4" /> Cancelar</> : <><Pencil className="w-4 h-4" /> Editar</>}
          </button>
          <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========== EDIT FORM ========== */}
      {editing && (
        <div className="card border-2 border-brand-200 space-y-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><User className="w-4 h-4 text-brand-600" /> Editar Dados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome *</label>
              <input type="text" value={editForm.nome} onChange={e => setEditForm({...editForm, nome: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">CPF *</label>
              <input type="text" value={editForm.cpf} onChange={e => setEditForm({...editForm, cpf: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">RG</label>
              <input type="text" value={editForm.rg} onChange={e => setEditForm({...editForm, rg: e.target.value})} className="input-field" placeholder="0000000 SSP/SC" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Telefone</label>
              <input type="text" value={editForm.telefone} onChange={e => setEditForm({...editForm, telefone: e.target.value})} className="input-field" placeholder="(00) 00000-0000" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="input-field" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Endereço completo</label>
              <input type="text" value={editForm.endereco_completo} onChange={e => setEditForm({...editForm, endereco_completo: e.target.value})} className="input-field" placeholder="Rua, nº, Bairro, Cidade, CEP" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Carro atribuído</label>
              <select value={editForm.car_id} onChange={e => setEditForm({...editForm, car_id: e.target.value})} className="input-field">
                <option value="">Nenhum</option>
                {availableCars.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.marca} {c.modelo} — {c.placa} (R$ {fmt(c.valor_semanal)}/sem)
                    {c.id === driver.car_id ? ' ← atual' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Dia da cobrança semanal</label>
              <select value={editForm.dia_cobranca} onChange={e => setEditForm({...editForm, dia_cobranca: e.target.value})} className="input-field">
                {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Observações</label>
            <textarea value={editForm.observacoes} onChange={e => setEditForm({...editForm, observacoes: e.target.value})} className="input-field" rows={2} placeholder="Notas internas..." />
          </div>

          <button onClick={handleSaveEdit} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Alterações
          </button>
        </div>
      )}

      {/* ========== INFO CARDS ========== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Veículo */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2"><Car className="w-4 h-4 text-brand-600" /><h3 className="font-semibold text-gray-700 text-sm">Veículo</h3></div>
          {driver.car_marca ? (
            <div>
              <p className="font-medium">{driver.car_marca} {driver.car_modelo}</p>
              <p className="text-xs text-gray-400">{driver.car_placa} · R$ {fmt(driver.car_valor_semanal)}/sem</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Nenhum — <button onClick={() => setEditing(true)} className="text-brand-600 underline">atribuir</button></p>
          )}
        </div>

        {/* Dia da cobrança */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-brand-600" /><h3 className="font-semibold text-gray-700 text-sm">Cobrança</h3></div>
          <p className="font-medium capitalize">{driver.dia_cobranca || 'segunda'}-feira</p>
          <p className="text-xs text-gray-400">Dia da semana para cobrança</p>
        </div>

        {/* Progresso */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2"><Shield className="w-4 h-4 text-brand-600" /><h3 className="font-semibold text-gray-700 text-sm">Progresso</h3></div>
          <div className="space-y-1 text-xs">
            {[
              { ok: driver.cnh_url, label: 'CNH-e' },
              { ok: driver.comprovante_url, label: 'Comprovante' },
              { ok: driver.selfie_url, label: 'Selfie' },
              { ok: driver.perfil_app_url, label: 'Print Uber/99' },
              { ok: driver.contrato_url, label: 'Contrato' },
              { ok: driver.caucao_pago, label: 'Caução' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {item.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
                <span className={item.ok ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== AÇÕES POR STATUS ========== */}
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
          <button onClick={handleActivate} className="btn-primary flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Ativar Motorista</button>
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
            return (
              <div key={doc.tipo} className={`rounded-lg border p-2.5 text-center ${hasFile ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-xs font-medium text-gray-700 mb-1.5">{doc.label}</p>
                <div className="flex items-center justify-center gap-1">
                  {hasFile && (
                    <button onClick={() => setPreviewUrl(driver[urlField[doc.tipo]])} className="text-[11px] bg-white border text-brand-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Eye className="w-3 h-3" /> Ver
                    </button>
                  )}
                  <button onClick={() => triggerDocUpload(doc.tipo)} disabled={uploading}
                    className={`text-[11px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${hasFile ? 'bg-white border text-gray-500' : 'bg-brand-600 text-white'}`}>
                    <Upload className="w-3 h-3" /> {hasFile ? 'Trocar' : 'Enviar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {uploading && <p className="text-sm text-brand-600 animate-pulse mb-2">Enviando...</p>}

        {driver.documents?.length > 0 && (
          <details className="text-sm">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Histórico ({driver.documents.length} arquivos)</summary>
            <div className="mt-2 divide-y divide-gray-100 max-h-40 overflow-auto">
              {driver.documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-gray-600">{doc.tipo.toUpperCase()} — {doc.nome_arquivo} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                  <button onClick={() => setPreviewUrl(doc.caminho)} className="text-brand-600"><Eye className="w-3.5 h-3.5" /></button>
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
              <p className="text-sm text-gray-500 mt-1">Gera o contrato DOCX automaticamente com os dados do motorista e veículo</p>
            </div>
            <button onClick={openContractModal} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Gerar Contrato
            </button>
          </div>
        </div>
      )}

      {/* ========== COBRANÇAS ========== */}
      {(driver.status === 'ativo' || driver.status === 'inadimplente' || driver.charges?.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Banknote className="w-4 h-4 text-brand-600" /> Cobranças Semanais</h3>
            <button onClick={() => { setChargeForm({ semana_ref: new Date().toISOString().split('T')[0], valor_base: driver.car_valor_semanal || '', observacoes: '' }); setChargeModal(true); }}
              className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Nova Cobrança
            </button>
          </div>

          {driver.charges?.length > 0 ? (
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
                        <p className="text-sm font-medium">Semana {new Date(charge.semana_ref).toLocaleDateString('pt-BR')}</p>
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

                    {/* Acréscimos */}
                    {acrescimos.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                        <p className="text-xs font-medium text-red-700">Acréscimos:</p>
                        {acrescimos.map(acr => (
                          <div key={acr.id} className="flex items-center justify-between bg-red-50 rounded px-2 py-1">
                            <span className="text-xs">{acr.descricao} — <strong>+R$ {fmt(acr.valor)}</strong></span>
                            {!charge.pago && <button onClick={() => handleRemoveAcrescimo(acr.id)} className="text-xs text-red-500 px-1">✕</button>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add acréscimo */}
                    {!charge.pago && (
                      <div className="mt-2">
                        {acrescimoChargeId === charge.id ? (
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
                        ) : (
                          <button onClick={() => { setAcrescimoChargeId(charge.id); setAcrescimoForm({ descricao: '', valor: '' }); }}
                            className="text-xs text-red-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Acréscimo</button>
                        )}
                      </div>
                    )}

                    {/* Abatimentos pendentes */}
                    {pendingAbats.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                        <p className="text-xs font-medium text-yellow-700">Abatimentos pendentes:</p>
                        {pendingAbats.map(abat => (
                          <div key={abat.id} className="flex items-center justify-between bg-yellow-50 rounded px-2 py-1">
                            <span className="text-xs">{abat.descricao || 'S/ desc'} — R$ {fmt(abat.valor)}</span>
                            <button onClick={() => handleApproveAbatimento(abat.id)} className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Aprovar</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400">Nenhuma cobrança registrada</p>}
        </div>
      )}

      {/* ========== RESCISÃO ========== */}
      {(driver.status === 'ativo' || driver.status === 'inadimplente') && (
        <div className="card border border-red-200">
          <h3 className="font-semibold text-gray-800 mb-1">Rescisão e Acerto Final</h3>
          <p className="text-sm text-gray-500 mb-3">Gera relatório PDF de retenção do caução.</p>
          <button onClick={() => setSettlementModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 text-sm">
            <AlertCircle className="w-4 h-4" /> Iniciar Rescisão
          </button>
        </div>
      )}

      {/* ========== MODAIS ========== */}

      {/* Preview doc */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b">
              <span className="text-sm font-medium">Documento</span>
              <button onClick={() => setPreviewUrl(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-2"><img src={previewUrl} alt="Doc" className="w-full rounded" onError={e => { e.target.style.display='none'; }} /></div>
          </div>
        </div>
      )}

      {/* Modal Aprovar */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setApproveModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Aprovar Motorista</h3>
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

      {/* Modal Nova Cobrança */}
      {chargeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setChargeModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-4">Nova Cobrança Semanal</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Semana de referência *</label>
                <input type="date" value={chargeForm.semana_ref} onChange={e => setChargeForm({...chargeForm, semana_ref: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm mb-1">Valor base (R$) *</label>
                <input type="number" step="0.01" value={chargeForm.valor_base} onChange={e => setChargeForm({...chargeForm, valor_base: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm mb-1">Observações</label>
                <textarea value={chargeForm.observacoes} onChange={e => setChargeForm({...chargeForm, observacoes: e.target.value})} className="input-field" rows={2} />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setChargeModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreateCharge} disabled={processing} className="btn-primary flex-1">Criar Cobrança</button>
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
                <div key={f.k}>
                  <label className="block text-sm mb-1">{f.l} (R$)</label>
                  <input type="number" step="0.01" value={settlementForm[f.k]} onChange={e => setSettlementForm({...settlementForm, [f.k]: e.target.value})} className="input-field" />
                </div>
              ))}
              <div>
                <label className="block text-sm mb-1">Observações</label>
                <textarea value={settlementForm.observacoes} onChange={e => setSettlementForm({...settlementForm, observacoes: e.target.value})} className="input-field" rows={2} />
              </div>
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
                <div>
                  <label className="block text-xs text-gray-500 mb-1">RG do locatário</label>
                  <input type="text" value={contractForm.locatario_rg} onChange={e => setContractForm({...contractForm, locatario_rg: e.target.value})} className="input-field" placeholder="0000000 SSP/SC" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data do contrato</label>
                  <input type="text" value={contractForm.data_contrato} onChange={e => setContractForm({...contractForm, data_contrato: e.target.value})} className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Endereço completo do locatário</label>
                <input type="text" value={contractForm.locatario_endereco} onChange={e => setContractForm({...contractForm, locatario_endereco: e.target.value})} className="input-field" placeholder="Rua, nº, Bairro, Cidade, CEP" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor semanal por extenso</label>
                  <input type="text" value={contractForm.valor_semanal_extenso} onChange={e => setContractForm({...contractForm, valor_semanal_extenso: e.target.value})} className="input-field" placeholder="seiscentos e vinte e cinco reais" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Caução por extenso</label>
                  <input type="text" value={contractForm.valor_caucao_extenso} onChange={e => setContractForm({...contractForm, valor_caucao_extenso: e.target.value})} className="input-field" placeholder="um mil e setecentos reais" />
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-700">
                Os dados do <strong>LOCADOR</strong> são puxados das Configurações (Admin → Config). Preencha lá seus dados (nome, RG, CPF, endereço).
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setContractModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleGenerateContract} disabled={generatingContract}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white flex-1 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                {generatingContract ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando...</>
                  : <><Download className="w-4 h-4" /> Baixar Contrato DOCX</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Confirmar Exclusão */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="font-semibold text-lg text-gray-800 mb-2">Excluir motorista?</h3>
              <p className="text-sm text-gray-500 mb-1">Tem certeza que deseja excluir <strong>{driver.nome}</strong>?</p>
              <p className="text-xs text-red-500 mb-4">Todos os dados, cobranças, pagamentos e documentos serão removidos permanentemente.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleDeleteDriver} disabled={processing} className="btn-danger flex-1 flex items-center justify-center gap-2">
                {processing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
