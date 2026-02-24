import { useState, useEffect } from 'react';
import { settingsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import {
  Settings, Save, Calendar, Percent, Clock, CreditCard,
  Globe, RefreshCw
} from 'lucide-react';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFees, setSavingFees] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [settingsRes, feesRes] = await Promise.all([
        settingsAPI.get(),
        settingsAPI.getFees(),
      ]);

      // Converte de { chave: {valor, descricao} } para flat
      const flat = {};
      Object.entries(settingsRes.data).forEach(([key, obj]) => {
        flat[key] = obj.valor;
      });

      setSettings(flat);
      setFees(feesRes.data);
    } catch (err) {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setChanged(true);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await settingsAPI.update(settings);
      toast.success('Configurações salvas!');
      setChanged(false);
    } catch (err) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const updateFee = (index, taxa) => {
    const updated = [...fees];
    updated[index] = { ...updated[index], taxa_percentual: parseFloat(taxa) || 0 };
    setFees(updated);
  };

  const handleSaveFees = async () => {
    setSavingFees(true);
    try {
      await settingsAPI.updateFees(fees.map(f => ({
        parcelas: f.parcelas,
        taxa_percentual: f.taxa_percentual,
      })));
      toast.success('Taxas atualizadas!');
    } catch (err) {
      toast.error('Erro ao salvar taxas');
    } finally {
      setSavingFees(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
          <p className="text-gray-500 text-sm mt-1">Ajuste parâmetros do sistema</p>
        </div>
        {changed && (
          <button onClick={handleSaveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      </div>

      {/* Vencimento semanal */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-brand-600" />
          <h2 className="font-semibold text-gray-800">Vencimento Semanal</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dia da semana para vencimento</label>
          <select
            value={settings.dia_vencimento || '1'}
            onChange={e => updateSetting('dia_vencimento', e.target.value)}
            className="input-field w-full md:w-64"
          >
            {DIAS_SEMANA.map((dia, i) => (
              <option key={i} value={i}>{dia}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Multas */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Percent className="w-5 h-5 text-red-500" />
          <h2 className="font-semibold text-gray-800">Multa por Atraso</h2>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de multa</label>
              <select
                value={settings.multa_tipo || 'percentual'}
                onChange={e => updateSetting('multa_tipo', e.target.value)}
                className="input-field"
              >
                <option value="percentual">Percentual (% ao dia)</option>
                <option value="fixo">Valor fixo (R$ ao dia)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor ({settings.multa_tipo === 'fixo' ? 'R$ por dia' : '% por dia'})
              </label>
              <input
                type="number"
                step="0.01"
                value={settings.multa_valor || ''}
                onChange={e => updateSetting('multa_valor', e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dias de carência</label>
              <input
                type="number"
                value={settings.multa_carencia_dias || ''}
                onChange={e => updateSetting('multa_carencia_dias', e.target.value)}
                className="input-field"
              />
              <p className="text-xs text-gray-400 mt-1">Dias sem multa após o vencimento</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Multa diferida</label>
              <select
                value={settings.multa_diferida || 'true'}
                onChange={e => updateSetting('multa_diferida', e.target.value)}
                className="input-field"
              >
                <option value="true">Sim — cobrar só no acerto final</option>
                <option value="false">Não — cobrar na semana</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Se diferida, multa acumula mas só é cobrada na rescisão</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mercado Pago */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-green-600" />
          <h2 className="font-semibold text-gray-800">Mercado Pago</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Configure as credenciais na Etapa 4. As variáveis de ambiente MP_ACCESS_TOKEN e MP_PUBLIC_KEY
          devem ser definidas no .env do backend.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL do Webhook</label>
          <input
            type="text"
            value={settings.mp_webhook_url || ''}
            onChange={e => updateSetting('mp_webhook_url', e.target.value)}
            className="input-field"
            placeholder="https://seudominio.com/api/webhooks/mp"
          />
          <p className="text-xs text-gray-400 mt-1">Configure esta URL no painel do Mercado Pago</p>
        </div>
      </div>

      {/* Dados do Locador (para contrato) */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-gray-800">Dados do Locador (Contrato)</h2>
        </div>
        <p className="text-xs text-gray-400 mb-3">Esses dados são usados para gerar o contrato de locação automaticamente.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
            <input type="text" value={settings.locador_nome || ''} onChange={e => updateSetting('locador_nome', e.target.value)} className="input-field" placeholder="JOSÉ RICARDO DOERNER NETO" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
            <input type="text" value={settings.locador_cpf || ''} onChange={e => updateSetting('locador_cpf', e.target.value)} className="input-field" placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RG</label>
            <input type="text" value={settings.locador_rg || ''} onChange={e => updateSetting('locador_rg', e.target.value)} className="input-field" placeholder="0000000 SSP/SC" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="text" value={settings.locador_email || ''} onChange={e => updateSetting('locador_email', e.target.value)} className="input-field" placeholder="email@exemplo.com" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço completo</label>
            <input type="text" value={settings.locador_endereco || ''} onChange={e => updateSetting('locador_endereco', e.target.value)} className="input-field" placeholder="Rua ..., nº, Bairro, Cidade, CEP" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade / Comarca</label>
            <input type="text" value={settings.locador_cidade || ''} onChange={e => updateSetting('locador_cidade', e.target.value)} className="input-field" placeholder="JARAGUÁ DO SUL - SC" />
          </div>
        </div>
      </div>

      {/* Plataforma externa */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-gray-800">Plataforma Externa</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Evento que dispara cadastro externo</label>
          <select
            value={settings.evento_cadastro_externo || 'caucao_pago'}
            onChange={e => updateSetting('evento_cadastro_externo', e.target.value)}
            className="input-field w-full md:w-64"
          >
            <option value="caucao_pago">Caução pago</option>
            <option value="contrato_confirmado">Contrato confirmado</option>
            <option value="ativado">Motorista ativado</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Token do motorista: 6 primeiros dígitos do CPF. API externa configurável no .env
          </p>
        </div>
      </div>

      {/* Botão salvar */}
      {changed && (
        <button onClick={handleSaveSettings} disabled={saving} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      )}

      {/* Taxas de parcelas */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-gray-800">Taxas de Parcelamento (Juros no Pagador)</h2>
          </div>
          <button onClick={handleSaveFees} disabled={savingFees} className="btn-primary text-sm flex items-center gap-1">
            {savingFees ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar Taxas
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {fees.map((fee, idx) => (
            <div key={fee.parcelas} className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-700 mb-1">{fee.parcelas}x</p>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={fee.taxa_percentual}
                  onChange={e => updateFee(idx, e.target.value)}
                  className="input-field text-sm py-1"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Os juros são adicionados ao valor total do pagamento do motorista. Ex: 12x com 25,49% = valor × 1,2549
        </p>
      </div>
    </div>
  );
}
