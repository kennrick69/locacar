#!/bin/bash
# ============================================================
#  LocaCar - Setup Inicial do VPS Hostinger
#  Executar como root no VPS Ubuntu 22.04+
#  Uso: bash setup-vps.sh
# ============================================================

set -e
echo "=== LocaCar VPS Setup ==="

# 1) Atualiza sistema
echo "[1/8] Atualizando sistema..."
apt update && apt upgrade -y

# 2) Instala Node.js 20
echo "[2/8] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3) Instala PM2
echo "[3/8] Instalando PM2..."
npm install -g pm2

# 4) Instala PostgreSQL
echo "[4/8] Instalando PostgreSQL..."
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# 5) Cria banco e usuario
echo "[5/8] Configurando banco de dados..."
sudo -u postgres psql -c "CREATE USER locacar WITH PASSWORD 'TROCAR_SENHA_AQUI';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE locacar OWNER locacar;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE locacar TO locacar;" 2>/dev/null || true

# 6) Cria diretorio do projeto
echo "[6/8] Criando diretório do projeto..."
mkdir -p /opt/locacar/backend/uploads
mkdir -p /opt/locacar/backend/public

# 7) Instala Nginx (para HTTPS e proxy)
echo "[7/8] Instalando Nginx..."
apt install -y nginx
cat > /etc/nginx/sites-available/locacar << 'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        root /opt/locacar/backend/public;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/locacar /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 8) Firewall
echo "[8/8] Configurando firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "=== SETUP COMPLETO! ==="
echo ""
echo "Proximos passos:"
echo "  1. Edite /opt/locacar/backend/.env com suas credenciais"
echo "  2. Envie os arquivos com deploy.bat ou GitHub Actions"
echo "  3. Execute: cd /opt/locacar/backend && npm run migrate && npm run seed"
echo "  4. Inicie: pm2 start src/server.js --name locacar && pm2 save && pm2 startup"
echo "  5. Para HTTPS: apt install certbot python3-certbot-nginx && certbot --nginx -d seudominio.com"
echo ""
