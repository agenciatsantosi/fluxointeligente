# 🗺️ Roadmap de Desenvolvimento - FluxoInteligente V2.0

Este documento detalha o estado atual de cada página e serviço do sistema, indicando o que está pronto e o que ainda está em desenvolvimento.

## 🟢 100% Operacional (Pronto para Uso)
*Status: Testado e estável.*

### Automação & Core
- **WhatsApp Automation**: Conexão Baileys estável, sincronização de grupos e envio de mídia funcionando.
- **Telegram Automation**: Envio via Bot API 100% funcional com suporte a vídeo/imagem.
- **Schedules (Agendamentos)**: Motor de cron jobs estável, respeitando timezones e filas de execução.
- **Media Downloader**: Extração de vídeos (TikTok, Instagram, Kwai) via yt-dlp funcional.
- **Autenticação**: Login, Registro e Controle de Sessão.
- **Logs & Auditoria**: Rastreamento completo de ações do sistema.

---

## 🟡 Estável com Ajustes (Monitoramento Ativo)
*Status: Funcional, mas requer ajustes finos de UX ou filtros.*

### Integrações Shopee
- **Shopee Central / API**: Busca de produtos funcional.
- **Shopee Scraper**: **[EM AJUSTE]** Filtros de imagem recém-fortalecidos para barrar logos e propagandas (Hash & Ratio validation).
- **Filtros de Idioma**: Agora bloqueando títulos em inglês automaticamente.

### Redes Meta & Outras
- **Facebook Automation**: Postagem de Reels e Fotos ok. (UX: Melhorando feedback de "Processing" da Meta).
- **Instagram Automation**: Sincronizado via Graph API.
- **Public Vitrine**: Funcional com paginação e busca dinâmica por usuário.
- **Twitter (X)**: Postagem básica de texto e imagem operacional.

---

## 🟠 Em Desenvolvimento / Pendente
*Status: Funcionalidades incompletas ou em fase de arquitetura.*

### Módulos Avançados
- **Inbox Multicanal**: Centralização de mensagens de WhatsApp/Facebook (Complexidade alta de Webhooks).
- **Comment Automation**: Respostas automáticas em posts (Requer revisão de segurança da Meta).
- **Pinterest Automation**: Fluxo de pins em massa em fase de refinamento.
- **YouTube Automation**: Integração com Shorts ainda em fase de testes de API.
- **AI Agents**: Módulo de agentes inteligentes para criação de legendas (Em planejamento).

---

## 🛠️ Próximos Passos Imediatos
1. **Validação de Campo**: Confirmar se o novo filtro de "Hash & Ratio" do Shopee Scraper eliminou 100% dos logos de lojas.
2. **UX Meta**: Finalizar a melhoria visual do status de processamento de Reels no dashboard.
3. **Analytics**: Popular os gráficos da `AnalyticsPage.tsx` com dados reais das filas de execução.

---
*Atualizado em: 09/05/2026*
