
import React, { useEffect, useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { getShopeeAffiliateOrders, generateAffiliateLink, searchShopeeAffiliateProducts, getShopeeShopOffers, testShopeeAffiliateConnection } from '../services/shopeeService';
import { ShopeeAffiliateOrder, ShopeeAffiliateProduct, ShopeeShopOffer, ShopeeSortType } from '../types';
import { TrendingUp, Settings, Link as LinkIcon, DollarSign, Loader2, ShoppingCart, Search, Info, LayoutDashboard, ShoppingBag, Copy, Save, Store, Smartphone, Monitor, AlertOctagon, ShieldCheck, CheckCircle, Server, AlertTriangle, XCircle } from 'lucide-react';

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

    // Initial loads
    useEffect(() => {
        if (shopeeAffiliateSettings.appId && shopeeAffiliateSettings.password) {
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
        } catch (e: any) { alert(e.message); }
        finally { setLoadingSearch(false); }
    }

    const handleSaveConfig = (e: React.FormEvent) => {
        e.preventDefault();
        saveShopeeAffiliateSettings({
            appId: configData.appId.trim(),
            password: configData.password.trim()
        });
        alert("Configurações de Afiliado Salvas!");
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
        } catch (e: any) { alert("Erro: " + e.message); }
        finally { setLoadingLink(false); }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Link copiado!");
    }

    const totalComission = orders.reduce((acc, curr) => acc + curr.totalCommission, 0);

    const MenuButton = ({ id, icon: Icon, label }: any) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center px-6 py-4 font-medium text-sm transition-all duration-200 whitespace-nowrap border-b-2 ${activeTab === id
                ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
        >
            <Icon size={18} className={`mr-2 ${activeTab === id ? 'text-orange-500' : 'text-gray-400'}`} />
            {label}
        </button>
    )

    return (
        <div className="space-y-6 max-w-6xl mx-auto">

            {/* Submenu Navigation */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex overflow-x-auto no-scrollbar mb-6">
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
                        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">🔥 Mais Vendidos da Semana</h2>
                            <p className="text-gray-500 max-w-2xl mx-auto">
                                Produtos em alta com grande potencial de conversão. Aproveite para gerar links e divulgar agora mesmo.
                            </p>
                        </div>

                        {loadingBestSellers ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="animate-spin text-orange-500 mb-4" size={40} />
                                <p className="text-gray-500">Buscando as melhores ofertas...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {bestSellers.map((product) => (
                                    <div key={product.itemId} className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col">
                                        <div className="relative h-64 overflow-hidden">
                                            <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                                            />
                                            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center">
                                                <TrendingUp size={12} className="mr-1" />
                                                {(product.commissionRate * 100).toFixed(1)}% Com.
                                            </div>
                                            {product.sales > 0 && (
                                                <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                                                    {product.sales} vendidos
                                                </div>
                                            )}

                                            {/* Overlay Button */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                                <button
                                                    onClick={() => copyToClipboard(product.offerLink)}
                                                    className="bg-white text-gray-900 px-6 py-3 rounded-full font-bold transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 flex items-center shadow-lg"
                                                >
                                                    <Copy size={18} className="mr-2" /> Copiar Link
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-5 flex-1 flex flex-col">
                                            <h4 className="font-medium text-gray-800 text-sm line-clamp-2 mb-4 flex-1 leading-relaxed" title={product.name}>
                                                {product.name}
                                            </h4>

                                            <div className="flex items-end justify-between mt-auto pt-4 border-t border-gray-50">
                                                <div>
                                                    <p className="text-xs text-gray-400 mb-0.5">Preço</p>
                                                    <p className="text-lg font-bold text-gray-900">R$ {product.price.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-400 mb-0.5">Sua Comissão</p>
                                                    <p className="text-lg font-bold text-green-600">R$ {product.commission.toFixed(2)}</p>
                                                </div>
                                            </div>
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
                        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700">Período dos dados:</span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setDateRange(7)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateRange === 7
                                                ? 'bg-orange-500 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            Últimos 7 dias
                                        </button>
                                        <button
                                            onClick={() => setDateRange(15)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateRange === 15
                                                ? 'bg-orange-500 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            Últimos 15 dias
                                        </button>
                                        <button
                                            onClick={() => setDateRange(30)}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateRange === 30
                                                ? 'bg-orange-500 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            Últimos 30 dias
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">
                                    {new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')} ~ {new Date().toLocaleDateString('pt-BR')}
                                </div>
                            </div>
                        </div>
                        {/* Metrics Grid */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-800">Métricas Principais</h2>
                                <span className="text-xs text-gray-500">vs dia anterior</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Clicks */}
                                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-gray-500 font-medium">Cliques</span>
                                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                                            <TrendingUp className="text-blue-600" size={16} />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900 mb-1">
                                        {orders.reduce((acc, order) => acc + (order.items?.length || 0), 0)}
                                    </p>
                                    <span className="text-xs text-gray-400">Total de cliques</span>
                                </div>

                                {/* Orders */}
                                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-gray-500 font-medium">Pedidos</span>
                                        <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                                            <ShoppingCart className="text-purple-600" size={16} />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900 mb-1">{orders.length}</p>
                                    <span className="text-xs text-gray-400">Pedidos confirmados</span>
                                </div>

                                {/* Commission */}
                                <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl p-5 text-white shadow-lg hover:shadow-xl transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-white/90 font-medium">Comissão est. (R$)</span>
                                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                                            <DollarSign className="text-white" size={16} />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold mb-1">{totalComission.toFixed(2)}</p>
                                    <span className="text-xs text-white/80">Comissão estimada</span>
                                </div>

                                {/* Items Sold */}
                                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-gray-500 font-medium">Itens vendidos</span>
                                        <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                                            <ShoppingBag className="text-green-600" size={16} />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900 mb-1">
                                        {orders.reduce((acc, order) => acc + (order.items?.length || 0), 0)}
                                    </p>
                                    <span className="text-xs text-gray-400">Total de itens</span>
                                </div>

                                {/* Order Value */}
                                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-gray-500 font-medium">Valor do pedido(R$)</span>
                                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                                            <DollarSign className="text-indigo-600" size={16} />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900 mb-1">
                                        {orders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + (item.itemPrice || 0), 0), 0).toFixed(1)}
                                    </p>
                                    <span className="text-xs text-gray-400">Valor total</span>
                                </div>

                                {/* New Buyers */}
                                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm text-gray-500 font-medium">Novos compradores</span>
                                        <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                                            <CheckCircle className="text-teal-600" size={16} />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold text-gray-900 mb-1">
                                        {orders.filter(order => order.buyerType === 'NEW').length}
                                    </p>
                                    <span className="text-xs text-gray-400">Compradores novos</span>
                                </div>
                            </div>
                        </div>

                        {/* Top 5 Products */}
                        {orders.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <TrendingUp className="text-orange-600" size={20} />
                                    Meus Top 5 produtos
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">Produto</th>
                                                <th className="px-4 py-3 text-center font-semibold">Itens vendidos</th>
                                                <th className="px-4 py-3 text-center font-semibold">Comissão est. (R$)</th>
                                                <th className="px-4 py-3 text-center font-semibold">Ação</th>
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
                                                        <tr key={product.itemId} className="hover:bg-orange-50/20 transition-colors">
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-600">
                                                                        {index + 1}
                                                                    </div>
                                                                    <div className="max-w-md">
                                                                        <p className="font-medium text-gray-800 truncate" title={product.name}>{product.name}</p>
                                                                        <p className="text-xs text-gray-400 font-mono">ID: {product.itemId}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <span className="inline-flex items-center justify-center bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                                                                    {product.count}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4 text-center font-bold text-green-600 text-base">
                                                                {product.commission.toFixed(2)}
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <button
                                                                    onClick={() => copyToClipboard(`https://shopee.com.br/product/${product.itemId}`)}
                                                                    className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors"
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


                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <TrendingUp className="text-orange-600" size={20} />
                                    Relatório de Conversão Detalhado
                                </h3>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={orderLimit}
                                        onChange={(e) => setOrderLimit(Number(e.target.value))}
                                        className="text-xs border border-gray-300 rounded-lg p-1.5 bg-gray-50 focus:ring-2 focus:ring-orange-500 outline-none"
                                    >
                                        <option value={10}>10 itens</option>
                                        <option value={20}>20 itens</option>
                                        <option value={50}>50 itens</option>
                                        <option value={100}>100 itens</option>
                                    </select>
                                    <button onClick={fetchStats} disabled={loadingStats} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                        {loadingStats ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                                        {loadingStats ? 'Atualizando...' : 'Atualizar'}
                                    </button>
                                </div>
                            </div>

                            {isSimulatedStats && (
                                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-lg mb-4 text-xs flex items-center">
                                    <Info size={14} className="mr-2 flex-shrink-0" />
                                    <span><strong>Modo Simulação:</strong> Exibindo dados fictícios para demonstrar campos como Fraude, Dispositivo e SubID.</span>
                                </div>
                            )}

                            {orders.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-4 font-semibold tracking-wider">Data / ID</th>
                                                <th className="px-6 py-4 font-semibold tracking-wider">Produto / Item</th>
                                                <th className="px-6 py-4 text-center font-semibold tracking-wider">Device</th>
                                                <th className="px-6 py-4 text-center font-semibold tracking-wider">Comprador</th>
                                                <th className="px-6 py-4 text-center font-semibold tracking-wider">Fraude</th>
                                                <th className="px-6 py-4 font-semibold tracking-wider">SubID</th>
                                                <th className="px-6 py-4 font-semibold tracking-wider">Comissão</th>
                                                <th className="px-6 py-4 font-semibold tracking-wider">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {orders.map((order) => (
                                                <tr key={order.orderId} className="hover:bg-orange-50/30 transition-colors duration-150 group">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">{new Date(order.purchaseTime * 1000).toLocaleDateString()}</div>
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
                                                        {order.subId ? <span className="bg-gray-100 px-2 py-1 rounded text-gray-600">{order.subId}</span> : '-'}
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
                                <div className="py-12 text-center text-gray-400">
                                    <ShoppingCart size={48} className="mx-auto mb-3 opacity-20" />
                                    <p>Nenhuma venda encontrada.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- TAB: OFFERS --- */}
                {activeTab === 'offers' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Search size={20} className="text-orange-600" />
                                Product Offer V2
                            </h3>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        placeholder="Buscar produtos..."
                                        className="flex-1 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    />
                                    <select
                                        value={sortType}
                                        onChange={(e) => setSortType(e.target.value as ShopeeSortType)}
                                        className="p-2.5 border border-gray-300 rounded-lg bg-gray-50 text-sm"
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
                                    className="bg-orange-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                >
                                    {loadingSearch ? <Loader2 className="animate-spin" /> : 'Buscar'}
                                </button>
                            </div>
                        </div>

                        {products.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {products.map((product) => (
                                    <div key={product.itemId} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                                        <div className="relative h-48 bg-gray-100">
                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                            <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded shadow">
                                                {(product.commissionRate * 100).toFixed(1)}% Com.
                                            </div>
                                            {product.sales && product.sales > 0 && (
                                                <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                                                    {product.sales} vendidos
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 flex-1 flex flex-col">
                                            <h4 className="font-medium text-gray-800 text-sm line-clamp-2 mb-2 flex-1" title={product.name}>
                                                {product.name}
                                            </h4>
                                            <div className="flex justify-between items-end mb-3">
                                                <div>
                                                    <p className="text-xs text-gray-500">Preço</p>
                                                    <p className="font-bold text-gray-900">R$ {product.price.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500">Comissão</p>
                                                    <p className="font-bold text-green-600">R$ {product.commission.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(product.offerLink)}
                                                className="w-full bg-orange-50 text-orange-700 border border-orange-200 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Copy size={16} /> Copiar Link
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
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                                <Store size={20} className="text-orange-600" />
                                Lojas com Melhores Comissões
                            </h3>
                            <p className="text-sm text-gray-500">Encontre "Vendedores Chave" (Key Sellers) que oferecem taxas diferenciadas.</p>
                        </div>

                        {loadingShops ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {shops.map(shop => (
                                    <div key={shop.shopId} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center gap-4">
                                        <img src={shop.shopAvatar || 'https://via.placeholder.com/80'} alt="" className="w-16 h-16 rounded-full border border-gray-100" />
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-gray-800">{shop.shopName}</h4>
                                                {shop.isKeySeller && <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">KEY SELLER</span>}
                                            </div>
                                            <p className="text-sm text-gray-500">ID: {shop.shopId}</p>
                                            <p className="text-sm text-orange-600 font-medium mt-1">
                                                Comissão Média: {(shop.commissionRate * 100).toFixed(1)}%
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(shop.offerLink)}
                                            className="bg-orange-50 text-orange-600 p-2 rounded-lg hover:bg-orange-100"
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
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-fade-in">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <LinkIcon size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800">Gerador de Links com Rastreamento</h3>
                                <p className="text-sm text-gray-500">Crie Short Links e use SubIDs para saber a origem das vendas.</p>
                            </div>
                        </div>

                        <div className="space-y-4 max-w-3xl">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Link Original (Produto ou Loja)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: https://shopee.com.br/product/..."
                                    value={manualLink}
                                    onChange={(e) => setManualLink(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sub ID (Opcional)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: instagram_stories, telegram_grupo_vip..."
                                    value={subId}
                                    onChange={(e) => setSubId(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">Use para identificar qual campanha gerou a venda no relatório.</p>
                            </div>

                            <button
                                onClick={handleGenerateManualLink}
                                disabled={loadingLink || !manualLink}
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center w-full sm:w-auto"
                            >
                                {loadingLink ? <Loader2 className="animate-spin mr-2" /> : 'Gerar Short Link'}
                            </button>
                        </div>

                        {generatedLink && (
                            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="text-xs font-bold text-green-800 uppercase mb-1">Seu Link de Afiliado:</p>
                                <div className="flex items-center justify-between gap-4">
                                    <code className="text-green-900 font-mono text-sm break-all">{generatedLink}</code>
                                    <button
                                        onClick={() => copyToClipboard(generatedLink)}
                                        className="text-sm bg-white border border-green-200 text-green-700 px-3 py-1 rounded hover:bg-green-100 whitespace-nowrap flex items-center"
                                    >
                                        <CheckCircle size={14} className="mr-1" /> Copiar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: CONFIG --- */}
                {activeTab === 'config' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-2xl animate-fade-in">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="p-2 bg-gray-100 text-gray-600 rounded-lg">
                                <Settings size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800">Credenciais de API</h3>
                                <p className="text-sm text-gray-500">Necessário para acessar relatórios e gerar links assinados.</p>
                            </div>
                        </div>

                        {/* Warning Banner */}
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-yellow-700">
                                        <strong>Atenção:</strong> O "App ID" de Afiliado é <u>diferente</u> do "Partner ID" de Vendedor.
                                    </p>
                                    <p className="text-xs text-yellow-600 mt-1">
                                        Se você usar o Partner ID aqui, ocorrerá o erro <code>10020: Invalid Credential</code>.
                                        Pegue os dados corretos no <a href="https://affiliate.shopee.com.br/open_api" target="_blank" rel="noreferrer" className="underline font-bold">Portal de Afiliados &gt; Open API</a>.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSaveConfig} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
                                <input
                                    type="text" name="appId" value={configData.appId} onChange={(e) => setConfigData({ ...configData, appId: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-mono text-sm"
                                    placeholder="Ex: 18322..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Senha / Secret</label>
                                <input
                                    type="password" name="password" value={configData.password} onChange={(e) => setConfigData({ ...configData, password: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-mono text-sm"
                                />
                            </div>

                            {/* Feedback Status */}
                            {testStatus !== 'idle' && (
                                <div className={`p-3 rounded-lg flex items-center text-sm ${testStatus === 'loading' ? 'bg-blue-50 text-blue-700' :
                                    testStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                                        'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                    {testStatus === 'loading' && <Loader2 className="animate-spin mr-2" size={16} />}
                                    {testStatus === 'success' && <CheckCircle className="mr-2" size={16} />}
                                    {testStatus === 'error' && <XCircle className="mr-2" size={16} />}
                                    <span>{testMessage}</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    disabled={testStatus === 'loading'}
                                    className="flex-1 bg-gray-100 text-gray-700 px-6 py-2.5 rounded-lg hover:bg-gray-200 text-sm font-medium flex items-center justify-center"
                                >
                                    <Server size={16} className="mr-2" /> Testar API
                                </button>
                                <button type="submit" className="flex-1 bg-gray-800 text-white px-6 py-2.5 rounded-lg hover:bg-gray-900 text-sm font-medium flex items-center justify-center">
                                    <Save size={16} className="mr-2" /> Salvar Credenciais
                                </button>
                            </div>
                        </form>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ShopeeAffiliatePage;
