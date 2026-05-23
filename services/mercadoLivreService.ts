import { MLSettings } from '../types';

const ML_API_BASE = 'https://api.mercadolibre.com';
const BACKEND_BASE = '/api/mercadolivre';

export const testMLConnection = async (settings: MLSettings) => {
    try {
        const response = await fetch(`${BACKEND_BASE}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Erro na conexão com ML');
        return true;
    } catch (e: any) {
        throw new Error(e.message || 'Falha na conexão com Mercado Livre');
    }
};

export const searchMLProducts = async (
    keyword: string,
    limit: number = 20,
    offset: number = 0,
    sort: string = 'relevance'
) => {
    try {
        const params = new URLSearchParams({
            q: keyword,
            limit: limit.toString(),
            offset: offset.toString(),
            sort: sort
        });
        
        const response = await fetch(`${BACKEND_BASE}/search?${params.toString()}`);
        const data = await response.json();
        
        if (!data.success) throw new Error(data.message || 'Erro ao buscar produtos');
        
        // Formatar resultados para o padrão do frontend
        const products = data.results.map((item: any) => {
            // ML returns secure thumbnail, let's get a better image if possible
            let imageUrl = item.thumbnail.replace('I.jpg', 'O.jpg');
            
            return {
                itemId: item.id,
                name: item.title,
                imageUrl: imageUrl,
                price: item.price,
                originalPrice: item.original_price,
                sales: item.sold_quantity || 0,
                offerLink: item.permalink,
                freeShipping: item.shipping?.free_shipping || false,
                logisticType: item.shipping?.logistic_type,
                condition: item.condition,
                seller: item.seller?.nickname || 'Mercado Livre'
            };
        });

        return { products, total: data.paging?.total || 0 };
    } catch (e: any) {
        console.error("Erro busca ML:", e);
        throw e;
    }
};

export const generateMLAffiliateLink = (originalUrl: string, settings: MLSettings, campaignId?: string) => {
    // Para afiliados do ML (Programa de Afiliados), o padrão de link geralmente
    // não tem API pública geradora, mas usa parametros na URL ou link do afiliado.
    // Aqui fazemos um mock ou estrutura se ele tiver ID
    if (!settings.appId) return originalUrl;
    
    try {
        const urlObj = new URL(originalUrl);
        // Exemplo fictício de inserção de ID (já que ML tem programa interno)
        urlObj.searchParams.append('af_id', settings.appId);
        if (campaignId) urlObj.searchParams.append('campaign_id', campaignId);
        return urlObj.toString();
    } catch (e) {
        return originalUrl;
    }
};
