import axios from 'axios';
import crypto from 'crypto';

async function getTopSellingProducts(appId, password, options = {}) {
    // Updated query to remove discount field
    const {
        limit = 5,
        minRating = 0,
        minPrice = 0,
        maxPrice = 999999,
        minCommission = 0,
        minDiscount = 0,
        category = '',
        sortType = 2, // Default to Popularity
        keyword = ''
    } = options;

    const timestamp = Math.floor(Date.now() / 1000);
    const searchKeyword = keyword || category || '';

    const query = `
        query {
            productOfferV2(keyword: "${searchKeyword}", sortType: ${sortType}, limit: ${limit * 3}) {
                nodes {
                    itemId
                    productName
                    imageUrl
                    price
                    sales
                    commissionRate
                    offerLink
                    ratingStar
                }
            }
        }
    `;

    const payload = JSON.stringify({ query });
    const signatureBase = `${appId}${timestamp}${payload}${password}`;
    const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

    try {
        const response = await axios.post(
            'https://open-api.affiliate.shopee.com.br/graphql',
            { query },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`
                }
            }
        );

        if (response.data.errors) {
            throw new Error(response.data.errors[0].message);
        }

        // Filtrar e mapear produtos
        const allProducts = response.data.data.productOfferV2.nodes;
        const filteredProducts = allProducts
            .filter(node => {
                const price = parseFloat(node.price);
                const commission = price * parseFloat(node.commissionRate);
                const rating = parseFloat(node.ratingStar || 0);
                // Discount removed as it is not supported in this API version

                return (
                    rating >= minRating &&
                    price >= minPrice &&
                    price <= maxPrice &&
                    commission >= minCommission
                );
            })
            .slice(0, limit)
            .map(node => ({
                productId: node.itemId,
                productName: node.productName,
                productLink: node.offerLink,
                price: parseFloat(node.price),
                commission: parseFloat(node.price) * parseFloat(node.commissionRate),
                commissionRate: parseFloat(node.commissionRate),
                imageUrl: node.imageUrl,
                videoUrl: node.videoUrl || null, // Shopee pode ter vídeos
                rating: parseFloat(node.ratingStar || 0),
                discount: 0 // Default to 0 as not available
            }));

        return filteredProducts;
    } catch (error) {
        console.error('Error fetching products:', error);
        throw error;
    }
}

async function generateAffiliateLink(appId, password, productLink) {
    const timestamp = Math.floor(Date.now() / 1000);
    const query = `mutation { generateShortLink(input: { originUrl: "${productLink}" }) { shortLink } }`;

    const payload = JSON.stringify({ query });
    const signatureBase = `${appId}${timestamp}${payload}${password}`;
    const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

    try {
        const response = await axios.post(
            'https://open-api.affiliate.shopee.com.br/graphql',
            { query },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`
                }
            }
        );

        if (response.data.errors) {
            throw new Error(response.data.errors[0].message);
        }

        return response.data.data.generateShortLink.shortLink;
    } catch (error) {
        console.error('Error generating link:', error);
        throw error;
    }
}

async function prepareProductsForPosting(shopeeSettings, productCount, filters = {}, enableRotation = false, categoryType = 'random') {
    try {
        console.log('[AUTOMATION] Buscando produtos...');
        console.log(`[AUTOMATION] Tipo de Categoria: ${categoryType}`);

        // Get more products than needed if rotation is enabled
        const fetchCount = enableRotation ? productCount * 3 : productCount;

        let sortType = 2; // Default: Popularity
        let keyword = filters.category || '';

        switch (categoryType) {
            case 'cheapest':
                sortType = 3; // Price Low to High (Assumption)
                break;
            case 'best_sellers_week':
            case 'best_sellers_month':
                sortType = 2; // Top Sales
                break;
            case 'achadinhos':
                keyword = 'achadinhos';
                break;
        }

        const products = await getTopSellingProducts(
            shopeeSettings.appId,
            shopeeSettings.password,
            { limit: fetchCount, ...filters, sortType, keyword }
        );

        console.log(`[AUTOMATION] ${products.length} produtos encontrados`);

        // Filter out products sent in last 24h if rotation is enabled
        let filteredProducts = products;
        if (enableRotation) {
            try {
                const { getProductsSentInLastHours } = await import('./database.js');
                const sentProductIds = getProductsSentInLastHours(24);
                const sentIdsSet = new Set(sentProductIds);

                filteredProducts = products.filter(p => !sentIdsSet.has(p.id || p.productId));
                console.log(`[AUTOMATION] Rotação ativa: ${filteredProducts.length} produtos únicos (${products.length - filteredProducts.length} já enviados)`);
            } catch (dbError) {
                console.warn('[AUTOMATION] Erro ao verificar rotação, continuando sem filtro:', dbError.message);
            }
        }

        // Take only the requested count
        const selectedProducts = filteredProducts.slice(0, productCount);

        const productsWithLinks = await Promise.all(
            selectedProducts.map(async (product) => {
                const affiliateLink = await generateAffiliateLink(
                    shopeeSettings.appId,
                    shopeeSettings.password,
                    product.productLink
                );

                return {
                    id: product.id || product.productId,
                    productId: product.id || product.productId,
                    productName: product.productName,
                    price: product.price,
                    commission: product.commission,
                    commissionRate: product.commissionRate,
                    affiliateLink: affiliateLink,
                    imagePath: product.imageUrl,  // For compatibility
                    imageUrl: product.imageUrl,    // WhatsApp checks this too
                    videoUrl: product.videoUrl,
                    rating: product.rating,
                    discount: product.discount,
                    category: product.category || null
                };
            })
        );

        console.log('[AUTOMATION] Links de afiliado gerados');
        return productsWithLinks;
    } catch (error) {
        console.error('[AUTOMATION] Erro:', error);
        throw error;
    }
}

export {
    getTopSellingProducts,
    generateAffiliateLink,
    prepareProductsForPosting
};
