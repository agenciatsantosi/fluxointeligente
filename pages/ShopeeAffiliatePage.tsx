import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useProducts } from '../context/ProductContext';
import { getShopeeAffiliateOrders, generateAffiliateLink, searchShopeeAffiliateProducts, getShopeeShopOffers, testShopeeAffiliateConnection } from '../services/shopeeService';
import { ShopeeAffiliateOrder, ShopeeAffiliateProduct, ShopeeShopOffer, ShopeeSortType } from '../types';
import { TrendingUp, Settings, Link as LinkIcon, DollarSign, Loader2, ShoppingCart, Search, Info, LayoutDashboard, ShoppingBag, Copy, Save, Store, Smartphone, Monitor, AlertOctagon, ShieldCheck, CheckCircle, Server, AlertTriangle, XCircle, ExternalLink, HelpCircle, Pin, Download, MessageCircle, Instagram, Calendar, AlertCircle } from 'lucide-react';

const ShopeeAffiliatePage: React.FC = () => {
    const { shopeeAffiliateSettings, saveShopeeAffiliateSettings, addLog } = useProducts();

    // Sub-navigation
    const [activeTab, setActiveTab] = useState<'dashboard' | 'best_sellers' | 'offers' | 'shops' | 'tools' | 'config'>('dashboard');

    // --- DASHBOARD STATES ---
    const [orders, setOrders] = useState<ShopeeAffiliateOrder[]>([]);
    const [loadingStats, setLoadingStats] = useState(false);
    const [isSimulatedStats, setIsSimulatedStats] = useState(false);
    const [orderLimit, setOrderLimit] = useState(50);
    const [dateRange, setDateRange] = useState(30); // days

    // --- SEARCH OFFERS STATES ---
    const [keyword, setKeyword] = useState('');
    const [sortType, setSortType] = useState<ShopeeSortType>('latest');
    const [products, setProducts] = useState<ShopeeAffiliateProduct[]>([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [isSimulatedSearch, setIsSimulatedSearch] = useState(false);

    // --- SHOP OFFERS STATES ---
    const [shops, setShops] = useState<ShopeeShopOffer[]>([]);
    const [loadingShops, setLoadingShops] = useState(false);

    // --- BEST SELLERS STATES ---
    const [bestSellers, setBestSellers] = useState<ShopeeAffiliateProduct[]>([]);
    const [loadingBestSellers, setLoadingBestSellers] = useState(false);

    // --- TOOLS STATES ---
    const [manualLink, setManualLink] = useState('');
    const [subId, setSubId] = useState('');
    const [generatedLink, setGeneratedLink] = useState('');
    const [loadingLink, setLoadingLink] = useState(false);

    // --- CONFIG STATES ---
    const [configData, setConfigData] = useState(shopeeAffiliateSettings);
    const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // --- PINTEREST VIDEO SEARCH STATES ---
    const [showPinterestModal, setShowPinterestModal] = useState(false);
    const [pinterestKeyword, setPinterestKeyword] = useState('');
    const [pinterestResults, setPinterestResults] = useState<any[]>([]);
    const [loadingPinterest, setLoadingPinterest] = useState(false);
    const [downloadingVideo, setDownloadingVideo] = useState(false);
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

    const downloadVideo = async (pinUrl: string) => {
        setDownloadingVideo(true);
        try {
            const response = await axios.post('/api' + '/pinterest/download-video', { pinUrl });
            if (response.data.success) {
                setDownloadedVideo({ localPath: response.data.localPath, filename: response.data.filename });
                showNotification('Vídeo baixado com sucesso!', 'success');
            }
        } catch (error) {
            console.error(error);
            showNotification('Erro ao baixar vídeo', 'error');
        } finally {
            setDownloadingVideo(false);
        }
    };

    // Initial loads
    useEffect(() => {
        if (shopeeAffiliateSettings.appId || shopeeAffiliateSettings.password) {
            setConfigData(shopeeAffiliateSettings);

            if (activeTab === 'dashboard') fetchStats();
            if (activeTab === 'best_sellers') fetchBestSellers();
            if (activeTab === 'shops') fetchShops();
        }
    }, [shopeeAffiliateSettings, activeTab, orderLimit, dateRange]);

    const fetchBestSellers = async () => {
        setLoadingBestSellers(true);
        try {
            // Busca genérica por "promoção" ou categoria popular para exibir os mais vendidos
            const { products: data } = await searchShopeeAffiliateProducts('oferta', shopeeAffiliateSettings, 'sales');
            setBestSellers(data);
        } catch (e) { console.error(e); }
        finally { setLoadingBestSellers(false); }
    };

    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            const { orders: data, isSimulated: simulated } = await getShopeeAffiliateOrders(shopeeAffiliateSettings, orderLimit, dateRange);
            setOrders(data);
            setIsSimulatedStats(simulated);
        } catch (e) { console.error(e); }
        finally { setLoadingStats(false); }
    };

    const fetchShops = async () => {
        setLoadingShops(true);
        try {
            const { shops: data } = await getShopeeShopOffers(shopeeAffiliateSettings);
            setShops(data);
        } catch (e) { console.error(e); }
        finally { setLoadingShops(false); }
    };

    const handleSearchOffers = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!keyword) return;
        setLoadingSearch(true);
        setProducts([]);
        try {
            const { products: data, isSimulated: simulated } = await searchShopeeAffiliateProducts(keyword, shopeeAffiliateSettings, sortType);
            setProducts(data);
            setIsSimulatedSearch(simulated);
        } catch (e: any) { showNotification(e.message, 'error'); }
        finally { setLoadingSearch(false); }
    }

    const handleSaveConfig = (e: React.FormEvent) => {
        e.preventDefault();
        saveShopeeAffiliateSettings({
            appId: configData.appId.trim(),
            password: configData.password.trim()
        });
        showNotification("Configurações de Afiliado Salvas!", 'success');
    };

    const handleTestConnection = async () => {
        if (!configData.appId || !configData.password) {
            setTestStatus('error');
            setTestMessage("Preencha App ID e Senha primeiro.");
            return;
        }
        setTestStatus('loading');
        setTestMessage("Testando assinatura e conexão...");

        try {
            await testShopeeAffiliateConnection({
                appId: configData.appId.trim(),
                password: configData.password.trim()
            });
            setTestStatus('success');
            setTestMessage("Conexão bem-sucedida! API Ativa.");
        } catch (error: any) {
            setTestStatus('error');
            setTestMessage(error.message || "Falha na conexão.");
        }
    };

    const handleGenerateManualLink = async () => {
        if (!manualLink) return;
        setLoadingLink(true);
        try {
            const link = await generateAffiliateLink(manualLink, shopeeAffiliateSettings, subId);
            setGeneratedLink(link);
            addLog('AFFILIATE_LINK', `Link gerado com SubID: ${subId}`);
            showNotification("Link gerado com sucesso!", 'success');
        } catch (e: any) { showNotification("Erro: " + e.message, 'error'); }
        finally { setLoadingLink(false); }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showNotification("Link copiado!", 'success');
    }

    const totalComission = orders.reduce((acc, curr) => acc + curr.totalCommission, 0);

    const MenuButton = ({ id, icon: Icon, label }: any) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center px-6 py-4 font-bold text-sm transition-all duration-300 whitespace-nowrap relative ${activeTab === id
                ? 'text-orange-600'
                : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                }`}
        >
            <Icon size={18} className={`mr-2 transition-transform duration-300 ${activeTab === id ? 'scale-110' : ''}`} />
            {label}
            {activeTab === id && (
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-t-full"></div>
            )}
        </button>
    )

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in ${notification.type === 'success' ? 'bg-green-500 text-white' :
                    notification.type === 'error' ? 'bg-red-500 text-white' :
                        'bg-blue-500 text-white'
                    }`}>
                    {notification.type === 'success' ? <CheckCircle size={24} /> :
                        notification.type === 'error' ? <AlertCircle size={24} /> :
                            <HelpCircle size={24} />}
                    <span className="font-bold">{notification.message}</span>
                </div>
            )}

            {/* Header Section */}
            <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-3xl p-8 text-white shadow-xl shadow-orange-900/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <ShoppingBag size={32} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold">Painel Afiliado Shopee</h1>
                        </div>
                        <p className="text-orange-100 text-lg max-w-xl">Gerencie suas vendas, encontre produtos e acompanhe seus ganhos.</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-xl border border-white/20">
                            <p className="text-orange-100 text-xs font-bold uppercase tracking-wider mb-1">Comissão Total</p>
                            <p className="text-2xl font-bold">R$ {totalComission.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Submenu Navigation */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm border border-white/20 flex overflow-x-auto no-scrollbar p-1">
                <MenuButton id="dashboard" icon={LayoutDashboard} label="Visão Geral" />
                <MenuButton id="best_sellers" icon={TrendingUp} label="Mais Vendidos" />
                <MenuButton id="offers" icon={Search} label="Buscar Ofertas" />
                <MenuButton id="shops" icon={Store} label="Lojas Parceiras" />
                <MenuButton id="tools" icon={LinkIcon} label="Ferramentas" />
                <MenuButton id="config" icon={Settings} label="Configurações" />
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">

                {/* --- TAB: BEST SELLERS (NEW) --- */}
                {activeTab === 'best_sellers' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-gradient-to-br from-orange-50 to-red-50 p-8 rounded-3xl border border-orange-100 text-center">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                                <TrendingUp className="text-orange-500" />
                                Mais Vendidos da Semana
                            </h2>
                            <p className="text-gray-600 max-w-2xl mx-auto">
                                Produtos em alta com grande potencial de conversão. Aproveite para gerar links e divulgar agora mesmo.
                            </p>
                        </div>

                        {loadingBestSellers ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="animate-spin text-orange-500 mb-4" size={40} />
                                <p className="text-gray-500 font-medium">Buscando as melhores ofertas...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {bestSellers.map((product) => (
                                    <div key={product.itemId} className="group bg-white border border-gray-100 rounded-3xl overflow-hidden hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 flex flex-col hover:-translate-y-1">
                                        <div className="relative h-64 overflow-hidden">
                                            <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                                            />
                                            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center border border-orange-100">
                                                <TrendingUp size={12} className="mr-1" />
                                                {(product.commissionRate * 100).toFixed(1)}% Com.
                                            </div>
                                            {product.sales > 0 && (
                                                <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                                                    {product.sales} vendidos
                                                </div>
                                            )}

                                            {/* Overlay Button */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                                <button
                                                    onClick={() => copyToClipboard(product.offerLink)}
                                                    className="bg-white text-gray-900 px-6 py-3 rounded-full font-bold transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 flex items-center shadow-lg hover:bg-orange-50"
                                                >
                                                    <Copy size={18} className="mr-2" /> Copiar Link
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-5 flex-1 flex flex-col">
                                            <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-4 flex-1 leading-relaxed" title={product.name}>
                                                {product.name}
                                            </h4>

                                            <div className="flex items-end justify-between mt-auto pt-4 border-t border-gray-50">
                                                <div>
                                                    <p className="text-xs text-gray-400 mb-0.5 font-medium">Preço</p>
                                                    <p className="text-lg font-bold text-gray-900">R$ {product.price.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-400 mb-0.5 font-medium">Sua Comissão</p>
                                                    <p className="text-lg font-bold text-green-600">R$ {product.commission.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => openPinterestSearch(product.name)}
                                                className="w-full bg-red-50 text-red-700 border border-red-200 py-3 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2 mt-4"
                                            >
                                                <Pin size={18} /> Buscar Vídeo (Pinterest)
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: DASHBOARD --- */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Date Range Selector */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-gray-700">Período:</span>
                                <div className="flex bg-gray-100 p-1 rounded-xl">
                                    {[7, 15, 30].map(days => (
                                        <button
                                            key={days}
                                            onClick={() => setDateRange(days)}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${dateRange === days
                                                ? 'bg-white text-orange-600 shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            {days} dias
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                {new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')} ~ {new Date().toLocaleDateString('pt-BR')}
                            </div>
                        </div>

                        {/* Metrics Grid */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-800">Métricas Principais</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Clicks */}
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg shadow-gray-200/50 hover:-translate-y-1 transition-transform duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm text-gray-500 font-bold">Cliques</span>
                                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                            <TrendingUp className="text-blue-600" size={20} />
                                        </div>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-900 mb-1">
                                        {orders.reduce((acc, order) => acc + (order.items?.length || 0), 0)}
                                    </p>
                                    <span className="text-xs font-medium text-gray-400">Total de cliques</span>
                                </div>

                                {/* Orders */}
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg shadow-gray-200/50 hover:-translate-y-1 transition-transform duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm text-gray-500 font-bold">Pedidos</span>
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                                            <ShoppingCart className="text-purple-600" size={20} />
                                        </div>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-900 mb-1">{orders.length}</p>
                                    <span className="text-xs font-medium text-gray-400">Pedidos confirmados</span>
                                </div>

                                {/* Commission */}
                                <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl p-6 text-white shadow-xl shadow-orange-500/30 hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                        <span className="text-sm text-white/90 font-bold">Comissão Estimada</span>
                                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                            <DollarSign className="text-white" size={20} />
                                        </div>
                                    </div>
                                    <p className="text-4xl font-bold mb-1 relative z-10">R$ {totalComission.toFixed(2)}</p>
                                    <span className="text-xs text-white/80 font-medium relative z-10">Ganhos no período</span>
                                </div>

                                {/* Items Sold */}
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg shadow-gray-200/50 hover:-translate-y-1 transition-transform duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm text-gray-500 font-bold">Itens Vendidos</span>
                                        <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                                            <ShoppingBag className="text-green-600" size={20} />
                                        </div>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-900 mb-1">
                                        {orders.reduce((acc, order) => acc + (order.items?.length || 0), 0)}
                                    </p>
                                    <span className="text-xs font-medium text-gray-400">Total de itens</span>
                                </div>

                                {/* Order Value */}
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg shadow-gray-200/50 hover:-translate-y-1 transition-transform duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm text-gray-500 font-bold">Valor Total (GMV)</span>
                                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                            <DollarSign className="text-indigo-600" size={20} />
                                        </div>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-900 mb-1">
                                        R$ {orders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + (item.itemPrice || 0), 0), 0).toFixed(1)}
                                    </p>
                                    <span className="text-xs font-medium text-gray-400">Volume de vendas</span>
                                </div>

                                {/* New Buyers */}
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-lg shadow-gray-200/50 hover:-translate-y-1 transition-transform duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm text-gray-500 font-bold">Novos Compradores</span>
                                        <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
                                            <CheckCircle className="text-teal-600" size={20} />
                                        </div>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-900 mb-1">
                                        {orders.filter(order => order.buyerType === 'NEW').length}
                                    </p>
                                    <span className="text-xs font-medium text-gray-400">Clientes novos</span>
                                </div>
                            </div>
                        </div>

                        {/* Top 5 Products */}
                        {orders.length > 0 && (
                            <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-lg shadow-gray-200/50">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 text-lg">
                                    <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                        <TrendingUp size={20} />
                                    </div>
                                    Meus Top 5 Produtos
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-4 py-4 text-left font-bold rounded-tl-xl">Produto</th>
                                                <th className="px-4 py-4 text-center font-bold">Itens vendidos</th>
                                                <th className="px-4 py-4 text-center font-bold">Comissão est. (R$)</th>
                                                <th className="px-4 py-4 text-center font-bold rounded-tr-xl">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {(() => {
                                                const productMap = new Map<string, { name: string; count: number; commission: number; itemId: string }>();
                                                orders.forEach(order => {
                                                    order.items.forEach(item => {
                                                        const existing = productMap.get(item.itemId) || { name: item.itemName, count: 0, commission: 0, itemId: item.itemId };
                                                        existing.count += 1;
                                                        existing.commission += item.itemCommission || 0;
                                                        productMap.set(item.itemId, existing);
                                                    });
                                                });
                                                return Array.from(productMap.values())
                                                    .sort((a, b) => b.commission - a.commission)
                                                    .slice(0, 5)
                                                    .map((product, index) => (
                                                        <tr key={product.itemId} className="hover:bg-orange-50/30 transition-colors">
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                                                        index === 1 ? 'bg-gray-100 text-gray-700' :
                                                                            index === 2 ? 'bg-orange-100 text-orange-700' :
                                                                                'bg-gray-50 text-gray-500'
                                                                        }`}>
                                                                        {index + 1}
                                                                    </div>
                                                                    <div className="max-w-md">
                                                                        <p className="font-bold text-gray-800 truncate" title={product.name}>{product.name}</p>
                                                                        <p className="text-xs text-gray-400 font-mono">ID: {product.itemId}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <span className="inline-flex items-center justify-center bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">
                                                                    {product.count}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4 text-center font-bold text-green-600 text-base">
                                                                {product.commission.toFixed(2)}
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <button
                                                                    onClick={() => copyToClipboard(`https://shopee.com.br/product/${product.itemId}`)}
                                                                    className="bg-orange-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
                                                                >
                                                                    Obter link
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}


                        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-lg shadow-gray-200/50">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                                    <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                                        <DollarSign size={20} />
                                    </div>
                                    Relatório de Conversão Detalhado
                                </h3>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={orderLimit}
                                        onChange={(e) => setOrderLimit(Number(e.target.value))}
                                        className="text-xs font-bold border border-gray-200 rounded-xl p-2.5 bg-gray-50 focus:ring-2 focus:ring-orange-500 outline-none"
                                    >
                                        <option value={10}>10 itens</option>
                                        <option value={20}>20 itens</option>
                                        <option value={50}>50 itens</option>
                                        <option value={100}>100 itens</option>
                                    </select>
                                    <button
                                        onClick={fetchStats}
                                        disabled={loadingStats}
                                        className="text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-orange-500/20"
                                    >
                                        {loadingStats ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
                                        {loadingStats ? 'Atualizando...' : 'Atualizar'}
                                    </button>
                                </div>
                            </div>

                            {isSimulatedStats && (
                                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-3">
                                    <Info size={18} className="flex-shrink-0 text-yellow-600" />
                                    <span><strong>Modo Simulação:</strong> Exibindo dados fictícios para demonstrar campos como Fraude, Dispositivo e SubID.</span>
                                </div>
                            )}

                            {orders.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-4 font-bold tracking-wider rounded-tl-xl">Data / ID</th>
                                                <th className="px-6 py-4 font-bold tracking-wider">Produto / Item</th>
                                                <th className="px-6 py-4 text-center font-bold tracking-wider">Device</th>
                                                <th className="px-6 py-4 text-center font-bold tracking-wider">Comprador</th>
                                                <th className="px-6 py-4 text-center font-bold tracking-wider">Fraude</th>
                                                <th className="px-6 py-4 font-bold tracking-wider">SubID</th>
                                                <th className="px-6 py-4 font-bold tracking-wider">Comissão</th>
                                                <th className="px-6 py-4 font-bold tracking-wider rounded-tr-xl">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {orders.map((order) => (
                                                <tr key={order.orderId} className="hover:bg-orange-50/30 transition-colors duration-150 group">
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-gray-900">{new Date(order.purchaseTime * 1000).toLocaleDateString()}</div>
                                                        <div className="text-xs text-gray-400 font-mono mt-0.5 group-hover:text-orange-500 transition-colors">{order.orderId}</div>
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-gray-700 max-w-xs">
                                                        <div className="truncate" title={order.items[0]?.itemName}>{order.items[0]?.itemName}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {order.deviceType === 'APP' ? (
                                                            <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-50 text-blue-600 rounded-full shadow-sm" title="App"><Smartphone size={16} /></span>
                                                        ) : (
                                                            <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-600 rounded-full shadow-sm" title="Web"><Monitor size={16} /></span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {order.buyerType === 'NEW' ? (
                                                            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full border border-green-200 uppercase tracking-wide">Novo</span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200 uppercase tracking-wide">Recorrente</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {order.fraudStatus === 'VERIFIED' && <span title="Verificado"><ShieldCheck size={18} className="text-green-500 mx-auto" /></span>}
                                                        {order.fraudStatus === 'FRAUD' && <span title="Fraude Detectada"><AlertOctagon size={18} className="text-red-500 mx-auto" /></span>}
                                                        {order.fraudStatus === 'UNVERIFIED' && <div className="w-2 h-2 bg-gray-300 rounded-full mx-auto" title="Não verificado"></div>}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                                                        {order.subId ? <span className="bg-gray-100 px-2 py-1 rounded text-gray-600 font-bold">{order.subId}</span> : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-green-600 text-base">
                                                        R$ {order.totalCommission.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-3 py-1 text-xs rounded-full font-bold border
                                                            ${order.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                order.status === 'Cancelled' || order.status === 'Void' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                    'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-16 text-center text-gray-400">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <ShoppingCart size={32} className="opacity-30" />
                                    </div>
                                    <p className="font-medium">Nenhuma venda encontrada no período.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- TAB: OFFERS --- */}
                {activeTab === 'offers' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-lg shadow-gray-200/50">
                            <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 text-xl">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                    <Search size={24} />
                                </div>
                                Buscar Ofertas
                            </h3>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 flex gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                        <input
                                            type="text"
                                            value={keyword}
                                            onChange={(e) => setKeyword(e.target.value)}
                                            placeholder="Buscar produtos (ex: iPhone, Tênis)..."
                                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all font-medium"
                                        />
                                    </div>
                                    <select
                                        value={sortType}
                                        onChange={(e) => setSortType(e.target.value as ShopeeSortType)}
                                        className="p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-orange-500 outline-none"
                                    >
                                        <option value="latest">Recentes</option>
                                        <option value="sales">Mais Vendidos</option>
                                        <option value="commission_rate_desc">Maior Comissão</option>
                                        <option value="price_asc">Menor Preço</option>
                                    </select>
                                </div>
                                <button
                                    onClick={(e) => handleSearchOffers(e)}
                                    disabled={loadingSearch || !keyword}
                                    className="bg-orange-500 text-white px-8 py-4 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap shadow-lg shadow-orange-500/20 transition-all hover:-translate-y-0.5"
                                >
                                    {loadingSearch ? <Loader2 className="animate-spin" /> : 'Buscar Produtos'}
                                </button>
                            </div>
                        </div>

                        {products.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {products.map((product) => (
                                    <div key={product.itemId} className="bg-white border border-gray-100 rounded-3xl overflow-hidden hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 flex flex-col hover:-translate-y-1 group">
                                        <div className="relative h-56 bg-gray-100 overflow-hidden">
                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" />
                                            <div className="absolute top-3 right-3 bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                                {(product.commissionRate * 100).toFixed(1)}% Com.
                                            </div>
                                            {product.sales && product.sales > 0 && (
                                                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full">
                                                    {product.sales} vendidos
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-5 flex-1 flex flex-col">
                                            <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-3 flex-1" title={product.name}>
                                                {product.name}
                                            </h4>
                                            <div className="flex justify-between items-end mb-4 pt-4 border-t border-gray-50">
                                                <div>
                                                    <p className="text-xs text-gray-500 font-medium">Preço</p>
                                                    <p className="font-bold text-gray-900 text-lg">R$ {product.price.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500 font-medium">Comissão</p>
                                                    <p className="font-bold text-green-600 text-lg">R$ {product.commission.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(product.offerLink)}
                                                className="w-full bg-orange-50 text-orange-700 border border-orange-200 py-3 rounded-xl text-sm font-bold hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Copy size={18} /> Copiar Link
                                            </button>
                                            <button
                                                onClick={() => openPinterestSearch(product.name)}
                                                className="w-full bg-red-50 text-red-700 border border-red-200 py-3 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2 mt-2"
                                            >
                                                <Pin size={18} /> Buscar Vídeo (Pinterest)
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: SHOPS (NEW) --- */}
                {activeTab === 'shops' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2 text-xl">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <Store size={24} />
                                </div>
                                Lojas com Melhores Comissões
                            </h3>
                            <p className="text-gray-500">Encontre "Vendedores Chave" (Key Sellers) que oferecem taxas diferenciadas.</p>
                        </div>

                        {loadingShops ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={40} /></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {shops.map(shop => (
                                    <div key={shop.shopId} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex items-center gap-5">
                                        <img src={shop.shopAvatar || 'https://via.placeholder.com/80'} alt="" className="w-20 h-20 rounded-full border-2 border-gray-100 p-1" />
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-gray-800 text-lg">{shop.shopName}</h4>
                                                {shop.isKeySeller && <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-200">KEY SELLER</span>}
                                            </div>
                                            <p className="text-xs text-gray-400 font-mono mb-2">ID: {shop.shopId}</p>
                                            <p className="text-sm text-orange-600 font-bold bg-orange-50 inline-block px-3 py-1 rounded-lg">
                                                Comissão Média: {(shop.commissionRate * 100).toFixed(1)}%
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(shop.offerLink)}
                                            className="bg-gray-50 text-gray-600 p-3 rounded-xl hover:bg-orange-50 hover:text-orange-600 transition-colors border border-gray-200"
                                            title="Copiar Link da Loja"
                                        >
                                            <Copy size={20} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: TOOLS --- */}
                {activeTab === 'tools' && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-lg shadow-gray-200/50 animate-fade-in">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                                <LinkIcon size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Gerador de Links com Rastreamento</h3>
                                <p className="text-gray-500">Crie Short Links e use SubIDs para saber a origem das vendas.</p>
                            </div>
                        </div>

                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Link Original (Produto ou Loja)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: https://shopee.com.br/product/..."
                                    value={manualLink}
                                    onChange={(e) => setManualLink(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Sub ID (Opcional)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: instagram_stories, telegram_grupo_vip..."
                                    value={subId}
                                    onChange={(e) => setSubId(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium"
                                />
                                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                    <Info size={12} />
                                    Use para identificar qual campanha gerou a venda no relatório.
                                </p>
                            </div>

                            <button
                                onClick={handleGenerateManualLink}
                                disabled={loadingLink || !manualLink}
                                className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center w-full sm:w-auto shadow-lg shadow-blue-500/20 hover:-translate-y-0.5"
                            >
                                {loadingLink ? <Loader2 className="animate-spin mr-2" /> : 'Gerar Short Link'}
                            </button>
                        </div>

                        {generatedLink && (
                            <div className="mt-8 bg-green-50 border border-green-200 rounded-2xl p-6 animate-scale-in">
                                <p className="text-xs font-bold text-green-800 uppercase mb-2 flex items-center gap-2">
                                    <CheckCircle size={14} />
                                    Seu Link de Afiliado Gerado
                                </p>
                                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-green-100">
                                    <code className="text-green-900 font-mono text-sm break-all">{generatedLink}</code>
                                    <button
                                        onClick={() => copyToClipboard(generatedLink)}
                                        className="text-sm bg-green-100 text-green-700 px-6 py-2.5 rounded-lg hover:bg-green-200 whitespace-nowrap flex items-center font-bold transition-colors"
                                    >
                                        <Copy size={16} className="mr-2" /> Copiar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: CONFIG --- */}
                {activeTab === 'config' && (
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-lg shadow-gray-200/50 max-w-2xl animate-fade-in mx-auto">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-gray-100 text-gray-600 rounded-2xl">
                                <Settings size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Credenciais de API</h3>
                                <p className="text-gray-500">Necessário para acessar relatórios e gerar links assinados.</p>
                            </div>
                        </div>

                        {/* Warning Banner */}
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-5 rounded-r-xl mb-8">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-yellow-800 font-bold mb-1">
                                        Atenção: O "App ID" de Afiliado é diferente do "Partner ID" de Vendedor.
                                    </p>
                                    <p className="text-xs text-yellow-700 leading-relaxed">
                                        Se você usar o Partner ID aqui, ocorrerá o erro <code>10020: Invalid Credential</code>.
                                        Pegue os dados corretos no <a href="https://affiliate.shopee.com.br/open_api" target="_blank" rel="noreferrer" className="underline font-bold hover:text-yellow-900 inline-flex items-center gap-1">Portal de Afiliados <ExternalLink size={10} /></a>.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSaveConfig} className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">App ID</label>
                                <input
                                    type="text" name="appId" value={configData.appId} onChange={(e) => setConfigData({ ...configData, appId: e.target.value })}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                                    placeholder="Ex: 18322..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Senha / Secret</label>
                                <input
                                    type="password" name="password" value={configData.password} onChange={(e) => setConfigData({ ...configData, password: e.target.value })}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                                />
                            </div>

                            {/* Feedback Status */}
                            {testStatus !== 'idle' && (
                                <div className={`p-4 rounded-xl flex items-center text-sm font-medium animate-fade-in ${testStatus === 'loading' ? 'bg-blue-50 text-blue-700' :
                                    testStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                                        'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                    {testStatus === 'loading' && <Loader2 className="animate-spin mr-2" size={18} />}
                                    {testStatus === 'success' && <CheckCircle className="mr-2" size={18} />}
                                    {testStatus === 'error' && <XCircle className="mr-2" size={18} />}
                                    <span>{testMessage}</span>
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    disabled={testStatus === 'loading'}
                                    className="flex-1 bg-gray-100 text-gray-700 px-6 py-4 rounded-xl hover:bg-gray-200 text-sm font-bold flex items-center justify-center transition-colors"
                                >
                                    <Server size={18} className="mr-2" /> Testar API
                                </button>
                                <button type="submit" className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-xl hover:bg-black text-sm font-bold flex items-center justify-center transition-colors shadow-lg shadow-gray-900/20">
                                    <Save size={18} className="mr-2" /> Salvar Credenciais
                                </button>
                            </div>
                        </form>
                    </div>
                )}

            </div>
            {/* --- PINTEREST SEARCH MODAL --- */}
            {showPinterestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                    <Pin size={24} />
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
                                                    onClick={() => downloadVideo(pin.pinUrl)}
                                                    disabled={downloadingVideo}
                                                    className="bg-white text-red-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-50 transition-colors w-full flex items-center justify-center gap-2"
                                                >
                                                    {downloadingVideo ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
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

export default ShopeeAffiliatePage;


