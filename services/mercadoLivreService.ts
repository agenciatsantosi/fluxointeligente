import api from './api';
import { MLSettings } from '../types';

export const testMLConnection = async (settings: MLSettings) => {
    try {
        const { data } = await api.post('/mercadolivre/test', {
            appId: settings.appId,
            clientSecret: settings.clientSecret,
            accessToken: settings.accessToken || undefined
        });
        if (!data.success) throw new Error(data.error || data.message || 'Erro na conexão com ML');
        // Cache the generated token if server returned it
        if (data.generatedToken) {
            localStorage.setItem('ml_accessToken', data.generatedToken);
        }
        return true;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.response?.data?.message || e.message || 'Falha na conexão com Mercado Livre');
    }
};

export const exchangeMLOAuthCode = async (code: string, appId: string, clientSecret: string, redirectUri: string) => {
    try {
        const { data } = await api.post('/mercadolivre/oauth-exchange', {
            code,
            appId,
            clientSecret,
            redirectUri
        });
        if (!data.success) throw new Error(data.error || 'Erro ao trocar código por token');
        return data;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha na autenticação OAuth com Mercado Livre');
    }
};

export const searchMLProducts = async (
    keyword: string,
    limit: number = 20,
    offset: number = 0,
    sort: string = 'relevance',
    credentials?: { appId?: string; clientSecret?: string; accessToken?: string; refreshToken?: string }
) => {
    try {
        const headers: Record<string, string> = {};
        if (credentials?.accessToken) {
            headers['x-ml-token'] = credentials.accessToken;
        }
        if (credentials?.appId) {
            headers['x-ml-appid'] = credentials.appId;
        }
        if (credentials?.clientSecret) {
            headers['x-ml-secret'] = credentials.clientSecret;
        }
        if (credentials?.refreshToken) {
            headers['x-ml-refresh-token'] = credentials.refreshToken;
        }

        const { data } = await api.get('/mercadolivre/search', {
            params: { q: keyword, limit, offset, sort },
            headers
        });

        if (data.error && !data.success) {
            throw new Error(data.message || data.error || 'Erro ao buscar produtos');
        }

        const products = data.results.map((item: any) => ({
            itemId: item.id,
            name: item.title,
            imageUrl: item.thumbnail_id
                ? `https://http2.mlstatic.com/D_NQ_NP_${item.thumbnail_id}-O.webp`
                : item.thumbnail.replace('I.jpg', 'O.jpg'),
            price: item.price,
            originalPrice: item.original_price,
            sales: item.sold_quantity || 0,
            offerLink: item.permalink,
            freeShipping: item.shipping?.free_shipping || false,
            logisticType: item.shipping?.logistic_type,
            condition: item.condition,
            seller: item.seller?.nickname || 'Mercado Livre'
        }));

        return { products, total: data.paging?.total || 0 };
    } catch (e: any) {
        console.error('Erro busca ML:', e);
        const responseData = e.response?.data;
        let errorMessage = e.message;
        
        if (responseData) {
            if (typeof responseData === 'object') {
                errorMessage = responseData.message || responseData.error || JSON.stringify(responseData);
                if (typeof errorMessage === 'object') {
                    errorMessage = errorMessage.message || errorMessage.error || JSON.stringify(errorMessage);
                }
            } else {
                errorMessage = responseData;
            }
        }
        
        if (errorMessage === 'forbidden' || errorMessage?.toLowerCase() === 'forbidden') {
            errorMessage = 'A busca anônima falhou (403 Forbidden). O Mercado Livre agora exige autenticação. Por favor, insira um Access Token (APP_USR-...) válido na aba de Configurações.';
        }
        
        throw new Error(errorMessage || 'Falha na conexão com Mercado Livre');
    }
};

export const generateMLAffiliateLink = (originalUrl: string, settings: MLSettings, campaignId?: string) => {
    const trackingId = settings.affiliateId || settings.appId;
    if (!trackingId || !originalUrl) return originalUrl;
    try {
        let urlString = originalUrl.trim();
        if (!urlString.startsWith('http')) {
            urlString = 'https://' + urlString;
        }
        const urlObj = new URL(urlString);
        // Append tracking parameters (af_id used as default tracking param for this integration)
        urlObj.searchParams.append('af_id', trackingId);
        if (campaignId) urlObj.searchParams.append('campaign_id', campaignId);
        return urlObj.toString();
    } catch (e) {
        return originalUrl;
    }
};

// --- MERCADO LIVRE BIO LINKS (VITRINE) ---
export const getMLBioLinks = async (keyword: string = '') => {
    try {
        const { data } = await api.get(`/mercadolivre/bio-links?keyword=${encodeURIComponent(keyword)}`);
        if (!data.success) throw new Error(data.error || 'Erro ao carregar links da vitrine');
        return data.links;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao buscar links da vitrine');
    }
};

export const addMLBioLink = async (payload: { productId: string; name: string; imageUrl: string; affiliateLink: string; category?: string }) => {
    try {
        const { data } = await api.post('/mercadolivre/bio-links', payload);
        if (!data.success) throw new Error(data.error || 'Erro ao adicionar link à vitrine');
        return data.link;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao adicionar link');
    }
};

export const deleteMLBioLink = async (id: number) => {
    try {
        const { data } = await api.delete(`/mercadolivre/bio-links/${id}`);
        if (!data.success) throw new Error(data.error || 'Erro ao remover link da vitrine');
        return true;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao deletar link');
    }
};

// --- MERCADO LIVRE BIO SETTINGS ---
export const getMLBioSettings = async () => {
    try {
        const { data } = await api.get('/mercadolivre/bio-settings');
        if (!data.success) throw new Error(data.error || 'Erro ao carregar configurações da vitrine');
        return data.settings;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao carregar configurações');
    }
};

export const saveMLBioSettings = async (settings: any) => {
    try {
        const { data } = await api.post('/mercadolivre/bio-settings', settings);
        if (!data.success) throw new Error(data.error || 'Erro ao salvar configurações da vitrine');
        return true;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao salvar configurações');
    }
};

// --- MERCADO LIVRE BIO STATS ---
export const getMLBioStats = async () => {
    try {
        const { data } = await api.get('/mercadolivre/bio-stats');
        if (!data.success) throw new Error(data.error || 'Erro ao carregar estatísticas');
        return data.stats;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao carregar estatísticas');
    }
};

// --- MERCADO LIVRE CATEGORIES ---
export const getMLCategories = async (onlyActive: boolean = false) => {
    try {
        const { data } = await api.get(`/mercadolivre/categories?onlyActive=${onlyActive}`);
        if (!data.success) throw new Error(data.error || 'Erro ao buscar categorias');
        return data.categories;
    } catch (e: any) {
        throw new Error(e.response?.data?.error || e.message || 'Falha ao buscar categorias');
    }
};
