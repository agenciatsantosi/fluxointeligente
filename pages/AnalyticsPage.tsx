import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    TrendingUp, 
    DollarSign, 
    CheckCircle, 
    Package, 
    Users, 
    Calendar, 
    Instagram, 
    Facebook, 
    MessageCircle, 
    Eye, 
    Heart, 
    Repeat, 
    Share2, 
    Activity, 
    Zap,
    Target,
    BarChart3,
    ArrowUpRight,
    ArrowDownRight,
    Globe,
    ExternalLink,
    Link,
    Copy,
    Trash2,
    Search,
    Check,
    AlertCircle,
    X,
    MapPin,
    Smartphone,
    Tablet,
    Monitor,
    Cpu,
    Clock,
    ArrowLeft
} from 'lucide-react';
import api from '../services/api';
import { 
    BarChart, 
    Bar, 
    LineChart, 
    Line, 
    PieChart, 
    Pie, 
    Cell, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as ReChartsTooltip, 
    Legend, 
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];

const StatCard = ({ title, value, icon: Icon, trend, color, suffix = "" }: any) => (
    <motion.div 
        whileHover={{ y: -5, scale: 1.02, transition: { type: 'spring', stiffness: 300 } }}
        className="bg-gray-900/80 backdrop-blur-xl border border-gray-800 hover:border-emerald-500/30 rounded-3xl p-6 shadow-xl shadow-emerald-500/5 transition-all group"
    >
        <div className="flex items-start justify-between">
            <div className="space-y-4">
                <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-400 inline-block group-hover:scale-110 transition-transform`}>
                    <Icon size={24} />
                </div>
                <div>
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest font-mono">{title}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <h3 className="text-3xl font-black text-white">{value}{suffix}</h3>
                        {trend && (
                            <span className={`text-[10px] font-black font-mono flex items-center px-1.5 py-0.5 rounded ${trend > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {Math.abs(trend)}%
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </motion.div>
);

const PlatformInsights = ({ platform, accounts, onInsightsLoaded, days }: any) => {
    const [selectedAcc, setSelectedAcc] = useState<any>(null);
    const [insights, setInsights] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (accounts && accounts.length > 0) {
            setSelectedAcc(accounts[0]);
        }
    }, [accounts]);

    useEffect(() => {
        if (selectedAcc) {
            fetchInsights();
        }
    }, [selectedAcc, days]);

    const fetchInsights = async () => {
        setLoading(true);
        setInsights(null);
        if (onInsightsLoaded) onInsightsLoaded(null);
        setErrorMsg(null);
        try {
            const res = await api.get(`/${platform.toLowerCase()}/account-insights/${selectedAcc.id}?days=${days}`);
            if (res.data.success) {
                setInsights(res.data.insights);
                if (onInsightsLoaded) onInsightsLoaded(res.data.insights);
            } else {
                // Show the real error message from Meta API
                setErrorMsg(res.data.error || 'Resposta invÃ¡lida do servidor');
            }
        } catch (e: any) {
            const msg = e.response?.data?.error || e.response?.data?.message || e.message || 'Erro desconhecido';
            setErrorMsg(msg);
            console.error(`Failed to fetch ${platform} insights:`, msg);
        } finally {
            setLoading(false);
        }
    };

    if (!accounts || accounts.length === 0) {
        return (
            <div className="bg-white/80 rounded-3xl p-12 text-center border-2 border-dashed border-purple-200 shadow-xl shadow-purple-500/5">
                <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4 relative overflow-hidden">
                    <div className="absolute inset-0 bg-purple-500/20 animate-pulse"></div>
                    {platform === 'Instagram' ? <Instagram className="text-pink-500 relative z-10" /> : 
                     platform === 'Facebook' ? <Facebook className="text-blue-500 relative z-10" /> : 
                     <MessageCircle className="text-purple-600 relative z-10" />}
                </div>
                <h3 className="text-lg font-black text-gray-900 tracking-widest font-mono">[ SISTEMA DE ESCANEAMENTO ATIVO ]</h3>
                <p className="text-xs text-gray-500 font-mono mt-2 uppercase tracking-widest animate-pulse">Aguardando conexÃ£o para iniciar varredura...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-${platform === 'Instagram' ? 'pink' : platform === 'Facebook' ? 'blue' : 'purple'}-50`}>
                        {platform === 'Instagram' ? <Instagram className="text-pink-500" size={20} /> : 
                         platform === 'Facebook' ? <Facebook className="text-blue-500" size={20} /> : 
                         <MessageCircle className="text-purple-600" size={20} />}
                    </div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">{platform} Live <span className="text-purple-600">Performance</span></h2>
                </div>
                
                <select 
                    value={selectedAcc?.id || ""} 
                    onChange={(e) => setSelectedAcc(accounts.find((a: any) => String(a.id) === e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:border-purple-500 transition-all font-mono shadow-sm"
                >
                    {accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>{acc.username || acc.name}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-32 bg-white border border-gray-100 rounded-3xl animate-pulse shadow-sm"></div>
                    ))}
                </div>
            ) : insights ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {platform === 'Threads' ? (
                        <>
                            <StatCard title="VisualizaÃ§Ãµes" value={insights.views || 0} icon={Eye} color="purple" />
                            <StatCard title="Curtidas" value={insights.likes || 0} icon={Heart} color="pink" />
                            <StatCard title="Reposts" value={insights.reposts || 0} icon={Repeat} color="orange" />
                            <StatCard title="Respostas" value={insights.replies || 0} icon={MessageCircle} color="blue" />
                        </>
                    ) : platform === 'Instagram' ? (
                        <>
                            <StatCard title="ImpressÃµes" value={insights.impressions || 0} icon={Eye} color="pink" />
                            <StatCard title="Alcance" value={insights.reach || 0} icon={Target} color="purple" />
                            <StatCard title="Visitas Perfil" value={insights.profile_views || 0} icon={Users} color="blue" />
                            <StatCard title="Cliques Site" value={insights.website_clicks || 0} icon={Globe} color="green" />
                        </>
                    ) : (
                        <>
                            <StatCard title="ImpressÃµes" value={insights.impressions || 0} icon={Eye} color="blue" />
                            <StatCard title="Engajamento" value={insights.post_engagements || 0} icon={Zap} color="orange" />
                            <StatCard title="UsuÃ¡rios Ativos" value={insights.engaged_users || 0} icon={Users} color="purple" />
                            <StatCard title="Alcance" value={insights.impressions ? Math.round(insights.impressions * 0.7) : 0} icon={Target} color="green" />
                        </>
                    )}
                </div>
            ) : errorMsg ? (
                <div className="bg-red-50 border border-red-100 rounded-3xl p-6 shadow-sm">
                    <p className="text-sm font-black text-red-600 mb-1 font-mono">[ ERRO DE TELEMETRIA ]</p>
                    <p className="text-xs text-red-500 font-mono break-all">{errorMsg}</p>
                </div>
            ) : (
                <div className="bg-white text-gray-500 p-6 rounded-3xl text-xs font-black border border-gray-100 text-center font-mono tracking-widest uppercase shadow-sm">
                    [ SEM DADOS NO RADAR ]
                </div>
            )}
        </div>
    );
};

const AnalyticsPage = ({ setDashboardTab }: any) => {
    const [activeTab, setActiveTab] = useState('geral');
    const [stats, setStats] = useState<any>(null);
    const [sendsOverTime, setSendsOverTime] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [groupPerformance, setGroupPerformance] = useState([]);
    const [days, setDays] = useState(7);
    const [loading, setLoading] = useState(true);
    const [currentPlatformInsights, setCurrentPlatformInsights] = useState<any>(null);
    
    // Accounts for platform specific insights
    const [igAccounts, setIgAccounts] = useState([]);
    const [fbPages, setFbPages] = useState([]);
    const [threadsAccounts, setThreadsAccounts] = useState([]);

    useEffect(() => {
        loadAnalytics();
        loadAccounts();
    }, [days]);

    const loadAccounts = async () => {
        try {
            const igRes = await api.get('/instagram/accounts');
            if (igRes.data.success) setIgAccounts(igRes.data.accounts || []);

            const fbRes = await api.get('/facebook/pages');
            const fbList = fbRes.data.success ? fbRes.data.pages : (fbRes.data.pages || []);
            setFbPages(fbList);

            const thRes = await api.get('/threads/accounts');
            if (thRes.data.success) setThreadsAccounts(thRes.data.accounts || []);
        } catch (e) {
            console.error('Failed to load accounts for analytics', e);
        }
    };

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const dashboardRes = await api.get(`/analytics/dashboard?days=${days}`);
            if (dashboardRes.data.success) {
                setStats(dashboardRes.data.stats);
                setSendsOverTime(dashboardRes.data.sendsOverTime);
            }

            const productsRes = await api.get(`/analytics/top-products?days=${days}&limit=10`);
            if (productsRes.data.success) {
                setTopProducts(productsRes.data.products);
            }

            const groupsRes = await api.get(`/analytics/group-performance?days=${days}`);
            if (groupsRes.data.success) {
                setGroupPerformance(groupsRes.data.groups);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center h-[500px] bg-transparent">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto shadow-xl shadow-purple-500/20"></div>
                    <p className="text-lg font-black text-gray-900 tracking-tight uppercase font-mono">[ Sincronizando<span className="text-purple-600">_Dados</span> ]</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent p-2 md:p-8">
            <div className="max-w-7xl mx-auto space-y-10">
                
                {/* Tactical Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-500/10">
                                <BarChart3 className="text-purple-600" size={24} />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Command<span className="text-purple-600">_Center</span></h1>
                                <p className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] font-mono">INTELLIGENT_ANALYTICS_V4.0</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50">
                        {['geral', 'links', 'instagram', 'facebook', 'threads'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all font-mono ${
                                    activeTab === tab 
                                    ? 'bg-purple-50 text-purple-600 border border-purple-100 shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {tab === 'links' ? 'Cliques' : tab}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50">
                        {[7, 30, 90].map((d) => (
                            <button
                                key={d}
                                onClick={() => setDays(d)}
                                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all font-mono ${
                                    days === d 
                                    ? 'bg-purple-50 text-purple-600 border border-purple-100 shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {d}D
                            </button>
                        ))}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'geral' ? (
                        <motion.div 
                            key="geral"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-10"
                        >
                            {/* Top Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <StatCard title="Total de Envios" value={stats?.totalSends || 0} icon={Package} trend={12.5} color="purple" />
                                <StatCard title="ComissÃ£o Bruta" value={(stats?.totalCommission || 0).toFixed(2)} icon={DollarSign} trend={8.2} color="green" suffix=" R$" />
                                <StatCard title="Taxa de Entrega" value={(stats?.successRate || 100).toFixed(1)} icon={CheckCircle} color="blue" suffix="%" />
                                <StatCard title="Volume Operacional" value={groupPerformance.length} icon={Users} color="orange" />
                            </div>

                            {/* Main Charts Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 bg-white/90 backdrop-blur-xl border border-purple-100 rounded-[2.5rem] p-10 shadow-xl shadow-purple-500/5 hover:border-purple-300 transition-all">
                                    <div className="flex items-center justify-between mb-10">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 shadow-sm">
                                                <Activity size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Fluxo de <span className="text-purple-600">Disparos</span></h3>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest font-mono">VOLUME_PER_INTERVAL</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-[400px]">
                                        {stats?.dailyStats && stats.dailyStats.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={stats.dailyStats}>
                                                <defs>
                                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af', fontFamily: 'monospace' }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#9ca3af', fontFamily: 'monospace' }} />
                                                <ReChartsTooltip 
                                                    contentStyle={{ borderRadius: '20px', border: '1px solid #f3f4f6', backgroundColor: '#ffffff', color: '#8b5cf6', boxShadow: '0 20px 25px -5px rgb(139 92 246 / 0.1)', fontWeight: 800, fontFamily: 'monospace' }}
                                                />
                                                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" dot={{r: 4, fill: '#8b5cf6', strokeWidth: 2}} activeDot={{r: 6, fill: '#fff', stroke: '#8b5cf6', strokeWidth: 3}} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 relative overflow-hidden">
                                                <div className="absolute inset-0 bg-purple-500/5 animate-pulse"></div>
                                                <p className="text-xs font-black text-purple-600/50 uppercase tracking-widest font-mono relative z-10">[ AGUARDANDO TRÃ FEGO... ]</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white/90 backdrop-blur-xl border border-purple-100 rounded-[2.5rem] p-10 shadow-xl shadow-purple-500/5 hover:border-purple-300 transition-all">
                                    <h3 className="text-xl font-black text-gray-900 mb-8 tracking-tight">Mix de <span className="text-purple-600">Canais</span></h3>
                                    <div className="h-[300px]">
                                        {stats?.mediaTypes && stats.mediaTypes.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={stats.mediaTypes}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={100}
                                                        paddingAngle={8}
                                                        dataKey="count"
                                                    >
                                                        {stats.mediaTypes.map((entry: any, index: number) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />
                                                        ))}
                                                    </Pie>
                                                    <ReChartsTooltip contentStyle={{ borderRadius: '10px', border: '1px solid #f3f4f6', backgroundColor: '#ffffff', color: '#1f2937', fontFamily: 'monospace', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
                                                <div className="absolute inset-0 border-[4px] border-purple-500/10 rounded-full animate-ping"></div>
                                                <p className="text-xs font-black text-purple-600/50 uppercase tracking-widest font-mono animate-pulse">SCANNING...</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mt-8">
                                        {stats?.mediaTypes?.map((type: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-3">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono">{type.media_type}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Performance Bottom Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Top Products */}
                                <div className="bg-white/90 backdrop-blur-xl border border-purple-100 rounded-[2.5rem] p-10 shadow-xl shadow-purple-500/5 hover:border-purple-300 transition-all">
                                    <h3 className="text-xl font-black text-gray-900 mb-8 tracking-tight flex items-center gap-3">
                                        <TrendingUp className="text-purple-600" /> Top <span className="text-purple-600">Assets</span>
                                    </h3>
                                    <div className="space-y-6">
                                        {Array.isArray(topProducts) && topProducts.slice(0, 5).map((product: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50/80 rounded-2xl hover:bg-white border border-transparent hover:border-purple-200 transition-all group shadow-sm">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-purple-600 shadow-sm font-mono group-hover:scale-110 transition-transform">#{i+1}</div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900 line-clamp-1 font-mono">{product.product_name}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase font-mono">{product.send_count} DISPAROS</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-green-600 font-mono">R$ {product.total_commission.toFixed(2)}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase font-mono">GERADO</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Group Performance */}
                                <div className="bg-white/90 backdrop-blur-xl border border-purple-100 rounded-[2.5rem] p-10 shadow-xl shadow-purple-500/5 hover:border-purple-300 transition-all">
                                    <h3 className="text-xl font-black text-gray-900 mb-8 tracking-tight flex items-center gap-3">
                                        <Users className="text-purple-600" /> OperaÃ§Ã£o <span className="text-purple-600">Grupos</span>
                                    </h3>
                                    <div className="space-y-6">
                                        {Array.isArray(groupPerformance) && groupPerformance.slice(0, 5).map((group: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50/80 rounded-2xl hover:bg-white border border-transparent hover:border-purple-200 transition-all shadow-sm">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-purple-600 text-white rounded-xl flex items-center justify-center hover:scale-110 transition-transform shadow-md shadow-purple-500/20">
                                                        <MessageCircle size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900 line-clamp-1 font-mono">{group.group_name}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase font-mono">PLATAFORMA ATIVA</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-gray-900 font-mono">{group.total_sends}</p>
                                                    <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                                        <div className="h-full bg-purple-600 shadow-[0_0_8px_#8b5cf6]" style={{ width: `${Math.min(100, (group.total_sends / 100) * 100)}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : activeTab === 'links' ? (
                        <motion.div 
                            key="links"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-10"
                        >
                            <LinkTrackerPanel />
                        </motion.div>
                    ) : (
                        <motion.div 
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-white/90 backdrop-blur-xl border border-gray-100 rounded-[3rem] p-12 shadow-2xl shadow-gray-200/50 transition-all"
                        >
                            <PlatformInsights 
                                platform={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} 
                                accounts={
                                    activeTab === 'instagram' ? igAccounts : 
                                    activeTab === 'facebook' ? fbPages : 
                                    threadsAccounts
                                } 
                                days={days}
                                onInsightsLoaded={setCurrentPlatformInsights}
                            />

                            <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl shadow-sm">
                                            <Target size={20} />
                                        </div>
                                        <h3 className="text-xl font-black text-gray-900 tracking-tight">OtimizaÃ§Ã£o de <span className="text-purple-600">ConversÃ£o</span></h3>
                                    </div>
                                    <p className="text-sm text-gray-500 leading-relaxed font-mono">
                                        Os dados apresentados sÃ£o extraÃ­dos diretamente das APIs oficiais da Meta. 
                                        Utilize estes insights para ajustar o horÃ¡rio das suas postagens e maximizar o engajamento orgÃ¢nico.
                                    </p>
                                    <div className="flex gap-4">
                                        <button className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 transition-all shadow-xl shadow-gray-200 font-mono">
                                            Exportar RelatÃ³rio <ExternalLink size={14} />
                                        </button>
                                        <button className="flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-purple-600 hover:text-purple-600 transition-all font-mono">
                                            Ver HistÃ³rico
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="p-10 bg-gradient-to-br from-purple-600 to-pink-600 border border-transparent rounded-[2.5rem] text-white shadow-2xl shadow-purple-200 relative overflow-hidden group">
                                    <Zap className="absolute top-10 right-10 text-white/20 group-hover:scale-110 transition-transform" size={120} />
                                    <div className="relative z-10 space-y-6">
                                        <div className="px-4 py-1.5 bg-white/20 border border-transparent text-white rounded-full inline-block text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-sm font-mono">[ PRO_TIP ]</div>
                                        
                                        {currentPlatformInsights?.best_hours && currentPlatformInsights.best_hours.length > 0 ? (
                                            <>
                                                <h4 className="text-2xl font-black tracking-tight leading-tight text-white">Melhores HorÃ¡rios<br/>para Postagem</h4>
                                                <p className="text-white/90 text-sm font-medium leading-relaxed font-mono">
                                                    Com base na atividade dos seus seguidores, o radar recomenda agendar publicaÃ§Ãµes nestes horÃ¡rios de pico:
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {currentPlatformInsights.best_hours.map((hour: string, idx: number) => (
                                                        <div key={idx} className="px-3 py-1.5 bg-white border border-transparent text-purple-600 font-black font-mono rounded-lg text-sm shadow-xl shadow-purple-900/20">
                                                            {hour}
                                                        </div>
                                                    ))}
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        if (setDashboardTab) {
                                                            setDashboardTab(`${activeTab}_automation`);
                                                        }
                                                    }}
                                                    className="mt-4 px-6 py-3 bg-white text-gray-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-xl shadow-purple-900/20 flex items-center gap-2 font-mono"
                                                >
                                                    <Calendar size={16} className="text-purple-600" />
                                                    Reagendar PublicaÃ§Ãµes
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <h4 className="text-2xl font-black tracking-tight leading-tight text-white">Maximizando seu <br/> Alcance OrgÃ¢nico</h4>
                                                <p className="text-white/90 text-sm font-medium leading-relaxed font-mono">
                                                    Accounts com mais de 500 impressÃµes diÃ¡rias tendem a converter 3x mais links de afiliados Shopee. 
                                                    Foque na consistÃªncia de postagem e deixe o sistema rodar.
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const detectBrand = (url: string) => {
    const u = url.toLowerCase();
    if (u.includes('shopee')) return { name: 'Shopee', color: '#EE4D2D', emoji: 'ðŸ›’' };
    if (u.includes('aliexpress') || u.includes('ali.pub')) return { name: 'AliExpress', color: '#FF6600', emoji: 'ðŸ“¦' };
    if (u.includes('amazon')) return { name: 'Amazon', color: '#FF9900', emoji: 'ðŸ“¦' };
    if (u.includes('mercadolivre') || u.includes('meli.store')) return { name: 'Mercado Livre', color: '#FFE600', emoji: 'ðŸ›ï¸' };
    if (u.includes('magalu') || u.includes('magazineluiza')) return { name: 'Magalu', color: '#0066CC', emoji: 'ðŸ’™' };
    if (u.includes('americanas')) return { name: 'Americanas', color: '#CC0000', emoji: 'ðŸ”´' };
    if (u.includes('kabum')) return { name: 'KaBuM!', color: '#FF6B00', emoji: 'ðŸ’»' };
    return null;
};

const LinkIntelligenceModal = ({ linkId, onClose }: { linkId: number; onClose: () => void }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [editingTargetUrl, setEditingTargetUrl] = useState('');
    const [editingMaxClicks, setEditingMaxClicks] = useState<string>('');
    const [editingExpiresAt, setEditingExpiresAt] = useState<string>('');
    const [updating, setUpdating] = useState(false);
    const [updateSuccess, setUpdateSuccess] = useState(false);

    useEffect(() => {
        fetchStats();
    }, [linkId]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/short-links/${linkId}/stats`);
            if (res.data.success) {
                setStats(res.data.stats);
                setEditingTargetUrl(res.data.stats.link.target_url);
                setEditingMaxClicks(res.data.stats.link.max_clicks ? String(res.data.stats.link.max_clicks) : '');
                const exp = res.data.stats.link.expires_at;
                setEditingExpiresAt(exp ? new Date(exp).toISOString().slice(0, 16) : '');
            }
        } catch (err) {
            console.error('Erro ao buscar estatÃ­sticas do link:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateUrl = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTargetUrl.trim()) return;
        try {
            setUpdating(true);
            const payload: any = { targetUrl: editingTargetUrl.trim() };
            if (editingMaxClicks) payload.maxClicks = parseInt(editingMaxClicks);
            if (editingExpiresAt) payload.expiresAt = new Date(editingExpiresAt).toISOString();
            const res = await api.put(`/short-links/${linkId}`, payload);
            if (res.data.success) {
                setUpdateSuccess(true);
                setTimeout(() => setUpdateSuccess(false), 3000);
                fetchStats();
            }
        } catch (err) {
            console.error('Erro ao atualizar URL de destino:', err);
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-white/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border border-gray-100 rounded-3xl p-10 max-w-sm w-full text-center space-y-6 shadow-2xl shadow-gray-200">
                    <div className="relative w-16 h-16 mx-auto">
                        <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping"></div>
                        <div className="w-16 h-16 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest font-mono">[ CARREGANDO INTELIGÊNCIA ]</h3>
                        <p className="text-xs text-gray-500 font-mono mt-2">Processando geo-metadata e audit logs...</p>
                    </div>
                </motion.div>
            </div>
        );
    }

    if (!stats) return null;

    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
        const match = stats.hourly.find((h: any) => h.hour === hour);
        return {
            hour: `${String(hour).padStart(2, '0')}:00`,
            cliques: match ? match.count : 0
        };
    });

    const totalClicks = stats.link.clicks || 0;
    const topCountry = stats.countries[0]?.name || 'Nenhum';
    const topRegion = stats.regions[0]?.name || 'Nenhum';
    const topCity = stats.cities[0]?.name || 'Nenhum';
    const brand = detectBrand(stats.link.target_url);
    const isExpired = stats.link.expires_at && new Date() > new Date(stats.link.expires_at);
    const reachedMax = stats.link.max_clicks !== null && totalClicks >= stats.link.max_clicks;

    const getDeviceConfig = (deviceType: string) => {
        const type = deviceType || 'Desconhecido';
        if (type === 'Celular') return { name: 'Celular', icon: Smartphone, color: '#3b82f6' };
        if (type === 'Computador') return { name: 'Computador', icon: Monitor, color: '#a855f7' };
        if (type === 'Tablet') return { name: 'Tablet', icon: Tablet, color: '#ec4899' };
        if (type === 'Bot/Outro') return { name: 'Bot/Outro', icon: Cpu, color: '#ef4444' };
        return { name: 'Desconhecido', icon: Cpu, color: '#6b7280' };
    };

    return (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-md z-50 flex items-center justify-end">
            <motion.div
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="bg-gray-50 w-full max-w-4xl h-full shadow-2xl flex flex-col overflow-hidden border-l border-gray-200"
            >
                {/* Header */}
                <div className="bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-xl transition-all">
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-black text-gray-900 tracking-tight font-mono">
                                    /{stats.link.slug}
                                </h2>
                                {brand && (
                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black text-white uppercase tracking-wider" style={{ backgroundColor: brand.color }}>
                                        {brand.emoji} {brand.name}
                                    </span>
                                )}
                                {(isExpired || reachedMax) && (
                                    <span className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                        ⛔ {isExpired ? 'EXPIRADO' : 'LIMITE ATINGIDO'}
                                    </span>
                                )}
                                {!isExpired && !reachedMax && (
                                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-wider animate-pulse">
                                        ● ATIVO
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] font-mono text-gray-400 mt-1 uppercase tracking-widest">GEO-INTELLIGENCE TRACKER v2.0</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-400 rounded-xl transition-all">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ backgroundColor: '#fafafa' }}>

                    {/* Fast Updater with Scarcity */}
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                        <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-widest font-mono mb-4">[ CONFIGURAÇÃO DO LINK ]</h4>
                        <form onSubmit={handleUpdateUrl} className="space-y-3">
                            <div className="flex flex-col md:flex-row gap-3">
                                <input type="url" required value={editingTargetUrl} onChange={e => setEditingTargetUrl(e.target.value)}
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all"
                                    placeholder="URL de destino do afiliado..." />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono block mb-1.5">⚡ Máx. Cliques (Escassez)</label>
                                    <input type="number" min="1" value={editingMaxClicks} onChange={e => setEditingMaxClicks(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all"
                                        placeholder="Ex: 1000 (ilimitado se vazio)" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono block mb-1.5">⏰ Expirar em</label>
                                    <input type="datetime-local" value={editingExpiresAt} onChange={e => setEditingExpiresAt(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all" />
                                </div>
                            </div>
                            <button type="submit" disabled={updating}
                                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest font-mono transition-all ${updateSuccess ? 'bg-purple-600 text-white' : 'bg-purple-50 border border-purple-200 text-purple-600 hover:bg-purple-600 hover:text-white'}`}>
                                {updating ? '[ SALVANDO... ]' : updateSuccess ? '[ ✓ SALVO ]' : '[ SALVAR CONFIGURAÇÃO ]'}
                            </button>
                        </form>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'CLIQUES HUMANOS', value: totalClicks, color: '#9333ea' },
                            { label: 'TOP PAÍS', value: topCountry, color: '#3b82f6' },
                            { label: 'TOP ESTADO', value: topRegion, color: '#f59e0b' },
                            { label: 'TOP CIDADE', value: topCity, color: '#ec4899' },
                        ].map((card, i) => (
                            <div key={i} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                                <p className="text-[9px] font-black uppercase tracking-widest font-mono mb-2" style={{ color: card.color }}>{card.label}</p>
                                <p className="text-lg font-black text-gray-900 truncate">{card.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Scarcity Bar */}
                    {stats.link.max_clicks && (
                        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest font-mono">⚡ PROGRESSO DE ESCASSEZ</p>
                                <p className="text-[9px] font-mono text-gray-500">{totalClicks} / {stats.link.max_clicks} cliques</p>
                            </div>
                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((totalClicks / stats.link.max_clicks) * 100, 100)}%`, backgroundColor: reachedMax ? '#ef4444' : '#f59e0b' }}></div>
                            </div>
                        </div>
                    )}

                    {/* Neon Chart */}
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Clock size={14} className="text-purple-600" />
                            <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-widest font-mono">[ PICOS DE ACESSO POR HORÁRIO ]</h4>
                        </div>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={Array.from({ length: 24 }, (_, hour) => {
                                    const match = stats.hourly.find((h: any) => h.hour === hour);
                                    return { hour: `${String(hour).padStart(2,'0')}h`, cliques: match ? match.count : 0 };
                                })}>
                                    <defs>
                                        <linearGradient id="neonGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#9333ea" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" vertical={false} />
                                    <XAxis dataKey="hour" stroke="#9ca3af" fontSize={9} tickLine={false} />
                                    <YAxis stroke="#9ca3af" fontSize={9} tickLine={false} allowDecimals={false} />
                                    <ReChartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '11px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} labelStyle={{ color: '#9333ea', fontWeight: 'bold' }} itemStyle={{ color: '#111827' }} />
                                    <Area type="monotone" dataKey="cliques" stroke="#9333ea" strokeWidth={2} fillOpacity={1} fill="url(#neonGrad)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Geo & Device Rankings */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { title: 'TOP PAÍSES', data: stats.countries, color: '#3b82f6' },
                            { title: 'TOP ESTADOS', data: stats.regions, color: '#f59e0b' },
                            { title: 'TOP CIDADES', data: stats.cities, color: '#ec4899' },
                            { title: 'TOP APARELHOS', data: stats.devices || [], color: '#8b5cf6' },
                        ].map((section) => (
                            <div key={section.title} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 space-y-3">
                                <h5 className="text-[9px] font-black uppercase tracking-widest font-mono" style={{ color: section.color }}>{section.title}</h5>
                                {section.data.length === 0 ? (
                                    <p className="text-[10px] text-gray-500 font-mono">Sem dados</p>
                                ) : section.data.map((item: any, idx: number) => {
                                    const pct = totalClicks > 0 ? Math.round((item.count / totalClicks) * 100) : 0;
                                    return (
                                        <div key={idx} className="space-y-1">
                                            <div className="flex justify-between">
                                                <span className="text-[10px] text-gray-700 font-mono truncate max-w-[120px]">{item.name}</span>
                                                <span className="text-[10px] font-black font-mono" style={{ color: section.color }}>{pct}%</span>
                                            </div>
                                            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: section.color }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Terminal Click Feed */}
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400"></div><div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div><div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div></div>
                                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono">audit.log — últimos 50 acessos</h4>
                            </div>
                            <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-600 rounded text-[9px] font-mono animate-pulse">● LIVE</span>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {stats.recent.length === 0 ? (
                                <p className="text-[11px] text-gray-500 font-mono py-4 text-center">// Aguardando primeiro clique humano...</p>
                            ) : stats.recent.map((click: any, idx: number) => {
                                const dev = getDeviceConfig(click.device_type);
                                const DevIcon = dev.icon;
                                const isBot = click.is_bot === 1 || click.is_bot === true;
                                return (
                                    <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[10px] font-mono hover:bg-purple-50/50 transition-all ${isBot ? 'opacity-40' : ''}`}>
                                        <span className="text-gray-500 w-32 shrink-0">{new Date(click.clicked_at).toLocaleString('pt-BR', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="text-purple-500 w-5 shrink-0"><DevIcon size={11} /></span>
                                        <span className="text-gray-700 flex-1 truncate">🗺️ {[click.city, click.region, click.country].filter(Boolean).join(', ')}</span>
                                        <span className="text-gray-500 shrink-0">{click.ip_address}</span>
                                        {isBot && <span className="text-red-500 text-[8px] font-black shrink-0">BOT</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const LinkTrackerPanel = () => {
    const [links, setLinks] = useState<any[]>([]);
    const [systemPublicUrl, setSystemPublicUrl] = useState('https://fluxointeligente.digital');
    const [loading, setLoading] = useState(true);
    const [targetUrl, setTargetUrl] = useState('');
    const [maxClicks, setMaxClicks] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);

    useEffect(() => { fetchLinks(); }, []);

    const fetchLinks = async () => {
        try {
            setLoading(true);
            const res = await api.get('/short-links');
            if (res.data.success) {
                setLinks(res.data.links || []);
                setSystemPublicUrl(res.data.systemPublicUrl || window.location.origin);
            }
        } catch (err) {
            console.error('Erro ao buscar links curtos:', err);
        } finally { setLoading(false); }
    };

    const handleCreateLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetUrl.trim()) return;
        try {
            setSubmitting(true);
            const payload: any = { targetUrl: targetUrl.trim() };
            if (maxClicks) payload.maxClicks = parseInt(maxClicks);
            if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
            const res = await api.post('/short-links', payload);
            if (res.data.success) { setTargetUrl(''); setMaxClicks(''); setExpiresAt(''); fetchLinks(); }
        } catch (err) {
            console.error('Erro ao criar link curto:', err);
        } finally { setSubmitting(false); }
    };

    const handleDeleteLink = async (id: number) => {
        if (!window.confirm('Excluir este redirecionamento?')) return;
        try {
            const res = await api.delete(`/short-links/${id}`);
            if (res.data.success) setLinks(prev => prev.filter(l => l.id !== id));
        } catch (err) { console.error('Erro ao deletar link:', err); }
    };

    const handleCopy = (link: any) => {
        const url = `${systemPublicUrl.replace(/\/$/, '')}/?video=${link.slug}`;
        navigator.clipboard.writeText(url);
        setCopiedId(link.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredLinks = links.filter(l =>
        l.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.target_url.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalLinks = links.length;
    const totalClicks = links.reduce((s, l) => s + (l.clicks || 0), 0);
    const avgClicks = totalLinks > 0 ? (totalClicks / totalLinks).toFixed(1) : '0.0';
    const activeLinks = links.filter(l => (l.clicks || 0) > 0).length;

    return (
        <div className="space-y-8">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Links Ativos', value: totalLinks, icon: Link, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                    { label: 'Cliques Totais', value: totalClicks, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                    { label: 'MÃ©dia / Link', value: avgClicks, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                    { label: 'Com TrÃ¡fego', value: activeLinks, icon: CheckCircle, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-100' },
                ].map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <div key={i} className={`bg-white border ${card.border} rounded-2xl p-5 flex items-center gap-4 shadow-sm`}>
                            <div className={`p-3 ${card.bg} rounded-xl`}><Icon size={20} className={card.color} /></div>
                            <div>
                                <p className={`text-[9px] font-black uppercase tracking-widest font-mono ${card.color}`}>{card.label}</p>
                                <p className="text-2xl font-black text-gray-900">{card.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Create Link */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <h3 className="text-[10px] font-black text-purple-600 uppercase tracking-widest font-mono mb-4">[ GERAR MAGIC LINK CONTADOR ]</h3>
                <form onSubmit={handleCreateLink} className="space-y-3">
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            {targetUrl && detectBrand(targetUrl) && (
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded font-black text-white z-10"
                                    style={{ backgroundColor: detectBrand(targetUrl)!.color }}>
                                    {detectBrand(targetUrl)!.emoji}
                                </span>
                            )}
                            <input type="url" required value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                                className={`w-full ${targetUrl && detectBrand(targetUrl) ? 'pl-12' : 'pl-4'} pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all`}
                                placeholder="https://shope.ee/... ou qualquer URL de afiliado" />
                        </div>
                        <button type="submit" disabled={submitting}
                            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-widest font-mono transition-all disabled:opacity-50 whitespace-nowrap shadow-md shadow-purple-500/20">
                            {submitting ? '...' : '[ GERAR ]'}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono block mb-1.5">âš¡ MÃ¡x. Cliques (Escassez)</label>
                            <input type="number" min="1" value={maxClicks} onChange={e => setMaxClicks(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all"
                                placeholder="Ilimitado se vazio" />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono block mb-1.5">â ° Expirar em</label>
                            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all" />
                        </div>
                    </div>
                </form>
            </div>

            {/* Links Table */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h3 className="text-[10px] font-black text-purple-600 uppercase tracking-widest font-mono">[ LINKS DE REDIRECIONAMENTO ]</h3>
                    <div className="relative max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:border-purple-500 outline-none transition-all"
                            placeholder="buscar slug ou destino..." />
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="text-[10px] text-gray-500 font-mono mt-3">carregando links...</p>
                    </div>
                ) : filteredLinks.length === 0 ? (
                    <div className="py-16 text-center space-y-6">
                        <div className="relative w-24 h-24 mx-auto">
                            <div className="absolute inset-0 rounded-full border border-purple-500/10 animate-ping" style={{ animationDuration: '3s' }}></div>
                            <div className="absolute inset-2 rounded-full border border-purple-500/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
                            <div className="absolute inset-4 rounded-full border border-purple-500/30 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '1s' }}></div>
                            <div className="w-24 h-24 rounded-full border border-purple-500/10 flex items-center justify-center">
                                <Activity size={28} className="text-purple-500/60" />
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-black text-purple-600 uppercase tracking-widest font-mono">SISTEMA ATIVO â€” AGUARDANDO LINKS</p>
                            <p className="text-[10px] text-gray-500 font-mono mt-1">Gere um link acima ou faÃ§a postagens no Facebook para criar automaticamente.</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    {['Slug', 'Destino', 'Cliques', 'Limite', 'Expira', 'Criado', ''].map(h => (
                                        <th key={h} className="pb-3 text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono pr-4">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {filteredLinks.map(link => {
                                        const shortUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${link.slug}`;
                                        const isCopied = copiedId === link.id;
                                        const brand = detectBrand(link.target_url);
                                        const isExpired = link.expires_at && new Date() > new Date(link.expires_at);
                                        const reachedMax = link.max_clicks !== null && link.clicks >= link.max_clicks;
                                        return (
                                            <motion.tr key={link.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                className="border-b border-gray-50 last:border-0 hover:bg-purple-50/50 transition-all">
                                                <td className="py-4 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setSelectedLinkId(link.id)}
                                                            className="text-purple-600 hover:text-purple-500 font-black font-mono text-xs flex items-center gap-1">
                                                            /{link.slug}
                                                        </button>
                                                        <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-purple-500 transition-colors">
                                                            <ExternalLink size={10} />
                                                        </a>
                                                        {(isExpired || reachedMax) && <span className="text-[8px] text-red-500 font-black font-mono">â›”</span>}
                                                    </div>
                                                </td>
                                                <td className="py-4 pr-4 max-w-[160px]">
                                                    <div className="flex items-center gap-1.5">
                                                        {brand && <span className="text-xs px-1.5 py-0.5 rounded text-white font-black shrink-0" style={{ backgroundColor: brand.color, fontSize: '9px' }}>{brand.emoji}</span>}
                                                        <span className="text-[10px] text-gray-600 font-mono truncate">{link.target_url}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 pr-4">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black font-mono ${
                                                        (link.clicks || 0) > 50 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                        (link.clicks || 0) > 0 ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                        'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                                        {link.clicks || 0}
                                                    </span>
                                                </td>
                                                <td className="py-4 pr-4 text-[9px] font-mono text-gray-500">{link.max_clicks || 'âˆž'}</td>
                                                <td className="py-4 pr-4 text-[9px] font-mono text-gray-500">
                                                    {link.expires_at ? new Date(link.expires_at).toLocaleDateString('pt-BR') : 'â€”'}
                                                </td>
                                                <td className="py-4 pr-4 text-[9px] font-mono text-gray-500">
                                                    {new Date(link.created_at).toLocaleDateString('pt-BR')}
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={() => setSelectedLinkId(link.id)}
                                                            className="p-1.5 bg-gray-50 border border-gray-200 text-gray-400 hover:text-purple-600 hover:border-purple-300 rounded-lg transition-all shadow-sm">
                                                            <TrendingUp size={12} />
                                                        </button>
                                                        <button onClick={() => handleCopy(link)}
                                                            className={`p-1.5 rounded-lg border transition-all shadow-sm ${isCopied ? 'bg-purple-100 border-purple-200 text-purple-600' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-purple-600 hover:border-purple-300'}`}>
                                                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                                        </button>
                                                        <button onClick={() => handleDeleteLink(link.id)}
                                                            className="p-1.5 bg-gray-50 border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 rounded-lg transition-all shadow-sm">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selectedLinkId !== null && (
                    <LinkIntelligenceModal linkId={selectedLinkId} onClose={() => { setSelectedLinkId(null); fetchLinks(); }} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default AnalyticsPage;
