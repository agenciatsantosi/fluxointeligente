
import React, { useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { Product, ProductStatus } from '../types';
import { publishItemToML } from '../services/mlService';
import { publishItemToShopee, generateAffiliateLink } from '../services/shopeeService';
import { Search, Globe, ExternalLink, CheckCircle, Loader2, ShoppingBag, DollarSign, Link as LinkIcon } from 'lucide-react';

const ProductList: React.FC = () => {
  const { products, settings, shopeeSettings, shopeeAffiliateSettings, updateProduct, addLog } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'ML' | 'SHOPEE' | 'AFFILIATE' | null>(null);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePublishML = async (product: Product) => {
    const token = settings.accessToken ? settings.accessToken.trim() : '';
    
    if (!token) {
        alert("Configuração incompleta: Access Token ML não encontrado. Vá em Configurações.");
        return;
    }

    if (product.images.length === 0) {
        alert("Requisito da API: O produto precisa de pelo menos uma imagem.");
        return;
    }

    if (window.confirm(`Confirmar publicação oficial de "${product.name}" no Mercado Livre?`)) {
        setPublishingId(product.id);
        setActionType('ML');
        try {
            const mlData = await publishItemToML(product, token);
            
            updateProduct(product.id, {
                status: ProductStatus.PUBLISHED,
                meli_id: mlData.id,
                meli_permalink: mlData.permalink,
                meli_status: 'active',
                last_updated: new Date().toISOString()
            });

            addLog('PUBLISH', `SUCESSO API ML: ${product.sku}`, `ID ML: ${mlData.id}`);
        } catch (error: any) {
            console.error("Erro API ML:", error);
            addLog('ERROR', `FALHA API ML: ${product.sku}`, error.message);
            alert(`A API do Mercado Livre retornou um erro:\n\n${error.message}`);
        } finally {
            setPublishingId(null);
            setActionType(null);
        }
    }
  };

  const handlePublishShopee = async (product: Product) => {
    const token = shopeeSettings.accessToken ? shopeeSettings.accessToken.trim() : '';
    
    if (!token) {
        alert("Configuração incompleta: Access Token Shopee não encontrado. Vá em Configurações Shopee > Vendedor.");
        return;
    }

    if (window.confirm(`Confirmar publicação oficial de "${product.name}" na Shopee?`)) {
        setPublishingId(product.id);
        setActionType('SHOPEE');
        try {
            const shopeeId = await publishItemToShopee(product, shopeeSettings);
            
            updateProduct(product.id, {
                shopee_id: shopeeId,
                shopee_status: 'NORMAL',
                shopee_permalink: `https://shopee.com.br/product/${shopeeSettings.shopId}/${shopeeId}`,
                last_updated: new Date().toISOString()
            });

            addLog('SHOPEE_PUBLISH', `SUCESSO API SHOPEE: ${product.sku}`, `ID Shopee: ${shopeeId}`);
        } catch (error: any) {
            console.error("Erro API Shopee:", error);
            addLog('SHOPEE_ERROR', `FALHA API SHOPEE: ${product.sku}`, error.message);
            alert(`A API da Shopee retornou um erro:\n\n${error.message}`);
        } finally {
            setPublishingId(null);
            setActionType(null);
        }
    }
  };

  const handleGenerateAffiliateLink = async (product: Product) => {
      const appId = shopeeAffiliateSettings.appId ? shopeeAffiliateSettings.appId.trim() : '';
      
      if (!appId) {
          alert("Configuração incompleta: App ID de Afiliado não encontrado. Vá em Configurações Shopee > Afiliado.");
          return;
      }

      // Precisamos de uma URL base para gerar o link de afiliado.
      // Usamos a URL da Shopee ou ML se existir, senão pede uma.
      let targetUrl = product.shopee_permalink || product.meli_permalink;
      
      if (!targetUrl) {
          targetUrl = prompt("Este produto ainda não tem link de venda publicado. Insira a URL original do produto na Shopee:", "");
          if (!targetUrl) return;
      }

      setPublishingId(product.id);
      setActionType('AFFILIATE');

      try {
          const link = await generateAffiliateLink(targetUrl, shopeeAffiliateSettings);
          updateProduct(product.id, { affiliate_link: link });
          addLog('AFFILIATE_LINK', `Link gerado: ${product.sku}`);
          alert(`Link de Afiliado Gerado com Sucesso!\n\n${link}`);
      } catch (error: any) {
          alert(`Erro ao gerar link de afiliado: ${error.message}`);
      } finally {
          setPublishingId(null);
          setActionType(null);
      }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Gerenciamento de Estoque</h2>
        <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder="Buscar por nome ou SKU..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase font-medium text-gray-500">
                <tr>
                    <th className="px-6 py-4">Produto</th>
                    <th className="px-6 py-4">SKU</th>
                    <th className="px-6 py-4">Preço</th>
                    <th className="px-6 py-4 text-center">Mercado Livre</th>
                    <th className="px-6 py-4 text-center">Shopee</th>
                    <th className="px-6 py-4 text-center">Afiliados</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">
                            <div className="flex items-center space-x-3">
                                {product.images[0] && (
                                    <img src={product.images[0]} alt="" className="w-8 h-8 rounded object-cover bg-gray-200" />
                                )}
                                <span className="truncate max-w-xs" title={product.name}>{product.name}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4">{product.sku}</td>
                        <td className="px-6 py-4">R$ {product.price.toFixed(2)}</td>
                        
                        {/* Coluna Mercado Livre */}
                        <td className="px-6 py-4 text-center">
                            {product.meli_id ? (
                                <div className="flex flex-col items-center">
                                    <a href={product.meli_permalink} target="_blank" rel="noreferrer" className="flex items-center text-blue-600 hover:underline mb-1">
                                        <span className="mr-1 font-mono text-xs">{product.meli_id}</span>
                                        <ExternalLink size={10} />
                                    </a>
                                    <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center">
                                        <CheckCircle size={10} className="mr-1" /> Ativo
                                    </span>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => handlePublishML(product)}
                                    disabled={publishingId === product.id}
                                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center transition-colors shadow-sm mx-auto"
                                >
                                    {publishingId === product.id && actionType === 'ML' ? (
                                        <Loader2 className="animate-spin mr-1" size={14} />
                                    ) : (
                                        <Globe className="mr-1" size={14} />
                                    )}
                                    Publicar
                                </button>
                            )}
                        </td>

                        {/* Coluna Shopee */}
                        <td className="px-6 py-4 text-center">
                            {product.shopee_id ? (
                                <div className="flex flex-col items-center">
                                    <a href={product.shopee_permalink} target="_blank" rel="noreferrer" className="flex items-center text-orange-600 hover:underline mb-1">
                                        <span className="mr-1 font-mono text-xs">#{product.shopee_id}</span>
                                        <ExternalLink size={10} />
                                    </a>
                                    <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center">
                                        <CheckCircle size={10} className="mr-1" /> Ativo
                                    </span>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => handlePublishShopee(product)}
                                    disabled={publishingId === product.id}
                                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center transition-colors shadow-sm mx-auto"
                                >
                                    {publishingId === product.id && actionType === 'SHOPEE' ? (
                                        <Loader2 className="animate-spin mr-1" size={14} />
                                    ) : (
                                        <ShoppingBag className="mr-1" size={14} />
                                    )}
                                    Publicar
                                </button>
                            )}
                        </td>

                         {/* Coluna Afiliados */}
                         <td className="px-6 py-4 text-center">
                            {product.affiliate_link ? (
                                <div className="flex flex-col items-center">
                                    <a href={product.affiliate_link} target="_blank" rel="noreferrer" className="flex items-center text-green-600 hover:underline mb-1">
                                        <LinkIcon size={12} className="mr-1" /> Link
                                    </a>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(product.affiliate_link || '');
                                            alert('Link copiado!');
                                        }}
                                        className="text-[10px] text-gray-500 underline hover:text-gray-700"
                                    >
                                        Copiar
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => handleGenerateAffiliateLink(product)}
                                    disabled={publishingId === product.id}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center transition-colors shadow-sm mx-auto"
                                >
                                    {publishingId === product.id && actionType === 'AFFILIATE' ? (
                                        <Loader2 className="animate-spin mr-1" size={14} />
                                    ) : (
                                        <DollarSign className="mr-1" size={14} />
                                    )}
                                    Gerar Link
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
                {filteredProducts.length === 0 && (
                    <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                            Nenhum produto encontrado.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductList;
