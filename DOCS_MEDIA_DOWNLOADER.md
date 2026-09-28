# 📥 Guia Técnico: Media Downloader & Pipeline de Postagem (v2.1)

Este documento detalha o funcionamento interno do sistema de captura, download e postagem, servindo como manual de reparo para o Antigravity Kit.

---

## 🚀 1. O Fluxo de Trabalho (Workflow)

O processo segue 4 etapas críticas:
1. **Captura (Fetch)**: Extração da URL direta do vídeo/imagem.
2. **Download Local**: O arquivo é baixado para `uploads/downloads/` com nome único (`crypto.randomUUID`).
3. **Ponte de Mídia (Bridge)**: Upload para Catbox.moe (apenas se rodando localmente para o Instagram).
4. **Postagem (Publish)**: Envio para Meta Graph API ou WhatsApp.

---

## 🛠 2. Inteligência de Extração (fetchMediaInfo)

Para evitar os erros de "link cinza" ou "miniatura não encontrada", o sistema usa uma busca em 3 níveis:

### A. Hierarquia de Mídia (MP4)
O sistema não confia apenas no primeiro link que o `yt-dlp` entrega. Ele busca na seguinte ordem:
1. **requested_formats**: Links já combinados (vídeo + áudio) pelo motor de extração.
2. **formats (best mp4)**: Varre a lista de trás para frente buscando o formato `mp4` que tenha `vcodec` e `acodec` válidos.
3. **fallback**: Se não houver MP4 puro, ele pega o último formato disponível que não seja um "manifesto" (m3u8/mpd).

### B. Miniatura Elite (Thumbnails)
Para garantir que a capa do vídeo apareça:
- O sistema varre o array `thumbnails`.
- Ordena as imagens por **resolução (width)**.
- Descarta links que contenham "placeholder" (imagens cinzas genéricas do Facebook).
- Prioriza a maior imagem nítida disponível.

---

## 📥 3. Segurança no Download (downloadToLocal)

Esta é a parte mais crítica para evitar o erro **"The image format is not supported"**:

### O Problema do HTML-como-MP4
Se você tentar baixar o link da página (ex: `facebook.com/reel/...`) usando Axios direto, o sistema vai baixar o **código HTML** da página e salvar como `.mp4`. O Instagram vai tentar ler esse "vídeo" (que na verdade é texto) e dar erro de formato.

### A Solução (Safe-Check)
- **Bloqueio de Axios em Redes Sociais**: O sistema identifica links de IG, FB e TikTok e **proíbe** o download via Axios nesses domínios.
- **Forçamento de yt-dlp**: Para redes sociais, o sistema sempre usa o motor de extração profunda (`yt-dlp`), garantindo que o que chegue no disco seja um binário de vídeo real.
- **Validação de Tamanho**: Arquivos menores que 50KB são considerados "lixo" ou "erro" e o sistema aborta a postagem para proteger sua conta.

---

## 📤 4. Envio para Instagram (The "Video" Flag)

No Instagram Reels, o erro de formato de imagem geralmente ocorre por falta da etiqueta de tipo:
- **type: 'video'**: É obrigatório em todos os objetos de mídia extraídos. 
- Sem essa tag, o sistema pode tentar usar a função de postagem de fotos (`postPhoto`) para um arquivo de vídeo, o que causa rejeição imediata pela Meta.

---

## 📝 5. Sanitização de Legendas (Smart Captions)

O sistema agora processa as legendas antes de postar para garantir profissionalismo:
- **Remoção de Spam**: Frases como "Siga para descobrir seu novo filme favorito" são detectadas e removidas automaticamente.
- **Substituição de Mentions (@)**: Qualquer arroba (@) encontrado na legenda original (ex: `@original_creator`) é substituído pelo `@` da sua conta de destino (username do IG ou nome da página FB).
- **Remoção de Links**: Links externos indesejados (como Shopee) são removidos para evitar banimentos ou desvio de tráfego.

---

## 🌉 6. Dependências Críticas

- **yt-dlp**: Deve estar em `bin/yt-dlp.exe` ou no PATH global.
- **FFmpeg**: (Opcional) Usado para normalizar o codec para H.264. Se não estiver no PATH, o sistema usa o arquivo original para evitar corrupção por falha de comando.
- **Catbox**: Único bridge autorizado para rodar em localhost (Windows).

---

## ⚠️ 7. Guia de Reparo Rápido

| Sintoma | Causa Provável | Ação Corretiva |
| :--- | :--- | :--- |
| **Miniatura Cinza** | Thumb expirada ou placeholder | Refazer a análise; o sistema agora filtra placeholders. |
| **Image format not supported** | Download baixou HTML ou tag `type` ausente | Verifique se o link de origem é público e se a tag `type: 'video'` está no log. |
| **500 Internal Server Error** | Dependência ausente (ex: uuid) | Use funções nativas (`crypto.randomUUID`) em vez de pacotes npm externos. |

---
## 🎬 8. Pipeline de Originalidade do TikTok

Quando o TikTok restringe um vídeo com **"Conteúdo não original, de baixa qualidade"**, é porque o
arquivo foi enviado *exatamente como baixado*. Para evitar isso, todo vídeo publicado no TikTok passa
antes pelo **TikTok Originality Pipeline** (`processVideoForTikTok` em `services/videoService.js`),
chamado automaticamente por `prepareTikTokMedia()` dentro de `tiktok.publishVideo()` — ou seja, cobre
**postagem manual, quick-post e agendamentos** sem mudanças nos endpoints.

O que ele faz (em um único passo de FFmpeg):

1. **Reenquadra para 9:16 nativo** (`scale` + `crop` central): preenche a tela, sem barras pretas.
2. **Título + @handle sobrepostos**: primeira linha da legenda (sem hashtags) vira overlay no topo,
   com o @ da sua conta na parte inferior — tamanho de fonte calculado para caber em 1080px.
3. **Reencoding em qualidade TikTok**: H.264, CRF 19–22, AAC 160k, `yuv420p`, `faststart`.
4. **Variação sutil por post**: micro-crop 1–4%, brilho/contraste/saturação levemente aleatórios.
5. **Metadados de celular** (`injectMobileMetadata`): o arquivo passa a parecer gravado no aparelho.
6. **Trilha de áudio**: a mixagem de royalties (se habilitada) acontece antes e é preservada;
   vídeos sem faixa de áudio recebem uma trilha estéreo silenciosa (o TikTok rejeita arquivos sem áudio).

**Comportamento fail-safe:** se o FFmpeg não estiver no PATH, se a fonte não existir ou se qualquer
etapa falhar, o sistema registra o erro e publica o **arquivo original** — o processamento nunca derruba
uma postagem.

**Requisitos:** `ffmpeg`/`ffprobe` no PATH (já instalados em produção via `nixpacks.toml`/`Aptfile`).
A fonte usada nos textos é copiada automaticamente para `uploads/tiktok_font.ttf` (caminho relativo,
sem `:`, porque o filtro do FFmpeg não aceita letra de drive dentro de valor entre aspas).

**Desativar:** gravar `TIKTOK_ORIGINALIZE = 0` na tabela `system_config` (qualquer outro valor = ativo).

**Teste rápido:** `node test_tiktok_pipeline.js` (usa `test_input.mp4` e imprime resolução/áudio antes e depois).

---

*Documento atualizado em 05/05/2026 para Antigravity Kit - Proteção contra quebras de pipeline.*
