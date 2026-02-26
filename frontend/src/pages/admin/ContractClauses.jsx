import { useState, useEffect } from 'react';
import { clausesAPI } from '../../services/api';
import { toast } from 'react-toastify';
import { FileText, Save, Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ContractClauses() {
  const [clauses, setClauses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { loadClauses(); }, []);

  const loadClauses = async () => {
    try {
      const res = await clausesAPI.list();
      setClauses(res.data);
    } catch (err) { toast.error('Erro ao carregar cláusulas'); }
    finally { setLoading(false); }
  };

  const handleSave = async (clause) => {
    setSaving(clause.id);
    try {
      await clausesAPI.update(clause.id, { titulo: clause.titulo, conteudo: clause.conteudo, ativo: clause.ativo });
      toast.success('Cláusula salva!');
      setEditingId(null);
    } catch (err) { toast.error('Erro ao salvar'); }
    finally { setSaving(null); }
  };

  const handleToggle = async (clause) => {
    try {
      await clausesAPI.update(clause.id, { ativo: !clause.ativo });
      setClauses(prev => prev.map(c => c.id === clause.id ? { ...c, ativo: !c.ativo } : c));
      toast.success(clause.ativo ? 'Cláusula desativada' : 'Cláusula ativada');
    } catch (err) { toast.error('Erro'); }
  };

  const handleAdd = async () => {
    try {
      const res = await clausesAPI.create({ titulo: 'NOVA CLAUSULA', conteudo: 'Conteudo da nova clausula...' });
      setClauses(prev => [...prev, res.data]);
      setEditingId(res.data.id);
      toast.success('Cláusula criada!');
    } catch (err) { toast.error('Erro ao criar'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover esta cláusula permanentemente?')) return;
    try {
      await clausesAPI.remove(id);
      setClauses(prev => prev.filter(c => c.id !== id));
      toast.success('Removida');
    } catch (err) { toast.error('Erro'); }
  };

  const handleMove = async (index, direction) => {
    const newClauses = [...clauses];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newClauses.length) return;
    [newClauses[index], newClauses[targetIdx]] = [newClauses[targetIdx], newClauses[index]];
    const items = newClauses.map((c, i) => ({ id: c.id, ordem: i + 1 }));
    setClauses(newClauses);
    try { await clausesAPI.reorder(items); } catch (err) { toast.error('Erro ao reordenar'); loadClauses(); }
  };

  const updateClause = (id, field, value) => {
    setClauses(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/configuracoes')} className="p-1 hover:bg-gray-100 rounded"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Cláusulas do Contrato</h1>
            <p className="text-gray-500 text-sm">Edite, reordene ou desative cláusulas. Alterações valem para contratos futuros.</p>
          </div>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nova Cláusula
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
        <p className="font-medium mb-1">Placeholders disponíveis:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs font-mono">
          <span>{'{VEICULO}'}</span>
          <span>{'{VALOR_SEMANAL}'}</span>
          <span>{'{VALOR_CAUCAO}'}</span>
          <span>{'{DIA_PAGAMENTO}'}</span>
          <span>{'{CIDADE_COMARCA}'}</span>
          <span>{'{LOCADOR_NOME}'}</span>
          <span>{'{LOCATARIO_NOME}'}</span>
        </div>
      </div>

      <div className="space-y-3">
        {clauses.map((clause, idx) => (
          <div key={clause.id} className={`card transition-all ${!clause.ativo ? 'opacity-50 bg-gray-50' : ''}`}>
            <div className="flex items-start gap-3">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-1 pt-1">
                <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                <span className="text-xs text-gray-400 text-center">{idx + 1}</span>
                <button onClick={() => handleMove(idx, 1)} disabled={idx === clauses.length - 1} className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
              </div>

              <div className="flex-1 min-w-0">
                {editingId === clause.id ? (
                  <div className="space-y-2">
                    <input type="text" value={clause.titulo} onChange={e => updateClause(clause.id, 'titulo', e.target.value)}
                      className="input-field font-bold text-sm w-full" />
                    <textarea value={clause.conteudo} onChange={e => updateClause(clause.id, 'conteudo', e.target.value)}
                      className="input-field text-sm w-full font-mono" rows={Math.min(20, Math.max(5, clause.conteudo.split('\n').length + 2))} />
                    <div className="flex gap-2">
                      <button onClick={() => handleSave(clause)} disabled={saving === clause.id}
                        className="btn-primary text-xs flex items-center gap-1">
                        <Save className="w-3 h-3" /> {saving === clause.id ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button onClick={() => { setEditingId(null); loadClauses(); }} className="btn-secondary text-xs">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => setEditingId(clause.id)}>
                      <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                      <h3 className="font-semibold text-sm text-gray-800">{clause.titulo}</h3>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 cursor-pointer" onClick={() => setEditingId(clause.id)}>
                      {clause.conteudo.substring(0, 150)}...
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggle(clause)} title={clause.ativo ? 'Desativar' : 'Ativar'}
                  className={`p-1.5 rounded ${clause.ativo ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                  {clause.ativo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => handleDelete(clause.id)} title="Remover"
                  className="p-1.5 rounded text-red-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
