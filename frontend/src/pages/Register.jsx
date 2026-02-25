import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Car, KeyRound, Loader2, Search, CheckCircle2, XCircle,
  Upload, CreditCard, Home, Smartphone, ArrowRight, ArrowLeft, Clock, AlertTriangle
} from 'lucide-react';
import api, { authAPI, carsAPI } from '../services/api';

function validarCPF(cpf) {
  const nums = cpf.replace(/\D/g, '');
  if (nums.length !== 11) return null;
  if (/^(\d)\1{10}$/.test(nums)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(nums[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(nums[10]);
}

const DOCS = [
  { tipo: 'cnh', label: 'CNH-e (Digital)', icon: CreditCard, desc: 'Carteira Nacional de Habilitação Digital — baixe pelo app Gov.br', multi: false },
  { tipo: 'comprovante', label: 'Comprovante de Endereço', icon: Home, desc: 'Conta de luz, água ou telefone (últimos 3 meses)', multi: false },
  { tipo: 'perfil_app', label: 'Print Perfil Uber/99', icon: Smartphone, desc: 'Screenshots do perfil mostrando nota e avaliações', multi: true },
];

export default function Register() {
  const [searchParams] = useSearchParams();
  const carId = searchParams.get('car');
  const navigate = useNavigate();

  const [carInfo, setCarInfo] = useState(null);
  const [carLoading, setCarLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    nome: '', email: '', cpf: '', telefone: '',
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: ''
  });
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [token, setToken] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [uploads, setUploads] = useState({}); // { tipo: 'filename' } or { tipo: ['file1','file2'] } for multi
  const [uploading, setUploading] = useState({});
  const [dragOver, setDragOver] = useState(null);
  const fileInputs = useRef({});

  // Se não tem car param, redireciona
  useEffect(() => {
    if (!carId) {
      navigate('/');
      return;
    }
    carsAPI.get(carId)
      .then(res => setCarInfo(res.data))
      .catch(() => {
        toast.error('Carro não encontrado');
        navigate('/');
      })
      .finally(() => setCarLoading(false));
  }, [carId]);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const cpfStatus = validarCPF(form.cpf);

  const formatCPF = (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14);
  const formatPhone = (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2').substring(0, 15);
  const formatCEP = (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').substring(0, 9);

  const buscarCEP = async (cepRaw) => {
    const cep = cepRaw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const { data } = await api.get(`/auth/cep/${cep}`);
      if (data.erro) { toast.warning('CEP não encontrado'); return; }
      setForm(prev => ({
        ...prev, rua: data.logradouro || '', bairro: data.bairro || '',
        cidade: data.localidade || '', estado: data.uf || '',
        complemento: data.complemento || prev.complemento
      }));
    } catch { toast.error('Erro ao buscar CEP'); }
    finally { setCepLoading(false); }
  };

  const handleCEPChange = (e) => {
    const formatted = formatCEP(e.target.value);
    setForm({ ...form, cep: formatted });
    if (formatted.replace(/\D/g, '').length === 8) buscarCEP(formatted);
  };

  const montarEndereco = () => {
    const { rua, numero, complemento, bairro, cidade, estado, cep } = form;
    let end = rua;
    if (numero) end += `, ${numero}`;
    if (complemento) end += ` - ${complemento}`;
    if (bairro) end += `, ${bairro}`;
    if (cidade) end += ` - ${cidade}`;
    if (estado) end += `/${estado}`;
    if (cep) end += ` - CEP: ${cep}`;
    return end;
  };

  const handleStep1 = async (e) => {
    e.preventDefault();
    const { nome, email, cpf, telefone, cep, rua, numero, bairro, cidade, estado } = form;
    if (!nome || !cpf || !email || !telefone) return toast.warning('Preencha todos os campos obrigatórios');
    if (!validarCPF(cpf)) return toast.error('CPF inválido!');
    if (!cep || !rua || !numero || !bairro || !cidade || !estado) return toast.warning('Preencha o endereço completo');

    setLoading(true);
    try {
      const cpfClean = cpf.replace(/\D/g, '');
      const generatedToken = cpfClean.substring(0, 6);
      const endereco = montarEndereco();
      const res = await authAPI.register({
        nome, email, senha: generatedToken, cpf: cpfClean, telefone, endereco,
        car_interesse_id: parseInt(carId)
      });
      setAuthToken(res.data.token);
      setToken(generatedToken);
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar');
    } finally { setLoading(false); }
  };

  const uploadDoc = async (tipo, file, isMulti = false) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('Arquivo muito grande (máx 10MB)');
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) return toast.error('Use JPG, PNG ou PDF');

    setUploading(prev => ({ ...prev, [tipo]: true }));
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      await api.post(`/drivers/me/documents?tipo=${tipo}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${authToken}` }
      });
      if (isMulti) {
        setUploads(prev => ({ ...prev, [tipo]: [...(prev[tipo] || []), file.name] }));
      } else {
        setUploads(prev => ({ ...prev, [tipo]: file.name }));
      }
      toast.success('Documento enviado!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro no upload');
    } finally {
      setUploading(prev => ({ ...prev, [tipo]: false }));
    }
  };

  const handleDrop = (e, tipo, isMulti = false) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null);
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadDoc(tipo, file, isMulti);
  };

  const getDocDone = (doc) => {
    const val = uploads[doc.tipo];
    if (!val) return false;
    if (doc.multi) return Array.isArray(val) && val.length > 0;
    return !!val;
  };

  const allDocsUploaded = DOCS.every(d => getDocDone(d));
  const handleFinish = () => setStep(3);

  if (carLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-blue-100">
      <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );

  const stepLabels = ['Dados Pessoais', 'Documentos', 'Concluído'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-blue-100 p-4">
      <div className="w-full max-w-lg mx-auto pt-4">
        {/* Car info banner */}
        {carInfo && step < 3 && (
          <div className="bg-white rounded-xl p-3 mb-4 flex items-center gap-3 shadow-sm border border-gray-200">
            <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              {carInfo.foto_url ? (
                <img src={carInfo.foto_url} alt="" className="w-full h-full object-cover" />
              ) : <Car className="w-6 h-6 text-gray-300 m-auto mt-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 text-sm truncate">{carInfo.marca} {carInfo.modelo}</p>
              <p className="text-xs text-gray-500">{carInfo.ano} · {carInfo.cor}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Semanal</p>
              <p className="font-bold text-brand-700 text-sm">R$ {parseFloat(carInfo.valor_semanal).toFixed(2).replace('.', ',')}</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-2xl mb-2 shadow-lg shadow-brand-200">
            <Car className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-800">Adesão — Locação de Veículo</h1>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center mb-4 gap-1">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                step > i + 1 ? 'bg-green-100 text-green-700' :
                step === i + 1 ? 'bg-brand-600 text-white shadow-md' :
                'bg-gray-200 text-gray-400'
              }`}>
                {step > i + 1 ? <CheckCircle2 className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < stepLabels.length - 1 && <div className={`w-6 h-0.5 mx-0.5 ${step > i + 1 ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="card">
          {/* STEP 1 */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                <input type="text" value={form.nome} onChange={set('nome')} className="input-field" placeholder="Seu nome completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                <div className="relative">
                  <input type="text" value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                    className={`input-field pr-10 ${cpfStatus === true ? 'ring-2 ring-green-400 border-green-400' : cpfStatus === false ? 'ring-2 ring-red-400 border-red-400' : ''}`}
                    placeholder="000.000.000-00" maxLength={14} />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {cpfStatus === true && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                    {cpfStatus === false && <XCircle className="w-5 h-5 text-red-500" />}
                  </div>
                </div>
                {cpfStatus === false && <p className="text-xs text-red-500 mt-1">CPF inválido</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                  <input type="text" value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: formatPhone(e.target.value) })}
                    className="input-field" placeholder="(00) 00000-0000" maxLength={15} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="seu@email.com" />
                </div>
              </div>
              <div className="border-t pt-3 mt-1">
                <p className="text-sm font-semibold text-gray-700 mb-2">Endereço</p>
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                  <div className="relative">
                    <input type="text" value={form.cep} onChange={handleCEPChange}
                      className="input-field pr-10" placeholder="00000-000" maxLength={9} />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {cepLoading ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <Search className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rua *</label>
                  <input type="text" value={form.rua} onChange={set('rua')} className="input-field" placeholder="Logradouro" />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nº *</label>
                    <input type="text" value={form.numero} onChange={set('numero')} className="input-field" placeholder="Nº" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                    <input type="text" value={form.complemento} onChange={set('complemento')} className="input-field" placeholder="Apto, bloco..." />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
                  <input type="text" value={form.bairro} onChange={set('bairro')} className="input-field" placeholder="Bairro" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                    <input type="text" value={form.cidade} onChange={set('cidade')} className="input-field" placeholder="Cidade" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UF *</label>
                    <input type="text" value={form.estado} onChange={set('estado')} className="input-field uppercase" placeholder="SC" maxLength={2} />
                  </div>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Próximo <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="text-center mb-1">
                <p className="text-sm text-gray-500">Envie os documentos obrigatórios</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-xs">
                    <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${(DOCS.filter(d => getDocDone(d)).length / DOCS.length) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700">{DOCS.filter(d => getDocDone(d)).length}/{DOCS.length}</span>
                </div>
              </div>
              {DOCS.map((doc) => {
                const Icon = doc.icon;
                const isDone = getDocDone(doc);
                const isLoading = uploading[doc.tipo];
                const isDrag = dragOver === doc.tipo;
                const multiFiles = doc.multi ? (uploads[doc.tipo] || []) : [];
                return (
                  <div key={doc.tipo}
                    className={`border rounded-xl p-3 transition-all ${isDone ? 'border-green-300 bg-green-50/50' : isDrag ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-300' : 'border-gray-200'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(doc.tipo); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDrop(e, doc.tipo, doc.multi)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDone ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {isDone ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Icon className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm">{doc.label}</p>
                        {doc.multi ? (
                          <p className="text-xs text-gray-500 truncate">
                            {multiFiles.length > 0 ? `${multiFiles.length} arquivo(s) enviado(s)` : doc.desc}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 truncate">{isDone ? uploads[doc.tipo] : doc.desc}</p>
                        )}
                      </div>
                      <input type="file" ref={el => fileInputs.current[doc.tipo] = el}
                        accept="image/*,application/pdf" className="hidden"
                        onChange={(e) => { if (e.target.files[0]) uploadDoc(doc.tipo, e.target.files[0], doc.multi); e.target.value = ''; }} />
                      <button onClick={() => fileInputs.current[doc.tipo]?.click()} disabled={isLoading}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
                          isDone && !doc.multi ? 'bg-green-100 text-green-700' : 'bg-brand-600 text-white hover:bg-brand-700'
                        }`}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                          isDone && !doc.multi ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                        {isDone && !doc.multi ? 'OK' : doc.multi && multiFiles.length > 0 ? '+ Mais' : 'Enviar'}
                      </button>
                    </div>
                    {/* Multi-file list */}
                    {doc.multi && multiFiles.length > 0 && (
                      <div className="mt-2 pl-12 space-y-1">
                        {multiFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{f}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(1)} className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <button onClick={handleFinish} disabled={!allDocsUploaded}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${allDocsUploaded ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                  Enviar para Análise <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="text-center space-y-4 py-4">
              <div className="w-18 h-18 bg-amber-100 rounded-full flex items-center justify-center mx-auto w-16 h-16">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Adesão enviada para análise!</h2>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Seus dados e documentos estão sendo analisados. Você receberá uma mensagem
                no <strong>WhatsApp</strong> ou <strong>Email</strong> com os próximos passos.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">Próximas etapas</p>
                {['Aprovação dos documentos', 'Receber contrato do veículo', 'Assinar e enviar selfie com documento', 'Pagamento da caução → conta ativada'].map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold mt-0.5">{i + 1}</div>
                    <p className="text-sm text-gray-600">{t}</p>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                <strong>Seu token:</strong>
                <span className="font-mono font-bold text-lg ml-2 tracking-widest">{token}</span>
                <p className="text-xs text-blue-500 mt-1">Guarde! É seu login quando sua conta for ativada.</p>
              </div>
              <Link to="/" className="btn-primary w-full py-3 inline-flex items-center justify-center">
                Voltar ao Início
              </Link>
            </div>
          )}
        </div>

        {step < 3 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            <Link to="/" className="text-brand-600 font-medium hover:text-brand-700">
              ← Voltar para os carros
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
