const express = require('express');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// BACKUP EXPORT — JSON dump completo do banco (admin only).
// Plano Railway $5 não tem backup automático. Esse endpoint dá
// uma rede de segurança grátis: JOs baixa periodicamente e
// guarda em local seguro. Restore: ver scripts/restore.js OU
// importa manualmente no PG cluster novo.
//
// SEGURANÇA:
// - adminOnly (motorista não baixa).
// - Settings sensíveis (credenciais MP) são EXCLUÍDAS do dump.
//   Quem quiser fazer backup de credenciais usa o painel Railway.
// - Audit log registra cada download.
// - Não expõe senha_hash dos users? Inclui (necessário pra restore
//   funcionar) — JOs deve guardar o backup em local seguro.
// ============================================================

// Lista de tabelas exportadas (ordem importa pra restore: pais antes de filhos).
const EXPORT_TABLES = [
  'users',
  'cars',
  'properties',
  'driver_profiles',
  'documents',
  'weekly_charges',
  'abatimentos',
  'acrescimos',
  'payments',
  'payment_entries',
  'final_settlements',
  'car_swaps',
  'car_maintenance',
  'installment_fees',
  'contract_clauses',
  'magic_link_tokens', // tokens já expirados/usados — não sensível em dump
  'audit_log',
];

// Chaves de settings sensíveis (NÃO incluímos no dump — usuário backupa via Railway).
const SENSITIVE_SETTING_KEYS = [
  'mp_access_token',
  'mp_access_token_test',
  'mp_public_key',
  'mp_public_key_test',
  'mp_webhook_secret',
];

/**
 * GET /api/admin/backup/export
 * Retorna JSON com todo o banco (exceto secrets).
 * Content-Disposition force download.
 */
router.get('/backup/export', auth, adminOnly, async (req, res) => {
  try {
    const dump = {
      _meta: {
        exported_at: new Date().toISOString(),
        exported_by: req.user.email,
        schema_version: '1.0',
        notas: 'Backup do banco IMP Locadora. Credenciais MP excluídas (gerencie via Railway). Restore: usar pg_restore equivalente OU script Node.',
      },
      tabelas: {},
    };

    for (const t of EXPORT_TABLES) {
      try {
        const r = await pool.query(`SELECT * FROM ${t}`);
        dump.tabelas[t] = r.rows;
      } catch (e) {
        dump.tabelas[t] = { _erro: e.message };
      }
    }

    // Settings: tudo MENOS credenciais sensíveis
    try {
      const placeholders = SENSITIVE_SETTING_KEYS.map((_, i) => `$${i + 1}`).join(', ');
      const r = await pool.query(
        `SELECT * FROM settings WHERE chave NOT IN (${placeholders})`,
        SENSITIVE_SETTING_KEYS
      );
      dump.tabelas.settings = r.rows;
      dump._meta.settings_excluidas = SENSITIVE_SETTING_KEYS;
    } catch (e) {
      dump.tabelas.settings = { _erro: e.message };
    }

    // Audit
    try {
      await pool.query(
        `INSERT INTO audit_log (user_id, user_email, acao, recurso, via, ip)
         VALUES ($1, $2, 'backup_export', 'database', $3, $4)`,
        [req.user.id, req.user.email, req.user.via || 'password', req.ip || null]
      );
    } catch (_) { /* audit pode não existir */ }

    const filename = `impl-locadora-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(dump);
  } catch (err) {
    console.error('[backup] erro:', err);
    res.status(500).json({ error: 'Erro ao gerar backup' });
  }
});

/**
 * GET /api/admin/backup/stats
 * Resumo rápido pra confirmar o que o backup vai conter (sem baixar tudo).
 */
router.get('/backup/stats', auth, adminOnly, async (req, res) => {
  try {
    const stats = {};
    for (const t of EXPORT_TABLES) {
      try {
        const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
        stats[t] = r.rows[0].n;
      } catch (e) {
        stats[t] = null;
      }
    }
    try {
      const placeholders = SENSITIVE_SETTING_KEYS.map((_, i) => `$${i + 1}`).join(', ');
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM settings WHERE chave NOT IN (${placeholders})`,
        SENSITIVE_SETTING_KEYS
      );
      stats.settings = r.rows[0].n;
    } catch (_) { stats.settings = null; }
    res.json({ stats, settings_excluidas: SENSITIVE_SETTING_KEYS, generated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar stats' });
  }
});

module.exports = router;
