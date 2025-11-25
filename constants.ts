import { Product, ProductStatus } from './types';

export const ML_API_BASE = 'https://api.mercadolibre.com';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod_001',
    name: 'Smartphone Galaxy S23 Ultra 256GB',
    description: 'Smartphone high-end com câmera de 200MP e processador Snapdragon 8 Gen 2.',
    price: 5999.90,
    stock: 15,
    category: 'Eletrônicos',
    images: ['https://picsum.photos/500/500?random=1', 'https://picsum.photos/500/500?random=2'],
    sku: 'SAM-S23U-256',
    weight: 0.5,
    height: 10,
    width: 8,
    length: 16,
    status: ProductStatus.NOT_PUBLISHED,
  },
  {
    id: 'prod_002',
    name: 'Tênis Esportivo Running Performance',
    description: 'Tênis ideal para corridas de longa distância com amortecimento avançado.',
    price: 299.90,
    stock: 50,
    category: 'Calçados',
    images: ['https://picsum.photos/500/500?random=3'],
    sku: 'NKE-RUN-002',
    weight: 0.8,
    height: 12,
    width: 20,
    length: 32,
    status: ProductStatus.ACTIVE,
  },
  {
    id: 'prod_003',
    name: 'Cadeira Gamer Ergonômica',
    description: 'Cadeira com ajuste de altura, inclinação e apoio lombar.',
    price: 899.00,
    stock: 5,
    category: 'Móveis',
    images: ['https://picsum.photos/500/500?random=4'],
    sku: 'CHR-GMR-X1',
    weight: 15.0,
    height: 120,
    width: 60,
    length: 60,
    status: ProductStatus.PUBLISHED,
    meli_id: 'MLB1234567890',
    meli_permalink: 'https://mercadolivre.com.br/p/MLB1234567890',
    meli_status: 'active',
  }
];