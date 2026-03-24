/**
 * Utility to generate smart hashtags based on keywords in the product name
 * This prevents cross-category hashtag pollution (e.g., Umbanda tags on Gospel products)
 */

export function generateSmartTags(productName) {
    if (!productName) return '';

    const lowerName = productName.toLowerCase();
    
    // Define keyword mappings to specific hashtags
    // Order matters: More specific first
    const categoryMap = [
        {
            keywords: ['evangelico', 'evangélico', 'gospel', 'biblia', 'bíblia', 'cristao', 'cristão', 'jesus', 'deus', 'salmo', 'louvor', 'igreja'],
            tags: ['#achadinhosEvangelicos', '#modaevangelica', '#gospel', '#cristao', '#biblia', '#jesus', '#fé']
        },
        {
            keywords: ['umbanda', 'candomble', 'candomblé', 'axe', 'axé', 'orixa', 'orixá', 'guia', 'terreiro', 'exu', 'pombagira', 'iemanja', 'oxum', 'ogum', 'zepelintra', 'pretovelho', 'caboclo', 'ponto', 'atabaque'],
            tags: ['#umbanda', '#candomble', '#axe', '#orixas', '#guias', '#umbandasagrada', '#fé', '#religiao']
        },
        {
            keywords: ['gato', 'cachorro', 'pet', 'animal', 'coleira', 'racao', 'ração', 'brinquedo pet', 'cama pet', 'arranhador'],
            tags: ['#pet', '#cachorro', '#gato', '#pets', '#maedepet', '#amomeupet', '#animais']
        },
        {
            keywords: ['cozinha', 'panela', 'utensilio', 'talher', 'copo', 'prato', 'liquidificador', 'air fryer', 'pote', 'tupperware'],
            tags: ['#cozinha', '#utensilios', '#casa', '#cozinhar', '#dicasdecasa', '#donadecasa', '#decoraçãodeinteriores']
        },
        {
            keywords: ['roupa', 'vestido', 'calça', 'camiseta', 'moda', 'look', 'saia', 'short', 'blusa', 'jaqueta'],
            tags: ['#moda', '#lookdodia', '#estilo', '#roupas', '#modafeminina', '#tendencia']
        },
        {
            keywords: ['maquiagem', 'beleza', 'skincare', 'creme', 'perfume', 'batom', 'cabelo', 'shampoo'],
            tags: ['#beleza', '#maquiagem', '#skincare', '#cuidados', '#autocuidado', '#make']
        },
        {
            keywords: ['celular', 'fone', 'bluetooth', 'smartwatch', 'carregador', 'cabo', 'usb', 'gamer', 'mouse', 'teclado', 'eletronico'],
            tags: ['#tecnologia', '#eletronicos', '#gadgets', '#tech', '#celular', '#gamer', '#setup']
        },
        {
            keywords: ['casa', 'decoracao', 'decoração', 'quarto', 'sala', 'tapete', 'quadro', 'lustre', 'mesa', 'sofa', 'sofá', 'cortina'],
            tags: ['#casa', '#decoracao', '#lar', '#utilidades', '#homedecor', '#dicasdecasa']
        }
    ];

    let foundTags = new Set();
    
    // Generic base tags that always apply if no other is found, or mixed in
    // Removed base tags that clutter
    
    for (const category of categoryMap) {
        // Check if any keyword matches
        const hasKeyword = category.keywords.some(keyword => lowerName.includes(keyword));
        
        if (hasKeyword) {
            category.tags.forEach(tag => foundTags.add(tag));
            // Just take the first matched category to avoid mixing disconnected domains (like Gospel + Pets if weird name)
            break; 
        }
    }

    return Array.from(foundTags).join(' ');
}
