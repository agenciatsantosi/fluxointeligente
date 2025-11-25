import React, { useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { Save, ShoppingBag, Store } from 'lucide-react';
import { generateShopeeAuthUrl } from '../services/shopeeService';

const ShopeeConfig: React.FC = () => {
  const { shopeeSettings, saveShopeeSettings } = useProducts();

  // Seller Form State
  const [sellerData, setSellerData] = useState(shopeeSettings);
  
  const handleSellerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSellerData({ 
        ...sellerData, 
        [e.target.name]: e.target.name === 'partnerId' || e.target.name === 'shopId' 
            ? Number(e.target.value) 
            : e.target.value 
    });
  };

  const handleSaveSeller = (e: React.FormEvent) => {
    e.preventDefault();
    saveShopeeSettings(sellerData);
    alert('Configurações de Vendedor Shopee salvas!');
  };

  const handleGenerateAuthLink = async () => {
      if(!sellerData.partnerId || !sellerData.partnerKey) {
          alert("Preencha o Partner ID e a Senha (Key) primeiro.");
          return;
      }
      const url = await generateShopeeAuthUrl(sellerData.partnerId, sellerData.partnerKey);
      window.open(url, '_blank');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center space-x-3 p-6 border-b border-gray-100">
            <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                <ShoppingBag size={24} />
            </div>
            <div>
                <h2 className="text-xl font-bold text-gray-800">Integração Vendedor Shopee</h2>
                <p className="text-sm text-gray-500">Configure sua conta de Vendedor (Seller Center) para publicar produtos.</p>
            </div>
        </div>

        <div className="p-6">
            <form onSubmit={handleSaveSeller} className="space-y-5">
                <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 border border-blue-100 mb-4 flex items-start gap-2">
                    <Store size={18} className="mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Shopee Open Platform V2</p>
                        <p>Para vender produtos, você precisa do Partner ID e conectar sua loja.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Partner ID</label>
                        <input 
                            type="number" name="partnerId" value={sellerData.partnerId || ''} onChange={handleSellerChange}
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha (Partner Key)</label>
                        <input 
                            type="password" name="partnerKey" value={sellerData.partnerKey || ''} onChange={handleSellerChange}
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                        />
                    </div>
                </div>

                <button 
                    type="button"
                    onClick={handleGenerateAuthLink}
                    className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium border border-gray-300"
                >
                    🔗 Gerar Link de Login da Loja (OAuth)
                </button>

                <hr className="border-gray-100" />

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shop ID (ID da Loja)</label>
                    <input 
                        type="number" name="shopId" value={sellerData.shopId || ''} onChange={handleSellerChange}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                    <input 
                        type="text" name="accessToken" value={sellerData.accessToken} onChange={handleSellerChange}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                        placeholder="Token obtido após o login..."
                    />
                </div>

                <button type="submit" className="w-full bg-orange-600 text-white py-2.5 rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center">
                    <Save size={18} className="mr-2" /> Salvar Dados de Vendedor
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default ShopeeConfig;