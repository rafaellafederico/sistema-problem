#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Conectar WhatsApp via Evolution API — gera QR Code no terminal
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Carregar variáveis do .env
if [ -f "/opt/saint-germain/.env" ]; then
  export $(grep -v '^#' /opt/saint-germain/.env | xargs)
elif [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

EVOLUTION_URL="http://localhost:8080"
INSTANCE="${EVOLUTION_INSTANCE_NAME:-saint-germain}"
API_KEY="${EVOLUTION_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "❌ EVOLUTION_API_KEY não configurado no .env"
  exit 1
fi

echo ""
echo "▶ Criando instância WhatsApp: $INSTANCE"
echo ""

# Criar instância
curl -s -X POST "$EVOLUTION_URL/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{
    \"instanceName\": \"$INSTANCE\",
    \"qrcode\": true,
    \"integration\": \"WHATSAPP-BAILEYS\"
  }" | python3 -m json.tool 2>/dev/null || true

echo ""
echo "▶ Obtendo QR Code..."
echo ""

# Aguardar instância subir
sleep 3

# Obter QR Code
QR_RESPONSE=$(curl -s -X GET "$EVOLUTION_URL/instance/connect/$INSTANCE" \
  -H "apikey: $API_KEY")

echo "$QR_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'base64' in data:
    print('QR Code gerado com sucesso!')
    print('Acesse para escanear:')
    print('http://localhost:8080/instance/qrcode/$INSTANCE/image')
elif 'code' in data:
    print('QR Code (texto):', data.get('code', 'N/A'))
else:
    print(json.dumps(data, indent=2))
" 2>/dev/null || echo "$QR_RESPONSE"

echo ""
echo "📱 Para escanear o QR Code:"
echo "   Acesse no navegador: http://$(curl -s ifconfig.me):8080/instance/qrcode/$INSTANCE/image"
echo ""
echo "   Ou use o painel Evolution API:"
echo "   http://$(curl -s ifconfig.me):8080/manager"
echo ""
echo "⏳ Aguardando conexão... (pressione Ctrl+C para sair)"
echo ""

# Polling de status
for i in $(seq 1 30); do
  sleep 5
  STATUS=$(curl -s -X GET "$EVOLUTION_URL/instance/connectionState/$INSTANCE" \
    -H "apikey: $API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('instance',{}).get('state','unknown'))" 2>/dev/null)

  echo "  Status: $STATUS"

  if [ "$STATUS" = "open" ]; then
    echo ""
    echo "✅ WhatsApp conectado com sucesso!"
    echo ""
    echo "▶ Obtendo ID dos grupos disponíveis..."
    curl -s -X GET "$EVOLUTION_URL/group/fetchAllGroups/$INSTANCE?getParticipants=false" \
      -H "apikey: $API_KEY" | python3 -c "
import sys, json
groups = json.load(sys.stdin)
if isinstance(groups, list):
    for g in groups[:10]:
        print(f\"  {g.get('id','?')}  →  {g.get('subject','?')}\")
else:
    print(json.dumps(groups, indent=2))
" 2>/dev/null || true
    echo ""
    echo "  Copie o ID do grupo desejado e coloque no .env:"
    echo "  WHATSAPP_GROUP_ID=ID_DO_GRUPO@g.us"
    break
  fi
done
