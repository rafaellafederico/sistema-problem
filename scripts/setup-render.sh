#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Guia de deploy: Render.com (backend) + Vercel (frontend) + Supabase (banco)
# Execute este script para validar o ambiente antes do deploy
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Saint Germain — Checklist de Deploy (Grátis)           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

PASS=0
FAIL=0

check() {
  if eval "$2" &>/dev/null; then
    echo "  ✅ $1"
    PASS=$((PASS+1))
  else
    echo "  ❌ $1 — $3"
    FAIL=$((FAIL+1))
  fi
}

echo "── Ferramentas ──────────────────────────────────────────────"
check "Node.js instalado"       "command -v node"   "instale em nodejs.org"
check "npm instalado"           "command -v npm"    "vem com Node.js"
check "Git instalado"           "command -v git"    "instale git"
check "Vercel CLI instalado"    "command -v vercel" "npm install -g vercel"

echo ""
echo "── Variáveis de ambiente (backend/.env) ─────────────────────"
if [ -f "backend/.env" ]; then
  check "SUPABASE_URL"          "grep -q 'SUPABASE_URL=https' backend/.env"       "configure no backend/.env"
  check "SUPABASE_SERVICE_KEY"  "grep -q 'SUPABASE_SERVICE_KEY=ey' backend/.env"  "configure no backend/.env"
  check "OPENAI_API_KEY"        "grep -q 'OPENAI_API_KEY=sk-' backend/.env"       "configure no backend/.env"
  check "RESEND_API_KEY"        "grep -q 'RESEND_API_KEY=re_' backend/.env"       "crie conta grátis em resend.com"
  check "ALERT_EMAIL"           "grep -q 'ALERT_EMAIL=.' backend/.env"            "configure seu email"
else
  echo "  ❌ backend/.env não encontrado — cp backend/.env.example backend/.env"
  FAIL=$((FAIL+3))
fi

echo ""
echo "── Variáveis de ambiente (frontend/.env.local) ──────────────"
if [ -f "frontend/.env.local" ]; then
  check "SUPABASE_URL (frontend)"    "grep -q 'NEXT_PUBLIC_SUPABASE_URL' frontend/.env.local"    "configure no frontend/.env.local"
  check "SUPABASE_ANON_KEY (frontend)" "grep -q 'NEXT_PUBLIC_SUPABASE_ANON_KEY' frontend/.env.local" "configure no frontend/.env.local"
  check "API_URL (frontend)"         "grep -q 'NEXT_PUBLIC_API_URL' frontend/.env.local"         "use a URL do Render após deploy"
else
  echo "  ❌ frontend/.env.local não encontrado — cp frontend/.env.example frontend/.env.local"
  FAIL=$((FAIL+2))
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "  Resultado: $PASS OK, $FAIL problemas"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "  🚀 Pronto para deploy! Próximos passos:"
  echo ""
  echo "  1. SUPABASE — rodar migração:"
  echo "     Acesse supabase.com → SQL Editor → cole supabase/migrations/001_initial_schema.sql"
  echo ""
  echo "  2. RENDER.COM — deploy do backend:"
  echo "     - Acesse render.com → New → Web Service"
  echo "     - Conecte o repositório GitHub"
  echo "     - Render detecta o render.yaml automaticamente"
  echo "     - Configure as variáveis de ambiente no painel"
  echo "     - Copie a URL gerada (ex: https://saint-germain-backend.onrender.com)"
  echo ""
  echo "  3. VERCEL — deploy do frontend:"
  echo "     cd frontend"
  echo "     vercel login"
  echo "     vercel --prod"
  echo "     (configure NEXT_PUBLIC_API_URL com a URL do Render)"
  echo ""
  echo "  4. RESEND — configurar domínio de email:"
  echo "     - Acesse resend.com → Domains → Add Domain"
  echo "     - Siga as instruções de DNS"
  echo "     - Ou use o domínio sandbox deles para testes"
else
  echo "  ⚠️  Resolva os problemas acima antes de fazer deploy."
fi
echo ""
