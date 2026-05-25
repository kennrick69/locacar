# Backup Manual — IMP Locadora

Como o plano Railway $5 não tem backup automático, esse é seu plano-B grátis.

## Como BAIXAR backup (UI futura ou cURL)

Faça login admin (qualquer método: senha ou magic link). Pegue o JWT.

```bash
TOKEN="<seu_jwt_admin>"
curl -H "Authorization: Bearer $TOKEN" \
  https://implocadora.com.br/api/admin/backup/export \
  -o backup-$(date +%F).json
```

Arquivo gerado: `impl-locadora-backup-2026-05-25.json` (formato JSON).

**Conteúdo**: dump completo de todas as tabelas operacionais
- users, cars, properties, driver_profiles, documents
- weekly_charges, abatimentos, acrescimos, payments, payment_entries
- final_settlements, car_swaps, car_maintenance
- installment_fees, contract_clauses, audit_log, magic_link_tokens
- settings (TODAS EXCETO credenciais MP — essas você gerencia direto no Railway)

## Prévia (sem baixar tudo)

Pra confirmar quantos registros tem antes de baixar:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://implocadora.com.br/api/admin/backup/stats
```

Retorna `{ stats: { users: 42, payments: 1200, ... } }`.

## Onde guardar

- **Pen drive físico** (rede de segurança offline).
- **Google Drive / Dropbox pessoal** (criptografado se possível).
- **NÃO em pasta pública nem em repo Git** — contém `senha_hash` dos usuários (bcrypt, mas mesmo assim).

## Frequência sugerida

- **Semanal**: clica no botão (futura UI) e baixa.
- **Antes de mexer em qualquer migration**: backup obrigatório.
- **Antes de ações destrutivas** (remover muitos motoristas, mudança grande): backup.

## Como RESTAURAR (se algo der ruim)

### Opção 1 — Banco novo / vazio
1. Provisiona Postgres novo (Railway ou outro).
2. Sobe o servidor apontando pro novo DB. Boot vai rodar `migrate` → cria schema vazio.
3. Roda script de restore (a criar — por enquanto, manual via psql):
   ```bash
   node scripts/restore.js backup-2026-05-25.json
   ```
   (Esse script ainda não existe — vou criar quando for necessário; por enquanto,
   restore manual via `psql` insertando JSON tabela por tabela.)

### Opção 2 — Recuperar 1 registro
1. Abre o JSON num editor.
2. Procura o registro perdido em `tabelas.<nome>`.
3. INSERT manual no banco via psql / pgAdmin.

### Opção 3 — Recuperar 1 tabela
1. TRUNCATE da tabela (cuidado!).
2. INSERT em massa do JSON.

## Sobre credenciais MP

**Não vêm no backup** por design. São gerenciadas:
- No painel Railway (env vars), OU
- Na tela admin Settings com sessão **magic link** (atributo `via='magic_link'` no JWT).

Pra fazer backup das credenciais MP, copia/cola do painel Railway pra um cofre
(1Password, Bitwarden). Faz isso 1x e guarda.

## Audit log

Toda chamada de backup vai pro `audit_log` (`acao='backup_export'`), incluindo
quem baixou, via qual método e quando. Se alguém tentar baixar backup sem
autorização, você vê.
