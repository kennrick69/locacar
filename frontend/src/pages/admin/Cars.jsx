import { useState, useEffect, useRef } from 'react';
import { carsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  Car, Plus, Pencil, Trash2, X, Upload, Search,
  CheckCircle2, XCircle, Image
} from 'lucide-react';

const EMPTY_CAR = { marca: '', modelo: '', ano: '', placa: '', cor: '', valor_semanal: '', valor_caucao: '', observacoes: '' };

export default function AdminCars() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | car object (edit)
  const [form, setForm] = useState(EMPTY_CAR);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { loadCars(); }, []);

  const loadCars = async () => {
    try {
      const res = await carsAPI.listAll();
      setCars(res.data);
    } catch (err) {
      toast.error('Erro ao carregar carros');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setForm(EMPTY_CAR);
    setModal('new');
  };

  const openEdit = (car) => {
    setForm({
      marca: car.marca || '',
      modelo: car.modelo || '',
      ano: car.ano || '',
      placa: car.placa || '',
      cor: car.cor || '',
      valor_semanal: car.valor_semanal || '',
      valor_caucao: car.valor_caucao || '',
      observacoes: car.observacoes || '',
      disponivel: car.disponivel,
    });
    setModal(car);
  };

  const handleSave = async () => {
    if (!form.marca || !form.modelo || !form.placa || !form.valor_semanal) {
      return toast.warning('Preencha os campos obrigatórios');
    }

    setSaving(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => {
        if (val !== '' && val !== undefined) formData.append(key, val);
      });

      const file = fileRef.current?.files?.[0];
      if (file) formData.append('foto', file);

      if (modal === 'new') {
        await carsAPI.create(formData);
        toast.success('Carro cadastrado!');
      } else {
        await carsAPI.update(modal.id, formData);
        toast.success('Carro atualizado!');
      }

      setModal(null);
      await loadCars();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await carsAPI.delete(id);
      toast.success('Carro removido');
      setDeleteConfirm(null);
      await loadCars();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover');
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

  const filtered = cars.filter(c =>
    `${c.marca} ${c.modelo} ${c.placa} ${c.cor}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Carros</h1>
          <p className="text-gray-500 text-sm mt-1">{cars.length} veículos cadastrados</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Carro
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-10"
          placeholder="Buscar por marca, modelo, placa..."
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Car className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{search ? 'Nenhum resultado encontrado' : 'Nenhum carro cadastrado'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(car => (
            <div key={car.id} className="card">
              {/* Foto */}
              <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                {car.foto_url ? (
                  <img src={car.foto_url} alt={`${car.marca} ${car.modelo}`} className="w-full h-full object-cover" />
                ) : (
                  <Car className="w-10 h-10 text-gray-300" />
                )}
                {/* Status badge */}
                <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                  car.disponivel ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {car.disponivel ? 'Disponível' : 'Ocupado'}
                </span>
              </div>

              <h3 className="font-semibold text-gray-800">{car.marca} {car.modelo}</h3>
              <p className="text-sm text-gray-400">{car.placa} · {car.ano || '—'} · {car.cor || '—'}</p>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">Semanal</p>
                  <p className="font-bold text-brand-700">R$ {fmt(car.valor_semanal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Caução</p>
                  <p className="font-bold text-gray-600">R$ {fmt(car.valor_caucao)}</p>
                </div>
              </div>

              {parseInt(car.motoristas_ativos) > 0 && (
                <p className="text-xs text-purple-600 mt-2">{car.motoristas_ativos} motorista(s) ativo(s)</p>
              )}

              {/* Ações */}
              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(car)} className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => setDeleteConfirm(car)} className="px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== MODAL FORM ========== */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center" onClick={() => setModal(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-800">
                {modal === 'new' ? 'Novo Carro' : 'Editar Carro'}
              </h3>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca *</label>
                  <input type="text" value={form.marca} onChange={set('marca')} className="input-field" placeholder="Ex: Fiat" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modelo *</label>
                  <input type="text" value={form.modelo} onChange={set('modelo')} className="input-field" placeholder="Ex: Mobi" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                  <input type="number" value={form.ano} onChange={set('ano')} className="input-field" placeholder="2024" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Placa *</label>
                  <input type="text" value={form.placa} onChange={set('placa')} className="input-field" placeholder="ABC-1234" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                  <input type="text" value={form.cor} onChange={set('cor')} className="input-field" placeholder="Branco" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor Semanal (R$) *</label>
                  <input type="number" step="0.01" value={form.valor_semanal} onChange={set('valor_semanal')} className="input-field" placeholder="650.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Caução (R$)</label>
                  <input type="number" step="0.01" value={form.valor_caucao} onChange={set('valor_caucao')} className="input-field" placeholder="2000.00" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto</label>
                <input type="file" ref={fileRef} accept="image/*" className="input-field text-sm" />
              </div>

              {modal !== 'new' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="disponivel"
                    checked={form.disponivel !== false}
                    onChange={e => setForm({ ...form, disponivel: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="disponivel" className="text-sm text-gray-700">Disponível para locação</label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={form.observacoes} onChange={set('observacoes')} className="input-field" rows={2} placeholder="Opcional" />
              </div>

              <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3">
                {saving ? 'Salvando...' : (modal === 'new' ? 'Cadastrar Carro' : 'Salvar Alterações')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== DELETE CONFIRM ========== */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
            <Trash2 className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-800 mb-2">Remover carro?</h3>
            <p className="text-sm text-gray-500 mb-4">
              {deleteConfirm.marca} {deleteConfirm.modelo} ({deleteConfirm.placa})
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} className="btn-danger flex-1">Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
