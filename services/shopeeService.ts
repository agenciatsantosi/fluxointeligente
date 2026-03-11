
import { Product, ShopeeSettings, ShopeeAffiliateSettings, ShopeeAffiliateOrder, ShopeeAffiliateProduct, ShopeeShopOffer, ShopeeSortType } from '../types';

const BACKEND_BASE = '/api/proxy/global';

/**
 * Gera URL de Auth chamando o backend (que possui o segredo para assinar)
 */
export const generateShopeeAuthUrl = async (partnerId: number, partnerKey: string): Promise<string> => {
    try {
        const response = await fetch(BACKEND_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: 'shopee_auth_link', partnerId, partnerKey })
        });
        const data = await response.json();
        return data.url;
    } catch (e) {
        console.error(e);
        return '#error-generating-link';
    }
}

/**
 * Publica item na Shopee via Backend Proxy
 */
export const publishItemToShopee = async (product: Product, settings: ShopeeSettings): Promise<number> => {
    if (!settings.accessToken || !settings.shopId) throw new Error("Configurações incompletas.");

    const payload = {
        original_price: product.price,
        item_name: product.name.substring(0, 120),
        description: product.description || "Produto",
        item_status: "NORMAL",
        quantity: product.stock,
        weight: product.weight > 0 ? product.weight : 0.5,
        dimension: {
            package_height: product.height || 10,
            package_length: product.length || 10,
            package_width: product.width || 10
        },
        logistic_info: [{ logistic_id: 80004, enabled: true }],
        image: { image_id_list: [] },
        category_id: 10001,
        item_sku: product.sku
    };

    const response = await fetch(BACKEND_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target: 'shopee_seller',
            path: '/product/add_item',
            body: payload,
            partnerId: settings.partnerId,
            partnerKey: settings.partnerKey,
            shopId: settings.shopId,
            accessToken: settings.accessToken
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(`Shopee Error: ${data.message || data.error}`);
    return data.response.item_id;
};

/**
 * Helper para chamar API Affiliate via Proxy GraphQL
 */
const callAffiliateProxy = async (query: string, settings: ShopeeAffiliateSettings) => {
    if (!settings.appId || !settings.password) throw new Error("Credenciais de Afiliado faltando.");

    const response = await fetch(BACKEND_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target: 'shopee_affiliate',
            query,
            appId: settings.appId,
            password: settings.password
        })
    });

    const result = await response.json();

    // Se o backend não estiver rodando
    if (!response.ok) {
        throw new Error(result.error || 'Erro no Backend Afiliado');
    }

    if (result.errors) throw new Error(result.errors[0].message);
    return result.data;
}

export const generateAffiliateLink = async (originalUrl: string, settings: ShopeeAffiliateSettings, subId?: string): Promise<string> => {
    // Correção: API usa 'subIds' (array) e não 'subId' (string)
    const subIdsParam = subId ? `, subIds: ["${subId}"]` : '';
    const query = `mutation { generateShortLink(input: { originUrl: "${originalUrl}"${subIdsParam} }) { shortLink } }`;
    const data = await callAffiliateProxy(query, settings);
    return data.generateShortLink.shortLink;
}

export const getShopeeAffiliateOrders = async (settings: ShopeeAffiliateSettings, limit: number = 50, dateRangeDays: number = 30): Promise<{ orders: ShopeeAffiliateOrder[], isSimulated: boolean }> => {
    const timestamp = Math.floor(Date.now() / 1000);
    const startDate = timestamp - (dateRangeDays * 24 * 60 * 60);

    // Query corrigida baseada na introspecção (purchaseTimeStart/End e estrutura aninhada)
    const query = `
    query {
      conversionReport(purchaseTimeStart: ${startDate}, purchaseTimeEnd: ${timestamp}, limit: ${limit}) {
        nodes {
          purchaseTime
          totalCommission
          conversionStatus
          buyerType
          device
          utmContent
          orders {
            orderId
            orderStatus
            items {
              itemId
              itemName
              itemPrice
              actualAmount
              itemCommission
            }
          }
        }
      }
    }
    `;

    try {
        const data = await callAffiliateProxy(query, settings);

        // Mapeamento da estrutura aninhada (Nodes -> Orders -> Items) para ShopeeAffiliateOrder
        const orders: ShopeeAffiliateOrder[] = [];

        if (data.conversionReport?.nodes) {
            for (const node of data.conversionReport.nodes) {
                if (node.orders) {
                    for (const order of node.orders) {
                        orders.push({
                            purchaseTime: node.purchaseTime,
                            orderId: order.orderId,
                            totalAmount: order.items.reduce((acc: number, item: any) => acc + parseFloat(item.actualAmount || 0), 0),
                            totalCommission: parseFloat(node.totalCommission || 0),
                            status: node.conversionStatus, // Status da conversão é o mais relevante para pagamento
                            buyerType: node.buyerType,
                            deviceType: node.device,
                            subId: node.utmContent, // Shopee usa utmContent como SubId muitas vezes
                            items: order.items.map((item: any) => ({
                                itemId: String(item.itemId),
                                itemName: item.itemName,
                                itemPrice: parseFloat(item.itemPrice || 0),
                                itemCommission: parseFloat(item.itemCommission || 0)
                            }))
                        });
                    }
                }
            }
        }

        return { orders, isSimulated: false };
    } catch (e: any) {
        console.error("Erro real API:", e);
        throw e;
    }
}

export const searchShopeeAffiliateProducts = async (keyword: string, settings: ShopeeAffiliateSettings, sortType: ShopeeSortType = 'latest') => {
    // Mapeamento de SortType para Inteiros (Baseado em padrões comuns, já que a API exige Int)
    const sortMap: Record<ShopeeSortType, number> = {
        'latest': 1,
        'sales': 2,
        'price_asc': 3,
        'price_desc': 4,
        'commission_rate_desc': 5
    };

    const sortInt = sortMap[sortType] || 1;

    const query = `
    query {
      productOfferV2(keyword: "${keyword}", sortType: ${sortInt}, limit: 12) {
        nodes { itemId, productName, imageUrl, price, sales, commissionRate, offerLink }
      }
    }
    `;
    const data = await callAffiliateProxy(query, settings);
    const products = data.productOfferV2?.nodes?.map((node: any) => ({
        itemId: node.itemId,
        name: node.productName,
        imageUrl: node.imageUrl,
        price: parseFloat(node.price),
        sales: node.sales || 0,
        commissionRate: parseFloat(node.commissionRate),
        commission: parseFloat(node.price) * parseFloat(node.commissionRate),
        offerLink: node.offerLink
    })) || [];

    return { products, isSimulated: false };
}

export const getShopeeShopOffers = async (settings: ShopeeAffiliateSettings) => {
    // Removidos campos inválidos: shopAvatar, isKeySeller
    const query = `query { shopOfferV2(limit: 12) { nodes { shopId, shopName, commissionRate, offerLink } } }`;
    const data = await callAffiliateProxy(query, settings);

    const shops = data.shopOfferV2?.nodes?.map((node: any) => ({
        shopId: node.shopId,
        shopName: node.shopName,
        shopAvatar: '', // Campo não disponível na API atual
        commissionRate: parseFloat(node.commissionRate),
        offerLink: node.offerLink,
        isKeySeller: false // Campo não disponível na API atual
    })) || [];

    return { shops, isSimulated: false };
}

// Nova função para testar conexão
export const testShopeeAffiliateConnection = async (settings: ShopeeAffiliateSettings) => {
    // Query leve apenas para testar autenticação
    const query = `query { shopOfferV2(limit: 1) { nodes { shopName } } }`;
    await callAffiliateProxy(query, settings);
    return true;
}
