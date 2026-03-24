
export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PUBLISHED = 'published',
  NOT_PUBLISHED = 'not_published',
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string; // Internal category
  images: string[];
  sku: string;
  weight: number; // in kg
  height: number; // in cm
  width: number; // in cm
  length: number; // in cm
  status: ProductStatus;
  
  // Mercado Livre Fields
  meli_id?: string;
  meli_permalink?: string;
  meli_status?: string;
  
  // Shopee Seller Fields
  shopee_id?: number;
  shopee_status?: string;
  shopee_permalink?: string; // Construído manualmente pois a API não retorna direto

  // Shopee Affiliate Fields
  affiliate_link?: string;

  last_updated?: string;
}

export interface MLSettings {
  appId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
}

// Configuração para Vendedor (Seller Center)
export interface ShopeeSettings {
  partnerId: number;
  shopId: number;
  accessToken: string;
  partnerKey?: string; // Senha/Secret do Partner
}

// Configuração para Afiliado (Affiliate Open Platform)
export interface ShopeeAffiliateSettings {
  appId: string;
  password: string; // "Senha" mencionada no print
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  action: 'PUBLISH' | 'UPDATE' | 'ERROR' | 'SYSTEM' | 'SHOPEE_PUBLISH' | 'SHOPEE_ERROR' | 'AFFILIATE_LINK';
  message: string;
  details?: string;
}

export interface MeliCategoryPrediction {
  id: string;
  name: string;
  path_from_root: { id: string; name: string }[];
}

export interface ShopeeAffiliateOrder {
  purchaseTime: number;
  orderId: string;
  totalAmount: number;
  totalCommission: number;
  status: string; // 'Pending', 'Completed', 'Void', 'Cancelled'
  buyerType?: 'NEW' | 'EXISTING';
  deviceType?: 'APP' | 'WEB';
  fraudStatus?: 'VERIFIED' | 'FRAUD' | 'UNVERIFIED';
  subId?: string;
  items: {
    itemId: string;
    itemName: string;
    itemPrice: number;
    itemCommission: number;
  }[];
}

export interface ShopeeAffiliateProduct {
  itemId: string;
  name: string;
  imageUrl: string;
  videoUrl?: string; // Disponível em alguns produtos
  price: number;
  sales?: number; // Volume de vendas
  commissionRate: number; // Ex: 0.10 (10%)
  commission: number; // Valor estimado
  offerLink: string;
}

export interface ShopeeShopOffer {
  shopId: number;
  shopName: string;
  shopAvatar?: string;
  commissionRate: number; // Taxa média da loja
  offerLink: string;
  isKeySeller: boolean;
}

export type ShopeeSortType = 'latest' | 'sales' | 'price_asc' | 'price_desc' | 'commission_rate_desc';