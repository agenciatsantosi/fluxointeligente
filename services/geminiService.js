import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import { saveSystemConfig, getSystemConfig } from './database.js';

let genAI = null;
let apiKey = null;

/**
 * Initialize Gemini from database
 */
export async function initializeGemini() {
    try {
        const savedKey = await getSystemConfig('gemini_api_key');
        if (savedKey) {
            apiKey = savedKey;
            genAI = new GoogleGenerativeAI(savedKey);
            console.log('[GEMINI] Initialized from database');
            return true;
        }
    } catch (error) {
        console.error('[GEMINI] Initialization error:', error);
    }
    return false;
}

/**
 * Configure Gemini API
 */
export function configureGeminiAPI(key) {
    try {
        apiKey = key;
        genAI = new GoogleGenerativeAI(key);
        saveSystemConfig('gemini_api_key', key);
        return { success: true, message: 'API Gemini configurada com sucesso!' };
    } catch (error) {
        console.error('[GEMINI] Configuration error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if API is configured
 */
export function isConfigured() {
    return apiKey !== null && genAI !== null;
}

/**
 * Generate Instagram caption and hashtags
 */
export async function generateInstagramCaption(videoTitle = '', context = '') {
    if (!isConfigured()) {
        return {
            success: false,
            error: 'API Gemini não configurada. Configure a API Key primeiro.'
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Você é um especialista em marketing digital e Instagram. 
        
Crie uma descrição CRIATIVA e ENGAJADORA para um post no Instagram sobre:
${videoTitle || 'um produto/vídeo'}

${context ? `Contexto adicional: ${context}` : ''}

A descrição deve:
- Ser chamativa e usar emojis relevantes
- Ter entre 100-200 caracteres
- Incluir call-to-action
- Ser em português do Brasil

Depois da descrição, adicione uma linha em branco e liste 15-20 hashtags relevantes, separadas por espaço.

Formato de resposta:
[Descrição aqui]

[Hashtags aqui]`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return {
            success: true,
            caption: text.trim()
        };
    } catch (error) {
        console.error('[GEMINI] Generation error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Generate hashtags only
 */
export async function generateHashtags(topic) {
    if (!isConfigured()) {
        return {
            success: false,
            error: 'API Gemini não configurada'
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Gere 20 hashtags relevantes e populares para Instagram sobre: ${topic}

Regras:
- Hashtags em português do Brasil
- Mix de hashtags populares e específicas
- Sem espaços, apenas #
- Separadas por espaço

Exemplo: #moda #fashion #estilo #lookdodia`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return {
            success: true,
            hashtags: text.trim()
        };
    } catch (error) {
        console.error('[GEMINI] Hashtag generation error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Generate a conversational response for an AI Agent
 * @param {string} prompt - System instructions
 * @param {Array} history - Previous messages formatted for Gemini
 * @param {string} incomingMessage - New user message
 */
export async function generateAgentResponse(prompt, history, incomingMessage) {
    if (!isConfigured()) {
        throw new Error('API Gemini não configurada. Configure a API Key no Dashboard.');
    }

    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: prompt
        });

        const chat = model.startChat({
            history: history,
        });

        const result = await chat.sendMessage(incomingMessage);
        const response = await result.response;

        return {
            success: true,
            text: response.text()
        };
    } catch (error) {
        console.error('[GEMINI] Agent generate error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Generate an image using Gemini's native image generation.
 * Uses the @google/genai SDK with gemini-3.1-flash-image model.
 */
export async function generateImageWithGemini(prompt, userId = null) {
    try {
        // Resolve the API key: prefer user-specific, then system-wide
        let key = apiKey; // in-memory from last configureGeminiAPI call
        if (!key) {
            const { getUserConfig, getSystemConfig: getSC } = await import('./database.js');
            if (userId) key = await getUserConfig(userId, 'gemini_api_key');
            if (!key) key = await getSC('gemini_api_key');
        }

        if (!key) {
            return { success: false, error: 'API Gemini não configurada. Configure a API Key primeiro.' };
        }

        const ai = new GoogleGenAI({ apiKey: key });

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image',
            contents: prompt,
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
            },
        });

        // Find the image part in the response
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                // Return as base64 data URL so it can be used directly or uploaded
                const base64 = part.inlineData.data;
                const mimeType = part.inlineData.mimeType || 'image/png';
                return {
                    success: true,
                    imageDataUrl: `data:${mimeType};base64,${base64}`,
                    base64,
                    mimeType
                };
            }
        }

        return { success: false, error: 'Gemini não retornou imagem na resposta.' };
    } catch (error) {
        console.error('[GEMINI] Image generation error:', error);
        return { success: false, error: error.message };
    }
}

export default {
    configureGeminiAPI,
    initializeGemini,
    isConfigured,
    generateInstagramCaption,
    generateHashtags,
    generateAgentResponse,
    generateImageWithGemini
};
