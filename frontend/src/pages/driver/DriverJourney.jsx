import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { driversAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  User, FileText, Upload, CheckCircle2, Clock, Camera, Eye, X,
  CreditCard, Home, Smartphone, Lock, Download, AlertCircle,
  ChevronDown, ChevronUp, Banknote, Car, FileCheck, Shield, XCircle
} from 'lucide-react';

const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

export default function DriverJourney() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [expandedStep, setExpandedStep] = useState(null);
  const [vistoriaDesc, setVistoriaDesc] = useState('');
  const fileInputs = useRef({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [profileRes, docsRes, balanceRes] = await Promise.all([
        driversAPI.me(),
        driversAPI.myDocuments(),
        driversAPI.myBalance().catch(() => ({ data: null })),
      ]);
      setProfile(profileRes.data);
      setDocuments(docsRes.data);
      setBalance(balanceRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Upload helpers
  const uploadFile = async (tipo, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('Máximo 10MB');
    setUploading(prev => ({ ...prev, [tipo]: true }));
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      await driversAPI.uploadDocument(tipo, formData);
      toast.success('Enviado!');
      await loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro no upload'); }
    finally { setUploading(prev => ({ ...prev, [tipo]: false })); }
  };

  const handleContratoUpload = async (file) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, contrato: true }));
    try {
      const formData = new FormData();
      formData.append('contrato', file);
      await driversAPI.uploadContrato(formData);
      toast.success('Contrato enviado!');
      await loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro no upload'); }
    finally { setUploading(prev => ({ ...prev, contrato: false })); }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;

  // ============================
  // STEP STATUS COMPUTATION
  // ============================
  const status = profile?.status || 'pendente';
  const hasCnh = !!profile?.cnh_url;
  const hasComprovante = !!profile?.comprovante_url;
  const hasPrint = !!profile?.perfil_app_url;
  const hasContrato = !!profile?.contrato_url;
  const hasSelfie = !!profile?.selfie_url;
  const caucaoPaga = profile?.caucao_pago === true;
  const vistoriaDocs = documents.filter(d => d.tipo === 'vistoria_retirada');
  const isAprovado = ['aprovado', 'ativo', 'inadimplente'].includes(status);
  const isAtivo = ['ativo', 'inadimplente'].includes(status);
  const contratoGerado = documents.some(d => d.tipo === 'contrato_gerado');

  const steps = [
    {
      id: 'dados',
      label: 'Dados Pessoais',
      icon: User,
      done: !!profile?.nome && !!profile?.cpf && !!profile?.telefone,
      available: true,
    },
    {
      id: 'documentos',
      label: 'Documentos de Cadastro',
      icon: FileText,
      done: hasCnh && hasComprovante && hasPrint,
      available: true,
    },
    {
      id: 'contrato',
      label: 'Contrato de Locação',
      icon: FileCheck,
      done: hasContrato && hasSelfie,
      available: isAprovado,
      waitMsg: status === 'em_analise' ? 'Aguardando aprovação do administrador...' : status === 'pendente' ? 'Envie os documentos acima primeiro' : status === 'reprovado' ? 'Cadastro reprovado' : null,
    },
    {
      id: 'pagamento',
      label: 'Pagamento da Caução',
      icon: Banknote,
      done: caucaoPaga,
      available: isAprovado,
      waitMsg: !isAprovado ? 'Disponível após aprovação' : null,
    },
    {
      id: 'vistoria',
      label: 'Vistoria do Veículo',
      icon: Camera,
      done: vistoriaDocs.length > 0 && vistoriaDocs.some(d => d.fixado),
      available: isAtivo || (isAprovado && hasContrato),
      waitMsg: !isAprovado ? 'Disponível após ativação' : null,
    },
  ];

  // Auto-expand first incomplete step
  const currentStep = expandedStep || steps.find(s => s.available && !s.done)?.id || steps[0].id;
  const toggleStep = (id) => setExpandedStep(prev => prev === id ? null : id);

  // Doc card renderer (compact)
  const DocUpload = ({ tipo, label, icon: Icon, desc, field, colorClass = 'brand' }) => {
    const isUploaded = !!profile?.[field];
    const isFixed = documents.some(d => d.tipo === tipo && d.fixado);
    const isUp = uploading[tipo];
    const colors = colorClass === 'purple' ? { bg: 'bg-purple-100', icon: 'text-purple-600', btn: 'bg-purple-600 hover:bg-purple-700' } : { bg: 'bg-brand-100', icon: 'text-brand-600', btn: 'bg-brand-600 hover:bg-brand-700' };

    return (
      <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isFixed ? 'bg-amber-100' : isUploaded ? 'bg-green-100' : colors.bg}`}>
          {isFixed ? <Lock className="w-4 h-4 text-amber-600" /> : isUploaded ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Icon className={`w-4 h-4 ${colors.icon}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-800">{label}</p>
            {isFixed && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🔒 Fixado</span>}
            {!isFixed && isUploaded && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Enviado</span>}
          </div>
          <p className="text-xs text-gray-400">{isFixed ? 'Verificado pelo admin' : desc}</p>
          {isUploaded && profile[field] && (
            <button onClick={() => setPreviewUrl(profile[field])} className="text-xs text-brand-600 mt-0.5 flex items-center gap-1"><Eye className="w-3 h-3" /> Ver</button>
          )}
        </div>
        {!isFixed && (
          <div>
            <input type="file" ref={el => fileInputs.current[tipo] = el} accept="image/*,application/pdf" className="hidden"
              onChange={() => { const f = fileInputs.current[tipo]?.files?.[0]; if (f) uploadFile(tipo, f); fileInputs.current[tipo].value = ''; }} />
            <button onClick={() => fileInputs.current[tipo]?.click()} disabled={isUp}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${isUploaded ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : colors.btn + ' text-white'}`}>
              {isUp ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
              {isUploaded ? 'Reenviar' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ============================
  // RENDER
  // ============================
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Olá, {user?.nome?.split(' ')[0]}!</h1>
          <p className="text-gray-500 text-sm">Siga as etapas abaixo para começar a dirigir</p>
        </div>
        {profile?.car_marca && (
          <div className="text-right">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Car className="w-4 h-4" />
              <span className="font-medium">{profile.car_marca} {profile.car_modelo}</span>
            </div>
            <p className="text-xs text-gray-400">{profile.car_placa}</p>
          </div>
        )}
      </div>

      {/* Status alert */}
      {status === 'reprovado' && (
        <div className="card border-l-4 border-red-500 bg-red-50 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-800">Cadastro Reprovado</p>
            {profile.motivo_reprovacao && <p className="text-sm text-red-600">{profile.motivo_reprovacao}</p>}
            <p className="text-xs text-red-500 mt-1">Corrija os documentos e reenvie.</p>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(() => {
        const doneCount = steps.filter(s => s.done).length;
        return (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Progresso</p>
              <span className="text-sm font-bold text-brand-600">{doneCount}/{steps.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-brand-600 h-2 rounded-full transition-all duration-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            {doneCount === steps.length && <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Tudo pronto! Bom trabalho!</p>}
          </div>
        );
      })()}

      {/* ============================
          TIMELINE STEPS
         ============================ */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isOpen = currentStep === step.id;
          const isDone = step.done;
          const isAvail = step.available;
          const isLocked = !isAvail;

          return (
            <div key={step.id} className={`card transition-all duration-200 ${isLocked ? 'opacity-50' : ''} ${isOpen ? 'ring-1 ring-brand-200' : ''}`}>
              {/* Step header */}
              <button onClick={() => !isLocked && toggleStep(step.id)}
                className="w-full flex items-center gap-3" disabled={isLocked}>
                {/* Step circle */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isDone ? 'bg-green-100' : isOpen ? 'bg-brand-100' : isLocked ? 'bg-gray-100' : 'bg-gray-100'
                }`}>
                  {isDone ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
                   isLocked ? <Lock className="w-5 h-5 text-gray-300" /> :
                   <StepIcon className={`w-5 h-5 ${isOpen ? 'text-brand-600' : 'text-gray-400'}`} />}
                </div>

                {/* Label */}
                <div className="flex-1 text-left">
                  <p className={`text-sm font-semibold ${isDone ? 'text-green-700' : isOpen ? 'text-brand-700' : 'text-gray-700'}`}>
                    Etapa {idx + 1}: {step.label}
                  </p>
                  {isDone && <p className="text-xs text-green-500">Concluída ✓</p>}
                  {isLocked && step.waitMsg && <p className="text-xs text-gray-400">{step.waitMsg}</p>}
                </div>

                {/* Chevron */}
                {!isLocked && (
                  isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Step content */}
              {isOpen && !isLocked && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {/* ---- STEP 1: DADOS PESSOAIS ---- */}
                  {step.id === 'dados' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gray-400 text-xs">Nome</span><p className="font-medium">{profile?.nome || '—'}</p></div>
                        <div><span className="text-gray-400 text-xs">CPF</span><p className="font-medium">{profile?.cpf || '—'}</p></div>
                        <div><span className="text-gray-400 text-xs">Telefone</span><p className="font-medium">{profile?.telefone || '—'}</p></div>
                        <div><span className="text-gray-400 text-xs">RG</span><p className="font-medium">{profile?.rg || '—'}</p></div>
                        <div className="col-span-2"><span className="text-gray-400 text-xs">Endereço</span><p className="font-medium">{profile?.endereco_completo || '—'}</p></div>
                      </div>
                      {isDone && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Dados preenchidos</p>}
                    </div>
                  )}

                  {/* ---- STEP 2: DOCUMENTOS ---- */}
                  {step.id === 'documentos' && (
                    <div>
                      <DocUpload tipo="cnh" label="CNH-e (Digital)" icon={CreditCard} desc="Baixe pelo app Gov.br" field="cnh_url" />
                      <DocUpload tipo="comprovante" label="Comprovante de Endereço" icon={Home} desc="Conta de luz, água (últimos 3 meses)" field="comprovante_url" />
                      <DocUpload tipo="perfil_app" label="Print Perfil Uber/99" icon={Smartphone} desc="Screenshot mostrando nota e avaliações" field="perfil_app_url" />
                      {!isDone && (
                        <p className="text-xs text-gray-400 mt-3 text-center">
                          {status === 'em_analise' ? '⏳ Documentos em análise pelo administrador' : 'Envie todos os documentos para avançar'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ---- STEP 3: CONTRATO ---- */}
                  {step.id === 'contrato' && (
                    <div className="space-y-4">
                      {/* Instruções */}
                      {!hasContrato && (
                        <div className="bg-purple-50 rounded-lg p-3 text-sm text-purple-700 space-y-1">
                          <p className="font-medium">Passos para assinar o contrato:</p>
                          <ol className="list-decimal list-inside space-y-0.5 text-xs">
                            <li>O administrador gerará o contrato (você receberá por email/WhatsApp)</li>
                            <li>Acesse <strong>assinador.iti.br</strong> ou app <strong>Gov.br</strong></li>
                            <li>Assine digitalmente o PDF</li>
                            <li>Faça upload do contrato assinado abaixo</li>
                          </ol>
                        </div>
                      )}

                      {/* Download do contrato gerado */}
                      {contratoGerado && (
                        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                          <Download className="w-5 h-5 text-blue-600" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-800">Contrato disponível para download</p>
                            <p className="text-xs text-blue-600">Verifique seu email ou baixe aqui</p>
                          </div>
                          {(() => {
                            const contratoDoc = documents.find(d => d.tipo === 'contrato_gerado');
                            return contratoDoc ? (
                              <a href={contratoDoc.caminho} download className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1">
                                <Download className="w-3 h-3" /> Baixar PDF
                              </a>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* Upload contrato assinado */}
                      {(() => {
                        const isContratoFixed = documents.some(d => d.tipo === 'contrato' && d.fixado);
                        return (
                          <div className="flex items-center gap-3 py-3 border-b border-gray-100">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isContratoFixed ? 'bg-amber-100' : hasContrato ? 'bg-green-100' : 'bg-purple-100'}`}>
                              {isContratoFixed ? <Lock className="w-4 h-4 text-amber-600" /> : hasContrato ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <FileText className="w-4 h-4 text-purple-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">Contrato Assinado</p>
                                {isContratoFixed && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🔒 Fixado</span>}
                                {!isContratoFixed && hasContrato && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${profile.contrato_confirmado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {profile.contrato_confirmado ? '✓ Confirmado' : '⏳ Aguardando'}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">{isContratoFixed ? 'Verificado pelo admin' : 'PDF ou imagem do contrato assinado'}</p>
                              {hasContrato && <button onClick={() => setPreviewUrl(profile.contrato_url)} className="text-xs text-brand-600 mt-0.5 flex items-center gap-1"><Eye className="w-3 h-3" /> Ver</button>}
                            </div>
                            {!isContratoFixed && (
                              <div>
                                <input type="file" accept="image/*,application/pdf" className="hidden" id="contrato-input"
                                  onChange={e => { if (e.target.files?.[0]) handleContratoUpload(e.target.files[0]); e.target.value = ''; }} />
                                <label htmlFor="contrato-input" className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${hasContrato ? 'bg-gray-100 text-gray-600' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                                  {uploading.contrato ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
                                  {hasContrato ? 'Reenviar' : 'Enviar'}
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Selfie */}
                      <DocUpload tipo="selfie" label="Selfie com Documento" icon={Camera} desc="Foto segurando a CNH ao lado do rosto" field="selfie_url" colorClass="purple" />
                    </div>
                  )}

                  {/* ---- STEP 4: PAGAMENTO ---- */}
                  {step.id === 'pagamento' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm text-gray-500">Valor da Caução</p>
                          <p className="text-xl font-bold text-gray-800">R$ {fmt(profile?.car_valor_caucao || balance?.valor_caucao)}</p>
                        </div>
                        {caucaoPaga ? (
                          <span className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Paga
                          </span>
                        ) : (
                          <button onClick={() => navigate('/motorista/pagamentos')}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2">
                            <Banknote className="w-4 h-4" /> Pagar Caução
                          </button>
                        )}
                      </div>
                      {!caucaoPaga && (
                        <p className="text-xs text-gray-400 text-center">Você será redirecionado para a página de pagamentos</p>
                      )}
                    </div>
                  )}

                  {/* ---- STEP 5: VISTORIA ---- */}
                  {step.id === 'vistoria' && (
                    <div className="space-y-3">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-800 font-bold">⏰ PRAZO: 24 HORAS</p>
                        <p className="text-xs text-red-700 mt-1">
                          Você tem <strong>24 horas após a retirada</strong> para enviar fotos dos detalhes pré-existentes.
                          Após o prazo, danos encontrados na devolução serão sua responsabilidade.
                        </p>
                      </div>

                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <p className="text-xs text-orange-800 font-medium">O que fotografar:</p>
                        <p className="text-xs text-orange-700 mt-1">
                          Arranhões, riscos, aros, estofamento, painel, vidros, amassados, manchas.
                          <strong> Descreva: o quê, onde (lado/porta), tamanho aproximado.</strong>
                        </p>
                      </div>

                      {/* Fotos existentes */}
                      {vistoriaDocs.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-2">{vistoriaDocs.length} foto(s) enviada(s)</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {vistoriaDocs.map(doc => (
                              <div key={doc.id} className="relative">
                                <img src={doc.caminho} alt={doc.descricao || 'Vistoria'} className="w-full h-20 object-cover rounded-lg border cursor-pointer"
                                  onClick={() => setPreviewUrl(doc.caminho)} />
                                {doc.fixado && <span className="absolute top-1 right-1 bg-amber-500 text-white rounded-full p-0.5"><Lock className="w-2.5 h-2.5" /></span>}
                                {doc.descricao && <p className="text-[9px] text-gray-500 mt-0.5 truncate">{doc.descricao}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Upload */}
                      {!vistoriaDocs.some(d => d.fixado) && (
                        <div className="space-y-2">
                          <textarea placeholder="Descreva o dano: o que é, local (porta traseira esquerda), tamanho. Ex: Arranhão de 15cm na porta traseira esquerda, próximo à maçaneta"
                            value={vistoriaDesc} onChange={e => setVistoriaDesc(e.target.value)}
                            className="input-field text-sm" rows={2} />
                          <div className="flex justify-end">
                            <input type="file" accept="image/*" className="hidden" id="vistoria-input" multiple
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                for (const file of files) {
                                  if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); continue; }
                                  setUploading(prev => ({ ...prev, vistoria: true }));
                                  try {
                                    const fd = new FormData(); fd.append('arquivo', file); fd.append('descricao', vistoriaDesc || file.name);
                                    await driversAPI.uploadDocument('vistoria_retirada', fd);
                                    toast.success('Foto enviada!');
                                  } catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
                                }
                                setUploading(prev => ({ ...prev, vistoria: false }));
                                setVistoriaDesc(''); e.target.value = '';
                                await loadData();
                              }} />
                            <label htmlFor="vistoria-input" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer bg-orange-600 text-white hover:bg-orange-700">
                              {uploading.vistoria ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
                              Enviar Fotos
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============================
          COBRANÇAS SEMANAIS (pós-ativo)
         ============================ */}
      {isAtivo && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand-600" />
              <div>
                <p className="font-semibold text-gray-800">Cobranças Semanais</p>
                <p className="text-xs text-gray-400">Gerencie seus pagamentos</p>
              </div>
            </div>
            <button onClick={() => navigate('/motorista/pagamentos')}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
              Ver Pagamentos →
            </button>
          </div>
          {balance && (
            <div className="grid grid-cols-3 gap-3 mt-3 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-400">Cobrado</p>
                <p className="text-sm font-bold text-gray-700">R$ {fmt(balance.total_cobrado)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-gray-400">Pago</p>
                <p className="text-sm font-bold text-green-700">R$ {fmt(balance.total_pago)}</p>
              </div>
              <div className={`rounded-lg p-2 ${parseFloat(balance.saldo_devedor) > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className="text-xs text-gray-400">Saldo</p>
                <p className={`text-sm font-bold ${parseFloat(balance.saldo_devedor) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  R$ {fmt(balance.saldo_devedor)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Visualizar</h3>
              <button onClick={() => setPreviewUrl(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              {previewUrl.toLowerCase().includes('.pdf')
                ? <div className="p-8 text-center space-y-3">
                    <FileText className="w-12 h-12 text-red-500 mx-auto" />
                    <a href={previewUrl} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700">
                      <Download className="w-4 h-4" /> Baixar PDF
                    </a>
                  </div>
                : <img src={previewUrl} alt="Documento" className="w-full rounded" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
