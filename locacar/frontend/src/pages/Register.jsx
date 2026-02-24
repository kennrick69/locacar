import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { Car, Eye, EyeOff } from 'lucide-react';

export default function Register() {
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmar: '', cpf: '', telefone: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const formatCPF = (v) => {
    return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14);
  };

  const formatPhone = (v) => {
    return v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2').substring(0, 15);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { nome, email, senha, confirmar, cpf, telefone } = form;

    if (!nome || !email || !senha) return toast.warning('Preencha os campos obrigatórios');
    if (senha.length < 6) return toast.warning('Senha deve ter pelo menos 6 caracteres');
    if (senha !== confirmar) return toast.warning('As senhas não conferem');

    setLoading(true);
    try {
      await register({ nome, email, senha, cpf: cpf.replace(/\D/g, ''), telefone });
      toast.success('Cadastro realizado com sucesso!');
      navigate('/motorista');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-3 shadow-lg shadow-brand-200">
            <Car className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Criar Conta</h1>
          <p className="text-gray-500 text-sm mt-1">Cadastro de motorista</p>
        </div>

        {/* Form */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
              <input type="text" value={form.nome} onChange={set('nome')} className="input-field" placeholder="Seu nome" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="seu@email.com" autoComplete="email" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                <input
                  type="text"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                  className="input-field"
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: formatPhone(e.target.value) })}
                  className="input-field"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.senha}
                  onChange={set('senha')}
                  className="input-field pr-10"
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha *</label>
              <input
                type="password"
                value={form.confirmar}
                onChange={set('confirmar')}
                className="input-field"
                placeholder="Repita a senha"
                autoComplete="new-password"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-brand-600 font-medium hover:text-brand-700">
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
