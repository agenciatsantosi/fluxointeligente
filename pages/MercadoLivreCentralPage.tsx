import React, { useState, useEffect } from 'react';
import { 
    Search, ShoppingBag, Settings, LayoutDashboard, Copy, ExternalLink, 
    TrendingUp, Tag, Box, Link as LinkIcon
} from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import { searchMLProducts, testMLConnection, generateMLAffiliateLink } from '../services/mercadoLivreService';
import { MLSettings } from '../types';

type MainTab = 'dashboard' | 'search' | 'settings';

export default function MercadoLivreCentralPage() {
    const { showAlert } = useAlert();
    const [mainTab, setMainTab] = useState<MainTab>('dashboard');
    
    // Config
    const [config, setConfig] = useState<MLSettings>({
        appId: localStorage.getItem('ml_appId') || '',
        clientSecret: localStorage.getItem('ml_clientSecret') || '',
        accessToken: ''
    });
    const [testingConfig, setTestingConfig] = useState(false);
    const [configStatus, setConfigStatus] = useState<'idle'|'ok'|'error'>('idle');

    // Search
    const [keyword, setKeyword] = useState('iphone');
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (mainTab === 'search') {
            handleSearch();
        }
    }, [mainTab]);

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!keyword) return;
        
        setLoading(true);
        try {
            const data = await searchMLProducts(keyword);
            setProducts(data.products);
        } catch (error: any) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = () => {
        localStorage.setItem('ml_appId', config.appId);
        localStorage.setItem('ml_clientSecret', config.clientSecret);
        showAlert('Configurações salvas localmente!', 'success');
    };

    const handleTestConnection = async () => {
        setTestingConfig(true);
        try {
            await testMLConnection(config);
            setConfigStatus('ok');
            showAlert('Conexão bem sucedida com o ML!', 'success');
        } catch (error: any) {
            setConfigStatus('error');
            showAlert(error.message, 'error');
        } finally {
            setTestingConfig(false);
        }
    };

    const copyAffiliateLink = (originalUrl: string) => {
        const link = generateMLAffiliateLink(originalUrl, config);
        navigator.clipboard.writeText(link);
        showAlert('Link de Afiliado copiado para a área de transferência!', 'success');
    };

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

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-20">
            {/* Header Section (ML Colors: Yellow and Blue) */}
            <div className="bg-gradient-to-r from-[#FFE600] to-[#FFCC00] rounded-[2rem] p-8 sm:p-10 text-[#2D3277] shadow-lg relative overflow-hidden group">
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl rotate-3 group-hover:rotate-0 transition-transform duration-500 shrink-0">
                            <ShoppingBag size={36} className="text-[#2D3277]" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1">Central <span className="text-black">Mercado Livre</span></h1>
                            <p className="text-[#2D3277]/70 font-bold text-sm">Painel de afiliados e gestão de ofertas do ecossistema ML.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Navigation Tabs */}
            <div className="bg-white/70 backdrop-blur-2xl rounded-[1.5rem] shadow-xl border border-white/50 flex overflow-x-auto scrollbar-hide whitespace-nowrap p-1">
                <MainMenuButton id="dashboard" icon={LayoutDashboard} label="Visão Geral" />
                <MainMenuButton id="search" icon={Search} label="Buscar Ofertas" />
                <MainMenuButton id="settings" icon={Settings} label="Configurações" />
            </div>

            {/* TABS CONTENT */}
            {mainTab === 'dashboard' && (
                <div className="bg-white p-12 rounded-[2rem] text-center shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px]">
                    <div className="w-24 h-24 bg-[#FFE600]/20 rounded-full flex items-center justify-center mb-6">
                        <TrendingUp size={40} className="text-[#2D3277]" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-800 mb-2">Painel de Afiliado ML</h2>
                    <p className="text-gray-500 max-w-md text-sm font-medium leading-relaxed">
                        Seja bem vindo à nova integração! Utilize a aba "Buscar Ofertas" para encontrar os melhores produtos, gerar seu link e publicar nas suas redes sociais de forma inteligente.
                    </p>
                    <button onClick={() => setMainTab('search')} className="mt-8 px-8 py-4 bg-[#2D3277] text-white rounded-2xl font-black uppercase text-xs tracking-wider hover:shadow-lg hover:shadow-[#2D3277]/20 transition-all">
                        Começar a Buscar
                    </button>
                </div>
            )}

            {mainTab === 'search' && (
                <div className="space-y-6">
                    <form onSubmit={handleSearch} className="relative group">
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

                    {loading ? (
                        <div className="py-20 text-center flex flex-col items-center justify-center">
                            <div className="w-16 h-16 border-4 border-[#FFE600] border-t-[#2D3277] rounded-full animate-spin mb-4"></div>
                            <p className="font-bold text-gray-400 uppercase tracking-widest text-sm">Buscando Ofertas no ML...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {products.map(p => (
                                <div key={p.itemId} className="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-gray-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col group">
                                    <div className="relative h-64 bg-white p-4">
                                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" />
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
                                    <div className="p-6 flex-1 flex flex-col border-t border-gray-50">
                                        <p className="text-xs font-bold text-gray-400 mb-2 uppercase flex items-center gap-1"><Tag size={12}/> {p.condition === 'new' ? 'Novo' : 'Usado'}</p>
                                        <h3 className="font-medium text-gray-800 text-sm line-clamp-2 mb-4 h-10 leading-snug">{p.name}</h3>
                                        <div className="mt-auto">
                                            {p.originalPrice && p.originalPrice > p.price && (
                                                <p className="text-xs text-gray-400 line-through">R$ {p.originalPrice.toFixed(2)}</p>
                                            )}
                                            <p className="text-2xl font-black text-gray-900 mb-4">R$ {p.price.toFixed(2)}</p>
                                            
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => copyAffiliateLink(p.offerLink)}
                                                    className="flex-1 bg-[#3483FA] text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#2968c8] transition-colors"
                                                >
                                                    <LinkIcon size={14} /> Link Afiliado
                                                </button>
                                                <a 
                                                    href={p.offerLink} target="_blank" rel="noreferrer"
                                                    className="p-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                                                    title="Ver no ML"
                                                >
                                                    <ExternalLink size={18} />
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {mainTab === 'settings' && (
                <div className="max-w-2xl mx-auto bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
                    <h3 className="text-xl font-black text-gray-800 mb-6 flex items-center gap-2">
                        <Settings size={24} className="text-[#2D3277]" />
                        Credenciais API Mercado Livre
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">APP ID (Client ID)</label>
                            <input 
                                type="text"
                                value={config.appId}
                                onChange={e => setConfig({...config, appId: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] focus:ring-2 focus:ring-[#3483FA]/20 outline-none font-medium transition-all"
                                placeholder="Insira seu APP ID..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Client Secret</label>
                            <input 
                                type="password"
                                value={config.clientSecret}
                                onChange={e => setConfig({...config, clientSecret: e.target.value})}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#3483FA] focus:ring-2 focus:ring-[#3483FA]/20 outline-none font-medium transition-all"
                                placeholder="Insira seu Client Secret..."
                            />
                        </div>
                        <div className="flex gap-4 pt-4 border-t border-gray-100">
                            <button 
                                onClick={handleSaveConfig}
                                className="flex-1 bg-[#2D3277] text-white py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-[#1f2358] transition-colors"
                            >
                                <Copy size={16} /> Salvar Credenciais
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
                        <p className="text-xs text-gray-400 mt-4 text-center leading-relaxed">
                            Crie sua aplicação no portal de desenvolvedores do Mercado Livre para obter o App ID e o Secret. <a href="https://developers.mercadolivre.com.br/devcenter" target="_blank" className="text-[#3483FA] font-bold">Acessar DevCenter</a>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// Dummy Zap icon component for the inline use
const Zap = ({ size = 24, fill = "none", ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
);
