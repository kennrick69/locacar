import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { Car, KeyRound, Loader2, Search } from 'lucide-react';

export default function Register() {
  const [form, setForm] = useState({
    nome: '', email: '', cpf: '', telefone: '',
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: ''
  });
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState('');
  const { register, tokenLogin } = useAuth();
  const navigate = useNavigate();

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const formatCPF = (v) => {
    return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14);
  };

  const formatPhone = (v) => {
    return v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2').substring(0, 15);
  };

  const formatCEP = (v) => {
    return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').substring(0, 9);
  };

  const buscarCEP = async (cepRaw) => {
    const cep = cepRaw.replace(/\D/g, '');
    if (cep.length !== 8) return;

    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.warning('CEP não encontrado');
        return;
      }
      setForm(prev => ({
        ...prev,
        rua: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        estado: data.uf || '',
        complemento: data.complemento || prev.complemento
      }));
    } catch {
      toast.error('Erro ao buscar CEP');
    } finally {
      setCepLoading(false);
    }
  };

  const handleCEPChange = (e) => {
    const formatted = formatCEP(e.target.value);
    setForm({ ...form, cep: formatted });
    if (formatted.replace(/\D/g, '').length === 8) {
      buscarCEP(formatted);
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { nome, email, cpf, telefone, cep, rua, numero, bairro, cidade, estado } = form;

    if (!nome || !cpf || !email || !telefone) return toast.warning('Preencha todos os campos obrigatórios');
    if (!cep || !rua || !numero || !bairro || !cidade || !estado) return toast.warning('Preencha o endereço completo');

    const cpfClean = cpf.replace(/\D/g, '');
    if (cpfClean.length < 11) return toast.warning('CPF deve ter 11 dígitos');

    setLoading(true);
    try {
      const generatedToken = cpfClean.substring(0, 6);
      const endereco = montarEndereco();
      await register({ nome, email, senha: generatedToken, cpf: cpfClean, telefone, endereco });
      setToken(generatedToken);
      setSuccess(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToPanel = async () => {
    try {
      await tokenLogin(token);
      navigate('/motorista/documentos');
    } catch {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-3 shadow-lg shadow-brand-200">
            <Car className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Cadastro de Motorista</h1>
          <p className="text-gray-500 text-sm mt-1">Preencha seus dados para começar</p>
        </div>

        <div className="card">
          {success ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <KeyRound className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Cadastro realizado!</h2>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500 mb-1">Seu token de acesso:</p>
                <p className="text-3xl font-mono font-bold text-brand-700 tracking-widest">{token}</p>
                <p className="text-xs text-gray-400 mt-2">Use esse token para acessar sua conta sempre</p>
              </div>
              <p className="text-sm text-gray-500">Agora envie seus documentos para análise.</p>
              <button onClick={handleGoToPanel} className="btn-primary w-full py-3">
                Enviar Documentos
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Dados pessoais */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                  <input type="text" value={form.nome} onChange={set('nome')} className="input-field" placeholder="Seu nome completo" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                  <input type="text" value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                    className="input-field" placeholder="000.000.000-00" maxLength={14} />
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

                {/* Endereço com CEP */}
                <div className="border-t pt-4 mt-2">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Endereço</p>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                    <div className="relative">
                      <input type="text" value={form.cep}
                        onChange={handleCEPChange}
                        className="input-field pr-10" placeholder="00000-000" maxLength={9} />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {cepLoading ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <Search className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rua *</label>
                    <input type="text" value={form.rua} onChange={set('rua')} className="input-field" placeholder="Logradouro" />
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número *</label>
                      <input type="text" value={form.numero} onChange={set('numero')} className="input-field" placeholder="Nº" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                      <input type="text" value={form.complemento} onChange={set('complemento')} className="input-field" placeholder="Apto, bloco..." />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
                    <input type="text" value={form.bairro} onChange={set('bairro')} className="input-field" placeholder="Bairro" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
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

                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  <strong>Seu acesso:</strong> Após o cadastro, seu login será os <strong>6 primeiros números do CPF</strong>. Não precisa de senha!
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </form>

              <div className="mt-5 text-center text-sm text-gray-500">
                Já tem conta?{' '}
                <Link to="/" className="text-brand-600 font-medium hover:text-brand-700">
                  Acessar com Token
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
