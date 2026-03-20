import { useState, useEffect, useRef } from 'react';
import { propertiesAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  Building2, Plus, Pencil, Trash2, X, Search,
  Home, Bed, Bath, Car, Ruler, Image
} from 'lucide-react';

const PROPERTY_TYPES = ['Apartamento', 'Casa', 'Comercial', 'Terreno', 'Kitnet', 'Cobertura', 'Sobrado'];

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

const AMENITIES = [
  { key: 'mobiliado', label: 'Mobiliado' },
  { key: 'aceita_pets', label: 'Aceita Pets' },
  { key: 'piscina', label: 'Piscina' },
  { key: 'churrasqueira', label: 'Churrasqueira' },
  { key: 'portaria_24h', label: 'Portaria 24h' },
  { key: 'elevador', label: 'Elevador' },
  { key: 'academia', label: 'Academia' },
  { key: 'varanda', label: 'Varanda' },
  { key: 'area_servico', label: 'Area de Servico' },
  { key: 'playground', label: 'Playground' },
  { key: 'salao_festas', label: 'Salao de Festas' },
];

const EMPTY_PROPERTY = {
  tipo: '', titulo: '', endereco: '', bairro: '', cidade: '', estado: '', cep: '',
  quartos: '', banheiros: '', vagas_garagem: '', area_m2: '',
  valor_mensal: '', valor_deposito: '', descricao: '', observacoes: '',
  mobiliado: false, aceita_pets: false, piscina: false, churrasqueira: false,
  portaria_24h: false, elevador: false, academia: false, varanda: false,
  area_servico: false, playground: false, salao_festas: false,
};

export default function AdminProperties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_PROPERTY);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileRef = useRef(null);
  const extraPhotoRef = useRef(null);
  const [extraPhotos, setExtraPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { loadProperties(); }, []);

  const loadProperties = async () => {
    try {
      const res = await propertiesAPI.listAll();
      setProperties(res.data);
    } catch (err) {
      toast.error('Erro ao carregar imoveis');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => { setForm(EMPTY_PROPERTY); setExtraPhotos([]); setModal('new'); };

  const openEdit = (property) => {
    setForm({
      tipo: property.tipo || '',
      titulo: property.titulo || '',
      endereco: property.endereco || '',
      bairro: property.bairro || '',
      cidade: property.cidade || '',
      estado: property.estado || '',
      cep: property.cep || '',
      quartos: property.quartos || '',
      banheiros: property.banheiros || '',
      vagas_garagem: property.vagas_garagem || '',
      area_m2: property.area_m2 || '',
      valor_mensal: property.valor_mensal || '',
      valor_deposito: property.valor_deposito || '',
      descricao: property.descricao || '',
      observacoes: property.observacoes || '',
      disponivel: property.disponivel,
      mobiliado: property.mobiliado || false,
      aceita_pets: property.aceita_pets || false,
      piscina: property.piscina || false,
      churrasqueira: property.churrasqueira || false,
      portaria_24h: property.portaria_24h || false,
      elevador: property.elevador || false,
      academia: property.academia || false,
      varanda: property.varanda || false,
      area_servico: property.area_servico || false,
      playground: property.playground || false,
      salao_festas: property.salao_festas || false,
    });
    try { setExtraPhotos(JSON.parse(property.fotos_extras || '[]')); } catch { setExtraPhotos([]); }
    setModal(property);
  };

  const handleUploadExtraPhoto = async (files) => {
    if (!files || files.length === 0 || modal === 'new') return;
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('foto', file);
        const res = await propertiesAPI.addPhoto(modal.id, fd);
        setExtraPhotos(res.data.fotos);
      }
      toast.success('Foto(s) adicionada(s)!');
    } catch (e) { toast.error('Erro ao enviar foto'); }
    finally { setUploadingPhoto(false); if (extraPhotoRef.current) extraPhotoRef.current.value = ''; }
  };

  const handleRemoveExtraPhoto = async (url) => {
    try {
      const res = await propertiesAPI.removePhoto(modal.id, url);
      setExtraPhotos(res.data.fotos);
      toast.success('Foto removida');
    } catch (e) { toast.error('Erro ao remover'); }
  };

  const handleSave = async () => {
    if (!form.tipo || !form.valor_mensal) {
      return toast.warning('Preencha os campos obrigatorios (tipo, valor mensal)');
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
        await propertiesAPI.create(formData);
        toast.success('Imovel cadastrado!');
      } else {
        await propertiesAPI.update(modal.id, formData);
        toast.success('Imovel atualizado!');
      }
      setModal(null);
      await loadProperties();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await propertiesAPI.delete(id);
      toast.success('Imovel removido');
      setDeleteConfirm(null);
      await loadProperties();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover');
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const fmt = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');

  const filtered = properties.filter(p =>
    `${p.tipo} ${p.titulo} ${p.bairro} ${p.cidade} ${p.endereco}`.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold text-gray-800">Imoveis</h1>
          <p className="text-gray-500 text-sm mt-1">{properties.length} imoveis cadastrados</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Imovel
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-10" placeholder="Buscar por tipo, titulo, bairro, cidade..." />
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{search ? 'Nenhum resultado encontrado' : 'Nenhum imovel cadastrado'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(property => (
            <div key={property.id} className="card">
              <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
                {property.foto_url ? (
                  <img src={property.foto_url} alt={property.titulo || property.tipo} className="w-full h-full object-cover" />
                ) : (
                  <Home className="w-10 h-10 text-gray-300" />
                )}
                <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                  property.disponivel !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {property.disponivel !== false ? 'Disponivel' : 'Indisponivel'}
                </span>
                <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                  {property.tipo}
                </span>
              </div>

              <h3 className="font-semibold text-gray-800">
                {property.titulo || `${property.tipo} - ${property.bairro || ''}`}
              </h3>
              <p className="text-sm text-gray-400">
                {property.cidade}{property.estado ? ` - ${property.estado}` : ''}
              </p>

              <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                {property.quartos > 0 && (
                  <span className="flex items-center gap-1"><Bed className="w-3.5 h-3.5" /> {property.quartos} qto(s)</span>
                )}
                {property.banheiros > 0 && (
                  <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5" /> {property.banheiros} ban</span>
                )}
                {property.area_m2 > 0 && (
                  <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5" /> {property.area_m2} m2</span>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">Mensal</p>
                  <p className="font-bold text-brand-700">R$ {fmt(property.valor_mensal)}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(property)} className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => setDeleteConfirm(property)} className="px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
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
                {modal === 'new' ? 'Novo Imovel' : 'Editar Imovel'}
              </h3>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                  <select value={form.tipo} onChange={set('tipo')} className="input-field">
                    <option value="">Selecione...</option>
                    {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
                  <input type="text" value={form.titulo} onChange={set('titulo')} className="input-field" placeholder="Ex: Apto Centro" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereco</label>
                <input type="text" value={form.endereco} onChange={set('endereco')} className="input-field" placeholder="Rua, numero..." />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                  <input type="text" value={form.bairro} onChange={set('bairro')} className="input-field" placeholder="Bairro" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input type="text" value={form.cidade} onChange={set('cidade')} className="input-field" placeholder="Cidade" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={form.estado} onChange={set('estado')} className="input-field">
                    <option value="">UF</option>
                    {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                <input type="text" value={form.cep} onChange={set('cep')} className="input-field" placeholder="00000-000" />
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quartos</label>
                  <input type="number" value={form.quartos} onChange={set('quartos')} className="input-field" placeholder="0" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Banheiros</label>
                  <input type="number" value={form.banheiros} onChange={set('banheiros')} className="input-field" placeholder="0" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vagas</label>
                  <input type="number" value={form.vagas_garagem} onChange={set('vagas_garagem')} className="input-field" placeholder="0" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area (m2)</label>
                  <input type="number" value={form.area_m2} onChange={set('area_m2')} className="input-field" placeholder="0" min="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor Mensal (R$) *</label>
                  <input type="number" step="0.01" value={form.valor_mensal} onChange={set('valor_mensal')} className="input-field" placeholder="1500.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deposito (R$)</label>
                  <input type="number" step="0.01" value={form.valor_deposito} onChange={set('valor_deposito')} className="input-field" placeholder="3000.00" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
                <textarea value={form.descricao} onChange={set('descricao')} className="input-field" rows={3} placeholder="Detalhes sobre o imovel..." />
              </div>

              {/* Amenities */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Comodidades</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AMENITIES.map(a => (
                    <label key={a.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form[a.key] || false}
                        onChange={e => setForm({ ...form, [a.key]: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-sm text-gray-700">{a.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto principal</label>
                <input type="file" ref={fileRef} accept="image/*" className="input-field text-sm" />
                {modal !== 'new' && modal?.foto_url && (
                  <div className="mt-2 w-20 h-14 rounded-lg overflow-hidden border">
                    <img src={modal.foto_url} alt="Atual" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Fotos extras (so no editar) */}
              {modal !== 'new' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fotos adicionais</label>
                  {extraPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {extraPhotos.map((url, i) => (
                        <div key={i} className="relative w-20 h-14 rounded-lg overflow-hidden border group">
                          <img src={url} alt={`Extra ${i+1}`} className="w-full h-full object-cover" />
                          <button onClick={() => handleRemoveExtraPhoto(url)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                            X
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input type="file" ref={extraPhotoRef} accept="image/*" multiple className="hidden"
                      onChange={(e) => { if (e.target.files.length > 0) handleUploadExtraPhoto(e.target.files); }} />
                    <button type="button" onClick={() => extraPhotoRef.current?.click()} disabled={uploadingPhoto}
                      className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 flex items-center gap-1">
                      {uploadingPhoto ? <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                        : <><Plus className="w-3.5 h-3.5" /> Adicionar fotos</>}
                    </button>
                    <span className="text-xs text-gray-400">{extraPhotos.length} foto(s) extra(s)</span>
                  </div>
                </div>
              )}

              {modal !== 'new' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="disponivel"
                    checked={form.disponivel !== false}
                    onChange={e => setForm({ ...form, disponivel: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <label htmlFor="disponivel" className="text-sm text-gray-700">Disponivel para locacao</label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
                <textarea value={form.observacoes} onChange={set('observacoes')} className="input-field" rows={2} placeholder="Opcional" />
              </div>

              <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3">
                {saving ? 'Salvando...' : (modal === 'new' ? 'Cadastrar Imovel' : 'Salvar Alteracoes')}
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
            <h3 className="font-semibold text-gray-800 mb-2">Remover imovel?</h3>
            <p className="text-sm text-gray-500 mb-4">
              {deleteConfirm.titulo || `${deleteConfirm.tipo} - ${deleteConfirm.bairro || ''}`}
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
