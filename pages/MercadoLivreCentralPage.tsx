import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
    TrendingUp, Settings, Link as LinkIcon, DollarSign, Loader2, ShoppingCart, 
    Search, Info, LayoutDashboard, ShoppingBag, Copy, Save, Store, Smartphone, 
    Monitor, AlertOctagon, ShieldCheck, CheckCircle, Server, AlertTriangle, 
    XCircle, ExternalLink, HelpCircle, Pin, Download, MessageCircle, Instagram, 
    Calendar, AlertCircle, Video, Tag, Sparkles, Laugh, ChevronRight, ArrowRight,
    Plus, Zap, RefreshCw
} from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import { MLSettings } from '../types';
import { searchMLProducts, testMLConnection, generateMLAffiliateLink, getMLBioLinks, addMLBioLink, deleteMLBioLink, getMLBioSettings, saveMLBioSettings, getMLBioStats, getMLCategories, exchangeMLOAuthCode } from '../services/mercadoLivreService';

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

type MainTab = 'affiliate' | 'videos' | 'settings';
type AffiliateTab = 'dashboard' | 'vitrine' | 'vitrine_settings' | 'offers' | 'tools';
type VideoSubTab = 'best_sellers' | 'cheapest' | 'achadinhos' | 'bizarros' | 'moda_feminina' | 'moda_masculina' | 'celulares' | 'casa' | 'beleza';

const MercadoLivreCentralPage: React.FC = () => {
    const { showAlert } = useAlert();

    // Main Navigation
    const [mainTab, setMainTab] = useState<MainTab>('affiliate');
    
    // Sub-navigation for Affiliate
    const [affiliateTab, setAffiliateTab] = useState<AffiliateTab>('dashboard');
    
    // Sub-navigation for Videos
    const [videoSubTab, setVideoSubTab] = useState<string>('best_sellers');

    // --- CREDENTIALS CONFIG ---
    const [config, setConfig] = useState<MLSettings>({
        appId: localStorage.getItem('ml_appId') || '',
        clientSecret: localStorage.getItem('ml_clientSecret') || '',
        accessToken: localStorage.getItem('ml_accessToken') || '',
        affiliateId: localStorage.getItem('ml_affiliateId') || ''
    });
    const [testingConfig, setTestingConfig] = useState(false);
    const [configStatus, setConfigStatus] = useState<'idle'|'ok'|'error'>('idle');

    // --- SEARCH OFFERS STATE ---
    const [keyword, setKeyword] = useState('');
    const [products, setProducts] = useState<any[]>([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');
    
    // --- MANUAL LINK GENERATION ---
    const [manualLink, setManualLink] = useState('');
    const [manualGenerated, setManualGenerated] = useState('');
    
    // --- VITRINE STATE ---
    const [vitrineLinks, setVitrineLinks] = useState<any[]>([]);
    const [loadingVitrine, setLoadingVitrine] = useState(false);
    const [vitrineSearch, setVitrineSearch] = useState('');
    const [activeEditorTab, setActiveEditorTab] = useState<'perfil' | 'links' | 'analyticos' | 'geral'>('perfil');

    const [bioSettings, setBioSettings] = useState<BioSettings>({
        whatsapp_link: '',
        primary_color: '#3483FA',
        secondary_color: '#2D3277',
        font_family: 'Sans-serif',
        logo_url: '',
        hero_image_url: '',
        title: '',
        description: '',
        whatsapp_banner_text: '👉 Entre na nossa comunidade no WhatsApp',
        theme: 'Névoa Espiritual',
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
    const [mlCategories, setMLCategories] = useState<any[]>([]);

    // --- VIDEO & PINTEREST STATE ---
    const [videoProducts, setVideoProducts] = useState<any[]>([]);
    const [loadingVideos, setLoadingVideos] = useState(false);
    const [videoPage, setVideoPage] = useState(1);
    
    const [showPinterestModal, setShowPinterestModal] = useState(false);
    const [pinterestKeyword, setPinterestKeyword] = useState('');
    const [pinterestResults, setPinterestResults] = useState<any[]>([]);
    const [loadingPinterest, setLoadingPinterest] = useState(false);
    const [downloadingVideo, setDownloadingVideo] = useState(false);
    const [downloadedVideo, setDownloadedVideo] = useState<{ localPath: string, filename: string } | null>(null);

    // --- OAUTH FLOW TRIGGER AND DETECTOR ---
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            const appId = localStorage.getItem('ml_appId') || '';
            const clientSecret = localStorage.getItem('ml_clientSecret') || '';
            if (appId && clientSecret) {
                const exchangeCode = async () => {
                    showAlert('Conectando e gerando tokens com Mercado Livre...', 'info');
                    try {
                        const redirectUri = `${window.location.origin}/dashboard/mercadolivre_central`;
                        const data = await exchangeMLOAuthCode(code, appId, clientSecret, redirectUri);
                        
                        const newConfig = {
                            appId,
                            clientSecret,
                            accessToken: data.accessToken,
                            refreshToken: data.refreshToken
                        };
                        setConfig(newConfig);
                        
                        localStorage.setItem('ml_accessToken', data.accessToken);
                        localStorage.setItem('ml_refreshToken', data.refreshToken);
                        
                        setConfigStatus('ok');
                        showAlert('Conta conectada com sucesso!', 'success');
                    } catch (error: any) {
                        setConfigStatus('error');
                        showAlert(error.message || 'Erro ao conectar conta', 'error');
                    } finally {
                        // clean query params in url
                        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
                    }
                };
                exchangeCode();
            } else {
                showAlert('Para concluir a conexão automática, certifique-se de preencher o APP ID e a Chave Secreta antes de conectar.', 'error');
                window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
            }
        }
    }, []);

    const handleConnectOAuth = () => {
        if (!config.appId) {
            showAlert('Por favor, preencha o APP ID (Client ID) para conectar.', 'error');
            return;
        }
        // Save client credentials first so they are available when redirecting back
        localStorage.setItem('ml_appId', config.appId);
        localStorage.setItem('ml_clientSecret', config.clientSecret);
        
        const redirectUri = `${window.location.origin}/dashboard/mercadolivre_central`;
        const authUrl = `https://auth.mercadolibre.com.br/authorization?response_type=code&client_id=${config.appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
        
        showAlert('Redirecionando para a página de autorização do Mercado Livre...', 'info');
        setTimeout(() => {
            window.location.href = authUrl;
        }, 1000);
    };

    // --- ACTIONS: CONFIG ---
    const handleSaveConfig = () => {
        localStorage.setItem('ml_appId', config.appId);
        localStorage.setItem('ml_clientSecret', config.clientSecret);
        localStorage.setItem('ml_accessToken', config.accessToken || '');
        localStorage.setItem('ml_affiliateId', config.affiliateId || '');
        showAlert('Configurações do Mercado Livre salvas!', 'success');
    };

    const handleTestConnection = async () => {
        setTestingConfig(true);
        try {
            await testMLConnection(config);
            setConfigStatus('ok');
            showAlert('Conexão com Mercado Livre bem sucedida!', 'success');
        } catch (error: any) {
            setConfigStatus('error');
            showAlert(error.message, 'error');
        } finally {
            setTestingConfig(false);
        }
    };

    // --- ACTIONS: OFFERS SEARCH ---
    const handleSearchOffers = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!keyword) return;
        
        setLoadingSearch(true);
        try {
            const data = await searchMLProducts(keyword, 24, 0, 'relevance', {
                appId: config.appId || undefined,
                clientSecret: config.clientSecret || undefined,
                accessToken: config.accessToken || undefined,
                refreshToken: config.refreshToken || undefined
            });

            let filtered = data.products;
            if (minPrice) filtered = filtered.filter(p => p.price >= parseFloat(minPrice));
            if (maxPrice) filtered = filtered.filter(p => p.price <= parseFloat(maxPrice));

            setProducts(filtered);
        } catch (error: any) {
            showAlert(error.message, 'error');
        } finally {
            setLoadingSearch(false);
        }
    };

    // --- ACTIONS: VITRINE ---
    const fetchMLBioLinksData = async () => {
        setLoadingVitrine(true);
        try {
            const links = await getMLBioLinks(vitrineSearch);
            setVitrineLinks(links);
        } catch (e: any) {
            console.error('Error fetching ML vitrine links:', e);
        } finally {
            setLoadingVitrine(false);
        }
    };

    const fetchBioSettingsData = async () => {
        setLoadingSettings(true);
        try {
            const settings = await getMLBioSettings();
            if (settings) {
                if (typeof settings.testimonials === 'object') {
                    settings.testimonials = JSON.stringify(settings.testimonials);
                }
                setBioSettings(settings);
            }
        } catch (e) {
            console.error('Error fetching ML settings:', e);
        } finally {
            setLoadingSettings(false);
        }
    };

    const fetchBioStatsData = async () => {
        try {
            const stats = await getMLBioStats();
            if (stats) setBioStats(stats);
        } catch (e) {
            console.error('Error fetching ML stats:', e);
        }
    };

    const handleSaveSettings = async () => {
        setLoadingSettings(true);
        try {
            const dataToSave = { ...bioSettings };
            if (typeof dataToSave.testimonials === 'object') {
                dataToSave.testimonials = JSON.stringify(dataToSave.testimonials);
            }
            await saveMLBioSettings(dataToSave);
            showAlert("Identidade visual da vitrine Mercado Livre salva!", 'success');
            fetchBioSettingsData();
        } catch (e: any) {
            showAlert(e.message || "Erro ao salvar configurações", 'error');
        } finally {
            setLoadingSettings(false);
        }
    };

    const handleAddToVitrine = async (product: any) => {
        try {
            const affiliateLink = generateMLAffiliateLink(product.offerLink || product.permalink, config);
            await addMLBioLink({
                productId: product.itemId?.toString() || product.id?.toString(),
                name: product.name || product.title,
                imageUrl: product.imageUrl,
                affiliateLink: affiliateLink,
                category: videoSubTab || 'Geral'
            });
            showAlert("Produto adicionado à Vitrine Mercado Livre!", 'success');
            fetchMLBioLinksData();
        } catch (e: any) {
            showAlert(e.message || "Erro ao adicionar à vitrine", 'error');
        }
    };

    const handleRemoveFromVitrine = async (id: number) => {
        try {
            await deleteMLBioLink(id);
            showAlert("Produto removido da vitrine Mercado Livre!", 'success');
            fetchMLBioLinksData();
        } catch (e: any) {
            showAlert(e.message || "Erro ao remover produto", 'error');
        }
    };

    // --- ACTIONS: VIDEOS GENERATION ---
    const loadVideoProducts = async () => {
        setLoadingVideos(true);
        try {
            const systemTabs = [
                { id: 'best_sellers', keyword: 'iphone 15 pro max', label: 'Mais Vendidos' },
                { id: 'cheapest', keyword: 'barato utilidades', label: 'Mais Baratos' },
                { id: 'achadinhos', keyword: 'achados utilidades', label: 'Achadinhos' },
                { id: 'bizarros', keyword: 'diferente bizarro engraçado', label: 'Bizarros' },
            ];

            const dynamicTabs = mlCategories.map(cat => ({
                id: cat.slug,
                keyword: cat.keywords,
                label: cat.name
            }));

            const allTabs = [...systemTabs, ...dynamicTabs];
            const current = allTabs.find(t => t.id === videoSubTab) || allTabs[0];

            const data = await searchMLProducts(current.keyword, 24, (videoPage - 1) * 24, 'relevance', {
                appId: config.appId || undefined,
                clientSecret: config.clientSecret || undefined,
                accessToken: config.accessToken || undefined,
                refreshToken: config.refreshToken || undefined
            });
            setVideoProducts(data.products);
        } catch (error) {
            console.error(error);
            showAlert('Erro ao carregar vídeos do Mercado Livre', 'error');
        } finally {
            setLoadingVideos(false);
        }
    };

    // --- ACTIONS: PINTEREST SEARCH & DOWNLOAD ---
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
            showAlert('Erro ao buscar no Pinterest', 'error');
        } finally {
            setLoadingPinterest(false);
        }
    };

    const downloadPinterestVideo = async (pinUrl: string) => {
        setDownloadingVideo(true);
        try {
            const response = await axios.post('/api/pinterest/download-video', { pinUrl });
            if (response.data.success) {
                setDownloadedVideo({ localPath: response.data.localPath, filename: response.data.filename });
                showAlert('Vídeo baixado com sucesso!', 'success');
                const link = document.createElement('a');
                link.href = response.data.localPath;
                link.download = response.data.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error(error);
            showAlert('Erro ao baixar vídeo do Pinterest', 'error');
        } finally {
            setDownloadingVideo(false);
        }
    };

    // --- INITIAL LOADING ---
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const categories = await getMLCategories(true);
                setMLCategories(categories);
            } catch (error) {
                console.error('Error fetching ML categories:', error);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        if (mainTab === 'affiliate') {
            if (affiliateTab === 'dashboard') fetchBioStatsData();
            if (affiliateTab === 'vitrine') fetchMLBioLinksData();
            if (affiliateTab === 'vitrine_settings') {
                fetchBioSettingsData();
                fetchBioStatsData();
            }
        }
    }, [mainTab, affiliateTab, vitrineSearch]);

    useEffect(() => {
        if (affiliateTab === 'vitrine_settings' && activeEditorTab === 'analyticos') {
            fetchBioStatsData();
        }
    }, [activeEditorTab]);

    useEffect(() => {
        if (mainTab === 'videos') {
            loadVideoProducts();
        }
    }, [mainTab, videoSubTab, videoPage]);

    // --- MOBILE PREVIEW COMPONENT ---
    const MobilePreview = () => {
        const primaryColor = bioSettings.primary_color || '#3483FA';
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
                            <div className="w-16 h-16 bg-white/10 rounded-full mx-auto mb-3 border border-white/20 overflow-hidden flex items-center justify-center">
                                {bioSettings.logo_url ? (
                                    <img src={bioSettings.logo_url} className="w-full h-full object-cover" />
                                ) : (
                                    <ShoppingBag size={28} className="text-[#FFE600]" />
                                )}
                            </div>
                            <h4 className="text-white font-black text-sm uppercase">{bioSettings.title || 'Sua Vitrine ML'}</h4>
                            <p className="text-white/60 text-[10px] leading-tight italic px-4 mt-1">{bioSettings.description || 'Achadinhos recomendados.'}</p>
                        </div>

                        {/* Hero Section */}
                        <div className="bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                            <button 
                                className="w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg"
                                style={{ backgroundColor: primaryColor, color: '#FFF' }}
                            >
                                {bioSettings.hero_text}
                            </button>
                        </div>

                        {/* Links Preview */}
                        <div className="space-y-3">
                            {vitrineLinks.slice(0, 3).map(link => (
                                <div key={link.id} className="bg-white/5 backdrop-blur-sm p-2 rounded-2xl flex items-center gap-3 border border-white/5">
                                    <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center bg-white">
                                        <img src={link.image_url} className="w-full h-full object-contain p-1" />
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
                                <p className="text-white/40 text-[8px] font-bold uppercase tracking-widest pl-1">Depoimentos</p>
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

    // --- BUTTON RENDERING HELPERS ---
    const MainMenuButton = ({ id, icon: Icon, label }: {id: MainTab, icon: any, label: string}) => (
        <button
            onClick={() => setMainTab(id)}
            className={`flex items-center px-6 sm:px-8 py-4 sm:py-5 font-black text-xs sm:text-sm uppercase tracking-wider transition-all duration-300 relative shrink-0 whitespace-nowrap ${mainTab === id
                ? 'text-[#2D3277] bg-[#FFE600]/20'
                : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                }`}
        >
            <Icon size={18} className={`mr-2 sm:mr-3 ${mainTab === id ? 'animate-pulse' : ''}`} />
            {label}
            {mainTab === id && (
                <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2D3277]"></div>
            )}
        </button>
    );

    const SubMenuButton = ({ id, icon: Icon, label, active, onClick }: any) => (
        <button
            onClick={onClick}
            className={`flex items-center px-4 py-2.5 rounded-xl font-bold text-xs transition-all duration-200 shrink-0 whitespace-nowrap ${active
                ? 'bg-[#2D3277] text-white shadow-lg shadow-[#2D3277]/20'
                : 'text-gray-500 hover:bg-gray-100'
                }`}
        >
            <Icon size={14} className="mr-2" />
            {label}
        </button>
    );

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-20">
            {/* Header Section (ML yellow style) */}
            <div className="bg-gradient-to-r from-[#FFE600] to-[#FFCC00] rounded-[2rem] p-8 sm:p-10 text-[#2D3277] shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-1000"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl rotate-3 group-hover:rotate-0 transition-transform duration-500 shrink-0">
                            <ShoppingBag size={36} className="text-[#2D3277]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1">Central <span className="text-black">Mercado Livre</span></h1>
                            <p className="text-[#2D3277]/70 font-bold text-sm">Crie vitrines personalizadas, pesquise ofertas e baixe vídeos de apoio.</p>
                        </div>
                    </div>
                    <div className="bg-white/30 backdrop-blur-xl border border-white/40 px-8 py-4 rounded-[2rem] text-center md:text-left">
                        <p className="text-[#2D3277] text-[10px] font-black uppercase tracking-[0.2em] mb-1">Visitas na Bio</p>
                        <p className="text-3xl font-black text-black">{bioStats.totalVisits}</p>
                    </div>
                </div>
            </div>

            {/* Main Navigation Tabs */}
            <div className="bg-white/70 backdrop-blur-2xl rounded-[1.5rem] shadow-xl border border-white/50 flex overflow-x-auto scrollbar-hide whitespace-nowrap p-1">
                <MainMenuButton id="affiliate" icon={TrendingUp} label="Painel Afiliado" />
                <MainMenuButton id="videos" icon={Video} label="ML Vídeos" />
                <MainMenuButton id="settings" icon={Settings} label="Configurações" />
            </div>

            {/* --- MAIN TAB: PAINEL AFILIADO --- */}
            {mainTab === 'affiliate' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Sub Navigation */}
                    <div className="flex gap-2 bg-gray-100/50 p-1.5 rounded-2xl overflow-x-auto max-w-full scrollbar-hide whitespace-nowrap">
                        <SubMenuButton id="dashboard" icon={LayoutDashboard} label="Visão Geral" active={affiliateTab === 'dashboard'} onClick={() => setAffiliateTab('dashboard')} />
                        <SubMenuButton id="vitrine" icon={Sparkles} label="Link na Bio / Vitrine" active={affiliateTab === 'vitrine'} onClick={() => setAffiliateTab('vitrine')} />
                        <SubMenuButton id="vitrine_settings" icon={Settings} label="Configurar Bio" active={affiliateTab === 'vitrine_settings'} onClick={() => setAffiliateTab('vitrine_settings')} />
                        <SubMenuButton id="offers" icon={Search} label="Buscar Produtos" active={affiliateTab === 'offers'} onClick={() => setAffiliateTab('offers')} />
                        <SubMenuButton id="tools" icon={LinkIcon} label="Short Links" active={affiliateTab === 'tools'} onClick={() => setAffiliateTab('tools')} />
                    </div>

                    {/* SUBTAB: VISÃO GERAL */}
                    {affiliateTab === 'dashboard' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Total Visitas na Vitrine</p>
                                    <p className="text-3xl font-black text-gray-900">{bioStats.totalVisits}</p>
                                </div>
                                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Total Cliques nos Links</p>
                                    <p className="text-3xl font-black text-gray-900">{bioStats.totalClicks}</p>
                                </div>
                                <div className="bg-[#FFE600]/25 p-6 rounded-[2rem] shadow-md text-[#2D3277] border border-[#FFE600]/50">
                                    <p className="text-xs font-bold text-[#2D3277]/80 uppercase mb-4">Taxa de CTR Geral</p>
                                    <p className="text-3xl font-black text-black">
                                        {(bioStats.totalVisits > 0 ? ((bioStats.totalClicks / bioStats.totalVisits) * 100).toFixed(1) : 0)}%
                                    </p>
                                </div>
                            </div>
                            
                            <div className="bg-white p-12 rounded-[2rem] border border-gray-100 shadow-sm text-center flex flex-col items-center">
                                <div className="w-16 h-16 bg-[#3483FA]/10 rounded-full flex items-center justify-center text-[#3483FA] mb-4">
                                    <TrendingUp size={28} />
                                </div>
                                <h3 className="font-bold text-lg text-gray-800">Estatísticas do Link de Afiliado</h3>
                                <p className="text-sm text-gray-400 max-w-sm mt-1">Veja cliques e acessos em tempo real da sua vitrine do Mercado Livre configurando seu domínio.</p>
                            </div>
                        </div>
                    )}

                    {/* SUBTAB: LINK NA BIO / VITRINE */}
                    {affiliateTab === 'vitrine' && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-800">Minha Vitrine Mercado Livre</h3>
                                        <p className="text-gray-400 font-medium text-sm">Gerencie os produtos ativos na sua página de Link na Bio.</p>
                                    </div>
                                    <a 
                                        href={`/ml-vitrine/${localStorage.getItem('userId') || '1'}`} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="bg-[#FFE600] text-[#2D3277] px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all hover:scale-105"
                                    >
                                        <ExternalLink size={18} /> Ver Vitrine Pública
                                    </a>
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input 
                                        type="text" 
                                        value={vitrineSearch}
                                        onChange={(e) => setVitrineSearch(e.target.value)}
                                        placeholder="Buscar produto na minha vitrine..."
                                        className="w-full pl-14 pr-4 py-5 bg-gray-50 border-2 border-transparent rounded-[1.8rem] focus:bg-white focus:border-[#3483FA] focus:outline-none transition-all font-bold text-gray-700 shadow-inner"
                                    />
                                </div>
                            </div>

                            {loadingVitrine ? (
                                <div className="py-24 text-center">
                                    <Loader2 className="animate-spin text-[#3483FA] mx-auto mb-4" size={40} />
                                    <p className="text-sm font-black text-gray-400 uppercase tracking-wider">Carregando Vitrine...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    {vitrineLinks.map(link => (
                                        <div key={link.id} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group flex flex-col justify-between">
                                            <div className="relative h-56 bg-white p-4 flex items-center justify-center">
                                                <img src={link.image_url} className="max-h-full max-w-full object-contain p-2" alt={link.name} />
                                                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black text-white flex items-center gap-1.5">
                                                    <TrendingUp size={12} className="text-[#FFE600]" /> {link.clicks || 0} CLIQUES
                                                </div>
                                            </div>
                                            <div className="p-6 border-t border-gray-50 flex-1 flex flex-col justify-between">
                                                <h4 className="font-bold text-gray-800 text-sm line-clamp-2 mb-4 leading-snug">{link.name}</h4>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => window.open(link.affiliate_link, '_blank')} 
                                                        className="flex-1 bg-[#3483FA] text-white py-3 rounded-xl font-bold hover:bg-[#2968c8] transition-colors text-xs flex items-center justify-center gap-2"
                                                    >
                                                        Link <ExternalLink size={14}/>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleRemoveFromVitrine(link.id)} 
                                                        className="p-3 bg-gray-50 text-red-500 rounded-xl hover:bg-red-50 border border-gray-100 transition-colors"
                                                        title="Remover da Vitrine"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {vitrineLinks.length === 0 && (
                                        <div className="col-span-4 bg-white p-24 rounded-[3.5rem] border-4 border-dashed border-gray-50 text-center flex flex-col items-center">
                                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                                <Sparkles size={40} className="text-[#FFE600]" />
                                            </div>
                                            <h4 className="text-lg font-black text-gray-500 uppercase tracking-widest">Nenhum produto cadastrado</h4>
                                            <p className="text-gray-400 text-sm mt-1 max-w-sm">Use a aba "Buscar Produtos" para pesquisar itens no Mercado Livre e adicioná-los com facilidade.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* SUBTAB: CONFIGURAR BIO */}
                    {affiliateTab === 'vitrine_settings' && (
                        <div className="flex flex-col lg:flex-row gap-8 items-start animate-in fade-in duration-300">
                            {/* Editor Form */}
                            <div className="flex-1 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm w-full">
                                <div className="flex border-b border-gray-100 pb-4 mb-6 overflow-x-auto gap-4">
                                    <button onClick={() => setActiveEditorTab('perfil')} className={`pb-3 font-bold text-sm transition-all border-b-2 ${activeEditorTab === 'perfil' ? 'border-[#3483FA] text-gray-800' : 'border-transparent text-gray-400'}`}>Perfil Vitrine</button>
                                    <button onClick={() => setActiveEditorTab('links')} className={`pb-3 font-bold text-sm transition-all border-b-2 ${activeEditorTab === 'links' ? 'border-[#3483FA] text-gray-800' : 'border-transparent text-gray-400'}`}>Links Adicionais</button>
                                    <button onClick={() => setActiveEditorTab('analyticos')} className={`pb-3 font-bold text-sm transition-all border-b-2 ${activeEditorTab === 'analyticos' ? 'border-[#3483FA] text-gray-800' : 'border-transparent text-gray-400'}`}>Estilos & Cores</button>
                                    <button onClick={() => setActiveEditorTab('geral')} className={`pb-3 font-bold text-sm transition-all border-b-2 ${activeEditorTab === 'geral' ? 'border-[#3483FA] text-gray-800' : 'border-transparent text-gray-400'}`}>Geral</button>
                                </div>

                                {loadingSettings ? (
                                    <div className="py-12 text-center">
                                        <Loader2 className="animate-spin text-[#3483FA] mx-auto" size={32} />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {activeEditorTab === 'perfil' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Título da Vitrine</label>
                                                    <input type="text" value={bioSettings.title} onChange={e => setBioSettings({...bioSettings, title: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="Ex: Meus Achadinhos Recomendados" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Descrição / Bio</label>
                                                    <textarea value={bioSettings.description} onChange={e => setBioSettings({...bioSettings, description: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium h-24" placeholder="Ex: Confira produtos testados e aprovados que achei no Mercado Livre com super descontos!" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Link da Logo (URL)</label>
                                                    <input type="text" value={bioSettings.logo_url} onChange={e => setBioSettings({...bioSettings, logo_url: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="https://..." />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Personalização da URL (Slug)</label>
                                                    <input type="text" value={bioSettings.slug} onChange={e => setBioSettings({...bioSettings, slug: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="meusachados" />
                                                </div>
                                            </>
                                        )}

                                        {activeEditorTab === 'links' && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Grupo do WhatsApp (Link)</label>
                                                    <input type="text" value={bioSettings.whatsapp_link} onChange={e => setBioSettings({...bioSettings, whatsapp_link: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="https://chat.whatsapp.com/..." />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Texto do Banner do WhatsApp</label>
                                                    <input type="text" value={bioSettings.whatsapp_banner_text} onChange={e => setBioSettings({...bioSettings, whatsapp_banner_text: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="Ex: Participe da nossa Comunidade VIP e receba cupons" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">CTA Principal (Texto do Botão Destaque)</label>
                                                    <input type="text" value={bioSettings.hero_text} onChange={e => setBioSettings({...bioSettings, hero_text: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="Ex: ACESSAR LOJA EXCLUSIVA" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">CTA Link (URL do Botão Destaque)</label>
                                                    <input type="text" value={bioSettings.hero_link} onChange={e => setBioSettings({...bioSettings, hero_link: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="https://..." />
                                                </div>
                                            </>
                                        )}

                                        {activeEditorTab === 'analyticos' && (
                                            <>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Cor Primária (Hex)</label>
                                                        <div className="flex gap-2">
                                                            <input type="color" value={bioSettings.primary_color} onChange={e => setBioSettings({...bioSettings, primary_color: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border border-gray-200" />
                                                            <input type="text" value={bioSettings.primary_color} onChange={e => setBioSettings({...bioSettings, primary_color: e.target.value})} className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Cor Secundária (Hex)</label>
                                                        <div className="flex gap-2">
                                                            <input type="color" value={bioSettings.secondary_color} onChange={e => setBioSettings({...bioSettings, secondary_color: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border border-gray-200" />
                                                            <input type="text" value={bioSettings.secondary_color} onChange={e => setBioSettings({...bioSettings, secondary_color: e.target.value})} className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tema Visual Geral</label>
                                                    <select value={bioSettings.theme} onChange={e => setBioSettings({...bioSettings, theme: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-bold text-gray-600">
                                                        <option>Papel Natural</option>
                                                        <option>Gradiente Mistico</option>
                                                        <option>Névoa Espiritual</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Imagem de Fundo (Background URL)</label>
                                                    <input type="text" value={bioSettings.background_url || ''} onChange={e => setBioSettings({...bioSettings, background_url: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="https://..." />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Opacidade do Overlay de Fundo ({bioSettings.overlay_opacity}%)</label>
                                                    <input type="range" min="0" max="100" value={bioSettings.overlay_opacity} onChange={e => setBioSettings({...bioSettings, overlay_opacity: parseInt(e.target.value)})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#3483FA]" />
                                                </div>
                                            </>
                                        )}

                                        {activeEditorTab === 'geral' && (
                                            <>
                                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                                                    <div>
                                                        <p className="font-bold text-sm text-gray-800">Balão de WhatsApp Flutuante</p>
                                                        <p className="text-xs text-gray-400">Ativa o botão flutuante de chat direto no canto da tela.</p>
                                                    </div>
                                                    <input type="checkbox" checked={bioSettings.whatsapp_floating_enabled === 1} onChange={e => setBioSettings({...bioSettings, whatsapp_floating_enabled: e.target.checked ? 1 : 0})} className="w-6 h-6 rounded-lg cursor-pointer accent-[#3483FA]" />
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                                                    <div>
                                                        <p className="font-bold text-sm text-gray-800">Alerta de Vagas / Vendas Limitadas</p>
                                                        <p className="text-xs text-gray-400">Exibe uma faixa de urgência no topo da vitrine.</p>
                                                    </div>
                                                    <input type="checkbox" checked={bioSettings.limited_slots_enabled === 1} onChange={e => setBioSettings({...bioSettings, limited_slots_enabled: e.target.checked ? 1 : 0})} className="w-6 h-6 rounded-lg cursor-pointer accent-[#3483FA]" />
                                                </div>
                                                {bioSettings.limited_slots_enabled === 1 && (
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Texto do Alerta de Urgência</label>
                                                        <input type="text" value={bioSettings.limited_slots_text} onChange={e => setBioSettings({...bioSettings, limited_slots_text: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium" placeholder="Ex: VAGAS LIMITADAS PARA ESTA SEMANA" />
                                                    </div>
                                                )}
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Depoimentos (Social Proof JSON)</label>
                                                    <textarea value={bioSettings.testimonials} onChange={e => setBioSettings({...bioSettings, testimonials: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-mono text-xs h-32" placeholder='[{"name": "Ana", "text": "Super recomendo!"}]' />
                                                </div>
                                            </>
                                        )}

                                        <button onClick={handleSaveSettings} className="w-full py-4 bg-[#2D3277] text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-[#1a1e50] transition-colors mt-6">
                                            <Save size={16} /> Salvar Configurações
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Mobile Live Preview (Shopee page preview style) */}
                            <MobilePreview />
                        </div>
                    )}

                    {/* SUBTAB: BUSCAR PRODUTOS */}
                    {affiliateTab === 'offers' && (
                        <div className="space-y-6">
                            <form onSubmit={handleSearchOffers} className="relative group">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#2D3277] transition-colors" size={24} />
                                <input 
                                    type="text" 
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    placeholder="Buscar no Mercado Livre (Ex: iPhone, Notebook, Cadeira Gamer)..."
                                    className="w-full pl-16 pr-6 py-6 bg-white border-2 border-transparent rounded-[2rem] focus:border-[#FFE600] focus:ring-4 focus:ring-[#FFE600]/20 transition-all font-bold text-gray-700 shadow-sm text-lg"
                                />
                                <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#2D3277] text-white px-8 py-3 rounded-xl font-black uppercase text-xs hover:scale-105 transition-transform">
                                    Buscar
                                </button>
                            </form>

                            {/* Filters row */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 flex flex-wrap gap-4 items-center">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Filtros Rápidos</span>
                                <input 
                                    type="number" 
                                    value={minPrice} 
                                    onChange={e => setMinPrice(e.target.value)} 
                                    placeholder="Preço Min (R$)" 
                                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold max-w-[130px] focus:border-[#3483FA] outline-none" 
                                />
                                <input 
                                    type="number" 
                                    value={maxPrice} 
                                    onChange={e => setMaxPrice(e.target.value)} 
                                    placeholder="Preço Max (R$)" 
                                    className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold max-w-[130px] focus:border-[#3483FA] outline-none" 
                                />
                                <button onClick={() => { setMinPrice(''); setMaxPrice(''); }} className="text-xs font-bold text-red-500 hover:text-red-700 ml-auto uppercase tracking-widest">Limpar Filtros</button>
                            </div>

                            {loadingSearch ? (
                                <div className="py-24 text-center">
                                    <Loader2 className="animate-spin text-[#3483FA] mx-auto mb-4" size={40} />
                                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest animate-pulse">Buscando Ofertas...</p>
                                </div>
                            ) : products.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {products.map(p => {
                                        const alreadyInVitrine = vitrineLinks.some(v => v.product_id === p.itemId);
                                        return (
                                            <div key={p.itemId} className="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-gray-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col group justify-between">
                                                <div className="relative h-64 bg-white p-4 flex items-center justify-center">
                                                    <img src={p.imageUrl} alt={p.name} className="max-h-full max-w-full object-contain group-hover:scale-110 transition-transform duration-500" />
                                                    {p.freeShipping && (
                                                        <div className="absolute top-4 left-4 bg-[#00A650] text-white px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg">
                                                            Frete Grátis
                                                        </div>
                                                    )}
                                                    {p.logisticType === 'fulfillment' && (
                                                        <div className="absolute top-4 right-4 bg-[#FFE600] text-[#2D3277] px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg italic flex items-center gap-1">
                                                            <Zap size={10} fill="currentColor"/> FULL
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-6 flex-1 flex flex-col justify-between border-t border-gray-50">
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-400 mb-2 uppercase flex items-center gap-1"><Tag size={12}/> {p.condition === 'new' ? 'Novo' : 'Usado'}</p>
                                                        <h3 className="font-bold text-gray-800 text-sm line-clamp-2 mb-4 leading-snug">{p.name}</h3>
                                                    </div>
                                                    <div className="mt-auto">
                                                        {p.originalPrice && p.originalPrice > p.price && (
                                                            <p className="text-xs text-gray-400 line-through">R$ {p.originalPrice.toFixed(2)}</p>
                                                        )}
                                                        <p className="text-2xl font-black text-gray-900 mb-4">R$ {p.price.toFixed(2)}</p>
                                                        
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex gap-2">
                                                                <button 
                                                                    onClick={() => {
                                                                        const link = generateMLAffiliateLink(p.offerLink, config);
                                                                        navigator.clipboard.writeText(link);
                                                                        showAlert('Link de afiliado copiado!', 'success');
                                                                    }}
                                                                    className="flex-1 bg-[#3483FA] text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#2968c8] transition-colors"
                                                                >
                                                                    <LinkIcon size={14} /> Link Afiliado
                                                                </button>
                                                                <a 
                                                                    href={p.offerLink} target="_blank" rel="noreferrer"
                                                                    className="p-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center"
                                                                    title="Ver no ML"
                                                                >
                                                                    <ExternalLink size={16} />
                                                                </a>
                                                            </div>
                                                            <button
                                                                onClick={() => handleAddToVitrine(p)}
                                                                disabled={alreadyInVitrine}
                                                                className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors ${
                                                                    alreadyInVitrine ? 'bg-green-550/15 text-green-600 border border-green-250 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-[#FFE600] hover:text-[#2D3277]'
                                                                }`}
                                                            >
                                                                <Sparkles size={14} /> {alreadyInVitrine ? 'Já está na vitrine!' : 'Adicionar à Vitrine'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-20 text-gray-400">
                                    Nenhum produto encontrado. Busque por uma palavra-chave acima.
                                </div>
                            )}
                        </div>
                    )}

                    {/* SUBTAB: SHORT LINKS */}
                    {affiliateTab === 'tools' && (
                        <div className="max-w-2xl mx-auto bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-[#3483FA]/10 flex items-center justify-center text-[#3483FA]">
                                    <LinkIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-gray-800 text-lg">Gerador Rápido de Links de Afiliado</h3>
                                    <p className="text-sm text-gray-400">Cole qualquer link do Mercado Livre para convertê-lo instantaneamente em seu link de afiliado com tag de rastreamento.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <input 
                                    type="url" 
                                    value={manualLink}
                                    onChange={e => {
                                        setManualLink(e.target.value);
                                        if (e.target.value && config.appId) {
                                            setManualGenerated(generateMLAffiliateLink(e.target.value, config));
                                        } else {
                                            setManualGenerated('');
                                        }
                                    }}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium transition-all"
                                    placeholder="https://produto.mercadolivre.com.br/MLB-..."
                                />
                                {manualGenerated && (
                                    <div className="space-y-3 animate-in slide-in-from-top-4 duration-300">
                                        <div className="p-4 bg-green-50 text-green-700 text-xs rounded-xl break-all font-mono font-bold border border-green-100 select-all">
                                            {manualGenerated}
                                        </div>
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(manualGenerated);
                                                showAlert('Link de afiliado copiado para a área de transferência!', 'success');
                                            }}
                                            className="w-full py-4 bg-[#3483FA] text-white rounded-xl font-bold hover:bg-[#2968c8] transition-colors flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Copy size={16} /> Copiar Link de Afiliado
                                        </button>
                                    </div>
                                )}
                                {!(config.affiliateId || config.appId) && (
                                    <p className="text-xs text-red-500">Configure seu ID de Afiliado ou APP ID na aba "Configurações" primeiro para gerar os links corretamente.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- MAIN TAB: ML VÍDEOS --- */}
            {mainTab === 'videos' && (
                <div className="flex flex-col lg:flex-row gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Categories sidebar (similar to Shopee category tabs) */}
                    <div className="w-full lg:w-64 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm shrink-0 space-y-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-3 mb-4">Categorias</p>
                        <button onClick={() => setVideoSubTab('best_sellers')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition-all ${videoSubTab === 'best_sellers' ? 'bg-[#FFE600] text-[#2D3277] shadow-md shadow-[#FFE600]/10' : 'text-gray-500 hover:bg-gray-50'}`}>Mais Vendidos</button>
                        <button onClick={() => setVideoSubTab('cheapest')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition-all ${videoSubTab === 'cheapest' ? 'bg-[#FFE600] text-[#2D3277] shadow-md shadow-[#FFE600]/10' : 'text-gray-500 hover:bg-gray-50'}`}>Mais Baratos</button>
                        <button onClick={() => setVideoSubTab('achadinhos')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition-all ${videoSubTab === 'achadinhos' ? 'bg-[#FFE600] text-[#2D3277] shadow-md shadow-[#FFE600]/10' : 'text-gray-500 hover:bg-gray-50'}`}>Achadinhos</button>
                        <button onClick={() => setVideoSubTab('bizarros')} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition-all ${videoSubTab === 'bizarros' ? 'bg-[#FFE600] text-[#2D3277] shadow-md shadow-[#FFE600]/10' : 'text-gray-500 hover:bg-gray-50'}`}>Bizarros</button>
                        
                        {mlCategories.map(cat => (
                            <button key={cat.slug} onClick={() => setVideoSubTab(cat.slug)} className={`w-full text-left px-4 py-3 rounded-xl font-bold text-xs transition-all ${videoSubTab === cat.slug ? 'bg-[#FFE600] text-[#2D3277] shadow-md shadow-[#FFE600]/10' : 'text-gray-500 hover:bg-gray-50'}`}>{cat.name}</button>
                        ))}
                    </div>

                    {/* Products & Videos Scraper */}
                    <div className="flex-1 w-full space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-gray-800 text-lg uppercase">Vídeos de Produtos</h3>
                                <p className="text-sm text-gray-400">Escolha um produto e pesquise por vídeos prontos no Pinterest para postar nas suas redes.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setVideoPage(p => Math.max(1, p - 1))} disabled={videoPage === 1} className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 disabled:opacity-50 transition-colors"><ChevronRight size={18} className="rotate-180"/></button>
                                <span className="px-4 py-3 bg-gray-100 font-black text-xs rounded-xl flex items-center">{videoPage}</span>
                                <button onClick={() => setVideoPage(p => p + 1)} className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"><ChevronRight size={18}/></button>
                            </div>
                        </div>

                        {loadingVideos ? (
                            <div className="py-24 text-center">
                                <Loader2 className="animate-spin text-[#3483FA] mx-auto mb-4" size={40} />
                                <p className="text-sm font-bold text-gray-400 animate-pulse">Carregando produtos...</p>
                            </div>
                        ) : videoProducts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {videoProducts.map(p => {
                                    const alreadyInVitrine = vitrineLinks.some(v => v.product_id === p.itemId);
                                    return (
                                        <div key={p.itemId} className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-xl transition-all duration-300">
                                            <div className="relative h-48 bg-white p-4 flex items-center justify-center">
                                                <img src={p.imageUrl} alt={p.name} className="max-h-full max-w-full object-contain" />
                                            </div>
                                            <div className="p-5 border-t border-gray-50 flex-1 flex flex-col justify-between">
                                                <h4 className="font-bold text-gray-800 text-xs line-clamp-2 mb-4 leading-normal h-8">{p.name}</h4>
                                                <div className="space-y-2">
                                                    <p className="text-lg font-black text-[#2D3277]">R$ {p.price.toFixed(2)}</p>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => openPinterestSearch(p.name)}
                                                            className="flex-1 bg-gradient-to-r from-red-600 to-red-700 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:shadow-lg hover:shadow-red-200 transition-all"
                                                        >
                                                            <Instagram size={14} /> Achar Vídeo
                                                        </button>
                                                        <button
                                                            onClick={() => handleAddToVitrine(p)}
                                                            disabled={alreadyInVitrine}
                                                            className={`p-3 rounded-xl border transition-colors ${
                                                                alreadyInVitrine ? 'bg-green-50 border-green-200 text-green-600' : 'bg-gray-50 hover:bg-[#FFE600] text-gray-600 border-gray-250'
                                                            }`}
                                                            title="Adicionar à Vitrine"
                                                        >
                                                            <Sparkles size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-20 text-gray-400 bg-white border border-gray-100 rounded-3xl">
                                Configure a aba "Configurações" primeiro para buscar ofertas e encontrar vídeos do Mercado Livre.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- MAIN TAB: CONFIGURAÇÕES --- */}
            {mainTab === 'settings' && (
                <div className="max-w-2xl mx-auto bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 animate-in fade-in duration-300">
                    <h3 className="text-xl font-black text-[#2D3277] mb-6 flex items-center gap-2">
                        <Settings size={24} />
                        Credenciais API Mercado Livre
                    </h3>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ID de Afiliado (af_id)</label>
                            <input 
                                type="text"
                                value={config.affiliateId || ''}
                                onChange={e => setConfig({...config, affiliateId: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium transition-all"
                                placeholder="Ex: mercadolivrebr12345 (Seu ID de afiliado do ML)"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Insira seu ID oficial do programa de afiliados para que os links gerem comissão (af_id).</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">APP ID (Client ID)</label>
                            <input 
                                type="text"
                                value={config.appId}
                                onChange={e => setConfig({...config, appId: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium transition-all"
                                placeholder="Ex: 4937231372542009"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Chave Secreta (Client Secret)</label>
                            <input 
                                type="password"
                                value={config.clientSecret}
                                onChange={e => setConfig({...config, clientSecret: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium transition-all"
                                placeholder="Cole sua Chave Secreta aqui..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Access Token <span className="text-[#3483FA] normal-case font-normal">(APP_USR-...)</span></label>
                            <input 
                                type="password"
                                value={config.accessToken}
                                onChange={e => setConfig({...config, accessToken: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] outline-none font-medium transition-all"
                                placeholder="Cole seu Access Token..."
                            />
                            <p className="text-[11px] text-gray-400 mt-2">O Mercado Livre exige um Access Token de desenvolvedor ativo para permitir a busca por produtos.</p>
                        </div>

                        <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
                            <button 
                                onClick={handleConnectOAuth}
                                className="w-full bg-[#FFE600] text-[#2D3277] py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-[#ebd500] transition-colors shadow-md shadow-[#FFE600]/10"
                            >
                                <Zap size={16} fill="currentColor" /> Conectar Conta Mercado Livre (Automático)
                            </button>
                            <div className="flex gap-4">
                                <button 
                                    onClick={handleSaveConfig}
                                    className="flex-1 bg-[#2D3277] text-white py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-[#1a1e50] transition-colors"
                                >
                                    <Save size={16} /> Salvar Credenciais
                                </button>
                                <button 
                                    onClick={handleTestConnection}
                                    disabled={testingConfig}
                                    className={`flex-1 py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-colors border-2 ${
                                        configStatus === 'ok' ? 'bg-[#00A650]/10 text-[#00A650] border-[#00A650]/20' : 
                                        configStatus === 'error' ? 'bg-red-50 text-red-500 border-red-100' :
                                        'bg-white text-[#3483FA] border-[#3483FA]/20 hover:bg-[#3483FA]/5'
                                    }`}
                                >
                                    {testingConfig ? 'Testando...' : configStatus === 'ok' ? 'Conexão Aprovada!' : 'Testar Conexão'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- PINTEREST SEARCH VIDEOS MODAL --- */}
            {showPinterestModal && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 bg-[#E60023] text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Instagram size={24} className="animate-pulse" />
                                <div>
                                    <h3 className="font-black text-lg">Scraper de Vídeos do Pinterest</h3>
                                    <p className="text-xs text-white/80">Busque e faça o download de criativos em formato de vídeo para divulgar seu produto.</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowPinterestModal(false)}
                                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all font-black text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Search bar */}
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex gap-3">
                            <input 
                                type="text"
                                value={pinterestKeyword}
                                onChange={e => setPinterestKeyword(e.target.value)}
                                onKeyUp={e => e.key === 'Enter' && searchPinterest(pinterestKeyword)}
                                className="flex-1 p-4 bg-white border border-gray-200 rounded-xl focus:border-[#E60023] outline-none font-bold text-gray-700"
                                placeholder="Termo de busca no Pinterest..."
                            />
                            <button 
                                onClick={() => searchPinterest(pinterestKeyword)}
                                className="bg-[#E60023] text-white px-8 py-4 rounded-xl font-bold uppercase text-xs hover:scale-105 transition-transform"
                            >
                                Buscar
                            </button>
                        </div>

                        {/* Results list */}
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                            {loadingPinterest ? (
                                <div className="py-24 text-center">
                                    <Loader2 className="animate-spin text-[#E60023] mx-auto mb-4" size={40} />
                                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Buscando Vídeos Criativos...</p>
                                </div>
                            ) : pinterestResults.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {pinterestResults.map((video, idx) => (
                                        <div key={idx} className="bg-white rounded-3xl border border-gray-200 overflow-hidden flex flex-col justify-between shadow-sm relative group">
                                            <div className="relative h-64 bg-black">
                                                <video 
                                                    src={video.videoUrl} 
                                                    controls 
                                                    poster={video.thumbnailUrl}
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-2">
                                                <p className="text-[10px] font-bold text-gray-400 line-clamp-1 flex-1">{video.title || 'Criativo do Produto'}</p>
                                                <button
                                                    onClick={() => downloadPinterestVideo(video.pinUrl)}
                                                    disabled={downloadingVideo}
                                                    className="p-3 bg-red-50 text-[#E60023] hover:bg-[#E60023] hover:text-white rounded-xl transition-all border border-red-100"
                                                    title="Baixar Vídeo"
                                                >
                                                    {downloadingVideo ? <Loader2 className="animate-spin" size={14}/> : <Download size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 text-gray-400">
                                    Nenhum vídeo encontrado no Pinterest para esse produto.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MercadoLivreCentralPage;
