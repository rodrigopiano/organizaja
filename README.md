# 📊 OrganizaJá
**Suas finanças, organizadas já.**

App de gestão financeira pessoal e PJ com IA para leitura de comprovantes.

## Funcionalidades
- 📷 Scan de comprovantes com IA (Anthropic Claude)
- 📊 Dashboard com método 50/30/20
- 🏢 Divisão de despesas PF/PJ
- 👫 Compartilhamento familiar
- 🔐 Login com e-mail ou Google

## Stack
- React + Vite
- Supabase (auth + banco de dados)
- Anthropic API (IA)

## Como rodar localmente

```bash
npm install
cp .env.example .env
# Preencha VITE_ANTHROPIC_API_KEY no .env
npm run dev
```

## Deploy (Vercel / Netlify)
Configure as variáveis de ambiente do `.env.example` no painel do serviço de deploy.
