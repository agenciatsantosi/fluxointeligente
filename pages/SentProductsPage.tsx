import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { ShoppingBag, Calendar, ExternalLink, Hash, DollarSign, Share2, Search, Filter, RefreshCw } from 'lucide-react';

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
        const date = new Date(dateStr);
        return date.toLocaleString('pt-BR');
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             p.product_id.includes(searchTerm);
        const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                        <ShoppingBag className="text-blue-500" />
                        Histórico de Envíos
                    </h1>
                    <p className="text-slate-400 mt-1">Produtos enviados para suas redes sociais e grupos</p>
                </div>
                <button 
                    onClick={fetchHistory}
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </button>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nome ou ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <select 
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                    >
                        <option value="all">Todas as Plataformas</option>
                        {categories.filter(c => c !== 'all').map(cat => (
                            <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center justify-end px-2">
                    <span className="text-sm text-slate-400">
                        {filteredProducts.length} produtos encontrados
                    </span>
                </div>
            </div>

            {/* Tabela de Produtos */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700">
                                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Data</th>
                                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Produto</th>
                                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Plataforma</th>
                                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Destino</th>
                                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Preço/Comissão</th>
                                <th className="px-6 py-4 text-sm font-semibold text-slate-300">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-4 h-16 bg-slate-800/20"></td>
                                    </tr>
                                ))
                            ) : filteredProducts.length > 0 ? (
                                filteredProducts.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-sm text-slate-300">
                                                <Calendar className="w-4 h-4 text-slate-500" />
                                                {formatDate(p.sent_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-white font-medium line-clamp-1 max-w-xs" title={p.product_name}>
                                                    {p.product_name}
                                                </span>
                                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Hash className="w-3 h-3" />
                                                    {p.product_id}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                p.category === 'telegram' ? 'bg-blue-500/20 text-blue-400' :
                                                p.category === 'facebook' ? 'bg-blue-600/20 text-blue-300' :
                                                p.category === 'instagram' ? 'bg-pink-500/20 text-pink-400' :
                                                p.category === 'whatsapp' ? 'bg-green-500/20 text-green-400' :
                                                'bg-slate-600/20 text-slate-300'
                                            }`}>
                                                {p.category || 'Outros'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-300">
                                            <div className="flex flex-col">
                                                <span className="text-white line-clamp-1">{p.group_name}</span>
                                                <span className="text-xs text-slate-500">{p.group_id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col text-sm">
                                                <span className="text-white font-semibold">R$ {p.price.toFixed(2)}</span>
                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                    <DollarSign className="w-3 h-3" />
                                                    Com: R$ {p.commission.toFixed(2)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <div className="flex items-center gap-2 text-green-400">
                                                <Share2 className="w-4 h-4" />
                                                Enviado
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                                        Nenhum produto encontrado no histórico.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SentProductsPage;
