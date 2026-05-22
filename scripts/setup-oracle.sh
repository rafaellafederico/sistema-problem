#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Saint Germain — Setup Oracle Cloud VM
# Ubuntu 22.04 LTS — roda como root ou com sudo
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Saint Germain — Central Operacional Setup           ║"
echo "║                    Oracle Cloud VM                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Atualizar sistema ─────────────────────────────────────────────────────
echo "▶ Atualizando sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# ─── 2. Instalar dependências ─────────────────────────────────────────────────
echo "▶ Instalando dependências..."
apt-get install -y -qq \
  curl \
  git \
  ufw \
  htop \
  nano \
  ca-certificates \
  gnupg \
  lsb-release

# ─── 3. Instalar Docker ───────────────────────────────────────────────────────
echo "▶ Instalando Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker ubuntu 2>/dev/null || true
  usermod -aG docker $USER 2>/dev/null || true
fi

# ─── 4. Instalar Docker Compose ───────────────────────────────────────────────
echo "▶ Instalando Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

echo "  Docker version: $(docker --version)"
echo "  Compose version: $(docker-compose --version)"

# ─── 5. Configurar Firewall (UFW) ─────────────────────────────────────────────
echo "▶ Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # 22  — SSH
ufw allow 80/tcp       # 80  — Nginx (API + n8n + Evolution)
ufw allow 3001/tcp     # 3001 — Backend direto (opcional)
ufw allow 5678/tcp     # 5678 — n8n
ufw allow 8080/tcp     # 8080 — Evolution API
ufw --force enable
echo "  Firewall configurado."

# ─── 6. Configurar regras Oracle Cloud ───────────────────────────────────────
# Oracle Cloud tem um firewall interno (iptables) separado do UFW
echo "▶ Abrindo portas no iptables da Oracle..."
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5678 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
netfilter-persistent save 2>/dev/null || apt-get install -y iptables-persistent && netfilter-persistent save

# ─── 7. Clonar projeto ───────────────────────────────────────────────────────
echo "▶ Clonando projeto Saint Germain..."
if [ ! -d "/opt/saint-germain" ]; then
  git clone https://github.com/rafaellafederico/sistema-problem.git /opt/saint-germain
else
  echo "  Projeto já existe, atualizando..."
  cd /opt/saint-germain && git pull
fi
cd /opt/saint-germain

# ─── 8. Configurar .env ───────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠️  ATENÇÃO: Edite o arquivo .env com suas credenciais:"
  echo "     nano /opt/saint-germain/.env"
  echo ""
fi

# ─── 9. Criar diretório de dados ─────────────────────────────────────────────
mkdir -p /opt/saint-germain/data/n8n
mkdir -p /opt/saint-germain/data/evolution

# ─── 10. Build e start dos containers ────────────────────────────────────────
echo "▶ Iniciando containers..."
docker-compose pull
docker-compose build --no-cache
docker-compose up -d

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ Setup Concluído!                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Serviços rodando:"
echo ""
echo "  🟢 Backend API   → http://$(curl -s ifconfig.me):3001/health"
echo "  🟢 n8n           → http://$(curl -s ifconfig.me):5678"
echo "  🟢 Evolution API → http://$(curl -s ifconfig.me):8080"
echo ""
echo "  Próximos passos:"
echo "  1. Edite o .env:  nano /opt/saint-germain/.env"
echo "  2. Reinicie:      docker-compose restart"
echo "  3. Conecte WhatsApp via QR Code (veja scripts/connect-whatsapp.sh)"
echo "  4. Importe workflows n8n (veja docs/SETUP.md)"
echo ""
