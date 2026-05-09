import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import * as shopeeScraper from './shopeeScraper.js';
import * as db from './database.js';

/**
 * Helper to get local timestamp in YYYY-MM-DD HH:mm:ss format
 */
function getLocalTimestamp() {
    return new Date();
}

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
        categoryId = null,
        sortType = 2, // 2 = Mais Vendidos (Sales), 4 = Preço: Menor para Maior (Cheapest First)
        keyword = ''
    } = options;

    const timestamp = Math.floor(Date.now() / 1000);
    const searchKeyword = (keyword || category || '').replace(/"/g, '\\"');
    const categoryFilter = categoryId ? `, categoryId: ${categoryId}` : '';

    const query = `
        query {
            productOfferV2(keyword: "${searchKeyword}", sortType: ${sortType}, limit: ${Math.min(50, limit)}) {
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
        console.log(`[SHOPEE API] Buscando: "${searchKeyword}" | Sort: ${sortType} | Limit: ${limit}`);
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
            console.error('[SHOPEE API] Erros retornados:', response.data.errors);
            throw new Error(response.data.errors[0].message);
        }

        const allProducts = response.data.data?.productOfferV2?.nodes || [];
        console.log(`[SHOPEE API] Recebidos ${allProducts.length} produtos da API original.`);
        
        const filteredProducts = allProducts
            .filter(node => {
                const price = parseFloat(node.price);
                const commission = price * parseFloat(node.commissionRate);
                const rating = parseFloat(node.ratingStar || 0);
                const title = (node.productName || '').toLowerCase();
                
                // Filtro de Idioma: Evita produtos com títulos claramente em inglês
                // (Vendedores internacionais costumam usar esses termos)
                const englishTerms = [
                    'remote control', 'warranty', 'original', 'cheapest', 'installation', 
                    'local stock', 'ready stock', 'ship from', 'waterproof', 'portable',
                    'wireless', 'bluetooth', 'professional', 'high quality'
                ];
                const isEnglish = englishTerms.some(term => title.includes(term));

                const matches = rating >= minRating &&
                       price >= minPrice &&
                       price <= maxPrice &&
                       commission >= minCommission &&
                       !isEnglish; // Descarta se for inglês
                
                return matches;
            })
            .slice(0, limit)
            .map(node => {
                // Seleção de imagem: usa imageUrl da API
                let selectedImage = node.imageUrl;
                
                // Lista de padrões de imagens genéricas a evitar (Keywords na URL)
                const genericPatterns = [
                    'coupon', 'voucher', 'logo', 'shopee_icon', 'free_shipping', 'generic',
                    'frete_gratis', 'selo', 'banner', 'promo', 'oferta', 'desconto', 'click_here',
                    'compre_agora', 'official_store', 'loja_oficial', 'shopee_guarantee',
                    'lojas_oficiais', 'melhores_ofertas', 'produtos_oficiais', 'tetrix', 'tetri',
                    'overlay', 'background', 'invite', 'share', 'campaign', 'event'
                ];
                
                const isGeneric = (url) => url && genericPatterns.some(p => url.toLowerCase().includes(p));

                // Se a imagem for genérica, marcamos como null para que o prepareProductsForPosting
                // possa decidir se usa o scraper ou mantém (melhor sem imagem que imagem de cupom)
                if (isGeneric(selectedImage)) {
                    console.log(`[SHOPEE API] Imagem genérica detectada para ${node.itemId}: ${selectedImage}`);
                }

                return {
                    productId: node.itemId,
                    productName: node.productName,
                    productLink: node.offerLink,
                    price: parseFloat(node.price),
                    commission: parseFloat(node.price) * parseFloat(node.commissionRate),
                    commissionRate: parseFloat(node.commissionRate),
                    imageUrl: selectedImage,
                    videoUrl: null, // Not supported by current API version
                    rating: parseFloat(node.ratingStar || 0),
                    discount: 0 // Default to 0 as not available
                };
            });

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

async function prepareProductsForPosting(shopeeSettings, productCount, filters = {}, enableRotation = true, categoryType = 'random', userId = null, mediaType = 'auto', shouldScrape = true) {
    try {
        const appId = shopeeSettings.appId;
        const password = shopeeSettings.password || shopeeSettings.appSecret;

        if (!appId || !password) {
            throw new Error('Configurações da Shopee (App ID / App Secret) não encontradas.');
        }

        const fetchCount = enableRotation ? Math.min(50, Math.max(30, productCount * 10)) : productCount;
        const normalizedCategory = (categoryType || 'random').toLowerCase();

        // 1. Get Keywords from DB
        let keyword = filters.category || '';
        const dbCategories = await db.getShopeeCategories(true);
        const matchedCategory = dbCategories.find(cat => cat.slug.toLowerCase() === normalizedCategory);
        if (matchedCategory) {
            keyword = matchedCategory.keywords;
        }

        // 2. Determine Sort Type (Always prefer 4 to avoid System Error)
        let sortType = 4; // Preço Crescente (mais barato primeiro)
        
        if (normalizedCategory === 'best_sellers') {
            sortType = 2; // Sales count
        } else if (normalizedCategory === 'expensive') {
            sortType = 3; // High price (careful, might fail)
        }

        // 3. Prepare composed keyword for "achadinhos"
        let searchKeyword = keyword;
        if (!searchKeyword || normalizedCategory === 'achadinhos') {
            searchKeyword = searchKeyword || 'achadinhos úteis casa cozinha';
        }

        console.log(`[AUTOMATION] Buscando produtos... (Categoria: ${normalizedCategory})`);
        
        let products = await getTopSellingProducts(appId, password, {
            limit: fetchCount,
            ...filters,
            sortType: sortType,
            keyword: searchKeyword
        });

        // Fallback se não encontrar nada com o termo composto
        if (products.length === 0 && searchKeyword !== normalizedCategory) {
            console.log(`[AUTOMATION] Busca composta falhou. Tentando termo principal: "${normalizedCategory}"`);
            products = await getTopSellingProducts(appId, password, {
                limit: fetchCount,
                ...filters,
                sortType: 4,
                keyword: normalizedCategory
            });
        }
        // Fallback final: Se ainda não encontrou nada, tenta termos genéricos
        if (products.length === 0) {
            console.log(`[AUTOMATION] Tentando busca genérica de segurança...`);
            const genericTerms = ['oferta', 'promoção', 'utilidades'];
            const fallbackKeyword = genericTerms[Math.floor(Math.random() * genericTerms.length)];
            
            products = await getTopSellingProducts(appId, password, {
                limit: fetchCount,
                ...filters,
                sortType: 4,
                keyword: fallbackKeyword
            });
        }

        console.log(`[AUTOMATION] ${products.length} produtos retornados pela API (após filtros de preço/rating)`);

        // Filter out products sent in last 24h if rotation is enabled
        let filteredProducts = products;
        if (enableRotation && userId) {
            try {
                const { getProductsSentInLastHours, query } = await import('./database.js');
                const dbNowRes = await query('SELECT NOW()');
                const localNow = new Date(dbNowRes.rows[0].now);
                const sentProductIds = await getProductsSentInLastHours(24, userId, localNow);

                const filtered = products.filter(p => !sentProductIds.includes(String(p.id || p.productId)));
                console.log(`[AUTOMATION] Rotação ativa para user ${userId}:`);
                console.log(`[AUTOMATION]    - Já enviados (24h): [${sentProductIds.slice(0, 10).join(', ')}${sentProductIds.length > 10 ? '...' : ''}]`);
                console.log(`[AUTOMATION]    - Únicos restantes: ${filtered.length} de ${products.length}`);
                
                // Ordena por preço (Menor para Maior) conforme solicitado pelo usuário
                products = filtered.sort((a, b) => a.price - b.price);
            } catch (dbError) {
                console.warn('[AUTOMATION] Erro ao verificar rotação, continuando sem filtro:', dbError.message);
                products = products.sort(() => Math.random() - 0.5);
            }
        } else {
            // Ordena por preço (Menor para Maior) para garantir sempre os mais baratos
            products = products.sort((a, b) => a.price - b.price);
        }

        console.log(`[AUTOMATION] ${products.length} produtos encontrados. Iniciando extração de mídias...`);

        const productsWithLinks = [];
        
        // Processar um por um iterando sobre a lista completa até atingir o productCount necessário
        for (const product of products) {
            if (productsWithLinks.length >= productCount) {
                break;
            }

            // Identificar se a imagem da API é genérica
            const genericPatterns = [
                'coupon', 'voucher', 'logo', 'shopee_icon', 'free_shipping', 'generic',
                'frete_gratis', 'selo', 'banner', 'promo', 'oferta', 'desconto', 'click_here',
                'compre_agora', 'official_store', 'loja_oficial', 'shopee_guarantee'
            ];
            const isGeneric = product.imageUrl && genericPatterns.some(p => product.imageUrl.toLowerCase().includes(p));
            
            // Se a imagem for genérica, forçamos o scraping mesmo se shouldScrape for false
            const forceScrapeForThisProduct = shouldScrape || isGeneric;

            if (isGeneric) {
                console.log(`[AUTOMATION] ⚠️ Imagem genérica detectada para "${product.productName.substring(0, 20)}...". Forçando scraping.`);
            }

            // Se não for para fazer o scrape agora, apenas adiciona o link básico
            if (!forceScrapeForThisProduct) {
                productsWithLinks.push({
                    id: product.id || product.productId,
                    productId: product.id || product.productId,
                    productName: product.productName,
                    price: product.price,
                    commission: product.commission,
                    commissionRate: product.commissionRate,
                    affiliateLink: product.productLink,
                    imageUrl: product.imageUrl,
                    videoUrl: product.videoUrl,
                    rating: product.rating,
                    discount: product.discount,
                    category: product.category || null
                });
                continue;
            }

            try {
                console.log(`[AUTOMATION] Extraindo mídias para: ${product.productName.substring(0, 30)}...`);
                
                // Tenta extrair vídeos usando o novo scraper (Camada 2)
                const scrapeResult = await shopeeScraper.scrapeShopeeProduct(product.productLink, { mediaType }).catch(e => {
                    console.warn(`[AUTOMATION] Falha no scrape para ${product.productId}:`, e.message);
                    return null;
                });

                // Baixa as mídias localmente para maior confiabilidade no envio
                let finalScrapeResult = scrapeResult;
                if (scrapeResult && (scrapeResult.videos.length > 0 || scrapeResult.images.length > 0)) {
                    try {
                        console.log(`[AUTOMATION] Baixando mídias localmente para ${product.productId}...`);
                        
                        // Se for apenas imagem, limpa os vídeos antes de baixar para economizar banda/tempo
                        if (mediaType === 'image') {
                            scrapeResult.videos = [];
                        }
                        
                        finalScrapeResult = await shopeeScraper.downloadProductMedia(scrapeResult);
                    } catch (dlErr) {
                        console.warn(`[AUTOMATION] Erro ao baixar mídias para ${product.productId}:`, dlErr.message);
                    }
                }

                const finalVideoUrl = (finalScrapeResult && finalScrapeResult.localVideos && finalScrapeResult.localVideos.length > 0)
                    ? path.join(process.cwd(), 'public', finalScrapeResult.localVideos[0].replace(/^\//, ''))
                    : ((finalScrapeResult && finalScrapeResult.videos && finalScrapeResult.videos.length > 0) ? finalScrapeResult.videos[0] : product.videoUrl);

                const finalImageUrl = (finalScrapeResult && finalScrapeResult.localImages && finalScrapeResult.localImages.length > 0)
                    ? path.join(process.cwd(), 'public', finalScrapeResult.localImages[0].replace(/^\//, ''))
                    : (product.imageUrl || (finalScrapeResult && finalScrapeResult.images && finalScrapeResult.images.length > 0 ? finalScrapeResult.images[0] : null));

                const requiresVideo = mediaType === 'video' || mediaType === 'reel' || mediaType === 'reels';

                // FILTRO DE VÍDEO: Se for apenas vídeo e não encontrou vídeo, pula para o próximo produto da lista
                if (requiresVideo && !finalVideoUrl) {
                    console.log(`[AUTOMATION] ⏭️ Produto ${product.productId} ignorado pois não possui vídeo (Modo '${mediaType}'). Buscando próximo...`);
                    continue;
                }

                console.log(`[AUTOMATION] Caminhos Finais - Imagem: ${finalImageUrl?.substring(0, 50)}... | Vídeo: ${finalVideoUrl?.substring(0, 50)}...`);

                productsWithLinks.push({
                    id: product.id || product.productId,
                    productId: product.id || product.productId,
                    productName: product.productName,
                    price: product.price,
                    commission: product.commission,
                    commissionRate: product.commissionRate,
                    affiliateLink: product.productLink,
                    imagePath: finalImageUrl,     // Caminho local ou URL
                    imageUrl: product.imageUrl,    // URL original (backup)
                    videoUrl: finalVideoUrl,      // Caminho local ou URL capturada
                    rating: product.rating,
                    discount: product.discount,
                    category: product.category || null
                });
                
                if (finalVideoUrl) {
                    console.log(`[AUTOMATION] ✅ Vídeo encontrado para ${product.productId}!`);
                }
            } catch (err) {
                console.error(`[AUTOMATION] Erro ao processar produto ${product.productId}:`, err);
                
                // Fallback de erro: Se o modo é vídeo, não podemos adicionar como fallback se deu erro no scraper e não tem videoUrl original
                const requiresVideo = mediaType === 'video' || mediaType === 'reel' || mediaType === 'reels';
                if (requiresVideo && !product.videoUrl) {
                    console.log(`[AUTOMATION] ⏭️ Produto ${product.productId} com erro e sem vídeo. Ignorando...`);
                    continue;
                }

                // Fallback genérico: adiciona o produto
                productsWithLinks.push({
                    id: product.id || product.productId,
                    productId: product.id || product.productId,
                    productName: product.productName,
                    price: product.price,
                    commission: product.commission,
                    commissionRate: product.commissionRate,
                    affiliateLink: product.productLink,
                    imagePath: product.imageUrl,
                    imageUrl: product.imageUrl,
                    videoUrl: product.videoUrl,
                    rating: product.rating,
                    discount: product.discount,
                    category: product.category || null
                });
            }
        }

        console.log('[AUTOMATION] Links de afiliado gerados');

        // AUTO-ADD TO VITRINE (BIO LINK)
        if (userId) {
            try {
                const { addShopeeBioLink } = await import('./database.js');
                for (const product of productsWithLinks) {
                    await addShopeeBioLink({
                        productId: product.productId,
                        name: product.productName,
                        imageUrl: product.imageUrl,
                        affiliateLink: product.affiliateLink,
                        category: product.category || 'Promoção'
                    }, userId);
                }
                console.log(`[AUTOMATION] ${productsWithLinks.length} produtos adicionados à Vitrine com sucesso.`);
            } catch (bioError) {
                console.warn('[AUTOMATION] Erro ao adicionar à Vitrine Bio:', bioError.message);
            }
        }

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
