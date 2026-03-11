import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import * as analytics from './analyticsService.js';

// Telegram Service - Fixed Version
let bot = null;

function initTelegramBot(token) {
    if (bot) {
        bot.stopPolling();
    }
    bot = new TelegramBot(token, { polling: false });
    return bot;
}

async function testTelegramConnection(token) {
    try {
        const testBot = new TelegramBot(token, { polling: false });
        const botInfo = await testBot.getMe();
        testBot.stopPolling();
        return {
            success: true,
            botInfo: {
                id: botInfo.id,
                username: botInfo.username,
                firstName: botInfo.first_name
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function formatTelegramMessage(data, template) {
    // Se não houver template, retorna vazio
    if (!template) return '';

    // Se o template não tiver nenhuma tag (mensagens manuais), retorna o template original
    if (!template.includes('{')) return template;

    const commissionPercent = data && data.commission && data.price ? (data.commission / data.price * 100).toFixed(1) : '0';

    // Template padrão se nenhum for fornecido
    const defaultTemplate = `
🚨 *PROMOÇÃO NA SHOPEE AGORA*

{nome_produto}

🔴 *DE:* R$ {preco_original}
🟢 *SOMENTE HOJE:* R$ {preco_com_desconto}

⭐⭐⭐⭐⭐ (Bem Avaliado)

🛒 *Compre aqui:* 👇
{link}

⚠ *Esse BUG vai acabar em alguns minutos!*
    `.trim();

    const templateToUse = template || defaultTemplate;

    const price = data?.price || 0;
    // Estratégia de Marketing: 
    // Preço "DE" = Preço Real + 50% (Fake)
    // Preço "HOJE" = Preço Real
    const fakeOriginalPrice = price * 1.5;
    const realPrice = price;

    return templateToUse
        .replace(/{nome_produto}/g, data?.productName || '')
        .replace(/{preco_original}/g, fakeOriginalPrice.toFixed(2))
        .replace(/{preco_com_desconto}/g, realPrice.toFixed(2))
        .replace(/{comissao}/g, (data?.commission || 0).toFixed(2))
        .replace(/{taxa}/g, commissionPercent)
        .replace(/{link}/g, data?.affiliateLink || '')
        .replace(/{desconto}/g, '50') // Forçamos mostrar 50% de desconto
        .replace(/{avaliacao}/g, data?.rating ? data.rating.toFixed(1) : 'N/A');
}

async function postToTelegramGroup(chatId, postData, botToken, messageTemplate, mediaType = 'auto') {
    try {
        const activeBot = bot || (botToken ? new TelegramBot(botToken, { polling: false }) : null);
        if (!activeBot) {
            throw new Error('Bot não inicializado');
        }

        const message = formatTelegramMessage(postData, messageTemplate);

        // Lógica de Envio baseada no mediaType
        const shouldTryVideo = (mediaType === 'auto' || mediaType === 'video') && postData.videoUrl;
        const shouldTryImage = (mediaType === 'auto' || mediaType === 'image');

        if (shouldTryVideo) {
            try {
                console.log(`[TELEGRAM] Tentando enviar vídeo: ${postData.videoUrl}`);
                await activeBot.sendVideo(chatId, postData.videoUrl, {
                    caption: message,
                    parse_mode: 'Markdown'
                });
                return { success: true, type: 'video' };
            } catch (videoError) {
                console.warn('Erro ao enviar vídeo:', videoError.message);
                if (mediaType === 'video') {
                    console.warn(`[TELEGRAM] Pular envio: Falha ao enviar vídeo e modo estrito ativado.`);
                    return { success: false, error: 'Falha ao enviar vídeo' };
                }
            }
        }

        // Verificação estrita de "Apenas Vídeo" se não tinha URL
        if (mediaType === 'video' && !postData.videoUrl) {
            console.warn(`[TELEGRAM] Pular envio: Apenas Vídeo solicitado, mas produto sem vídeo.`);
            return { success: false, error: 'Vídeo não disponível (Ignorado)' };
        }

        // Fallback ou envio direto de imagem
        if (shouldTryImage || (mediaType === 'auto' && !postData.videoUrl)) {
            if (postData.imagePath) {
                try {
                    console.log(`[TELEGRAM] Tentando enviar imagem: ${postData.imagePath}`);
                    if (postData.imagePath.startsWith('http')) {
                        await activeBot.sendPhoto(chatId, postData.imagePath, {
                            caption: message,
                            parse_mode: 'Markdown'
                        });
                    } else if (fs.existsSync(postData.imagePath)) {
                        await activeBot.sendPhoto(chatId, postData.imagePath, {
                            caption: message,
                            parse_mode: 'Markdown'
                        });
                    } else {
                        console.warn(`[TELEGRAM] Imagem não encontrada: ${postData.imagePath}. Enviando apenas texto.`);
                        await activeBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                        return { success: true, type: 'text' };
                    }
                    console.log(`[TELEGRAM] Imagem enviada com sucesso para ${chatId}`);
                    return { success: true, type: 'image' };
                } catch (imgError) {
                    console.error('Erro ao enviar imagem:', imgError);
                    // Último recurso: texto
                    console.log(`[TELEGRAM] Fallback para texto após erro na imagem.`);
                    await activeBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                    return { success: true, type: 'text' };
                }
            } else {
                console.log(`[TELEGRAM] Sem imagem definida. Enviando apenas texto.`);
            }
        }

        // Se nada funcionou, envia texto
        console.log(`[TELEGRAM] Enviando mensagem de texto para ${chatId}`);
        await activeBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

        // Log success event
        await analytics.logEvent('telegram_send', {
            productId: postData.productId || postData.id,
            groupId: chatId,
            success: true
        });

        return { success: true, type: 'text' };

    } catch (error) {
        console.error('Error posting to Telegram:', error);

        // Log failure event
        await analytics.logEvent('telegram_send', {
            productId: postData?.productId || postData?.id,
            groupId: chatId,
            success: false,
            errorMessage: error.message
        });

        return { success: false, error: error.message };
    }
}

async function getChatInfo(chatId, botToken) {
    const testBot = new TelegramBot(botToken, { polling: false });
    try {
        const chat = await testBot.getChat(chatId);
        return {
            id: chat.id,
            title: chat.title || chat.first_name,
            type: chat.type
        };
    } finally {
        testBot.stopPolling();
    }
}

async function getBotGroups(botToken) {
    const testBot = new TelegramBot(botToken, { polling: false });
    try {
        // Obter atualizações recentes. Nota: O Telegram só retorna atualizações das últimas 24h.
        // Incluímos allowed_updates para garantir que recebemos eventos de membros e canais.
        const updates = await testBot.getUpdates({
            limit: 100,
            allowed_updates: ["message", "channel_post", "my_chat_member", "chat_member", "callback_query"]
        });

        const groupsMap = new Map();

        updates.forEach(update => {
            // Tenta extrair o chat de vários tipos de atualizações
            const chat = update.message?.chat ||
                update.my_chat_member?.chat ||
                update.channel_post?.chat ||
                update.callback_query?.message?.chat;

            if (chat && (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel')) {
                groupsMap.set(chat.id.toString(), {
                    id: chat.id.toString(),
                    name: chat.title || 'Chat sem nome',
                    type: chat.type
                });
            }
        });

        return Array.from(groupsMap.values());
    } catch (error) {
        console.error('Error getting bot groups:', error);
        throw error;
    } finally {
        testBot.stopPolling();
    }
}

export {
    initTelegramBot,
    testTelegramConnection,
    postToTelegramGroup,
    getChatInfo,
    getBotGroups
};
