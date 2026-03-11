import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useProducts } from '../context/ProductContext';
import { searchShopeeAffiliateProducts } from '../services/shopeeService';
import { ShopeeAffiliateProduct, ShopeeSortType } from '../types';
import { Video, Download, Copy, ExternalLink, Loader2, TrendingUp, DollarSign, Sparkles, Laugh, Search, Tag, CheckCircle, XCircle, MessageCircle, Instagram, Calendar } from 'lucide-react';

type TabType = 'best_sellers' | 'cheapest' | 'achadinhos' | 'bizarros';

const ShopeeVideoPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();
    const [activeTab, setActiveTab] = useState<TabType>('best_sellers');
    const [products, setProducts] = useState<ShopeeAffiliateProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages] = useState(3); // Simulating 3 pages
    const [downloadingVideo, setDownloadingVideo] = useState<string | null>(null);
    const [downloadedVideos, setDownloadedVideos] = useState<Record<string, any>>({});
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const tabs = [
        { id: 'best_sellers' as TabType, label: 'Mais Vendidos', icon: TrendingUp, keyword: 'utilidades casa', sort: 'sales' as ShopeeSortType },
        { id: 'cheapest' as TabType, label: 'Mais Baratos', icon: DollarSign, keyword: 'barato', sort: 'price_asc' as ShopeeSortType },
        { id: 'achadinhos' as TabType, label: 'Achadinhos', icon: Sparkles, keyword: 'achadinhos utilidades', sort: 'sales' as ShopeeSortType },
        { id: 'bizarros' as TabType, label: 'Bizarros', icon: Laugh, keyword: 'engraçado diferente', sort: 'latest' as ShopeeSortType }
    ];

    useEffect(() => {
        setCurrentPage(1); // Reset to page 1 when changing tabs
        loadProducts();
    }, [activeTab]);

    useEffect(() => {
        loadProducts();
    }, [currentPage]);

    const loadProducts = async () => {
        if (!shopeeAffiliateSettings.appId || !shopeeAffiliateSettings.password) {
            showNotification('Configure suas credenciais de Afiliado primeiro', 'error');
            return;
        }

        setLoading(true);
        try {
            const currentTab = tabs.find(t => t.id === activeTab);
            if (!currentTab) return;

            // Vary keywords per page to get different results
            const keywordVariations: Record<TabType, string[]> = {
                'best_sellers': ['utilidades casa', 'organizador', 'cozinha'],
                'cheapest': ['barato', 'promoção', 'oferta'],
                'achadinhos': ['achadinhos utilidades', 'gadgets', 'novidades'],
                'bizarros': ['engraçado diferente', 'criativo', 'inusitado']
            };

            const keywords = keywordVariations[activeTab];
            const keyword = keywords[(currentPage - 1) % keywords.length];

            const { products: result } = await searchShopeeAffiliateProducts(
                keyword,
                shopeeAffiliateSettings,
                currentTab.sort
            );
            setProducts(result);
        } catch (error) {
            console.error(error);
            showNotification('Erro ao carregar produtos', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- PINTEREST VIDEO SEARCH STATES ---
    const [showPinterestModal, setShowPinterestModal] = useState(false);
    const [pinterestKeyword, setPinterestKeyword] = useState('');
    const [pinterestResults, setPinterestResults] = useState<any[]>([]);
    const [loadingPinterest, setLoadingPinterest] = useState(false);
    const [downloadingPinterestVideo, setDownloadingPinterestVideo] = useState(false);
    const [downloadedVideo, setDownloadedVideo] = useState<{ localPath: string, filename: string } | null>(null);

    const openPinterestSearch = (productName: string) => {
        setPinterestKeyword(productName);
        setShowPinterestModal(true);
        setDownloadedVideo(null);
        setPinterestResults([]);
        // Auto search
        searchPinterest(productName);
    };

    const searchPinterest = async (term: string) => {
        if (!term) return;
        setLoadingPinterest(true);
        try {
            const response = await axios.get(`/pinterest/search-video?keyword=${encodeURIComponent(term)}`);
            if (response.data.success) {
                setPinterestResults(response.data.results);
            }
        } catch (error) {
            console.error(error);
            showNotification('Erro ao buscar no Pinterest', 'error');
        } finally {
            setLoadingPinterest(false);
        }
    };

    const downloadPinterestVideo = async (pinUrl: string) => {
        setDownloadingPinterestVideo(true);
        try {
            const response = await axios.post((import.meta.env.PROD ? '/api' : 'http://localhost:3001/api') + '/pinterest/download-video', { pinUrl });
            if (response.data.success) {
                setDownloadedVideo({ localPath: response.data.localPath, filename: response.data.filename });
                showNotification('Vídeo baixado com sucesso!', 'success');

                // Trigger browser download
                const link = document.createElement('a');
                link.href = response.data.localPath;
                link.download = response.data.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error(error);
            showNotification('Erro ao baixar vídeo', 'error');
        } finally {
            setDownloadingPinterestVideo(false);
        }
    };

    const generateTags = (productName: string) => {
        const words = productName.toLowerCase().split(' ').filter(w => w.length > 3);
        const tags = words.slice(0, 5).map(w => `#${w}`).join(' ');
        return `${productName}\n\n${tags}\n\n🛒 Compre agora na Shopee!\n💰 Preço imperdível!\n✨ Aproveite!`;
    };

    const copyTags = (product: ShopeeAffiliateProduct) => {
        const text = generateTags(product.name);
        navigator.clipboard.writeText(text);
        showNotification('Tags copiadas!', 'success');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 p-6">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-2xl shadow-lg">
                        <Video size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                            Shopee Vídeo
                        </h1>
                        <p className="text-gray-600">Encontre produtos com vídeos para repostar</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg scale-105'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            <Icon size={20} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Notification */}
            {notification && (
                <div className={`mb-4 p-4 rounded-xl flex items-center gap-2 ${notification.type === 'success' ? 'bg-green-100 text-green-800' :
                    notification.type === 'error' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                    }`}>
                    <CheckCircle size={20} />
                    {notification.message}
                </div>
            )}

            {/* Products Grid */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
                    <p className="text-gray-500">Carregando produtos...</p>
                </div>
            ) : products.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map(product => (
                        <div key={product.itemId} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all group">
                            {/* Product Image */}
                            <div className="relative h-64 bg-gray-100 overflow-hidden">
                                <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                                <div className="absolute top-2 right-2 bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                                    {product.sales} vendas
                                </div>
                            </div>

                            {/* Product Info */}
                            <div className="p-4">
                                <h3 className="font-bold text-gray-800 mb-2 line-clamp-2 min-h-[3rem]">
                                    {product.name}
                                </h3>

                                <div className="flex items-end justify-between mb-4 pb-4 border-b border-gray-100">
                                    <div>
                                        <p className="text-xs text-gray-400 mb-0.5 font-medium">Preço</p>
                                        <p className="text-lg font-bold text-gray-900">R$ {product.price.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 mb-0.5 font-medium">Comissão</p>
                                        <p className="text-lg font-bold text-green-600">R$ {product.commission.toFixed(2)}</p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2">
                                    <button
                                        onClick={() => openPinterestSearch(product.name)}
                                        className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                                    >
                                        <Download size={18} />
                                        Baixar Vídeo
                                    </button>

                                    <button
                                        onClick={() => copyTags(product)}
                                        className="w-full bg-purple-50 text-purple-700 border border-purple-200 py-3 rounded-xl font-bold hover:bg-purple-100 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Tag size={18} />
                                        Copiar Tags
                                    </button>

                                    <a
                                        href={product.offerLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-full bg-gray-50 text-gray-700 border border-gray-200 py-3 rounded-xl font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                                    >
                                        <ExternalLink size={18} />
                                        Ver na Shopee
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 text-gray-400">
                    <Search size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Nenhum produto encontrado.</p>
                    <p className="text-sm mt-2">Configure suas credenciais de Afiliado na página Shopee Afiliado.</p>
                </div>
            )}

            {/* Pagination */}
            {!loading && products.length > 0 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-white text-gray-700 rounded-lg font-bold hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ← Anterior
                    </button>

                    {[...Array(totalPages)].map((_, index) => (
                        <button
                            key={index + 1}
                            onClick={() => setCurrentPage(index + 1)}
                            className={`w-10 h-10 rounded-lg font-bold transition-all ${currentPage === index + 1
                                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                                : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            {index + 1}
                        </button>
                    ))}

                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-white text-gray-700 rounded-lg font-bold hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Próxima →
                    </button>
                </div>
            )}

            {/* --- PINTEREST SEARCH MODAL --- */}
            {showPinterestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                    <Search size={24} />
                                </div>
                                Buscar Vídeo no Pinterest
                            </h3>
                            <button onClick={() => setShowPinterestModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <XCircle size={24} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6 bg-gray-50 border-b border-gray-100">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={pinterestKeyword}
                                    onChange={(e) => setPinterestKeyword(e.target.value)}
                                    className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder="Digite para buscar..."
                                />
                                <button
                                    onClick={() => searchPinterest(pinterestKeyword)}
                                    disabled={loadingPinterest}
                                    className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center gap-2"
                                >
                                    {loadingPinterest ? <Loader2 className="animate-spin" /> : <Search size={20} />}
                                    Buscar
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {loadingPinterest ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Loader2 className="animate-spin text-red-500 mb-4" size={40} />
                                    <p className="text-gray-500">Buscando vídeos no Pinterest...</p>
                                </div>
                            ) : pinterestResults.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {pinterestResults.map((pin) => (
                                        <div key={pin.id} className="group relative rounded-xl overflow-hidden cursor-pointer border border-gray-200 hover:border-red-500 transition-all">
                                            <img src={pin.imageUrl} alt={pin.description} className="w-full h-48 object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                                <button
                                                    onClick={() => downloadPinterestVideo(pin.pinUrl)}
                                                    disabled={downloadingPinterestVideo}
                                                    className="bg-white text-red-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-50 transition-colors w-full flex items-center justify-center gap-2"
                                                >
                                                    {downloadingPinterestVideo ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                                                    Baixar Vídeo
                                                </button>
                                                <a href={pin.pinUrl} target="_blank" rel="noreferrer" className="text-white text-xs hover:underline flex items-center gap-1">
                                                    Ver no Pinterest <ExternalLink size={10} />
                                                </a>
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                                <p className="text-white text-xs truncate">{pin.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 text-gray-400">
                                    <Search size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>Nenhum resultado encontrado.</p>
                                </div>
                            )}
                        </div>

                        {downloadedVideo && (
                            <div className="p-6 bg-green-50 border-t border-green-100 animate-slide-up">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-black rounded-lg overflow-hidden flex-shrink-0">
                                        <video src={downloadedVideo.localPath} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-green-800">Vídeo Baixado com Sucesso!</h4>
                                        <p className="text-xs text-green-600 break-all">{downloadedVideo.filename}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="p-2 bg-white text-green-700 rounded-lg border border-green-200 hover:bg-green-100" title="Enviar para WhatsApp">
                                            <MessageCircle size={20} />
                                        </button>
                                        <button className="p-2 bg-white text-pink-600 rounded-lg border border-pink-200 hover:bg-pink-50" title="Enviar para Instagram">
                                            <Instagram size={20} />
                                        </button>
                                        <button className="p-2 bg-white text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-50" title="Agendar">
                                            <Calendar size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShopeeVideoPage;

