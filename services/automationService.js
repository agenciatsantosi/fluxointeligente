import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import * as shopeeScraper from './shopeeScraper.js';

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
        sortType = 2, // 2 = Preço: Menor para Maior (Cheapest First)
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
                videoUrl: null, // Not supported by current API version
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

async function prepareProductsForPosting(shopeeSettings, productCount, filters = {}, enableRotation = true, categoryType = 'random', userId = null, mediaType = 'auto', shouldScrape = true) {
    try {
        console.log('[AUTOMATION] Buscando produtos...');
        console.log(`[AUTOMATION] Tipo de Categoria: ${categoryType}`);

        // Get a large buffer of products (capped at 50 by Shopee API) to ensure unique ones
        const fetchCount = enableRotation ? Math.min(50, Math.max(30, productCount * 10)) : productCount;

        let sortType = 3; // Alterado para Preço Crescente (mais barato primeiro)
        let keyword = filters.category || '';

        // Map categories to keywords
        const categoryMap = {
            // Numeric legacy support
            '1': 'roupas masculinas',
            '2': 'roupas femininas',
            '3': 'celulares eletrônicos',
            '4': 'casa decoração',
            '5': 'saúde beleza maquiagem',
            '6': 'umbanda candomblé orixá axe',
            '7': 'evangélico gospel bíblia cristão',
            '8': 'brinquedos infantil',
            '9': 'fones smartwatch eletrônicos tech',
            '10': 'joias relógios óculos acessórios',
            '11': 'enxoval bebê fraldas',
            '12': 'academia fitness esporte',
            '13': 'acessórios carros motos',
            '14': 'relógios masculinos femininos',
            '15': 'bolsas femininas mochilas',
            '16': 'sapatos femininos sandálias',
            '17': 'sapatos masculinos tênis',
            '18': 'utensílios cozinha panelas',
            '19': 'video games consoles',
            '20': 'computadores notebooks',
            '21': 'pet shop cães gatos',
            '22': 'papelaria escritório escola',
            '23': 'achadinhos utilidades engraçado',
 
             // New string keys
             'moda_masculina': 'roupas masculinas moda masculina',
             'moda_feminina': 'roupas femininas moda feminina',
             'celulares': 'celulares smartphones xiaomi iphone',
             'casa': 'casa decoração cozinha utilidades',
             'beleza': 'maquiagem cosméticos saúde beleza',
             'umbanda': 'umbanda orixás axe candomblé',
             'evangelico': 'gospel bíblia cristão',
            'brinquedos': 'brinquedos infantil kids bonecas carrinhos',
            'eletronicos': 'fones de ouvido smartwatch eletrônicos tech gadget',
            'acessorios': 'joias relógios óculos',
            'bebes': 'bebê enxoval fraldas infantil recém nascido',
            'esportes': 'academia fitness esporte suplemento treino',
            'automotivo': 'acessórios carros motos automotivo som automotivo',
            'relogios': 'relógios luxo smartwatch digital analógico',
            'bolsas': 'bolsas femininas mochilas malas carteiras',
            'calcados_fem': 'sapatos femininos sandálias saltos sapatilhas',
            'calcados_masc': 'sapatos masculinos tênis botas chinelos',
            'cozinha': 'utensílios cozinha panelas airfryer fritadeira',
            'games': 'video games consoles ps5 xbox nintendo switch',
            'informatica': 'computadores notebooks mouse teclado monitor hardware',
            'pet': 'pet shop cães gatos ração brinquedos pet coleira',
            'papelaria': 'papelaria escritório escola canetas cadernos estojo',
            'bizarros': 'achadinhos úteis bizarros engraçados',
            'achadinhos': 'achadinhos úteis casa cozinha ferramentas utilidades'
        };

        const normalizedCategory = (categoryType || 'random').toLowerCase();

        if (normalizedCategory === 'bizarros') {
            const bizarroKeywords = [
                'presente pegadinha', 'presente inútil', 'presente estranho', 'item curioso',
                'decoração amaldiçoada', 'objeto engraçado', 'gadget inútil', 'bugiganga importada',
                'acessório nonsense', 'item aleatório', 'presente troll', 'novidade chinesa',
                'funny gift', 'prank gift', 'novelty item', 'weird gadget', 'useless gadget'
            ];
            keyword = bizarroKeywords[Math.floor(Math.random() * bizarroKeywords.length)];
            sortType = 3; // Preço Crescente
        } else if (categoryMap[categoryType]) {
            keyword = categoryMap[categoryType];
        }

        switch (normalizedCategory) {
            case 'bizarros':
                // Já definido acima, mas mantemos aqui para clareza se necessário
                sortType = 3;
                break;
            case 'cheapest':
                sortType = 3; // Price Low to High
                keyword = keyword || 'oferta barata';
                break;
            case 'expensive':
                sortType = 4; // Price High to Low
                keyword = keyword || 'luxo premium';
                break;
            case 'best_sellers':
            case 'best_sellers_week':
            case 'best_sellers_month':
                sortType = 2; // Price Low to High
                keyword = keyword || 'mais vendidos';
                break;
            case 'random':
            case 'all':
            case '0':
            default:
                // Se não tiver keyword, usar termos genéricos para evitar erro da API
                if (!keyword) {
                    const genericTerms = ['oferta', 'promoção', 'desconto', 'barato', 'casa', 'moda', 'tecnologia'];
                    keyword = genericTerms[Math.floor(Math.random() * genericTerms.length)];
                }
                break;
        }

        const appPassword = shopeeSettings.password || shopeeSettings.appSecret;
        if (!shopeeSettings.appId || !appPassword) {
            throw new Error('Configurações da Shopee (App ID / App Secret) não encontradas.');
        }

        let categoryId = null;
        if (normalizedCategory === 'umbanda' || normalizedCategory === '6') {
            categoryId = 11060109; // ID oficial da Shopee para Artigos Religiosos
        }

        let products = await getTopSellingProducts(
            shopeeSettings.appId,
            appPassword,
            { limit: fetchCount, ...filters, sortType, keyword, categoryId }
        );

        // Fallback 1: If specific search fails, try the first word of the keyword
        if (products.length === 0 && keyword && keyword.includes(' ')) {
            const firstWord = keyword.split(' ')[0];
            console.log(`[AUTOMATION] Busca composta falhou para "${keyword}". Tentando termo principal: "${firstWord}"...`);
            products = await getTopSellingProducts(
                shopeeSettings.appId,
                appPassword,
                { limit: fetchCount, ...filters, sortType: 3, keyword: firstWord }
            );
        }

        // Fallback 2: If still no products, try generic terms
        if (products.length === 0) {
            console.log(`[AUTOMATION] Nenhum produto encontrado para "${keyword}". Tentando busca genérica...`);
            const genericTerms = ['oferta', 'promoção', 'achadinhos', 'utilidades'];
            const fallbackKeyword = genericTerms[Math.floor(Math.random() * genericTerms.length)];
            
            products = await getTopSellingProducts(
                shopeeSettings.appId,
                appPassword,
                { limit: fetchCount, ...filters, sortType: 3, keyword: fallbackKeyword }
            );
        }

        console.log(`[AUTOMATION] ${products.length} produtos encontrados`);

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

        console.log(`[AUTOMATION] ${products.length} produtos encontrados. Iniciando extração de vídeos...`);
        
        // Take only the requested count
        const selectedProducts = products.slice(0, productCount);

        const productsWithLinks = [];
        
        // Processar um por um para evitar sobrecarga de memória (Puppeteer consome muito recurso)
        for (const product of selectedProducts) {
            // Se não for para fazer o scrape agora (Fluxo Um-por-Um), apenas adiciona o link básico
            if (!shouldScrape) {
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
                console.log(`[AUTOMATION] Extraindo vídeos para: ${product.productName.substring(0, 30)}...`);
                
                // Tenta extrair vídeos usando o novo scraper (Camada 2)
                // Usamos o offerLink original que a Shopee retorna, que redireciona para o produto
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
                // Fallback: adiciona o produto mesmo sem vídeo extraído
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
