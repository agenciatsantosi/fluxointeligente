import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useProducts } from '../context/ProductContext';
import { 
    getShopeeAffiliateOrders, 
    generateAffiliateLink, 
    searchShopeeAffiliateProducts, 
    getShopeeShopOffers, 
    testShopeeAffiliateConnection 
} from '../services/shopeeService';
import { 
    ShopeeAffiliateOrder, 
    ShopeeAffiliateProduct, 
    ShopeeShopOffer, 
    ShopeeSortType 
} from '../types';
interface BioSettings {
    whatsapp_link: string;
    primary_color: string;
    secondary_color: string;
    font_family: string;
    logo_url: string;
    hero_image_url: string;
    title: string;
    description: string;
    whatsapp_banner_text: string;
    theme: string;
    background_url: string;
    overlay_opacity: number;
    hero_text: string;
    hero_link: string;
    testimonials: string;
    links_data: string;
    limited_slots_enabled: number;
    limited_slots_text: string;
    whatsapp_floating_enabled: number;
    save_contact_enabled: number;
    slug: string;
}

import { 
    TrendingUp, Settings, Link as LinkIcon, DollarSign, Loader2, ShoppingCart, 
    Search, Info, LayoutDashboard, ShoppingBag, Copy, Save, Store, Smartphone, 
    Monitor, AlertOctagon, ShieldCheck, CheckCircle, Server, AlertTriangle, 
    XCircle, ExternalLink, HelpCircle, Pin, Download, MessageCircle, Instagram, 
    Calendar, AlertCircle, Video, Tag, Sparkles, Laugh, ChevronRight, ArrowRight,
    Plus, Zap
} from 'lucide-react';
import ShopeeConfig from '../components/ShopeeConfig';

type MainTab = 'affiliate' | 'videos' | 'settings';
type AffiliateTab = 'dashboard' | 'best_sellers' | 'offers' | 'shops' | 'tools' | 'vitrine' | 'vitrine_settings';
type VideoSubTab = 'best_sellers' | 'cheapest' | 'achadinhos' | 'bizarros' | 'moda_feminina' | 'moda_masculina' | 'celulares' | 'casa' | 'beleza' | 'umbanda' | 'evangelico' | 'brinquedos' | 'eletronicos' | 'acessorios' | 'bebes' | 'esportes' | 'automotivo' | 'relogios' | 'bolsas' | 'calcados_fem' | 'calcados_masc' | 'cozinha' | 'games' | 'informatica' | 'pet' | 'papelaria';

const ShopeeCentralPage: React.FC = () => {
    const { 
        shopeeAffiliateSettings, 
        saveShopeeAffiliateSettings, 
        shopeeSettings,
        saveShopeeSettings,
        addLog 
    } = useProducts();

    // Main Navigation
    const [mainTab, setMainTab] = useState<MainTab>('affiliate');
    
    // Sub-navigation for Affiliate
    const [affiliateTab, setAffiliateTab] = useState<AffiliateTab>('dashboard');
    
    // Sub-navigation for Videos
    const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>('best_sellers');

    // --- SHARED STATES ---
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // --- AFFILIATE STATES ---
    const [orders, setOrders] = useState<ShopeeAffiliateOrder[]>([]);
    const [loadingStats, setLoadingStats] = useState(false);
    const [isSimulatedStats, setIsSimulatedStats] = useState(false);
    const [orderLimit, setOrderLimit] = useState(50);
    const [dateRange, setDateRange] = useState(30);
    
    const [keyword, setKeyword] = useState('');
    const [sortType, setSortType] = useState<ShopeeSortType>('latest');
    const [products, setProducts] = useState<ShopeeAffiliateProduct[]>([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [isSimulatedSearch, setIsSimulatedSearch] = useState(false);
    const [searchPage, setSearchPage] = useState(1);
    const [videoOnly, setVideoOnly] = useState(false);
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');
    
    const [shops, setShops] = useState<ShopeeShopOffer[]>([]);
    const [loadingShops, setLoadingShops] = useState(false);
    
    const [bestSellers, setBestSellers] = useState<ShopeeAffiliateProduct[]>([]);
    const [loadingBestSellers, setLoadingBestSellers] = useState(false);
    
    const [manualLink, setManualLink] = useState('');
    const [subId, setSubId] = useState('');
    const [generatedLink, setGeneratedLink] = useState('');
    const [loadingLink, setLoadingLink] = useState(false);

    // --- VIDEO STATES ---
    const [videoProducts, setVideoProducts] = useState<ShopeeAffiliateProduct[]>([]);
    const [loadingVideos, setLoadingVideos] = useState(false);
    const [videoPage, setVideoPage] = useState(1);
    const [totalVideoPages] = useState(3);
    
    // --- PINTEREST MODAL STATES ---
    const [showPinterestModal, setShowPinterestModal] = useState(false);
    const [pinterestKeyword, setPinterestKeyword] = useState('');
    const [pinterestResults, setPinterestResults] = useState<any[]>([]);
    const [loadingPinterest, setLoadingPinterest] = useState(false);
    const [downloadingVideo, setDownloadingVideo] = useState(false);
    const [downloadedVideo, setDownloadedVideo] = useState<{ localPath: string, filename: string } | null>(null);

    // --- CONFIG STATES ---
    const [configData, setConfigData] = useState(shopeeAffiliateSettings);
    const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');

    // --- VITRINE STATES ---
    const [vitrineLinks, setVitrineLinks] = useState<any[]>([]);
    const [loadingVitrine, setLoadingVitrine] = useState(false);
    const [vitrineSearch, setVitrineSearch] = useState('');
    const [activeEditorTab, setActiveEditorTab] = useState<'perfil' | 'links' | 'analyticos' | 'geral'>('perfil');

    const [bioSettings, setBioSettings] = useState<BioSettings>({
        whatsapp_link: '',
        primary_color: '#EE4D2D',
        secondary_color: '#1A1A1A',
        font_family: 'Sans-serif',
        logo_url: '',
        hero_image_url: '',
        title: '',
        description: '',
        whatsapp_banner_text: '👉 Entre na nossa comunidade no WhatsApp',
        theme: 'Papel Natural',
        background_url: '',
        overlay_opacity: 50,
        hero_text: 'AGENDAR CONSULTA AGORA',
        hero_link: '',
        testimonials: '[]',
        links_data: '[]',
        limited_slots_enabled: 0,
        limited_slots_text: 'VAGAS LIMITADAS',
        whatsapp_floating_enabled: 1,
        save_contact_enabled: 0,
        slug: ''
    });
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [bioStats, setBioStats] = useState({
        totalVisits: 0,
        totalClicks: 0,
        topLocation: 'Brasil'
    });
    // --- ACTIONS: AFFILIATE ---
    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            const { orders: data, isSimulated: simulated } = await getShopeeAffiliateOrders(shopeeAffiliateSettings, orderLimit, dateRange);
            setOrders(data);
            setIsSimulatedStats(simulated);
        } catch (e) { console.error(e); }
        finally { setLoadingStats(false); }
    };

    const fetchBestSellers = async () => {
        setLoadingBestSellers(true);
        try {
            const { products: data } = await searchShopeeAffiliateProducts('oferta', shopeeAffiliateSettings, 'sales');
            setBestSellers(data);
        } catch (e) { console.error(e); }
        finally { setLoadingBestSellers(false); }
    };

    const fetchShops = async () => {
        setLoadingShops(true);
        try {
            const { shops: data } = await getShopeeShopOffers(shopeeAffiliateSettings);
            setShops(data);
        } catch (e) { console.error(e); }
        finally { setLoadingShops(false); }
    };

    const handleSearchOffers = async (e?: React.FormEvent, resetPage: boolean = true) => {
        if (e) e.preventDefault();
        if (!keyword) return;
        
        const pageToLoad = resetPage ? 1 : searchPage;
        if (resetPage) setSearchPage(1);

        setLoadingSearch(true);
        try {
            const { products: data, isSimulated: simulated } = await searchShopeeAffiliateProducts(
                keyword, 
                shopeeAffiliateSettings, 
                sortType,
                pageToLoad,
                24 // limit
            );

            // Filtragem manual para preço e vídeo (caso a API não suporte nativamente)
            let filtered = data;
            if (minPrice) filtered = filtered.filter(p => p.price >= parseFloat(minPrice));
            if (maxPrice) filtered = filtered.filter(p => p.price <= parseFloat(maxPrice));
            if (videoOnly) filtered = filtered.filter(p => !!p.videoUrl);

            setProducts(filtered);
            setIsSimulatedSearch(simulated);
        } catch (e: any) { showNotification(e.message, 'error'); }
        finally { setLoadingSearch(false); }
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

    // --- ACTIONS: VITRINE ---
    const fetchBioSettings = async () => {
        setLoadingSettings(true);
        try {
            const response = await axios.get('/api/shopee/bio-settings');
            if (response.data.success && response.data.settings) {
                // Ensure testimonials is a string (JSON)
                const settings = response.data.settings;
                if (typeof settings.testimonials === 'object') {
                    settings.testimonials = JSON.stringify(settings.testimonials);
                }
                setBioSettings(settings);
            }
        } catch (e) {
            console.error('Error fetching settings:', e);
        } finally {
            setLoadingSettings(false);
        }
    };

    const fetchBioStats = async () => {
        try {
            const response = await axios.get('/api/shopee/bio-stats');
            if (response.data.success) {
                setBioStats(response.data.stats);
            }
        } catch (e) {
            console.error('Error fetching stats:', e);
        }
    };

    const handleSaveSettings = async () => {
        setLoadingSettings(true);
        try {
            // Ensure testimonials is a string
            const dataToSave = { ...bioSettings };
            if (typeof dataToSave.testimonials === 'object') {
                dataToSave.testimonials = JSON.stringify(dataToSave.testimonials);
            }
            
            const response = await axios.post('/api/shopee/bio-settings', dataToSave);
            if (response.data.success) {
                showNotification("Identidade visual atualizada com sucesso!", 'success');
                fetchBioSettings();
            }
        } catch (e: any) {
            showNotification("Erro ao salvar configurações", 'error');
        } finally {
            setLoadingSettings(false);
        }
    };

    const fetchVitrineLinks = async () => {
        setLoadingVitrine(true);
        try {
            const response = await axios.get(`/api/shopee/bio-links?keyword=${encodeURIComponent(vitrineSearch)}`);
            if (response.data.success) {
                setVitrineLinks(response.data.links);
            }
        } catch (e: any) {
            console.error('Error fetching vitrine links:', e);
        } finally {
            setLoadingVitrine(false);
        }
    };

    const handleRemoveFromVitrine = async (id: number) => {
        try {
            const response = await axios.delete(`/api/shopee/bio-links/${id}`);
            if (response.data.success) {
                showNotification("Produto removido da vitrine!", 'success');
                fetchVitrineLinks();
            }
        } catch (e: any) {
            showNotification("Erro ao remover produto", 'error');
        }
    };

    const handleAddToVitrine = async (product: any) => {
        try {
            const response = await axios.post('/api/shopee/bio-links', {
                productId: product.itemId?.toString() || product.id?.toString(),
                name: product.name || product.itemName,
                imageUrl: product.imageUrl,
                category: 'Geral'
            });
            if (response.data.success) {
                showNotification("Produto adicionado à Vitrine!", 'success');
                fetchVitrineLinks();
            }
        } catch (e: any) {
            showNotification("Erro ao adicionar à vitrine", 'error');
        }
    };

    const loadVideoProducts = async () => {
        if (!shopeeAffiliateSettings.appId || !shopeeAffiliateSettings.password) return;
        setLoadingVideos(true);
        try {
            const videoTabs = [
                { id: 'best_sellers', keyword: 'utilidades casa', sort: 'sales' as ShopeeSortType },
                { id: 'cheapest', keyword: 'barato', sort: 'price_asc' as ShopeeSortType },
                { id: 'achadinhos', keyword: 'achadinhos utilidades', sort: 'sales' as ShopeeSortType },
                { id: 'bizarros', keyword: 'engraçado diferente', sort: 'latest' as ShopeeSortType },
                { id: 'moda_feminina', keyword: 'roupas femininas', sort: 'sales' as ShopeeSortType },
                { id: 'moda_masculina', keyword: 'roupas masculinas', sort: 'sales' as ShopeeSortType },
                { id: 'celulares', keyword: 'celulares iphone samsung', sort: 'sales' as ShopeeSortType },
                { id: 'casa', keyword: 'decoração casa quarto', sort: 'sales' as ShopeeSortType },
                { id: 'beleza', keyword: 'maquiagem skincare beleza', sort: 'sales' as ShopeeSortType },
                { id: 'umbanda', keyword: 'umbanda candomblé orixá', sort: 'sales' as ShopeeSortType },
                { id: 'evangelico', keyword: 'evangélico gospel bíblia', sort: 'sales' as ShopeeSortType },
                { id: 'brinquedos', keyword: 'brinquedos infantil', sort: 'sales' as ShopeeSortType },
                { id: 'eletronicos', keyword: 'fones smartwatch eletrônicos', sort: 'sales' as ShopeeSortType },
                { id: 'acessorios', keyword: 'joias relógios óculos', sort: 'sales' as ShopeeSortType },
                { id: 'bebes', keyword: 'enxoval bebê fraldas', sort: 'sales' as ShopeeSortType },
                { id: 'esportes', keyword: 'academia fitness esporte', sort: 'sales' as ShopeeSortType },
                { id: 'automotivo', keyword: 'acessórios carros motos', sort: 'sales' as ShopeeSortType },
                { id: 'relogios', keyword: 'relógios masculinos femininos', sort: 'sales' as ShopeeSortType },
                { id: 'bolsas', keyword: 'bolsas femininas mochilas', sort: 'sales' as ShopeeSortType },
                { id: 'calcados_fem', keyword: 'sapatos femininos sandálias', sort: 'sales' as ShopeeSortType },
                { id: 'calcados_masc', keyword: 'sapatos masculinos tênis', sort: 'sales' as ShopeeSortType },
                { id: 'cozinha', keyword: 'utensílios cozinha panelas', sort: 'sales' as ShopeeSortType },
                { id: 'games', keyword: 'video games consoles', sort: 'sales' as ShopeeSortType },
                { id: 'informatica', keyword: 'computadores notebooks', sort: 'sales' as ShopeeSortType },
                { id: 'pet', keyword: 'pet shop cães gatos', sort: 'sales' as ShopeeSortType },
                { id: 'papelaria', keyword: 'papelaria escritório escola', sort: 'sales' as ShopeeSortType }
            ];
            const current = videoTabs.find(t => t.id === videoSubTab) || videoTabs[0];
            const { products: result } = await searchShopeeAffiliateProducts(
                current.keyword, 
                shopeeAffiliateSettings, 
                current.sort,
                videoPage,
                24
            );
            setVideoProducts(result);
        } catch (error) {
            console.error(error);
            showNotification('Erro ao carregar vídeos', 'error');
        } finally {
            setLoadingVideos(false);
        }
    };

    // --- EFFECTS ---
    useEffect(() => {
        if (shopeeAffiliateSettings.appId || shopeeAffiliateSettings.password) {
            setConfigData(shopeeAffiliateSettings);
            if (mainTab === 'affiliate') {
                if (affiliateTab === 'dashboard') fetchStats();
                if (affiliateTab === 'best_sellers') fetchBestSellers();
                if (affiliateTab === 'shops') fetchShops();
                if (affiliateTab === 'vitrine') fetchVitrineLinks();
                if (affiliateTab === 'vitrine_settings') {
                    fetchBioSettings();
                    fetchBioStats();
                }
            }
        }
    }, [shopeeAffiliateSettings, mainTab, affiliateTab, orderLimit, dateRange]);

    useEffect(() => {
        if (affiliateTab === 'vitrine_settings' && activeEditorTab === 'analyticos') {
            fetchBioStats();
        }
    }, [activeEditorTab]);

    useEffect(() => {
        if (mainTab === 'videos') {
            loadVideoProducts();
        }
    }, [mainTab, videoSubTab, videoPage]);

    // --- MOBILE PREVIEW COMPONENT ---
    const MobilePreview = () => {
        const primaryColor = bioSettings.primary_color || '#EE4D2D';
        const testimonials = JSON.parse(bioSettings.testimonials || '[]');

        return (
            <div className="sticky top-20 w-[320px] h-[640px] bg-black rounded-[3rem] p-3 shadow-2xl border-[8px] border-gray-900 hidden lg:block overflow-hidden shrink-0">
                <div className="w-full h-full bg-[#0A0A0A] rounded-[2rem] overflow-y-auto no-scrollbar relative">
                    {/* Wallpaper */}
                    {bioSettings.background_url && (
                        <div 
                            className="absolute inset-0 bg-cover bg-center" 
                            style={{ backgroundImage: `url(${bioSettings.background_url})` }}
                        >
                            <div className="absolute inset-0 bg-black" style={{ opacity: bioSettings.overlay_opacity / 100 }}></div>
                        </div>
                    )}

                    <div className="relative z-10 p-4 space-y-6">
                        {/* Header */}
                        <div className="text-center pt-8">
                            <div className="w-16 h-16 bg-white/10 rounded-full mx-auto mb-3 border border-white/20 overflow-hidden">
                                {bioSettings.logo_url && <img src={bioSettings.logo_url} className="w-full h-full object-cover" />}
                            </div>
                            <h4 className="text-white font-black text-sm uppercase">{bioSettings.title || 'Sua Vitrine'}</h4>
                            <p className="text-white/60 text-[10px] leading-tight italic px-4 mt-1">{bioSettings.description || 'Os melhores achadinhos.'}</p>
                        </div>

                        {/* Hero Section */}
                        <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                            <button 
                                className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg"
                                style={{ backgroundColor: primaryColor, color: '#FFF' }}
                            >
                                {bioSettings.hero_text}
                            </button>
                            {bioSettings.hero_link && <p className="text-center text-white/40 text-[8px] mt-2 italic">Temos descontos exclusivos!</p>}
                        </div>

                        {/* Links Preview */}
                        <div className="space-y-3">
                            {vitrineLinks.slice(0, 3).map(link => (
                                <div key={link.id} className="bg-white/5 backdrop-blur-sm p-2 rounded-2xl flex items-center gap-3 border border-white/5">
                                    <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden flex-shrink-0">
                                        <img src={link.image_url} className="w-full h-full object-cover" />
                                    </div>
                                    <p className="text-white text-[9px] font-bold line-clamp-1 flex-1">{link.name}</p>
                                    <ChevronRight size={14} className="text-white/30" />
                                </div>
                            ))}
                        </div>

                        {/* Limited Slots Alert */}
                        {bioSettings.limited_slots_enabled === 1 && (
                            <div className="bg-red-500/20 border border-red-500/40 p-2 rounded-xl text-center">
                                <p className="text-red-400 font-black text-[8px] uppercase tracking-widest animate-pulse">🔥 {bioSettings.limited_slots_text}</p>
                            </div>
                        )}

                        {/* Testimonials */}
                        {testimonials.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-white/40 text-[8px] font-bold uppercase tracking-widest pl-1">O que dizem</p>
                                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                    <p className="text-white text-[9px] italic line-clamp-2">"{testimonials[0].text}"</p>
                                    <p className="text-white/60 text-[8px] font-bold mt-1 text-right">- {testimonials[0].name}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Floating WhatsApp */}
                    {bioSettings.whatsapp_floating_enabled === 1 && (
                        <div className="absolute bottom-4 right-4 w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg animate-bounce">
                            <MessageCircle size={20} className="text-white" />
                        </div>
                    )}
                </div>
            </div>
        );
    };


    const downloadPinterestVideo = async (pinUrl: string) => {
        setDownloadingVideo(true);
        try {
            const response = await axios.post('/api/pinterest/download-video', { pinUrl });
            if (response.data.success) {
                setDownloadedVideo({ localPath: response.data.localPath, filename: response.data.filename });
                showNotification('Vídeo baixado com sucesso!', 'success');
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
            setDownloadingVideo(false);
        }
    };

    // --- ACTIONS: PINTEREST SEARCH ---
    const openPinterestSearch = (productName: string) => {
        setPinterestKeyword(productName);
        setShowPinterestModal(true);
        setDownloadedVideo(null);
        setPinterestResults([]);
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

    // --- ACTIONS: CONFIG ---
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

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showNotification("Link copiado!", 'success');
    };

    const totalComission = orders.reduce((acc, curr) => acc + curr.totalCommission, 0);

    // --- HELPERS: RENDER ---
    const MainMenuButton = ({ id, icon: Icon, label }: {id: MainTab, icon: any, label: string}) => (
        <button
            onClick={() => setMainTab(id)}
            className={`flex items-center px-8 py-5 font-black text-sm uppercase tracking-wider transition-all duration-300 relative ${mainTab === id
                ? 'text-orange-600 bg-orange-50/50'
                : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                }`}
        >
            <Icon size={20} className={`mr-3 ${mainTab === id ? 'animate-pulse' : ''}`} />
            {label}
            {mainTab === id && (
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500"></div>
            )}
        </button>
    );

    const SubMenuButton = ({ id, icon: Icon, label, active, onClick }: any) => (
        <button
            onClick={onClick}
            className={`flex items-center px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 ${active
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                : 'text-gray-500 hover:bg-gray-100'
                }`}
        >
            <Icon size={14} className="mr-2" />
            {label}
        </button>
    );

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-20">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-in ${
                    notification.type === 'success' ? 'bg-green-500 text-white' :
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
            <div className="bg-gradient-to-br from-gray-900 via-orange-950 to-orange-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-orange-500/20 transition-all duration-1000"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-red-600 rounded-[2rem] flex items-center justify-center shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500">
                            <ShoppingBag size={40} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black tracking-tight mb-2">Central <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">Shopee</span></h1>
                            <p className="text-orange-100/60 font-medium">Ecossistema completo para afiliados e vendedores profissionais.</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                         <div className="bg-white/5 backdrop-blur-xl border border-white/10 px-8 py-4 rounded-[2rem]">
                            <p className="text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Ganhos no Período</p>
                            <p className="text-3xl font-black">R$ {totalComission.toFixed(2)}</p>
                         </div>
                    </div>
                </div>
            </div>

            {/* Main Navigation Tabs */}
            <div className="bg-white/70 backdrop-blur-2xl rounded-[2rem] shadow-xl border border-white/50 flex overflow-hidden p-1 p-2">
                <MainMenuButton id="affiliate" icon={TrendingUp} label="Painel Afiliado" />
                <MainMenuButton id="videos" icon={Video} label="Shopee Vídeos" />
                <MainMenuButton id="settings" icon={Settings} label="Configurações" />
            </div>

            {/* --- MAIN TAB: AFILIADO --- */}
            {mainTab === 'affiliate' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-wrap gap-2 bg-gray-100/50 p-1.5 rounded-2xl w-fit">
                        <SubMenuButton id="dashboard" icon={LayoutDashboard} label="Visão Geral" active={affiliateTab === 'dashboard'} onClick={() => setAffiliateTab('dashboard')} />
                        <SubMenuButton id="vitrine" icon={Sparkles} label="Link na Bio / Vitrine" active={affiliateTab === 'vitrine'} onClick={() => setAffiliateTab('vitrine')} />
                        <SubMenuButton id="vitrine_settings" icon={Settings} label="Configurar Bio" active={affiliateTab === 'vitrine_settings'} onClick={() => setAffiliateTab('vitrine_settings')} />
                        <SubMenuButton id="best_sellers" icon={TrendingUp} label="Mais Vendidos" active={affiliateTab === 'best_sellers'} onClick={() => setAffiliateTab('best_sellers')} />
                        <SubMenuButton id="offers" icon={Search} label="Buscar Produtos" active={affiliateTab === 'offers'} onClick={() => setAffiliateTab('offers')} />
                        <SubMenuButton id="shops" icon={Store} label="Lojas Parceiras" active={affiliateTab === 'shops'} onClick={() => setAffiliateTab('shops')} />
                        <SubMenuButton id="tools" icon={LinkIcon} label="Short Links" active={affiliateTab === 'tools'} onClick={() => setAffiliateTab('tools')} />
                    </div>


                    {affiliateTab === 'dashboard' && (
                        <div className="space-y-6">
                            {/* Metrics and Reports similar to ShopeeAffiliatePage */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Cliques</p>
                                    <p className="text-3xl font-black text-gray-900">{orders.reduce((acc, o) => acc + (o.items?.length || 0), 0)}</p>
                                </div>
                                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Pedidos</p>
                                    <p className="text-3xl font-black text-gray-900">{orders.length}</p>
                                </div>
                                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Itens</p>
                                    <p className="text-3xl font-black text-gray-900">{orders.reduce((acc, o) => acc + (o.items?.length || 0), 0)}</p>
                                </div>
                                <div className="bg-orange-500 p-6 rounded-[2rem] shadow-lg shadow-orange-200 text-white">
                                    <p className="text-xs font-bold text-white/70 uppercase mb-4">Conversão</p>
                                    <p className="text-3xl font-black">{(orders.length > 0 ? (orders.length / (orders.reduce((acc, o) => acc + (o.items?.length || 0), 0) || 1) * 100).toFixed(1) : 0)}%</p>
                                </div>
                            </div>
                            
                            {/* Detailed Report */}
                            <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
                                <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-gray-800">Relatório de Vendas</h3>
                                    <button onClick={fetchStats} className="p-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-orange-50 hover:text-orange-600 transition-colors">
                                        <TrendingUp size={20} />
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50/50 text-xs font-bold text-gray-400 uppercase">
                                            <tr>
                                                <th className="px-8 py-5">Data</th>
                                                <th className="px-8 py-5">Produto</th>
                                                <th className="px-8 py-5">Comissão</th>
                                                <th className="px-8 py-5">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {orders.map(o => (
                                                <tr key={o.orderId} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-8 py-5 text-sm font-medium text-gray-500">{new Date(o.purchaseTime * 1000).toLocaleDateString()}</td>
                                                    <td className="px-8 py-5 font-bold text-gray-800">{o.items[0]?.itemName}</td>
                                                    <td className="px-8 py-5 font-black text-green-600">R$ {o.totalCommission.toFixed(2)}</td>
                                                    <td className="px-8 py-5">
                                                        <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-[10px] font-black uppercase">{o.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {affiliateTab === 'vitrine' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-800">Minha Vitrine de Produtos</h3>
                                        <p className="text-gray-400 font-medium text-sm">Gerencie os produtos que aparecem no seu Link na Bio.</p>
                                    </div>
                                    <div className="bg-orange-50 text-orange-600 px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all hover:bg-orange-600 hover:text-white group">
                                        <ExternalLink size={20} className="group-hover:scale-110 transition-transform" />
                                        <a href={`/vitrine/${localStorage.getItem('userId') || '1'}`} target="_blank" rel="noreferrer" className="uppercase tracking-wider">Ver Vitrine Pública</a>
                                    </div>
                                </div>

                                <div className="relative group">
                                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition-colors" size={20} />
                                    <input 
                                        type="text" 
                                        value={vitrineSearch}
                                        onChange={(e) => setVitrineSearch(e.target.value)}
                                        onKeyUp={(e) => e.key === 'Enter' && fetchVitrineLinks()}
                                        placeholder="Buscar produto na minha vitrine..."
                                        className="w-full pl-14 pr-4 py-5 bg-gray-50 border-2 border-transparent rounded-[1.8rem] focus:bg-white focus:border-orange-500 transition-all font-bold text-gray-700 shadow-inner"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-gray-200 text-gray-500 px-3 py-1 rounded-xl text-[10px] font-black uppercase">ENTER</div>
                                </div>
                            </div>

                            {loadingVitrine ? (
                                <div className="py-20 text-center">
                                    <Loader2 className="animate-spin mx-auto text-orange-500 mb-4" size={48} />
                                    <p className="text-gray-400 font-bold animate-pulse">Sincronizando sua vitrine...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    {vitrineLinks.map(link => (
                                        <div key={link.id} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative">
                                            <div className="relative h-56 overflow-hidden">
                                                <img src={link.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={link.name} />
                                                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl text-[10px] font-black text-white flex items-center gap-2 shadow-lg">
                                                    <TrendingUp size={14} className="text-orange-400" /> {link.clicks || 0} <span className="text-white/60">CLIQUES</span>
                                                </div>
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            </div>
                                            <div className="p-6">
                                                <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-6 h-10 leading-relaxed">{link.name}</h4>
                                                <div className="flex gap-3">
                                                    <button 
                                                        onClick={() => window.open(link.affiliate_link, '_blank')} 
                                                        className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 text-white py-4 rounded-2xl font-black hover:shadow-lg hover:shadow-orange-200 transition-all text-[11px] uppercase tracking-wider"
                                                    >
                                                        Link Afiliado
                                                    </button>
                                                    <button 
                                                        onClick={() => handleRemoveFromVitrine(link.id)} 
                                                        className="p-4 bg-gray-50 text-gray-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all border border-gray-100 group/del"
                                                        title="Remover da Vitrine"
                                                    >
                                                        <XCircle size={20} className="group-hover/del:rotate-90 transition-transform" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {vitrineLinks.length === 0 && (
                                        <div className="col-span-4 bg-white p-24 rounded-[3.5rem] border-4 border-dashed border-gray-50 text-center flex flex-col items-center">
                                            <div className="w-24 h-24 bg-orange-50 rounded-[2.5rem] flex items-center justify-center mb-8 rotate-6 animate-pulse">
                                                <Sparkles size={48} className="text-orange-300" />
                                            </div>
                                            <h4 className="text-3xl font-black text-gray-300 mb-4 tracking-tight uppercase">Sua vitrine está vazia</h4>
                                            <p className="text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">
                                                Inicie sua curadoria buscando produtos ou gerando links! Eles aparecerão aqui automaticamente após cada postagem.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {affiliateTab === 'vitrine_settings' && (
                        <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Editor Pro Side */}
                            <div className="flex-1 space-y-8 max-w-4xl">
                                <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl space-y-10">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-3xl font-black text-gray-800 tracking-tight">Editor Pro <span className="text-orange-500">Vitrine</span></h3>
                                            <p className="text-gray-400 font-medium">Personalize cada detalhe da sua página de alta conversão.</p>
                                        </div>
                                        <div className="flex gap-2 bg-gray-100 p-1.5 rounded-2xl">
                                            {[
                                                { id: 'perfil', label: 'Identidade Visual' },
                                                { id: 'links', label: 'Gerenciar Bio' },
                                                { id: 'geral', label: 'Atmosfera' },
                                                { id: 'analyticos', label: 'Estatísticas' }
                                            ].map(tab => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveEditorTab(tab.id as any)}
                                                    className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeEditorTab === tab.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'text-gray-500 hover:bg-white'}`}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-8 min-h-[400px]">
                                        {activeEditorTab === 'perfil' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in duration-300">
                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">Título da Bio</label>
                                                        <input 
                                                            type="text" 
                                                            value={bioSettings.title}
                                                            onChange={(e) => setBioSettings({...bioSettings, title: e.target.value})}
                                                            placeholder="Ex: Achadinhos da Shopee 🛍️"
                                                            className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold text-gray-700 shadow-inner"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">URL Personalizada (Slug)</label>
                                                        <div className="relative">
                                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">/vitrine/</span>
                                                            <input 
                                                                type="text" 
                                                                value={bioSettings.slug || ''}
                                                                onChange={(e) => setBioSettings({...bioSettings, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                                                                placeholder="seu-nome"
                                                                className="w-full pl-24 pr-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold text-gray-700 shadow-inner"
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 font-medium pl-2 italic">Apenas letras, números e hifens.</p>
                                                    </div>
                                                    <div className="space-y-6">
                                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">Fonte Global da Vitrine</label>
                                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                                            {[
                                                                { id: 'Sans-serif', name: 'Inter' },
                                                                { id: 'Montserrat', name: 'Montserrat' },
                                                                { id: 'Playfair Display', name: 'Playfair' },
                                                                { id: 'Lora', name: 'Lora' },
                                                                { id: 'Cinzel', name: 'Cinzel' },
                                                                { id: 'Dancing Script', name: 'Script' }
                                                            ].map(font => (
                                                                <button
                                                                    key={font.id}
                                                                    onClick={() => setBioSettings({...bioSettings, font_family: font.id})}
                                                                    className={`px-4 py-3 rounded-xl border-2 transition-all font-bold text-xs text-left flex items-center justify-between ${bioSettings.font_family === font.id ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-50 bg-white text-gray-500 hover:border-gray-200'}`}
                                                                >
                                                                    <span style={{ fontFamily: font.id }}>{font.name}</span>
                                                                    {bioSettings.font_family === font.id && <CheckCircle size={14} />}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">Logo (URL)</label>
                                                        <div className="flex gap-4 items-center">
                                                            <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0">
                                                                {bioSettings.logo_url && <img src={bioSettings.logo_url} className="w-full h-full object-cover" alt="Logo" />}
                                                            </div>
                                                            <input 
                                                                type="text" 
                                                                value={bioSettings.logo_url}
                                                                onChange={(e) => setBioSettings({...bioSettings, logo_url: e.target.value})}
                                                                placeholder="Link da imagem..."
                                                                className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold text-gray-700 shadow-inner"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">Cor Principal</label>
                                                            <div className="flex gap-3 items-center">
                                                                <input 
                                                                    type="color" 
                                                                    value={bioSettings.primary_color}
                                                                    onChange={(e) => setBioSettings({...bioSettings, primary_color: e.target.value})}
                                                                    className="w-12 h-12 rounded-xl border-none cursor-pointer bg-transparent"
                                                                />
                                                                <span className="font-mono text-[10px] font-bold text-gray-400">{bioSettings.primary_color}</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">Wallpaper (URL)</label>
                                                            <input 
                                                                type="text" 
                                                                value={bioSettings.background_url}
                                                                onChange={(e) => setBioSettings({...bioSettings, background_url: e.target.value})}
                                                                className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold text-gray-700 shadow-inner"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activeEditorTab === 'links' && (
                                            <div className="space-y-6 animate-in fade-in duration-300">
                                                <div className="flex justify-between items-center">
                                                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-widest">Links Externos</h3>
                                                    <button 
                                                        onClick={() => {
                                                            const currentLinks = JSON.parse(bioSettings.links_data || '[]');
                                                            const newLinks = [...currentLinks, { id: Date.now(), title: 'Meu Perfil', url: '', color: '#EE4D2D', urgency: false }];
                                                            setBioSettings({...bioSettings, links_data: JSON.stringify(newLinks)});
                                                        }}
                                                        className="px-6 py-3 bg-gray-900 text-white rounded-xl font-black text-[10px] hover:bg-black transition-all flex items-center gap-2"
                                                    >
                                                        <Plus size={14} /> ADICIONAR LINK
                                                    </button>
                                                </div>
                                                <div className="space-y-4">
                                                    {JSON.parse(bioSettings.links_data || '[]').map((link: any, index: number) => (
                                                        <div key={link.id} className="bg-white border-2 border-gray-100 p-6 rounded-2xl shadow-sm hover:border-orange-200 transition-all">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div className="space-y-4">
                                                                    <input 
                                                                        type="text" 
                                                                        value={link.title}
                                                                        onChange={(e) => {
                                                                            const currentLinks = JSON.parse(bioSettings.links_data || '[]');
                                                                            currentLinks[index].title = e.target.value;
                                                                            setBioSettings({...bioSettings, links_data: JSON.stringify(currentLinks)});
                                                                        }}
                                                                        placeholder="Título do Botão"
                                                                        className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm"
                                                                    />
                                                                    <input 
                                                                        type="text" 
                                                                        value={link.url}
                                                                        onChange={(e) => {
                                                                            const currentLinks = JSON.parse(bioSettings.links_data || '[]');
                                                                            currentLinks[index].url = e.target.value;
                                                                            setBioSettings({...bioSettings, links_data: JSON.stringify(currentLinks)});
                                                                        }}
                                                                        placeholder="Link (https://...)"
                                                                        className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold text-sm"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col justify-center space-y-4">
                                                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Ativar Alerta</span>
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={link.urgency}
                                                                            onChange={(e) => {
                                                                                const currentLinks = JSON.parse(bioSettings.links_data || '[]');
                                                                                currentLinks[index].urgency = e.target.checked;
                                                                                setBioSettings({...bioSettings, links_data: JSON.stringify(currentLinks)});
                                                                            }}
                                                                            className="w-5 h-5 accent-orange-500"
                                                                        />
                                                                    </div>
                                                                    <button 
                                                                        onClick={() => {
                                                                            const currentLinks = JSON.parse(bioSettings.links_data || '[]');
                                                                            const filtered = currentLinks.filter((_: any, i: number) => i !== index);
                                                                            setBioSettings({...bioSettings, links_data: JSON.stringify(filtered)});
                                                                        }}
                                                                        className="w-full py-2 text-[10px] font-black text-red-100 hover:text-red-600 font-bold transition-all"
                                                                    >
                                                                        REMOVER
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {activeEditorTab === 'geral' && (
                                            <div className="space-y-10 animate-in fade-in duration-300">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                    <div className="bg-gray-50 p-8 rounded-3xl space-y-6">
                                                        <div className="flex items-center justify-between">
                                                            <h5 className="font-black text-gray-800 text-sm uppercase tracking-wider">Alertas de Urgência</h5>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={bioSettings.limited_slots_enabled === 1}
                                                                onChange={(e) => setBioSettings({...bioSettings, limited_slots_enabled: e.target.checked ? 1 : 0})}
                                                                className="w-5 h-5 accent-orange-500"
                                                            />
                                                        </div>
                                                        <input 
                                                            type="text" 
                                                            value={bioSettings.limited_slots_text}
                                                            onChange={(e) => setBioSettings({...bioSettings, limited_slots_text: e.target.value})}
                                                            className="w-full px-6 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 shadow-sm"
                                                            placeholder="Texto do Alerta"
                                                        />
                                                    </div>
                                                    <div className="bg-gray-50 p-8 rounded-3xl space-y-6">
                                                        <div className="flex items-center justify-between">
                                                            <h5 className="font-black text-gray-800 text-sm uppercase tracking-wider">Botão WhatsApp</h5>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={bioSettings.whatsapp_floating_enabled === 1}
                                                                onChange={(e) => setBioSettings({...bioSettings, whatsapp_floating_enabled: e.target.checked ? 1 : 0})}
                                                                className="w-5 h-5 accent-emerald-500 cursor-pointer"
                                                            />
                                                        </div>
                                                        <p className="text-gray-400 text-xs font-medium">Ativa o botão flutuante em todas as páginas da vitrine.</p>
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    <h5 className="font-black text-gray-800 text-sm uppercase tracking-wider pl-2">Botão de Ação Hero</h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <input 
                                                            type="text" 
                                                            value={bioSettings.hero_text}
                                                            onChange={(e) => setBioSettings({...bioSettings, hero_text: e.target.value})}
                                                            placeholder="Texto do botão principal"
                                                            className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold shadow-inner"
                                                        />
                                                        <input 
                                                            type="text" 
                                                            value={bioSettings.hero_link}
                                                            onChange={(e) => setBioSettings({...bioSettings, hero_link: e.target.value})}
                                                            placeholder="Link do botão principal"
                                                            className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold shadow-inner"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activeEditorTab === 'analyticos' && (
                                            <div className="space-y-8 animate-in fade-in duration-300">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    <div className="bg-orange-50 p-8 rounded-[2rem] border border-orange-100 text-center">
                                                        <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2">Visitas Totais</p>
                                                        <p className="text-4xl font-black text-orange-600">{bioStats.totalVisits}</p>
                                                    </div>
                                                    <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100 text-center">
                                                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Cliques Totais</p>
                                                        <p className="text-4xl font-black text-emerald-600">{bioStats.totalClicks}</p>
                                                    </div>
                                                    <div className="bg-blue-50 p-8 rounded-[2rem] border border-blue-100 text-center">
                                                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Engajamento</p>
                                                        <p className="text-4xl font-black text-blue-600">Premium</p>
                                                    </div>
                                                </div>
                                                <div className="bg-gray-950 p-8 rounded-[2rem] text-white relative group overflow-hidden">
                                                    <div className="relative z-10">
                                                        <h5 className="text-xl font-black mb-2">Desempenho em Alta! 🚀</h5>
                                                        <p className="text-white/40 text-sm font-medium">Sua vitrine está performando acima da média nos últimos 7 dias.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-10 border-t border-gray-100 flex justify-end gap-4">
                                        <button 
                                            className="px-10 py-5 bg-gray-100 text-gray-500 rounded-2xl font-black hover:bg-gray-200 transition-all"
                                            onClick={fetchBioSettings}
                                        >
                                            DESCARTAR
                                        </button>
                                        <button 
                                            onClick={handleSaveSettings}
                                            disabled={loadingSettings}
                                            className="px-12 py-5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-2xl font-black hover:scale-105 active:scale-95 transition-all shadow-xl shadow-orange-100 flex items-center gap-3"
                                        >
                                            {loadingSettings ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                            SALVAR IDENTIDADE VISUAL
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <MobilePreview />
                        </div>
                    )}

                    {affiliateTab === 'best_sellers' && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {bestSellers.map(p => (
                                <div key={p.itemId} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                                    <div className="relative h-48">
                                        <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-black text-orange-600 shadow-sm border border-orange-100">
                                            {(p.commissionRate * 100).toFixed(1)}% COMISSÃO
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-4 h-10">{p.name}</h4>
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">Preço</p>
                                                <p className="text-lg font-black text-gray-900">R$ {p.price.toFixed(2)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">Ganhos</p>
                                                <p className="text-lg font-black text-green-600">R$ {p.commission.toFixed(2)}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => copyToClipboard(p.offerLink)} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-100">
                                                Copiar Link
                                            </button>
                                            <button onClick={() => handleAddToVitrine(p)} className="p-3 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm" title="Adicionar à Vitrine">
                                                <Sparkles size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {affiliateTab === 'offers' && (
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
                                <form onSubmit={handleSearchOffers} className="flex gap-4">
                                    <div className="flex-1 relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                        <input 
                                            type="text" 
                                            value={keyword}
                                            onChange={(e) => setKeyword(e.target.value)}
                                            placeholder="O que você quer vender hoje? (e.g. Cozinha, Tech, Moda)"
                                            className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-orange-500 transition-all font-bold"
                                        />
                                    </div>
                                    <button type="submit" className="px-8 py-4 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-100">
                                        {loadingSearch ? <Loader2 className="animate-spin" /> : 'Buscar'}
                                    </button>
                                </form>

                                <div className="mt-6 flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 scrollbar-hide">
                                    {[
                                        { label: '🔥 Ofertas', kw: 'oferta' },
                                        { label: '👗 Roupas Fem', kw: 'roupas femininas' },
                                        { label: '👕 Roupas Masc', kw: 'roupas masculinas' },
                                        { label: '📱 Celulares', kw: 'celulares' },
                                        { label: '🏠 Casa', kw: 'casa utilidades deco' },
                                        { label: '💄 Beleza', kw: 'maquiagem skincare' },
                                        { label: '📿 Umbanda', kw: 'umbanda candomblé' },
                                        { label: '⛪ Gospel', kw: 'evangélico gospel' },
                                        { label: '🧸 Brinquedos', kw: 'brinquedos' },
                                        { label: '🎧 Eletrônicos', kw: 'eletrônicos tech' },
                                        { label: '⌚ Relógios', kw: 'relógios' },
                                        { label: '👜 Bolsas', kw: 'bolsas' },
                                        { label: '👠 Calçados Fem', kw: 'sapatos femininos' },
                                        { label: '👟 Calçados Masc', kw: 'sapatos masculinos' },
                                        { label: '🍳 Cozinha', kw: 'utensílios cozinha' },
                                        { label: '👶 Bebês', kw: 'enxoval bebê' },
                                        { label: '🎮 Games', kw: 'video games' },
                                        { label: '💻 Informática', kw: 'computadores' },
                                        { label: '⚽ Esportes', kw: 'esporte academia' },
                                        { label: '🚗 Automotivo', kw: 'acessórios carros' },
                                        { label: '🐶 Pet Shop', kw: 'pet shop' },
                                        { label: '📚 Papelaria', kw: 'papelaria escritório' }
                                    ].map((cat) => (
                                        <button
                                            key={cat.kw}
                                            onClick={() => {
                                                setKeyword(cat.kw);
                                                // Trigger search automatically
                                                setTimeout(() => {
                                                    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                                                    handleSearchOffers(fakeEvent);
                                                }, 0);
                                            }}
                                            className="px-4 py-2 bg-gray-50 hover:bg-orange-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-gray-100 hover:border-orange-400 whitespace-nowrap"
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {products.map(p => (
                                    <div key={p.itemId} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                                    <div className="relative h-48">
                                        <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                        {p.videoUrl && (
                                            <div className="absolute bottom-4 left-4 bg-orange-500 text-white px-3 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 shadow-lg scale-100 group-hover:scale-110 transition-transform">
                                                <Video size={12} /> POSSUI VÍDEO
                                            </div>
                                        )}
                                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black text-orange-600 shadow-sm">
                                            {(p.commissionRate * 100).toFixed(1)}% OFF
                                        </div>
                                    </div>
                                        <div className="p-6">
                                            <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-4 h-10">{p.name}</h4>
                                            <div className="flex items-center justify-between mb-6">
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Preço</p>
                                                    <p className="text-lg font-black text-gray-900">R$ {p.price.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Ganhos</p>
                                                    <p className="text-lg font-black text-green-600">R$ {p.commission.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => copyToClipboard(p.offerLink)} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-colors">
                                                    Copiar Link
                                                </button>
                                                <button onClick={() => handleAddToVitrine(p)} className="p-3 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm" title="Adicionar à Vitrine">
                                                    <Sparkles size={18} />
                                                </button>
                                            </div>
                                            <button onClick={() => openPinterestSearch(p.name)} className="w-full mt-2 bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition-colors text-xs">
                                                Buscar Vídeo (Pinterest)
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Pagination Search */}
                            {products.length > 0 && (
                                <div className="flex items-center justify-center gap-4 mt-12 pb-10">
                                    <button 
                                        disabled={searchPage === 1 || loadingSearch}
                                        onClick={() => {
                                            setSearchPage(p => p - 1);
                                            setTimeout(() => handleSearchOffers(undefined, false), 0);
                                        }}
                                        className="px-6 py-3 bg-white border border-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-all shadow-sm disabled:opacity-50"
                                    >
                                        Anterior
                                    </button>
                                    <div className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold shadow-lg shadow-orange-100">
                                        Página {searchPage}
                                    </div>
                                    <button 
                                        disabled={products.length < 24 || loadingSearch}
                                        onClick={() => {
                                            setSearchPage(p => p + 1);
                                            setTimeout(() => handleSearchOffers(undefined, false), 0);
                                        }}
                                        className="px-6 py-3 bg-white border border-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-all shadow-sm disabled:opacity-50"
                                    >
                                        Próxima
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {affiliateTab === 'shops' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {shops.map(s => (
                                <div key={s.shopId} className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between group">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center font-black text-xl text-orange-500 border-2 border-orange-100">
                                            {s.shopName[0]}
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-black text-gray-800">{s.shopName}</h4>
                                            <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest bg-orange-50 px-3 py-1 rounded-full w-fit mt-2">
                                                {(s.commissionRate * 100).toFixed(1)}% COMISSÃO MÉDIA
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => copyToClipboard(s.offerLink)} className="p-4 bg-gray-50 text-gray-400 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-all">
                                        <Copy size={20} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {affiliateTab === 'tools' && (
                        <div className="max-w-2xl mx-auto bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
                            <h3 className="text-2xl font-black text-gray-900 mb-8">Gerador de Short Link Profissional</h3>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">URL Original do Produto</label>
                                    <input 
                                        type="text" 
                                        value={manualLink}
                                        onChange={(e) => setManualLink(e.target.value)}
                                        placeholder="Cole o link da Shopee aqui..."
                                        className="w-full p-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-orange-500 transition-all font-bold"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">SubID (Rastreamento)</label>
                                        <input 
                                            type="text" 
                                            value={subId}
                                            onChange={(e) => setSubId(e.target.value)}
                                            placeholder="ex: story_01"
                                            className="w-full p-4 bg-gray-50 rounded-xl border-2 border-transparent focus:border-orange-500 transition-all font-bold"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <button 
                                            onClick={handleGenerateManualLink}
                                            disabled={loadingLink || !manualLink}
                                            className="w-full py-4 bg-orange-500 text-white rounded-xl font-black hover:bg-orange-600 shadow-lg shadow-orange-100 transition-all disabled:opacity-50"
                                        >
                                            {loadingLink ? <Loader2 className="animate-spin mx-auto" /> : 'GERAR LINK'}
                                        </button>
                                    </div>
                                </div>
                                
                                {generatedLink && (
                                    <div className="mt-10 p-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl text-white">
                                        <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-3">Link Encurtado de Afiliado</p>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 font-mono text-sm bg-white/10 p-4 rounded-xl truncate">{generatedLink}</div>
                                            <button onClick={() => copyToClipboard(generatedLink)} className="p-4 bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors">
                                                <Copy size={20} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- MAIN TAB: VIDEOS --- */}
            {mainTab === 'videos' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-wrap gap-2 bg-gray-100/50 p-2 rounded-3xl w-full">
                        <SubMenuButton id="best_sellers" icon={TrendingUp} label="Mais Vendidos" active={videoSubTab === 'best_sellers'} onClick={() => setVideoSubTab('best_sellers')} />
                        <SubMenuButton id="cheapest" icon={DollarSign} label="Mais Baratos" active={videoSubTab === 'cheapest'} onClick={() => setVideoSubTab('cheapest')} />
                        <SubMenuButton id="achadinhos" icon={Sparkles} label="Achadinhos" active={videoSubTab === 'achadinhos'} onClick={() => setVideoSubTab('achadinhos')} />
                        <SubMenuButton id="bizarros" icon={Laugh} label="Bizarros" active={videoSubTab === 'bizarros'} onClick={() => setVideoSubTab('bizarros')} />
                        <SubMenuButton id="moda_feminina" icon={ShoppingBag} label="Moda Feminina" active={videoSubTab === 'moda_feminina'} onClick={() => setVideoSubTab('moda_feminina')} />
                        <SubMenuButton id="moda_masculina" icon={ShoppingBag} label="Moda Masculina" active={videoSubTab === 'moda_masculina'} onClick={() => setVideoSubTab('moda_masculina')} />
                        <SubMenuButton id="celulares" icon={Smartphone} label="Celulares & Tech" active={videoSubTab === 'celulares'} onClick={() => setVideoSubTab('celulares')} />
                        <SubMenuButton id="casa" icon={Pin} label="Casa & Decoração" active={videoSubTab === 'casa'} onClick={() => setVideoSubTab('casa')} />
                        <SubMenuButton id="beleza" icon={Sparkles} label="Saúde & Beleza" active={videoSubTab === 'beleza'} onClick={() => setVideoSubTab('beleza')} />
                        <SubMenuButton id="umbanda" icon={Sparkles} label="Umbanda & Candomblé" active={videoSubTab === 'umbanda'} onClick={() => setVideoSubTab('umbanda')} />
                        <SubMenuButton id="evangelico" icon={CheckCircle} label="Evangélicos" active={videoSubTab === 'evangelico'} onClick={() => setVideoSubTab('evangelico')} />
                        <SubMenuButton id="brinquedos" icon={Laugh} label="Brinquedos" active={videoSubTab === 'brinquedos'} onClick={() => setVideoSubTab('brinquedos')} />
                        <SubMenuButton id="eletronicos" icon={Monitor} label="Eletrônicos" active={videoSubTab === 'eletronicos'} onClick={() => setVideoSubTab('eletronicos')} />
                        <SubMenuButton id="acessorios" icon={Tag} label="Acessórios" active={videoSubTab === 'acessorios'} onClick={() => setVideoSubTab('acessorios')} />
                        <SubMenuButton id="bebes" icon={Laugh} label="Bebês" active={videoSubTab === 'bebes'} onClick={() => setVideoSubTab('bebes')} />
                        <SubMenuButton id="esportes" icon={TrendingUp} label="Esportes" active={videoSubTab === 'esportes'} onClick={() => setVideoSubTab('esportes')} />
                        <SubMenuButton id="automotivo" icon={Settings} label="Automotivo" active={videoSubTab === 'automotivo'} onClick={() => setVideoSubTab('automotivo')} />
                        <SubMenuButton id="relogios" icon={Tag} label="Relógios" active={videoSubTab === 'relogios'} onClick={() => setVideoSubTab('relogios')} />
                        <SubMenuButton id="bolsas" icon={ShoppingBag} label="Bolsas" active={videoSubTab === 'bolsas'} onClick={() => setVideoSubTab('bolsas')} />
                        <SubMenuButton id="calcados_fem" icon={ShoppingBag} label="Calçados Fem" active={videoSubTab === 'calcados_fem'} onClick={() => setVideoSubTab('calcados_fem')} />
                        <SubMenuButton id="calcados_masc" icon={ShoppingBag} label="Calçados Masc" active={videoSubTab === 'calcados_masc'} onClick={() => setVideoSubTab('calcados_masc')} />
                        <SubMenuButton id="cozinha" icon={Pin} label="Cozinha" active={videoSubTab === 'cozinha'} onClick={() => setVideoSubTab('cozinha')} />
                        <SubMenuButton id="games" icon={Monitor} label="Games" active={videoSubTab === 'games'} onClick={() => setVideoSubTab('games')} />
                        <SubMenuButton id="informatica" icon={Monitor} label="Informática" active={videoSubTab === 'informatica'} onClick={() => setVideoSubTab('informatica')} />
                        <SubMenuButton id="pet" icon={Sparkles} label="Pet Shop" active={videoSubTab === 'pet'} onClick={() => setVideoSubTab('pet')} />
                        <SubMenuButton id="papelaria" icon={Pin} label="Papelaria" active={videoSubTab === 'papelaria'} onClick={() => setVideoSubTab('papelaria')} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {loadingVideos ? (
                            <div className="col-span-4 py-20 text-center"><Loader2 className="animate-spin mx-auto text-orange-500" size={48} /></div>
                        ) : videoProducts.map(p => (
                            <div key={p.itemId} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
                                <div className="relative h-64">
                                    <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase">{p.sales} VENDIDOS</div>
                                </div>
                                <div className="p-6">
                                    <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-6 min-h-[2.5rem] leading-relaxed">{p.name}</h4>
                                    <div className="flex gap-2">
                                        <button onClick={() => openPinterestSearch(p.name)} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 text-xs shadow-lg shadow-red-100">
                                            <Video size={16} /> BAIXAR VÍDEO
                                        </button>
                                        <button onClick={() => copyToClipboard(p.offerLink)} className="p-3 bg-gray-50 text-gray-500 rounded-xl hover:bg-orange-50 hover:text-orange-600 transition-colors border border-gray-100">
                                            <LinkIcon size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination Videos */}
                    <div className="flex items-center justify-center gap-4 mt-12 pb-10">
                        <button 
                            disabled={videoPage === 1 || loadingVideos}
                            onClick={() => setVideoPage(p => p - 1)}
                            className="px-6 py-3 bg-white border border-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-all shadow-sm disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <div className="px-6 py-3 bg-orange-500 text-white rounded-2xl font-bold shadow-lg shadow-orange-100">
                            Página {videoPage}
                        </div>
                        <button 
                            disabled={videoProducts.length < 24 || loadingVideos}
                            onClick={() => setVideoPage(p => p + 1)}
                            className="px-6 py-3 bg-white border border-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-all shadow-sm disabled:opacity-50"
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            )}

            {/* --- MAIN TAB: SETTINGS --- */}
            {mainTab === 'settings' && (
                <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Affiliate Settings */}
                    <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900">Configurações de Afiliado</h3>
                                <p className="text-gray-400 text-sm font-medium">Use suas credenciais do Console de Afiliado Shopee.</p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveConfig} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">App ID</label>
                                    <input 
                                        type="text" 
                                        value={configData.appId}
                                        onChange={(e) => setConfigData({ ...configData, appId: e.target.value })}
                                        className="w-full p-4 bg-gray-50 rounded-xl border-2 border-transparent focus:border-orange-500 transition-all font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">App Secret / Password</label>
                                    <input 
                                        type="password" 
                                        value={configData.password}
                                        onChange={(e) => setConfigData({ ...configData, password: e.target.value })}
                                        className="w-full p-4 bg-gray-50 rounded-xl border-2 border-transparent focus:border-orange-500 transition-all font-bold"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="submit" className="flex-1 bg-gray-900 text-white py-4 rounded-xl font-black hover:bg-black transition-all shadow-xl">
                                    SALVAR ALTERAÇÕES
                                </button>
                                <button type="button" onClick={handleTestConnection} className="flex-1 bg-white text-orange-600 border-2 border-orange-500 py-4 rounded-xl font-black hover:bg-orange-50 transition-all">
                                    TESTAR CONEXÃO
                                </button>
                            </div>
                            
                            {testStatus !== 'idle' && (
                                <div className={`p-5 rounded-2xl border flex items-center gap-4 font-bold text-sm ${
                                    testStatus === 'loading' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                                    testStatus === 'success' ? 'bg-green-50 border-green-100 text-green-600' :
                                    'bg-red-50 border-red-100 text-red-600'
                                }`}>
                                    {testStatus === 'loading' ? <Loader2 size={18} className="animate-spin" /> : 
                                     testStatus === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                    {testMessage}
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Shop/Seller Settings (Grouped here as requested) */}
                    <ShopeeConfig />
                </div>
            )}

            {/* --- PINTEREST MODAL --- */}
            {showPinterestModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-10 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl h-full max-h-[85vh] overflow-hidden flex flex-col relative">
                        <button 
                            onClick={() => setShowPinterestModal(false)}
                            className="absolute top-8 right-8 p-3 bg-gray-100 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all z-10"
                        >
                            <XCircle size={24} />
                        </button>

                        <div className="p-10 border-b border-gray-100">
                             <h3 className="text-3xl font-black text-gray-900 mb-2">Vídeos Recomendados</h3>
                             <p className="text-gray-400 font-medium">Buscando mídias de alta qualidade para: <span className="text-red-500 font-black">"{pinterestKeyword}"</span></p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-gray-50/50">
                            {loadingPinterest ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-16 h-16 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-6"></div>
                                    <p className="text-gray-500 font-bold">Vasculhando o Pinterest...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                    {pinterestResults.map((pin) => (
                                        <div key={pin.id} className="group relative rounded-[2rem] overflow-hidden bg-white shadow-sm border border-gray-100 group">
                                            <img src={pin.imageUrl} alt="" className="w-full h-64 object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-red-600/90 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center p-6 text-center">
                                                <button 
                                                    onClick={() => downloadPinterestVideo(pin.pinUrl)}
                                                    className="w-full bg-white text-red-600 py-3 rounded-2xl font-black text-xs hover:scale-105 transition-transform shadow-xl mb-4"
                                                >
                                                    {downloadingVideo ? 'BAIXANDO...' : 'BAIXAR AGORA'}
                                                </button>
                                                <a href={pin.pinUrl} target="_blank" rel="noreferrer" className="text-white text-[10px] font-black uppercase tracking-widest hover:underline">Ver Original</a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShopeeCentralPage;
