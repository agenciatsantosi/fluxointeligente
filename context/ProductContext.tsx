
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, ProductStatus, MLSettings, ShopeeSettings, ShopeeAffiliateSettings, LogEntry } from '../types';
import { MOCK_PRODUCTS } from '../constants';
import api from '../services/api';

interface ProductContextType {
  products: Product[];
  settings: MLSettings;
  shopeeSettings: ShopeeSettings;
  shopeeAffiliateSettings: ShopeeAffiliateSettings;
  logs: LogEntry[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  saveSettings: (settings: MLSettings) => void;
  saveShopeeSettings: (settings: ShopeeSettings) => void;
  saveShopeeAffiliateSettings: (settings: ShopeeAffiliateSettings) => void;
  addLog: (action: LogEntry['action'], message: string, details?: string) => void;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize state from localStorage or constants
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('products');
    return saved ? JSON.parse(saved) : MOCK_PRODUCTS;
  });

  const [settings, setSettings] = useState<MLSettings>(() => {
    const saved = localStorage.getItem('ml_settings');
    return saved ? JSON.parse(saved) : { appId: '', clientSecret: '', accessToken: '' };
  });

  const [shopeeSettings, setShopeeSettings] = useState<ShopeeSettings>(() => {
    const saved = localStorage.getItem('shopee_settings');
    return saved ? JSON.parse(saved) : { partnerId: 0, shopId: 0, accessToken: '', partnerKey: '' };
  });

  const [shopeeAffiliateSettings, setShopeeAffiliateSettings] = useState<ShopeeAffiliateSettings>({
    appId: '',
    password: ''
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Load Shopee config from backend on mount
  useEffect(() => {
    const loadShopeeConfig = async () => {
      try {
        const response = await api.get('/shopee/config');
        if (response.data.success && response.data.config) {
          setShopeeAffiliateSettings({
            appId: response.data.config.appId || '',
            password: response.data.config.appSecret || ''
          });
        }
      } catch (error) {
        console.error('Error loading Shopee config:', error);
      }
    };

    loadShopeeConfig();
  }, []);

  // Persistence effects
  useEffect(() => {
    localStorage.setItem('products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('ml_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('shopee_settings', JSON.stringify(shopeeSettings));
  }, [shopeeSettings]);

  // Save Shopee affiliate settings to backend instead of localStorage
  useEffect(() => {
    const saveShopeeConfig = async () => {
      try {
        if (!shopeeAffiliateSettings.appId) return;

        await api.post('/shopee/config', {
          appId: shopeeAffiliateSettings.appId,
          appSecret: shopeeAffiliateSettings.password,
          trackingId: '',
          subId: ''
        });
      } catch (error) {
        console.error('Error saving Shopee config:', error);
      }
    };

    saveShopeeConfig();
  }, [shopeeAffiliateSettings]);

  const addProduct = (newProduct: Omit<Product, 'id'>) => {
    const id = `prod_${Date.now()}`;
    setProducts([...products, { ...newProduct, id, status: ProductStatus.NOT_PUBLISHED }]);
    addLog('SYSTEM', `Produto criado: ${newProduct.name}`);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    if (updates.stock !== undefined || updates.price !== undefined) {
      addLog('UPDATE', `Produto atualizado: ${id}`);
    }
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    addLog('SYSTEM', `Produto removido: ${id}`);
  };

  const saveSettings = (newSettings: MLSettings) => {
    setSettings(newSettings);
    addLog('SYSTEM', 'Configurações do Mercado Livre atualizadas');
  };

  const saveShopeeSettings = (newSettings: ShopeeSettings) => {
    setShopeeSettings(newSettings);
    addLog('SYSTEM', 'Configurações da Shopee (Vendedor) atualizadas');
  };

  const saveShopeeAffiliateSettings = (newSettings: ShopeeAffiliateSettings) => {
    setShopeeAffiliateSettings(newSettings);
    addLog('SYSTEM', 'Configurações da Shopee (Afiliado) atualizadas');
  };

  const addLog = (action: LogEntry['action'], message: string, details?: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      action,
      message,
      details
    };
    setLogs(prev => [newLog, ...prev]);
  };

  return (
    <ProductContext.Provider value={{
      products, settings, shopeeSettings, shopeeAffiliateSettings, logs,
      addProduct, updateProduct, deleteProduct, saveSettings, saveShopeeSettings, saveShopeeAffiliateSettings, addLog
    }}>
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) throw new Error('useProducts must be used within a ProductProvider');
  return context;
};
