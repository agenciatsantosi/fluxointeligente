
import { Product } from '../types';

// Endereço do seu Backend Node.js Local
const BACKEND_URL = '/api/proxy/global';

/**
 * Função genérica para chamar o Proxy ML
 */
const callMlProxy = async (endpoint: string, method: string = 'GET', data: any = null, accessToken: string = '') => {
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: 'ml',
                endpoint: endpoint,
                method: method,
                data: data,
                token: accessToken
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || 'Erro na API ML');
        return result;
    } catch (error: any) {
        // Se o backend não estiver rodando
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Erro de conexão: Verifique se o servidor backend (server.js) está rodando na porta 3001.');
        }
        throw error;
    }
};

export const validateToken = async (accessToken: string): Promise<any> => {
    return callMlProxy('/users/me', 'GET', null, accessToken);
};

export const predictCategory = async (title: string): Promise<string | null> => {
    try {
        const data = await callMlProxy(`/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(title)}`);
        return data && data.length > 0 ? data[0].category_id : null;
    } catch (error) {
        console.error("Erro ao predizer categoria", error);
        return null;
    }
};

export const publishItemToML = async (product: Product, accessToken: string): Promise<{ id: string, permalink: string }> => {
    const categoryId = await predictCategory(product.name);
    if (!categoryId) throw new Error("Não foi possível identificar a categoria automaticamente.");

    const payload = {
        title: product.name,
        category_id: categoryId,
        price: product.price,
        currency_id: 'BRL',
        available_quantity: product.stock,
        buying_mode: 'buy_it_now',
        condition: 'new',
        listing_type_id: 'gold_pro',
        description: { plain_text: product.description || "Produto Novo" },
        pictures: product.images.map(url => ({ source: url })),
        attributes: [
            { id: "BRAND", value_name: "Genérica" },
            { id: "MODEL", value_name: product.sku || "Padrão" }
        ]
    };

    const data = await callMlProxy('/items', 'POST', payload, accessToken);
    return { id: data.id, permalink: data.permalink };
};

export const fetchProductFromLink = async (linkOrId: string, accessToken?: string): Promise<Partial<Product>> => {
    let id = '';
    let isCatalog = false;

    const catalogMatch = linkOrId.match(/\/p\/(MLB\d+)/);
    if (catalogMatch) {
        id = catalogMatch[1];
        isCatalog = true;
    } else {
        const itemMatch = linkOrId.match(/(MLB-?\d+)/i);
        if (itemMatch) {
            id = itemMatch[1].replace('-', '');
            isCatalog = false;
        } else if (linkOrId.startsWith('MLB')) {
            id = linkOrId;
        } else {
            throw new Error("Link inválido.");
        }
    }

    const endpoint = isCatalog ? `/products/${id}` : `/items/${id}`;
    const data = await callMlProxy(endpoint, 'GET', null, accessToken || '');

    let description = '';
    if (!isCatalog) {
        try {
            const descData = await callMlProxy(`/items/${id}/description`, 'GET', null, accessToken || '');
            description = descData.plain_text || '';
        } catch (e) { }
    } else {
        description = data.short_description?.content || '';
    }

    const images = data.pictures ? data.pictures.map((p: any) => p.url) : [];
    const skuAttr = data.attributes?.find((a: any) => a.id === 'SELLER_SKU' || a.id === 'MODEL');
    const sku = skuAttr ? skuAttr.value_name : `IMP-${id.slice(-6)}`;

    return {
        name: data.name || data.title,
        description,
        price: data.price || 0,
        stock: data.initial_quantity || 1,
        images,
        sku,
        category: data.category_id || data.domain_id,
        weight: 0,
        height: 0,
        width: 0,
        length: 0,
    };
}
