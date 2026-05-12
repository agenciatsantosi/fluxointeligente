import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { 
    ShoppingBag, 
    Calendar, 
    ExternalLink, 
    Hash, 
    DollarSign, 
    Share2, 
    Search, 
    Filter, 
    RefreshCw, 
    ArrowUpRight, 
    CheckCircle2, 
    Clock, 
    Smartphone, 
    Globe,
    BarChart3,
    Trophy,
    TrendingUp,
    ChevronRight,
    ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SentProduct {
    id: number;
    product_id: string;
    product_name: string;
    price: number;
    commission: number;
    group_id: string;
    group_name: string;
    sent_at: string;
    media_type: string;
    category: string;
}

const SentProductsPage: React.FC = () => {
    const [products, setProducts] = useState<SentProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await api.get('/sent-products');
            if (response.data.success) {
                setProducts(response.data.products);
            }
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '---';
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    const stats = useMemo(() => {
        const total = products.length;
        const commission = products.reduce((acc, curr) => acc + (Number(curr.commission) || 0), 0);
        const topPlatform = products.reduce((acc: any, curr) => {
            const cat = curr.category || 'Outros';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
        }, {});
        
        const sortedPlatforms = Object.entries(topPlatform).sort((a: any, b: any) => b[1] - a[1]);
        const bestPlatform = sortedPlatforms.length > 0 ? sortedPlatforms[0][0] : '---';

        return { total, commission, bestPlatform };
    }, [products]);

    const filteredProducts = products.filter(p => {
        const name = p.product_name || '';
        const id = p.product_id || '';
        const cat = p.category || '';
        
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || cat === filterCategory;
        return matchesSearch && matchesCategory;
    });

    const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

    const getPlatformIcon = (category: string | null) => {
        const cat = (category || 'outros').toLowerCase();
        switch (cat) {
            case 'whatsapp': return <div className="w-9 h-9 bg-green-50 text-green-600 rounded-xl flex items-center justify-center border border-green-100"><Smartphone size={18} /></div>;
            case 'telegram': return <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100"><Globe size={18} /></div>;
            case 'instagram': return <div className="w-9 h-9 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center border border-pink-100"><Smartphone size={18} /></div>;
            case 'facebook': return <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100"><Globe size={18} /></div>;
            default: return <div className="w-9 h-9 bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center border border-gray-100"><Share2 size={18} /></div>;
        }
    };

    return (
        <div className="space-y-10 p-4 md:p-8 bg-[#fdfdff] min-h-screen font-sans selection:bg-purple-100 selection:text-purple-900">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-white border border-gray-100 rounded-2xl shadow-sm text-purple-600">
                            <ShoppingBag size={24} />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Histórico de Envios</h1>
                    </div>
                    <p className="text-gray-500 text-sm font-medium ml-14">Registro centralizado de todas as operações de postagem.</p>
                </div>
                
                <button 
                    onClick={fetchHistory}
                    disabled={loading}
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:border-purple-300 hover:text-purple-600 text-gray-700 px-6 py-3 rounded-2xl transition-all duration-300 font-bold shadow-sm active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Sincronizar Dados
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Total Enviado', val: stats.total, icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Comissão Estimada', val: `R$ ${stats.commission.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Top Plataforma', val: stats.bestPlatform, icon: Trophy, color: 'text-orange-600', bg: 'bg-orange-50' }
                ].map((st, i) => (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white p-7 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 relative overflow-hidden group"
                    >
                        <div className={`absolute -right-4 -top-4 w-24 h-24 ${st.bg} opacity-30 rounded-full group-hover:scale-125 transition-transform duration-500`}></div>
                        <div className="flex flex-col gap-4 relative z-10">
                            <div className={`w-12 h-12 ${st.bg} ${st.color} rounded-2xl flex items-center justify-center`}>
                                <st.icon size={22} />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{st.label}</span>
                                <h3 className="text-3xl font-black text-gray-900 tracking-tight capitalize">{st.val}</h3>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Toolbar Section */}
            <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Pesquisar produto ou destino..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 border-none text-gray-700 rounded-2xl pl-12 pr-4 py-3.5 focus:ring-2 focus:ring-purple-500/10 outline-none text-sm font-medium transition-all"
                    />
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative min-w-[220px] w-full">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <select 
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="w-full bg-gray-50 border-none text-gray-700 rounded-2xl pl-12 pr-10 py-3.5 focus:ring-2 focus:ring-purple-500/10 outline-none appearance-none text-sm font-bold cursor-pointer transition-all"
                        >
                            <option value="all">Todas as Redes</option>
                            {categories.filter(c => c !== 'all').map(cat => (
                                <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>

                    <div className="hidden lg:flex items-center gap-2 px-5 py-3.5 bg-purple-50 rounded-2xl border border-purple-100">
                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">{filteredProducts.length} Registros</span>
                    </div>
                </div>
            </div>

            {/* Table View */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/40 border-b border-gray-50">
                                <th className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Cronologia</th>
                                <th className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Produto</th>
                                <th className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Plataforma</th>
                                <th className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Financeiro</th>
                                <th className="px-8 py-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            <AnimatePresence>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={5} className="px-8 py-8 h-24 bg-gray-50/10"></td>
                                        </tr>
                                    ))
                                ) : filteredProducts.length > 0 ? (
                                    filteredProducts.map((p, idx) => (
                                        <motion.tr 
                                            key={p.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="group hover:bg-gray-50/50 transition-all duration-200 cursor-default"
                                        >
                                            <td className="px-8 py-8">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                                                        <Clock size={14} className="text-gray-400" />
                                                        {formatDate(p.sent_at).split(',')[0]}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase ml-5">{formatDate(p.sent_at).split(',')[1]}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8">
                                                <div className="flex flex-col gap-1 max-w-[300px]">
                                                    <span className="text-gray-900 font-bold text-[15px] leading-tight line-clamp-1 group-hover:text-purple-600 transition-colors" title={p.product_name}>
                                                        {p.product_name}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">ID: {p.product_id}</span>
                                                        <span className="text-[10px] font-medium text-gray-400 italic truncate max-w-[150px]">{p.group_name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8">
                                                <div className="flex items-center gap-4">
                                                    {getPlatformIcon(p.category)}
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-gray-700 uppercase tracking-tighter">{p.category || 'Outros'}</span>
                                                        <span className="text-[10px] font-bold text-gray-400">Canal Ativo</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-gray-900 font-bold text-sm">R$ {Number(p.price).toFixed(2)}</div>
                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100 w-fit">
                                                        <TrendingUp size={10} />
                                                        <span className="text-[10px] font-black uppercase">Com: R$ {Number(p.commission).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-2.5 bg-gray-50 px-4 py-2 rounded-full border border-gray-100 group-hover:bg-purple-50 group-hover:border-purple-100 group-hover:text-purple-600 transition-all duration-300">
                                                        <CheckCircle2 size={16} className="text-emerald-500 group-hover:text-purple-500" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Publicado</span>
                                                    </div>
                                                    <button className="p-2.5 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-purple-200 hover:text-purple-600 transition-all opacity-0 group-hover:opacity-100">
                                                        <ExternalLink size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-40 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-30">
                                                <ShoppingBag size={64} />
                                                <p className="text-lg font-black uppercase tracking-[0.3em]">Histórico Vazio</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination/Footer */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-4 pb-12">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                    Sistema Online & Sincronizado
                </div>
                <div className="flex items-center gap-4">
                    <button className="px-6 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-500 hover:border-purple-200 hover:text-purple-600 transition-all shadow-sm">Página Anterior</button>
                    <button className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-xs font-bold hover:bg-purple-600 transition-all shadow-lg flex items-center gap-2">
                        Próxima Página
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SentProductsPage;
