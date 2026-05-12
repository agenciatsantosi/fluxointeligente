import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import * as analytics from './analyticsService.js';

// Telegram Service - Fixed Version
let bot = null;
const botCache = new Map();

function getBotInstance(token) {
    if (!token) return bot;
    if (botCache.has(token)) {
        return botCache.get(token);
    }
    const newBot = new TelegramBot(token, { polling: false });
    botCache.set(token, newBot);
    return newBot;
}

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
    // Template padrão se nenhum for fornecido ou se estiver vazio
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

    const templateToUse = template && template.trim() !== '' ? template : defaultTemplate;

    // Se o template não tiver nenhuma tag (mensagens manuais), retorna o template original
    if (!templateToUse.includes('{')) return templateToUse;

    const commissionPercent = data && data.commission && data.price ? (data.commission / data.price * 100).toFixed(1) : '0';

    const price = data?.price || 0;
    // Estratégia de Marketing: 
    // Preço "DE" = Preço Real + 50% (Fake)
    // Preço "HOJE" = Preço Real
    const fakeOriginalPrice = price * 1.5;
    const realPrice = price;

    // Escape HTML characters to avoid parsing errors
    const escapeHTML = (str) => str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);

    const productName = escapeHTML(data?.productName || '');

    return templateToUse
        .replace(/{nome_produto}|{product_name}/g, productName)
        .replace(/{preco_original}/g, fakeOriginalPrice.toFixed(2))
        .replace(/{preco_com_desconto}|{price}|{valor}/g, realPrice.toFixed(2))
        .replace(/{comissao}/g, (data?.commission || 0).toFixed(2))
        .replace(/{taxa}|{tags}/g, commissionPercent)
        .replace(/{link}|{product_link}|{link_shopee}/g, data?.affiliateLink || '')
        .replace(/{desconto}/g, '50') // Forçamos mostrar 50% de desconto
        .replace(/{avaliacao}/g, data?.rating ? data.rating.toFixed(1) : 'N/A');
}

async function postToTelegramGroup(chatId, postData, botToken, messageTemplate, mediaType = 'auto') {
    try {
        // Always prioritize the provided botToken to avoid using a system-wide bot for a specific user
        if (!botToken && !bot) {
            console.error('[TELEGRAM] Erro: Nenhum token de bot fornecido e o bot global não está configurado.');
            return { success: false, error: 'Token do bot não configurado' };
        }

        const activeBot = getBotInstance(botToken);
        
        if (botToken) {
            console.log(`[TELEGRAM] Usando bot (@${botToken.substring(0, 5)}...) para o grupo ${chatId}`);
        }
        
        if (!activeBot) {
            throw new Error('Bot não inicializado (Token ausente)');
        }

        const message = formatTelegramMessage(postData, messageTemplate);

        // Lógica de Envio baseada no mediaType
        // Lógica de Envio: Prioridade Vídeo -> Imagem
        const hasVideo = !!postData.videoUrl;
        const hasImage = !!postData.imagePath;

        const shouldTryVideo = hasVideo && mediaType !== 'image';
        const shouldTryImage = hasImage && mediaType !== 'video'; // Só tenta imagem se não for 'video-only'

        if (shouldTryVideo) {
            try {
                let messageObj;
                const videoPathOrUrl = postData.videoUrl;

                if (videoPathOrUrl.startsWith('http')) {
                    const isLocal = videoPathOrUrl.includes('127.0.0.1') || videoPathOrUrl.includes('localhost');
                    if (isLocal) {
                        console.log(`[TELEGRAM] Local Video URL detected: ${videoPathOrUrl}. Converting to filesystem path...`);
                        const uploadsIdx = videoPathOrUrl.indexOf('/uploads/');
                        if (uploadsIdx !== -1) {
                            const relPath = videoPathOrUrl.substring(uploadsIdx);
                            const absPath = path.join(process.cwd(), relPath);
                            if (fs.existsSync(absPath)) {
                                console.log(`[TELEGRAM] Resolved video to: ${absPath}`);
                                messageObj = await activeBot.sendVideo(chatId, fs.createReadStream(absPath), {
                                    caption: message,
                                    parse_mode: 'HTML'
                                });
                            } else {
                                // Try relative to public or root
                                let finalAbsPath = absPath;
                                if (!fs.existsSync(finalAbsPath)) {
                                    finalAbsPath = path.join(process.cwd(), 'public', relPath);
                                }
                                
                                if (fs.existsSync(finalAbsPath)) {
                                    console.log(`[TELEGRAM] Resolved video to (public): ${finalAbsPath}`);
                                    messageObj = await activeBot.sendVideo(chatId, fs.createReadStream(finalAbsPath), {
                                        caption: message,
                                        parse_mode: 'HTML'
                                    });
                                } else {
                                    throw new Error(`Video file not found at: ${absPath} or ${finalAbsPath}`);
                                }
                            }
                        } else {
                            // Check for /shopee-media/
                            const shopeeIdx = videoPathOrUrl.indexOf('/shopee-media/');
                            if (shopeeIdx !== -1) {
                                const relPath = videoPathOrUrl.substring(shopeeIdx);
                                const absPath = path.join(process.cwd(), 'public', relPath);
                                if (fs.existsSync(absPath)) {
                                    console.log(`[TELEGRAM] Resolved Shopee video to: ${absPath}`);
                                    messageObj = await activeBot.sendVideo(chatId, fs.createReadStream(absPath), {
                                        caption: message,
                                        parse_mode: 'HTML'
                                    });
                                } else {
                                    throw new Error(`Shopee video file not found at: ${absPath}`);
                                }
                            } else {
                                throw new Error('Local Video URL detected but cannot determine file path');
                            }
                        }
                    } else {
                        // Public URL
                        console.log(`[TELEGRAM] Sending video from public URL: ${videoPathOrUrl}`);
                        messageObj = await activeBot.sendVideo(chatId, videoPathOrUrl, {
                            caption: message,
                            parse_mode: 'HTML'
                        });
                    }
                } else if (fs.existsSync(videoPathOrUrl)) {
                    console.log(`[TELEGRAM] Sending video from local path: ${videoPathOrUrl}`);
                    messageObj = await activeBot.sendVideo(chatId, fs.createReadStream(videoPathOrUrl), {
                        caption: message,
                        parse_mode: 'HTML'
                    });
                } else {
                    // Try adding public if it starts with /shopee-media
                    if (videoPathOrUrl.startsWith('/shopee-media')) {
                        const absPath = path.join(process.cwd(), 'public', videoPathOrUrl);
                        if (fs.existsSync(absPath)) {
                            messageObj = await activeBot.sendVideo(chatId, fs.createReadStream(absPath), {
                                caption: message,
                                parse_mode: 'HTML'
                            });
                        } else {
                            throw new Error(`Video not found: ${videoPathOrUrl}`);
                        }
                    } else {
                        throw new Error(`Video not found: ${videoPathOrUrl}`);
                    }
                }
                
                // Get file URL for bridge purposes
                const fileInfo = await activeBot.getFile(messageObj.video.file_id);
                const fileUrl = `https://api.telegram.org/file/bot${botToken || activeBot.token}/${fileInfo.file_path}`;

                console.log(`[TELEGRAM] Vídeo enviado com sucesso para ${chatId}`);
                return { success: true, type: 'video', fileUrl, messageId: messageObj.message_id };
            } catch (videoError) {
                console.warn('Erro ao enviar vídeo:', videoError.message);
                
                // Handle group->supergroup migration for video
                if (videoError.message && videoError.message.includes('upgraded to a supergroup')) {
                    const newChatId = videoError.response?.body?.parameters?.migrate_to_chat_id 
                        || videoError.response?.parameters?.migrate_to_chat_id;
                    
                    if (newChatId) {
                        const newChatIdStr = newChatId.toString();
                        console.log(`[TELEGRAM] ⚡ Vídeo: Grupo migrado! Novo ID: ${newChatIdStr}. Reenviando...`);
                        try {
                            const videoPathOrUrl = postData.videoUrl || postData.videoPath;
                            let retryMsg;
                            if (videoPathOrUrl.startsWith('http')) {
                                retryMsg = await activeBot.sendVideo(newChatIdStr, videoPathOrUrl, { caption: message, parse_mode: 'HTML' });
                            } else {
                                const stream = fs.createReadStream(videoPathOrUrl);
                                retryMsg = await activeBot.sendVideo(newChatIdStr, stream, { caption: message, parse_mode: 'HTML' });
                            }
                            console.log(`[TELEGRAM] ✅ Vídeo enviado no supergrupo ${newChatIdStr}`);
                            return { success: true, type: 'video', messageId: retryMsg.message_id, newChatId: newChatIdStr };
                        } catch (e) {
                            console.error(`[TELEGRAM] Falha no retry de vídeo:`, e.message);
                        }
                    }
                }

                // Fallback automático para imagem permitido apenas se mediaType não for estritamente vídeo
                if (mediaType === 'video') {
                    console.warn(`[TELEGRAM] Falha no vídeo e modo 'Apenas Vídeo' ativo. Abortando envio.`);
                    return { success: false, error: 'Falha ao enviar vídeo (Modo estrito)' };
                }
                console.warn(`[TELEGRAM] Tentando fallback para imagem após falha no vídeo.`);
            }
        }

        // Verificação estrita de "Apenas Vídeo" se não tinha URL
        if (mediaType === 'video' && !postData.videoUrl) {
            console.warn(`[TELEGRAM] Pular envio: Apenas Vídeo solicitado, mas produto sem vídeo.`);
            return { success: false, error: 'Vídeo não disponível (Ignorado)' };
        }

        // Fallback ou envio direto de imagem
        if (shouldTryImage) {
            if (postData.imagePath) {
                try {
                    let messageObj;
                    let pathOrUrl = postData.imagePath;
                    
                    // Garantir que URLs tenham protocolo
                    if (typeof pathOrUrl === 'string' && pathOrUrl.startsWith('//')) {
                        pathOrUrl = 'https:' + pathOrUrl;
                    }

                    if (typeof pathOrUrl === 'string' && pathOrUrl.startsWith('http')) {
                        // Check if it's a local URL (127.0.0.1 or localhost)
                        const isLocal = pathOrUrl.includes('127.0.0.1') || pathOrUrl.includes('localhost');
                        
                        if (isLocal) {
                            console.log(`[TELEGRAM] Local URL detected: ${pathOrUrl}. Converting to filesystem path...`);
                            // Try to resolve relative to process.cwd() if it contains /uploads/ or /shopee-media/
                            const uploadsIdx = pathOrUrl.indexOf('/uploads/');
                            const shopeeIdx = pathOrUrl.indexOf('/shopee-media/');
                            const mediaIdx = uploadsIdx !== -1 ? uploadsIdx : shopeeIdx;

                            if (mediaIdx !== -1) {
                                const relPath = pathOrUrl.substring(mediaIdx);
                                let absPath = path.join(process.cwd(), relPath);
                                
                                // Tenta em várias pastas comuns
                                if (!fs.existsSync(absPath)) absPath = path.join(process.cwd(), 'public', relPath);
                                
                                if (fs.existsSync(absPath)) {
                                    console.log(`[TELEGRAM] Resolved photo to: ${absPath}`);
                                    messageObj = await activeBot.sendPhoto(chatId, fs.createReadStream(absPath), {
                                        caption: message,
                                        parse_mode: 'HTML'
                                    });
                                } else {
                                    throw new Error(`Photo file not found locally: ${relPath}`);
                                }
                            } else {
                                throw new Error('Local URL detected but cannot determine media folder');
                            }
                        } else {
                            // Public URL, let Telegram fetch it
                            messageObj = await activeBot.sendPhoto(chatId, pathOrUrl, {
                                caption: message,
                                parse_mode: 'HTML'
                            });
                        }
                    } else if (pathOrUrl && fs.existsSync(pathOrUrl)) {
                        console.log(`[TELEGRAM] Absolute Path detected: ${pathOrUrl}. Sending as stream...`);
                        messageObj = await activeBot.sendPhoto(chatId, fs.createReadStream(pathOrUrl), {
                            caption: message,
                            parse_mode: 'HTML'
                        });
                    } else if (pathOrUrl && pathOrUrl.startsWith('/shopee-media')) {
                        // Relative path from root/public
                        let absPath = path.join(process.cwd(), pathOrUrl);
                        if (!fs.existsSync(absPath)) absPath = path.join(process.cwd(), 'public', pathOrUrl);
                        
                        if (fs.existsSync(absPath)) {
                            messageObj = await activeBot.sendPhoto(chatId, fs.createReadStream(absPath), {
                                caption: message,
                                parse_mode: 'HTML'
                            });
                        } else {
                            throw new Error(`Relative photo not found: ${pathOrUrl}`);
                        }
                    } else {
                        throw new Error(`Image path/URL invalid or not found: ${pathOrUrl}`);
                    }
                    
                    // Get file URL for bridge purposes
                    const fileId = messageObj.photo[messageObj.photo.length - 1].file_id;
                    const fileInfo = await activeBot.getFile(fileId);
                    const fileUrl = `https://api.telegram.org/file/bot${botToken || activeBot.token}/${fileInfo.file_path}`;

                    console.log(`[TELEGRAM] Imagem enviada com sucesso para ${chatId}`);
                    return { success: true, type: 'image', fileUrl, messageId: messageObj.message_id };
                } catch (error) {
                    const tokenPreview = botToken ? botToken.substring(0, 10) : (activeBot.token ? activeBot.token.substring(0, 10) : 'NULL');
                    console.error(`[TELEGRAM] Erro ao enviar imagem para ${chatId} (Token: ${tokenPreview}...):`, error.message);
                    
                    // Handle group->supergroup migration: get new chat ID and retry
                    if (error.message && error.message.includes('upgraded to a supergroup')) {
                        const newChatId = error.response?.body?.parameters?.migrate_to_chat_id 
                            || error.response?.parameters?.migrate_to_chat_id
                            || error.body?.parameters?.migrate_to_chat_id
                            || (error.response?.body?.description && error.response.body.description.match(/-?\d+/)?.[0]);
                        
                        if (newChatId) {
                            const newChatIdStr = newChatId.toString();
                            console.log(`[TELEGRAM] ⚡ Grupo migrado! Novo ID: ${newChatIdStr}. Reenviando...`);
                            
                            try {
                                let retryMsg;
                                const pathOrUrl = postData.imagePath || postData.videoPath || postData.videoUrl;
                                
                                if (pathOrUrl && (postData.videoUrl || postData.videoPath)) {
                                    // Retry as video
                                    if (pathOrUrl.startsWith('http')) {
                                        retryMsg = await activeBot.sendVideo(newChatIdStr, pathOrUrl, { caption: message, parse_mode: 'HTML' });
                                    } else {
                                        retryMsg = await activeBot.sendVideo(newChatIdStr, fs.createReadStream(pathOrUrl), { caption: message, parse_mode: 'HTML' });
                                    }
                                } else if (pathOrUrl) {
                                    // Retry as photo
                                    if (pathOrUrl.startsWith('http') && !pathOrUrl.includes('localhost')) {
                                        retryMsg = await activeBot.sendPhoto(newChatIdStr, pathOrUrl, { caption: message, parse_mode: 'HTML' });
                                    } else {
                                        retryMsg = await activeBot.sendPhoto(newChatIdStr, fs.createReadStream(pathOrUrl), { caption: message, parse_mode: 'HTML' });
                                    }
                                } else {
                                    retryMsg = await activeBot.sendMessage(newChatIdStr, message, { parse_mode: 'HTML' });
                                }
                                
                                console.log(`[TELEGRAM] ✅ Enviado com sucesso para novo supergrupo ${newChatIdStr}`);
                                return { success: true, type: pathOrUrl ? 'media' : 'text', messageId: retryMsg.message_id, newChatId: newChatIdStr };
                            } catch (retryErr) {
                                console.error(`[TELEGRAM] Retry no supergrupo também falhou:`, retryErr.message);
                                return { success: false, error: `Retry falhou: ${retryErr.message}`, newChatId: newChatIdStr };
                            }
                        }
                    }

                    if (error.message.includes('404')) {
                        console.error('[TELEGRAM] ⚠️ ERRO 404 detectado! Isso indica que o token do bot ou o método da API estão incorretos.');
                    }

                    // Fallback: try text-only
                    try {
                        console.log(`[TELEGRAM] Tentando fallback apenas texto para ${chatId}...`);
                        await activeBot.sendMessage(chatId, message, { parse_mode: 'HTML' });
                        return { success: true, message: 'Fallback: Texto enviado' };
                    } catch (fallbackError) {
                        // Check if fallback also hit supergroup migration
                        if (fallbackError.message && fallbackError.message.includes('upgraded to a supergroup')) {
                            const newChatId = fallbackError.response?.body?.parameters?.migrate_to_chat_id;
                            if (newChatId) {
                                console.log(`[TELEGRAM] ⚡ Fallback: Novo supergrupo ID: ${newChatId}. Enviando texto...`);
                                try {
                                    await activeBot.sendMessage(newChatId.toString(), message, { parse_mode: 'Markdown' });
                                    return { success: true, message: 'Fallback texto no supergrupo', newChatId: newChatId.toString() };
                                } catch (e) {}
                            }
                            return { success: false, error: 'Grupo migrado para supergrupo. Atualize o ID nas configurações do agendamento.' };
                        }
                        console.error('[TELEGRAM] Erro no fallback de texto:', fallbackError.message);
                        return { success: false, error: 'Falha ao enviar imagem e fallback' };
                    }
                }
            } else {
                console.log(`[TELEGRAM] Sem imagem definida. Enviando apenas texto.`);
            }
        }

        // Se nada funcionou, envia texto
        try {
            console.log(`[TELEGRAM] Enviando mensagem de texto final para ${chatId}`);
            const txtMsg = await activeBot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            return { success: true, type: 'text', messageId: txtMsg.message_id };
        } catch (finalError) {
            if (finalError.message && finalError.message.includes('upgraded to a supergroup')) {
                const newChatId = finalError.response?.body?.parameters?.migrate_to_chat_id 
                    || finalError.response?.parameters?.migrate_to_chat_id;
                
                if (newChatId) {
                    const newChatIdStr = newChatId.toString();
                    console.log(`[TELEGRAM] ⚡ Texto: Grupo migrado! Novo ID: ${newChatIdStr}. Reenviando...`);
                    try {
                        const retryMsg = await activeBot.sendMessage(newChatIdStr, message, { parse_mode: 'Markdown' });
                        console.log(`[TELEGRAM] ✅ Texto enviado no supergrupo ${newChatIdStr}`);
                        return { success: true, type: 'text', messageId: retryMsg.message_id, newChatId: newChatIdStr };
                    } catch (e) {}
                }
            }
            throw finalError;
        }

    } catch (error) {
        console.error('Error posting to Telegram:', error.message);

        // Log failure event
        try {
            await analytics.logEvent('telegram_send', {
                productId: postData?.productId || postData?.id,
                groupId: chatId,
                success: false,
                errorMessage: error.message
            });
        } catch (e) {}

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
        const updates = await testBot.getUpdates({
            limit: 100,
            allowed_updates: ["message", "channel_post", "my_chat_member", "chat_member", "callback_query"]
        });

        const groupsMap = new Map();

        updates.forEach(update => {
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

/**
 * Uploads a file (video or image) to Telegram to be used as a bridge for Meta API
 * @returns {Promise<{fileUrl: string, messageId: number}>}
 */
async function uploadToTelegramBridge(botToken, chatId, filePath) {
    const bridgeBot = new TelegramBot(botToken, { polling: false });
    try {
        const isVideo = /mp4|mov|avi/i.test(filePath);
        console.log(`[TELEGRAM BRIDGE] Enviando ${isVideo ? 'vídeo' : 'imagem'} para o bridge (Chat ID: ${chatId})...`);
        
        let message;
        let mediaSource = filePath;

        // Se o filePath for um caminho local, use stream
        if (!filePath.startsWith('http') && fs.existsSync(filePath)) {
            console.log(`[TELEGRAM BRIDGE] Local file detected, using stream: ${filePath}`);
            mediaSource = fs.createReadStream(filePath);
        }

        if (isVideo) {
            message = await bridgeBot.sendVideo(chatId, mediaSource);
        } else {
            message = await bridgeBot.sendPhoto(chatId, mediaSource);
        }

        const fileId = isVideo ? message.video.file_id : message.photo[message.photo.length - 1].file_id;
        const messageId = message.message_id;

        console.log(`[TELEGRAM BRIDGE] Mídia enviada. FileID: ${fileId}. Obtendo path...`);
        const fileInfo = await bridgeBot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;

        return { fileUrl, filePath: fileInfo.file_path, messageId };
    } catch (error) {
        console.error('[TELEGRAM BRIDGE] Erro no upload bridge:', error.message);
        if (error.message.includes('EFATAL')) {
            console.error('[TELEGRAM BRIDGE] EFATAL is usually a network connectivity issue (DNS or Timeout) connecting to api.telegram.org. Check the VPS or local network.');
        }
        throw error;
    }
}

/**
 * Deletes a message from Telegram (cleanup)
 */
async function deleteTelegramMessage(botToken, chatId, messageId) {
    const bridgeBot = new TelegramBot(botToken, { polling: false });
    try {
        await bridgeBot.deleteMessage(chatId, messageId);
        console.log(`[TELEGRAM BRIDGE] Mensagem ${messageId} removida do bridge.`);
        return { success: true };
    } catch (error) {
        console.warn(`[TELEGRAM BRIDGE] Falha ao remover mensagem ${messageId}:`, error.message);
        return { success: false };
    }
}

export {
    initTelegramBot,
    testTelegramConnection,
    postToTelegramGroup,
    getChatInfo,
    getBotGroups,
    uploadToTelegramBridge,
    deleteTelegramMessage
};
