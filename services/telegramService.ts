import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';

export interface TelegramConfig {
    botToken: string;
    groups: Array<{
        id: string;
        name: string;
        enabled: boolean;
    }>;
}

export interface TelegramPostData {
    productName: string;
    price: number;
    commission: number;
    affiliateLink: string;
    imagePath?: string;
    videoPath?: string;
}

let bot: TelegramBot | null = null;

/**
 * Inicializa o bot do Telegram
 */
export function initTelegramBot(token: string): TelegramBot {
    if (bot) {
        bot.stopPolling();
    }

    bot = new TelegramBot(token, { polling: false });
    return bot;
}

/**
 * Testa conexão com o bot
 */
export async function testTelegramConnection(token: string): Promise<{ success: boolean; botInfo?: any; error?: string }> {
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
    } catch (error: any) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Formata mensagem para Telegram
 */
function formatTelegramMessage(data: TelegramPostData): string {
    const commissionPercent = (data.commission / data.price * 100).toFixed(1);

    return `
🔥 *OFERTA IMPERDÍVEL!* 🔥

📦 ${data.productName}

💰 *Preço:* R$ ${data.price.toFixed(2)}
💵 *Sua Comissão:* R$ ${data.commission.toFixed(2)} (${commissionPercent}%)

🛒 *Compre agora:*
${data.affiliateLink}

⚡ Aproveite antes que acabe!
    `.trim();
}

/**
 * Posta produto em um grupo do Telegram
 */
export async function postToTelegramGroup(
    chatId: string,
    postData: TelegramPostData,
    botToken?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const activeBot = bot || (botToken ? new TelegramBot(botToken, { polling: false }) : null);

        if (!activeBot) {
            throw new Error('Bot não inicializado. Configure o token primeiro.');
        }

        const message = formatTelegramMessage(postData);

        // Se tiver vídeo, enviar vídeo com caption
        if (postData.videoPath && fs.existsSync(postData.videoPath)) {
            await activeBot.sendVideo(chatId, postData.videoPath, {
                caption: message,
                parse_mode: 'Markdown'
            });
        }
        // Se tiver imagem, enviar imagem com caption
        else if (postData.imagePath && fs.existsSync(postData.imagePath)) {
            await activeBot.sendPhoto(chatId, postData.imagePath, {
                caption: message,
                parse_mode: 'Markdown'
            });
        }
        // Caso contrário, enviar apenas texto
        else {
            await activeBot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error('Error posting to Telegram:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Posta em múltiplos grupos
 */
export async function postToMultipleGroups(
    groups: Array<{ id: string; enabled: boolean }>,
    postData: TelegramPostData,
    botToken?: string
): Promise<{ success: number; failed: number; errors: string[] }> {
    const enabledGroups = groups.filter(g => g.enabled);
    const results = {
        success: 0,
        failed: 0,
        errors: [] as string[]
    };

    for (const group of enabledGroups) {
        const result = await postToTelegramGroup(group.id, postData, botToken);

        if (result.success) {
            results.success++;
        } else {
            results.failed++;
            results.errors.push(`Grupo ${group.id}: ${result.error}`);
        }

        // Delay entre postagens para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
}

/**
 * Obtém informações sobre um chat/grupo
 */
export async function getChatInfo(chatId: string, botToken: string): Promise<any> {
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
