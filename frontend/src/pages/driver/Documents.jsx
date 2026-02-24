import { useState, useEffect, useRef } from 'react';
import { driversAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  FileText, Upload, CheckCircle2, Clock, Image,
  CreditCard, Home, Camera, AlertCircle, Eye, X, Smartphone, FileCheck
} from 'lucide-react';

const DOC_CADASTRO = [
  { tipo: 'cnh', label: 'CNH-e (Digital)', icon: CreditCard, desc: 'Carteira Nacional de Habilitação Digital — baixe pelo app Gov.br', field: 'cnh_url' },
  { tipo: 'comprovante', label: 'Comprovante de Endereço', icon: Home, desc: 'Conta de luz, água ou telefone (últimos 3 meses)', field: 'comprovante_url' },
  { tipo: 'selfie', label: 'Selfie com Documento', icon: Camera, desc: 'Foto segurando a CNH ao lado do rosto', field: 'selfie_url' },
  { tipo: 'perfil_app', label: 'Print Perfil Uber/99', icon: Smartphone, desc: 'Screenshot do perfil de motorista mostrando nota e avaliações', field: 'perfil_app_url' },
];

export default function DriverDocuments() {
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState({});
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const fileInputs = useRef({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [profileRes, docsRes] = await Promise.all([
        driversAPI.me(),
        driversAPI.myDocuments(),
      ]);
      setProfile(profileRes.data);
      setDocuments(docsRes.data);
    } catch (err) {
      console.error('Erro:', err);
      toast.error('Erro ao carregar dados');
    } finally { setLoading(false); }
  };

  const uploadFile = async (tipo, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('Arquivo muito grande (máximo 10MB)');
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) return toast.error('Formato não suportado. Use JPG, PNG ou PDF.');

    setUploading(prev => ({ ...prev, [tipo]: true }));
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      await driversAPI.uploadDocument(tipo, formData);
      toast.success('Documento enviado com sucesso!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro no upload');
    } finally {
      setUploading(prev => ({ ...prev, [tipo]: false }));
    }
  };

  const handleFileInput = (tipo) => {
    const input = fileInputs.current[tipo];
    if (!input?.files?.[0]) return;
    uploadFile(tipo, input.files[0]);
    input.value = '';
  };

  const handleDragOver = (e, tipo) => { e.preventDefault(); e.stopPropagation(); setDragOver(tipo); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(null); };
  const handleDrop = (e, tipo) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(tipo, file);
  };

  const handleContratoUpload = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      return toast.error('O contrato deve ser PDF ou imagem');
    }
    setUploading(prev => ({ ...prev, contrato: true }));
    try {
      const formData = new FormData();
      formData.append('contrato', file);
      await driversAPI.uploadContrato(formData);
      toast.success('Contrato enviado com sucesso!');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro no upload do contrato');
    } finally {
      setUploading(prev => ({ ...prev, contrato: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Contrato aparece só após aprovação
  const showContrato = profile?.status === 'aprovado' || profile?.status === 'ativo' || profile?.status === 'inadimplente';

  // Quantos docs de cadastro já foram enviados
  const docsCadastroEnviados = DOC_CADASTRO.filter(d => !!profile?.[d.field]).length;
  const todosDocsEnviados = docsCadastroEnviados === DOC_CADASTRO.length;

  const renderDocCard = (doc, colorScheme = 'brand') => {
    const Icon = doc.icon;
    const isUploaded = !!profile?.[doc.field];
    const isUploading = uploading[doc.tipo];
    const isDragHere = dragOver === doc.tipo;
    const ringColor = colorScheme === 'purple' ? 'ring-purple-500 bg-purple-50' : 'ring-brand-500 bg-brand-50';
    const dropBorder = colorScheme === 'purple' ? 'border-purple-400' : 'border-brand-400';
    const dropBg = colorScheme === 'purple' ? 'bg-purple-50/50' : 'bg-brand-50/50';
    const dropText = colorScheme === 'purple' ? 'text-purple-600' : 'text-brand-600';
    const dropIcon = colorScheme === 'purple' ? 'text-purple-500' : 'text-brand-500';

    return (
      <div
        key={doc.tipo}
        className={`card transition-all duration-200 ${isDragHere ? `ring-2 ${ringColor} scale-[1.01]` : ''}`}
        onDragOver={(e) => handleDragOver(e, doc.tipo)}
        onDragEnter={(e) => handleDragOver(e, doc.tipo)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, doc.tipo)}
      >
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isUploaded ? 'bg-green-100' : colorScheme === 'purple' ? 'bg-purple-100' : 'bg-gray-100'
          }`}>
            {isUploaded ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Icon className={`w-5 h-5 ${colorScheme === 'purple' ? 'text-purple-600' : 'text-gray-400'}`} />}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-800">{doc.label}</p>
              {isUploaded && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Enviado</span>}
              {!isUploaded && doc.required !== false && <span className="text-xs text-red-400">*obrigatório</span>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{doc.desc}</p>
            {isUploaded && profile[doc.field] && (
              <button onClick={() => setPreviewUrl(profile[doc.field])}
                className="text-xs text-brand-600 hover:text-brand-700 mt-1 flex items-center gap-1">
                <Eye className="w-3 h-3" /> Visualizar
              </button>
            )}
          </div>

          <div>
            <input type="file" ref={el => fileInputs.current[doc.tipo] = el}
              accept="image/*,application/pdf" className="hidden"
              onChange={() => handleFileInput(doc.tipo)} />
            <button onClick={() => fileInputs.current[doc.tipo]?.click()}
              disabled={isUploading}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isUploaded ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : colorScheme === 'purple' ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}>
              {isUploading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Upload className="w-4 h-4" />}
              {isUploaded ? 'Reenviar' : 'Enviar'}
            </button>
          </div>
        </div>

        {isDragHere && (
          <div className={`mt-3 border-2 border-dashed ${dropBorder} rounded-lg p-4 text-center ${dropBg} pointer-events-none`}>
            <Upload className={`w-6 h-6 ${dropIcon} mx-auto mb-1`} />
            <p className={`text-sm font-medium ${dropText}`}>Solte o arquivo aqui</p>
          </div>
        )}

        {!isDragHere && !isUploaded && !isUploading && (
          <div className="mt-3 border border-dashed border-gray-200 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400">Arraste um arquivo aqui ou clique em Enviar</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Documentos</h1>
        <p className="text-gray-500 text-sm mt-1">Envie seus documentos para análise e aprovação</p>
      </div>

      {/* Progresso */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Progresso do cadastro</p>
          <span className="text-sm font-bold text-brand-600">{docsCadastroEnviados}/{DOC_CADASTRO.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-brand-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(docsCadastroEnviados / DOC_CADASTRO.length) * 100}%` }} />
        </div>
        {todosDocsEnviados && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Todos os documentos de cadastro enviados!
          </p>
        )}
      </div>

      {/* Status */}
      {profile?.status === 'em_analise' && (
        <div className="card border-l-4 border-yellow-400 bg-yellow-50 flex items-center gap-3">
          <Clock className="w-5 h-5 text-yellow-600" />
          <p className="text-sm text-gray-700">Seus documentos estão em análise. Aguarde a aprovação do administrador.</p>
        </div>
      )}

      {profile?.status === 'reprovado' && (
        <div className="card border-l-4 border-red-400 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">Cadastro reprovado</p>
              {profile.motivo_reprovacao && <p className="text-sm text-red-600 mt-1">Motivo: {profile.motivo_reprovacao}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ========== DOCUMENTOS DE CADASTRO ========== */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Documentos de Cadastro</h2>
        {DOC_CADASTRO.map(doc => renderDocCard(doc, 'brand'))}
      </div>

      {/* ========== CONTRATO DE LOCAÇÃO (pós-aprovação) ========== */}
      {showContrato && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-purple-600" /> Contrato de Locação
          </h2>

          {!profile?.contrato_url && (
            <div className="card border-l-4 border-purple-400 bg-purple-50">
              <p className="text-sm text-purple-800">
                Seu cadastro foi aprovado! Agora faça o upload do <strong>contrato de locação assinado</strong> para finalizar a ativação.
              </p>
            </div>
          )}

          <div
            className={`card transition-all duration-200 ${
              dragOver === 'contrato' ? 'ring-2 ring-purple-500 bg-purple-50 scale-[1.01]' : ''
            }`}
            onDragOver={(e) => handleDragOver(e, 'contrato')}
            onDragEnter={(e) => handleDragOver(e, 'contrato')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(null); const f = e.dataTransfer?.files?.[0]; if (f) handleContratoUpload(f); }}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                profile?.contrato_url ? 'bg-green-100' : 'bg-purple-100'
              }`}>
                {profile?.contrato_url ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-purple-600" />}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-800">Contrato de Locação Assinado</p>
                  {profile?.contrato_url && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      profile.contrato_confirmado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{profile.contrato_confirmado ? 'Confirmado pelo admin' : 'Aguardando confirmação'}</span>
                  )}
                  {!profile?.contrato_url && <span className="text-xs text-red-400">*obrigatório</span>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">Upload do contrato assinado (PDF ou imagem)</p>
                {profile?.contrato_url && (
                  <button onClick={() => setPreviewUrl(profile.contrato_url)}
                    className="text-xs text-brand-600 hover:text-brand-700 mt-1 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Visualizar
                  </button>
                )}
              </div>

              <div>
                <input type="file" accept="image/*,application/pdf" className="hidden" id="contrato-input"
                  onChange={(e) => { if (e.target.files?.[0]) handleContratoUpload(e.target.files[0]); }} />
                <label htmlFor="contrato-input"
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    profile?.contrato_url ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}>
                  {uploading.contrato
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Upload className="w-4 h-4" />}
                  {profile?.contrato_url ? 'Reenviar' : 'Enviar'}
                </label>
              </div>
            </div>

            {dragOver === 'contrato' && (
              <div className="mt-3 border-2 border-dashed border-purple-400 rounded-lg p-4 text-center bg-purple-50/50 pointer-events-none">
                <Upload className="w-6 h-6 text-purple-500 mx-auto mb-1" />
                <p className="text-sm font-medium text-purple-600">Solte o contrato aqui</p>
              </div>
            )}

            {dragOver !== 'contrato' && !profile?.contrato_url && !uploading.contrato && (
              <div className="mt-3 border border-dashed border-gray-200 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400">Arraste o contrato aqui ou clique em Enviar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico */}
      {documents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Histórico de Envios</h2>
          <div className="card divide-y divide-gray-100">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Image className="w-4 h-4 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{doc.nome_arquivo}</p>
                  <p className="text-xs text-gray-400">
                    {doc.tipo.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    {doc.tamanho && ` · ${(doc.tamanho / 1024).toFixed(0)}KB`}
                  </p>
                </div>
                <button onClick={() => setPreviewUrl(doc.caminho)} className="text-xs text-brand-600 hover:text-brand-700">
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal preview */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Visualizar Documento</h3>
              <button onClick={() => setPreviewUrl(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              {previewUrl.endsWith('.pdf')
                ? <iframe src={previewUrl} className="w-full h-[70vh] rounded" title="PDF" />
                : <img src={previewUrl} alt="Documento" className="w-full rounded" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
