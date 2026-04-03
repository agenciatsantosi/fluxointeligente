import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
    Search, 
    MessageCircle, 
    ShoppingBag, 
    ExternalLink, 
    TrendingUp, 
    Loader2, 
    Sparkles,
    ChevronRight,
    ArrowRight
} from 'lucide-react';

const PublicVitrinePage: React.FC = () => {
    // Manually extract userId from URL /vitrine/:userId
    const getUserIdFromUrl = () => {
        const parts = window.location.pathname.split('/');
        const index = parts.indexOf('vitrine');
        if (index !== -1 && parts[index + 1]) {
            return parts[index + 1];
        }
        return '1'; // Fallback
    };

    const userId = getUserIdFromUrl();
    const [links, setLinks] = useState<any[]>([]);
    const [userName, setUserName] = useState('Minha Vitrine');
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (settings?.font_family) {
            const fontId = settings.font_family;
            const link = document.createElement('link');
            link.href = `https://fonts.googleapis.com/css2?family=${fontId.replace(' ', '+')}:wght@400;700;900&display=swap`;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            return () => {
                document.head.removeChild(link);
            };
        }
    }, [settings?.font_family]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`/api/public/vitrine/${userId || '1'}?keyword=${encodeURIComponent(search)}`);
            if (response.data.success) {
                setLinks(response.data.links);
                setUserName(response.data.userName);
                setSettings(response.data.settings);
            }
        } catch (e) {
            console.error('Error fetching vitrine:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchData();
    };

    if (loading && links.length === 0) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="animate-spin mx-auto text-orange-500 mb-4" size={48} />
                    <p className="text-gray-500 font-bold animate-pulse uppercase tracking-widest text-[10px]">Carregando o melhor...</p>
                </div>
            </div>
        );
    }

    const primaryColor = settings?.primary_color || '#EE4D2D';
    const fontFamily = settings?.font_family || 'Inter';
    const testimonials = JSON.parse(settings?.testimonials || '[]');
    const modularLinks = JSON.parse(settings?.links_data || '[]');

    const trackClick = async (linkId: number) => {
        try {
            await axios.post('/api/public/vitrine/track', {
                type: 'click',
                linkId,
                userId
            });
        } catch (e) {
            console.error('Tracking error:', e);
        }
    };

    // Theme logic
    const themeStyles: any = {
        'Papel Natural': {
            bg: 'bg-[#F9F7F2]',
            text: 'text-stone-900',
            desc: 'text-stone-500',
            card: 'bg-white/80 border-stone-200 shadow-xl',
            blur: 'backdrop-blur-sm'
        },
        'Gradiente Mistico': {
            bg: 'bg-[#0F0C29] bg-gradient-to-br from-[#0F0C29] via-[#302B63] to-[#24243E]',
            text: 'text-white',
            desc: 'text-indigo-200/60',
            card: 'bg-white/10 border-white/10 shadow-2xl',
            blur: 'backdrop-blur-xl'
        },
        'Névoa Espiritual': {
            bg: 'bg-[#050505]',
            text: 'text-white',
            desc: 'text-gray-500',
            card: 'bg-white/5 border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]',
            blur: 'backdrop-blur-md'
        }
    };

    const theme = themeStyles[settings?.theme || 'Névoa Espiritual'] || themeStyles['Névoa Espiritual'];

    return (
        <div className={`min-h-screen ${theme.bg} pb-32 selection:bg-orange-900/30 overflow-x-hidden relative transition-all duration-1000`} style={{ fontFamily }}>
            {/* --- BACKGROUND DECORATION --- */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div 
                    className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[150px] -mr-64 -mt-64 opacity-20"
                    style={{ backgroundColor: primaryColor }}
                ></div>
                <div 
                    className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[120px] -ml-48 -mb-48 opacity-10"
                    style={{ backgroundColor: primaryColor }}
                ></div>
                {settings?.background_url && (
                    <div 
                        className="absolute inset-0 bg-cover bg-center fixed" 
                        style={{ 
                            backgroundImage: `url(${settings.background_url})`,
                            opacity: (settings.overlay_opacity || 50) / 100 
                        }}
                    >
                        <div className="absolute inset-0 bg-black/40"></div>
                    </div>
                )}
            </div>

            {/* --- HERO / HEADER --- */}
            <div className="pt-16 pb-12 px-6 relative z-10">
                <div className="max-w-xl mx-auto text-center">
                    {/* Logo */}
                    <div className="w-24 h-24 mx-auto mb-6 relative">
                        <div 
                            className="absolute inset-0 rounded-full animate-pulse blur-xl opacity-40 shadow-2xl"
                            style={{ backgroundColor: primaryColor }}
                        ></div>
                        <div className={`relative w-full h-full p-1 rounded-full border border-white/10 overflow-hidden shadow-2xl ${theme.bg}`}>
                            {settings?.logo_url ? (
                                <img src={settings.logo_url} className="w-full h-full object-cover rounded-full" alt="Logo" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <ShoppingBag size={40} style={{ color: primaryColor }} />
                                </div>
                            )}
                        </div>
                    </div>

                    <h1 className={`text-3xl font-black mb-2 tracking-tight uppercase ${theme.text}`}>
                        {settings?.title || userName}
                    </h1>
                    <p className={`text-xs font-bold max-w-sm mx-auto leading-relaxed italic opacity-80 ${theme.desc}`}>
                        {settings?.description || "✨ Curadoria exclusiva dos melhores achadinhos pra você."}
                    </p>
                </div>
            </div>

            {/* --- FLOATING CONTENT --- */}
            <div className="max-w-xl mx-auto px-6 relative z-20 space-y-8">
                
                {/* Hero Button CTA */}
                {settings?.hero_text && (
                    <div className="animate-in zoom-in-95 duration-700">
                        <a 
                            href={settings.hero_link || '#'}
                            className="group block w-full py-5 rounded-[2rem] text-center font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all hover:scale-[1.02] active:scale-95 relative overflow-hidden"
                            style={{ backgroundColor: primaryColor, color: '#FFF' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                            <span className="relative z-10 flex items-center justify-center gap-3">
                                {settings.hero_text} <Sparkles size={18} />
                            </span>
                        </a>
                    </div>
                )}

                {/* Modular Custom Links */}
                {modularLinks.length > 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                        {modularLinks.map((link: any) => (
                            <a 
                                key={link.id}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`block w-full py-5 px-8 rounded-[2rem] text-center font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all hover:scale-[1.03] active:scale-95 relative overflow-hidden group border border-white/5 ${theme.card} ${theme.text}`}
                            >
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <span className="relative z-10 flex items-center justify-center gap-3">
                                    {link.title} 
                                    {link.urgency && <TrendingUp className="text-orange-500 animate-pulse" size={16} />}
                                </span>
                            </a>
                        ))}
                    </div>
                )}

                {/* Urgency Alert */}
                {settings?.limited_slots_enabled === 1 && (
                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl text-center backdrop-blur-md animate-pulse">
                        <p className="text-red-500 font-black text-[10px] uppercase tracking-[0.3em]">
                            🔥 {settings.limited_slots_text || "VAGAS LIMITADAS PARA ESTA SEMANA"}
                        </p>
                    </div>
                )}
                
                {/* Search Bar - Luxury Style */}
                <form onSubmit={handleSearch} className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-white transition-colors duration-300">
                        <Search size={18} />
                    </div>
                    <input 
                        type="text" 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Pesquisar nos achadinhos..."
                        className={`w-full pl-16 pr-6 py-5 rounded-[2rem] border focus:outline-none transition-all font-bold shadow-2xl ${theme.card} ${theme.text} placeholder:opacity-30`}
                    />
                </form>

                {/* WhatsApp Community Banner */}
                {settings?.whatsapp_link && (
                    <a 
                        href={settings.whatsapp_link}
                        target="_blank"
                        rel="noreferrer"
                        className="block bg-gradient-to-br from-emerald-600 to-teal-800 p-5 rounded-[2.5rem] shadow-2xl text-white group overflow-hidden relative border border-white/10 active:scale-95 transition-all"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center animate-bounce shadow-inner">
                                    <MessageCircle size={28} />
                                </div>
                                <div className="space-y-0.5 text-left">
                                    <p className="font-black text-[10px] uppercase tracking-[0.2em] opacity-70">Grupo Exclusivo</p>
                                    <p className="font-black text-sm leading-tight italic">
                                        {settings?.whatsapp_banner_text || "Entre na nossa comunidade no WhatsApp"}
                                    </p>
                                </div>
                            </div>
                            <ArrowRight size={24} className="opacity-50 group-hover:translate-x-2 transition-transform" />
                        </div>
                    </a>
                )}

                {/* Product Section Title */}
                <div className="flex items-center gap-4 px-2 pt-4">
                    <div className="h-[1px] flex-1 bg-white/10"></div>
                    <span 
                        className="text-[9px] font-black uppercase tracking-[0.4em]"
                        style={{ color: primaryColor }}
                    >
                        PRODUTOS SELECIONADOS
                    </span>
                    <div className="h-[1px] flex-1 bg-white/10"></div>
                </div>

                {/* Product List */}
                <div className="space-y-6">
                    {links.map((link) => (
                        <a 
                            key={link.id}
                            href={`/api/public/l/${link.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackClick(link.id)}
                            className={`block border rounded-[2.8rem] p-3 shadow-2xl hover:border-white/10 transition-all duration-500 group active:scale-[0.98] ${theme.card} ${theme.text}`}
                        >
                            <div className="flex items-center gap-5">
                                <div className="w-28 h-28 rounded-[2.2rem] overflow-hidden flex-shrink-0 border border-white/5 shadow-2xl">
                                    <img 
                                        src={link.image_url} 
                                        className="w-full h-full object-cover group-hover:scale-125 transition-transform duration-[2000ms]" 
                                        alt={link.name} 
                                    />
                                </div>
                                <div className="flex-1 py-1 pr-4 space-y-3 text-left">
                                    <h4 className="text-[12px] font-black line-clamp-2 leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity">
                                        {link.name}
                                    </h4>
                                    <div 
                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-xl group-hover:translate-x-3"
                                        style={{ backgroundColor: primaryColor, color: '#FFF' }}
                                    >
                                        VER OFERTA <ChevronRight size={14} />
                                    </div>
                                </div>
                            </div>
                        </a>
                    ))}
                </div>

                {/* Testimonials Section */}
                {testimonials.length > 0 && (
                    <div className="pt-10 space-y-6">
                        <div className="flex items-center gap-4 px-2">
                             <div className="h-[1px] flex-1 bg-white/10"></div>
                             <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em]">PROVA SOCIAL</span>
                             <div className="h-[1px] flex-1 bg-white/10"></div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 text-left">
                            {testimonials.map((t: any, i: number) => (
                                <div key={i} className={`p-6 rounded-[2rem] border relative group ${theme.card} ${theme.text}`}>
                                    <Sparkles className="absolute top-4 right-4 text-white/5 group-hover:text-white/20 transition-all" size={20} />
                                    <p className={`text-xs italic leading-relaxed opacity-80 mb-4 ${theme.desc}`}>"{t.text}"</p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center font-black text-[10px] text-white">
                                            {t.name[0]}
                                        </div>
                                        <p className="font-black text-[10px] uppercase tracking-widest">{t.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {links.length === 0 && !loading && (
                    <div className={`p-16 rounded-[3rem] border border-white/5 text-center ${theme.card}`}>
                        <Sparkles size={48} className="mx-auto text-gray-700 mb-4" />
                        <h4 className="text-lg font-black text-gray-500 uppercase tracking-widest">Aguardando Produtos</h4>
                        <p className="text-gray-700 text-[9px] font-bold mt-2 uppercase tracking-tight">Novos achadinhos adicionados automaticamente!</p>
                    </div>
                )}
            </div>

            {/* --- FLOATING WHATSAPP BUBBLE (STALKER) --- */}
            {settings?.whatsapp_floating_enabled === 1 && settings?.whatsapp_link && (
                <div className="fixed bottom-6 right-6 z-[999] animate-bounce-slow">
                    <a 
                        href={settings.whatsapp_link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center w-16 h-16 bg-[#25D366] text-white rounded-full shadow-[0_10px_40px_rgba(37,211,102,0.5)] hover:scale-110 active:scale-90 transition-all border-2 border-white/20 relative group"
                    >
                        <MessageCircle size={32} fill="currentColor" className="text-white" />
                        <span className="absolute right-full mr-4 bg-white text-gray-900 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl border border-gray-100 pointer-events-none hidden md:block">
                            Comunidade VIP
                        </span>
                        
                        <span className="absolute top-0 right-0 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#060606] animate-ping"></span>
                    </a>
                </div>
            )}

            {/* Footer */}
            <div className={`mt-24 text-center text-[7px] font-black uppercase tracking-[0.8em] pb-12 opacity-20 ${theme.text}`}>
                SISTEMA ELITE © 2026 • TODOS OS DIREITOS RESERVADOS
            </div>
        </div>
    );
};

export default PublicVitrinePage;
