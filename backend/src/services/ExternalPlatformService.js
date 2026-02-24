/**
 * ExternalPlatformService — Cadastro de motorista em plataforma externa
 * Token = 6 primeiros dígitos do CPF
 * Dispara após evento configurável (caução pago, contrato confirmado, ativado)
 */
const pool = require('../config/database');

class ExternalPlatformService {

  /**
   * Cadastra motorista na plataforma externa via API
   * @param {number} driverId - ID do driver_profiles
   */
  static async cadastrarMotorista(driverId) {
    try {
      const apiUrl = process.env.EXTERNAL_API_URL;
      const apiKey = process.env.EXTERNAL_API_KEY;

      if (!apiUrl) {
        console.log('[EXTERNO] URL da API externa não configurada. Pulando cadastro.');
        return { success: false, reason: 'URL não configurada' };
      }

      // Busca dados do motorista
      const result = await pool.query(`
        SELECT dp.token_externo, dp.cadastro_externo, u.nome, u.email, u.cpf, u.telefone
        FROM driver_profiles dp
        JOIN users u ON u.id = dp.user_id
        WHERE dp.id = $1
      `, [driverId]);

      if (result.rows.length === 0) {
        return { success: false, reason: 'Motorista não encontrado' };
      }

      const driver = result.rows[0];

      if (driver.cadastro_externo) {
        console.log(`[EXTERNO] Motorista ${driverId} já cadastrado externamente.`);
        return { success: true, reason: 'Já cadastrado' };
      }

      // Monta payload
      const payload = {
        token: driver.token_externo,  // 6 primeiros dígitos do CPF
        nome: driver.nome,
        email: driver.email,
        cpf: driver.cpf,
        telefone: driver.telefone,
      };

      console.log(`[EXTERNO] Cadastrando motorista ${driverId} na plataforma externa...`);

      // Faz a chamada HTTP
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EXTERNO] Erro ${response.status}: ${errorText}`);
        return { success: false, reason: `HTTP ${response.status}`, detail: errorText };
      }

      const data = await response.json().catch(() => ({}));

      // Marca como cadastrado
      await pool.query(
        'UPDATE driver_profiles SET cadastro_externo = true, updated_at = NOW() WHERE id = $1',
        [driverId]
      );

      console.log(`[EXTERNO] Motorista ${driverId} cadastrado com sucesso!`);
      return { success: true, data };

    } catch (err) {
      console.error('[EXTERNO] Erro ao cadastrar:', err.message);
      return { success: false, reason: err.message };
    }
  }

  /**
   * Verifica se o evento atual corresponde ao evento configurado
   * e dispara o cadastro se necessário
   * @param {string} evento - 'caucao_pago' | 'contrato_confirmado' | 'ativado'
   * @param {number} driverId
   */
  static async verificarEDisparar(evento, driverId) {
    try {
      const settingRes = await pool.query(
        "SELECT valor FROM settings WHERE chave = 'evento_cadastro_externo'"
      );
      const eventoConfig = settingRes.rows[0]?.valor || 'caucao_pago';

      if (evento === eventoConfig) {
        console.log(`[EXTERNO] Evento '${evento}' corresponde. Disparando cadastro...`);
        return await this.cadastrarMotorista(driverId);
      }

      return { success: false, reason: `Evento '${evento}' não corresponde ao configurado '${eventoConfig}'` };
    } catch (err) {
      console.error('[EXTERNO] Erro na verificação:', err.message);
      return { success: false, reason: err.message };
    }
  }
}

module.exports = ExternalPlatformService;
