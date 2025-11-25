# 🚀 MeliFlow Auto Publisher

Sistema completo de automação para publicação de produtos em múltiplas plataformas sociais e marketplaces.

## 📋 Funcionalidades

### 🤖 Automações Disponíveis
- ✅ **WhatsApp** - Envio automático de produtos para grupos e contatos
- ✅ **Telegram** - Bot de automação para canais e grupos
- ✅ **Facebook** - Publicação automática em páginas
- ✅ **Instagram** - Upload em massa de vídeos (até 50 por vez)

### 📊 Recursos
- 📈 **Analytics** - Dashboard com estatísticas em tempo real
- 📅 **Agendamentos** - Programação de envios automáticos
- 🎯 **Afiliados Shopee** - Busca e importação de produtos
- 🤖 **IA Gemini** - Geração automática de legendas
- 📋 **Logs & Auditoria** - Histórico completo de ações

## 🛠️ Tecnologias

### Backend
- Node.js + Express
- SQLite (banco de dados)
- Baileys (WhatsApp Web API)
- Instagram Graph API
- Facebook Graph API
- Google Gemini API

### Frontend
- React + TypeScript
- Vite
- Tailwind CSS
- Lucide React (ícones)
- Recharts (gráficos)

## 📦 Instalação

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### Passos

1. **Clone o repositório**
```bash
git clone https://github.com/SEU_USUARIO/meliflow-auto-publisher.git
cd meliflow-auto-publisher
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
Crie um arquivo `.env` na raiz do projeto:
```env
# Gemini API
GEMINI_API_KEY=sua_chave_aqui

# Shopee Affiliate
SHOPEE_APP_ID=seu_app_id
SHOPEE_APP_SECRET=seu_app_secret

# Instagram Graph API
INSTAGRAM_ACCESS_TOKEN=seu_token
INSTAGRAM_ACCOUNT_ID=seu_account_id

# Facebook
FACEBOOK_ACCESS_TOKEN=seu_token
```

4. **Inicie o servidor**
```bash
npm run dev
```

5. **Acesse o sistema**
Abra o navegador em: `http://localhost:5173`

## 🎯 Como Usar

### WhatsApp Automation
1. Vá em "Automações" → "WhatsApp"
2. Escaneie o QR Code com seu WhatsApp
3. Configure grupos/contatos
4. Defina horários de agendamento
5. Ative a automação

### Instagram Upload em Massa
1. Vá em "Automações" → "Instagram"
2. Configure Access Token e Account ID
3. Faça upload de até 50 vídeos
4. Gere legendas com IA (opcional)
5. Agende ou publique imediatamente

### Telegram Bot
1. Vá em "Automações" → "Telegram"
2. Insira o Bot Token
3. Adicione grupos
4. Configure agendamentos
5. Ative a automação

## 📊 Estrutura do Projeto

```
meliflow---auto-publisher/
├── pages/              # Páginas React
├── components/         # Componentes reutilizáveis
├── services/           # Serviços backend
│   ├── whatsappService.js
│   ├── instagramGraphService.js
│   ├── facebookService.js
│   ├── telegramService.js
│   ├── geminiService.js
│   └── schedulerService.js
├── data/               # Dados e sessões
└── server.js           # Servidor Express
```

## 🔒 Segurança

- ⚠️ **Nunca** commite arquivos `.env`
- ⚠️ **Nunca** commite tokens de acesso
- ⚠️ Sessões do WhatsApp são locais
- ⚠️ Banco de dados SQLite é local

## 📝 Licença

Este projeto é privado e de uso pessoal.

## 🤝 Contribuindo

Este é um projeto pessoal. Não aceitamos contribuições externas no momento.

## 📧 Contato

Para dúvidas ou suporte, entre em contato com o desenvolvedor.

---

**Desenvolvido com ❤️ para automação de vendas**
