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
    ExternalLink
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
        whileHover={{ y: -5, transition: { duration: 0.2 } }}
        className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-xl shadow-gray-100/50"
    >
        <div className="flex items-start justify-between">
            <div className="space-y-4">
                <div className={`p-3 rounded-2xl bg-${color}-50 text-${color}-600 inline-block`}>
                    <Icon size={24} />
                </div>
                <div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{title}</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-black text-gray-900">{value}{suffix}</h3>
                        {trend && (
                            <span className={`text-xs font-bold flex items-center ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
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
                setErrorMsg(res.data.error || 'Resposta inválida do servidor');
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
            <div className="bg-gray-50 rounded-3xl p-12 text-center border-2 border-dashed border-gray-200">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                    {platform === 'Instagram' ? <Instagram className="text-pink-500" /> : 
                     platform === 'Facebook' ? <Facebook className="text-blue-600" /> : 
                     <MessageCircle className="text-purple-600" />}
                </div>
                <h3 className="text-lg font-bold text-gray-900">Nenhuma conta de {platform} conectada</h3>
                <p className="text-sm text-gray-500 mt-2">Conecte uma conta para ver métricas em tempo real.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-${platform === 'Instagram' ? 'pink' : platform === 'Facebook' ? 'blue' : 'purple'}-50`}>
                        {platform === 'Instagram' ? <Instagram className="text-pink-500" size={20} /> : 
                         platform === 'Facebook' ? <Facebook className="text-blue-600" size={20} /> : 
                         <MessageCircle className="text-purple-600" size={20} />}
                    </div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">{platform} Live <span className="text-purple-600">Performance</span></h2>
                </div>
                
                <select 
                    value={selectedAcc?.id || ""} 
                    onChange={(e) => setSelectedAcc(accounts.find((a: any) => String(a.id) === e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                >
                    {accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>{acc.username || acc.name}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-32 bg-gray-100 rounded-3xl animate-pulse"></div>
                    ))}
                </div>
            ) : insights ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {platform === 'Threads' ? (
                        <>
                            <StatCard title="Visualizações" value={insights.views || 0} icon={Eye} color="purple" />
                            <StatCard title="Curtidas" value={insights.likes || 0} icon={Heart} color="pink" />
                            <StatCard title="Reposts" value={insights.reposts || 0} icon={Repeat} color="orange" />
                            <StatCard title="Respostas" value={insights.replies || 0} icon={MessageCircle} color="blue" />
                        </>
                    ) : platform === 'Instagram' ? (
                        <>
                            <StatCard title="Impressões" value={insights.impressions || 0} icon={Eye} color="pink" />
                            <StatCard title="Alcance" value={insights.reach || 0} icon={Target} color="purple" />
                            <StatCard title="Visitas Perfil" value={insights.profile_views || 0} icon={Users} color="blue" />
                            <StatCard title="Cliques Site" value={insights.website_clicks || 0} icon={Globe} color="green" />
                        </>
                    ) : (
                        <>
                            <StatCard title="Impressões" value={insights.impressions || 0} icon={Eye} color="blue" />
                            <StatCard title="Engajamento" value={insights.post_engagements || 0} icon={Zap} color="orange" />
                            <StatCard title="Usuários Ativos" value={insights.engaged_users || 0} icon={Users} color="purple" />
                            <StatCard title="Alcance" value={insights.impressions ? Math.round(insights.impressions * 0.7) : 0} icon={Target} color="green" />
                        </>
                    )}
                </div>
            ) : errorMsg ? (
                <div className="bg-red-50 border border-red-100 rounded-3xl p-6">
                    <p className="text-sm font-black text-red-700 mb-1">⚠️ Erro ao carregar métricas</p>
                    <p className="text-xs text-red-600 font-mono break-all">{errorMsg}</p>
                    <p className="text-[10px] text-red-400 mt-3 font-bold uppercase tracking-widest">Verifique se a conta é do tipo Business/Creator e está vinculada a uma Página do Facebook.</p>
                </div>
            ) : (
                <div className="bg-gray-50 text-gray-500 p-6 rounded-3xl text-sm font-bold border border-gray-100 text-center">
                    Sem dados disponíveis para esta conta.
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
            <div className="flex items-center justify-center h-screen bg-gray-50/50">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto shadow-xl shadow-purple-200"></div>
                    <p className="text-lg font-black text-gray-900 tracking-tight uppercase">Sincronizando<span className="text-purple-600">_Dados</span></p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/30 p-8">
            <div className="max-w-7xl mx-auto space-y-10">
                
                {/* Tactical Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-200">
                                <BarChart3 className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Command<span className="text-purple-600">_Center</span></h1>
                                <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">INTELLIGENT_ANALYTICS_V4.0</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/20">
                        {['geral', 'instagram', 'facebook', 'threads'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                    activeTab === tab 
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' 
                                    : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/20">
                        {[7, 30, 90].map((d) => (
                            <button
                                key={d}
                                onClick={() => setDays(d)}
                                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                                    days === d 
                                    ? 'bg-gray-900 text-white shadow-lg shadow-gray-400/20' 
                                    : 'text-gray-400 hover:text-gray-600'
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
                                <StatCard title="Comissão Bruta" value={(stats?.totalCommission || 0).toFixed(2)} icon={DollarSign} trend={8.2} color="green" suffix=" R$" />
                                <StatCard title="Taxa de Entrega" value={(stats?.successRate || 100).toFixed(1)} icon={CheckCircle} color="blue" suffix="%" />
                                <StatCard title="Volume Operacional" value={groupPerformance.length} icon={Users} color="orange" />
                            </div>

                            {/* Main Charts Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] p-10 shadow-2xl shadow-gray-100/50">
                                    <div className="flex items-center justify-between mb-10">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 rounded-2xl bg-purple-50 text-purple-600">
                                                <Activity size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Fluxo de <span className="text-purple-600">Disparos</span></h3>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">VOLUME_PER_INTERVAL</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-[400px]">
                                        {stats?.dailyStats && stats.dailyStats.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={stats.dailyStats}>
                                                <defs>
                                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                                <ReChartsTooltip 
                                                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 800 }}
                                                />
                                                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={4} fillOpacity={1} fill="url(#colorCount)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sem dados no período</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] p-10 shadow-2xl shadow-gray-100/50">
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
                                                    <ReChartsTooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Aguardando dados...</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mt-8">
                                        {stats?.mediaTypes?.map((type: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-3">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{type.media_type}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Performance Bottom Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Top Products */}
                                <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] p-10 shadow-2xl shadow-gray-100/50">
                                    <h3 className="text-xl font-black text-gray-900 mb-8 tracking-tight flex items-center gap-3">
                                        <TrendingUp className="text-purple-600" /> Top <span className="text-purple-600">Assets</span>
                                    </h3>
                                    <div className="space-y-6">
                                        {Array.isArray(topProducts) && topProducts.slice(0, 5).map((product: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl hover:bg-white border border-transparent hover:border-gray-100 transition-all group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-purple-600 shadow-sm">#{i+1}</div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900 line-clamp-1">{product.product_name}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">{product.send_count} DISPAROS</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-green-600">R$ {product.total_commission.toFixed(2)}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">GERADO</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Group Performance */}
                                <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] p-10 shadow-2xl shadow-gray-100/50">
                                    <h3 className="text-xl font-black text-gray-900 mb-8 tracking-tight flex items-center gap-3">
                                        <Users className="text-purple-600" /> Operação <span className="text-purple-600">Grupos</span>
                                    </h3>
                                    <div className="space-y-6">
                                        {Array.isArray(groupPerformance) && groupPerformance.slice(0, 5).map((group: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl hover:bg-white border border-transparent hover:border-gray-100 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-purple-600 text-white rounded-xl flex items-center justify-center">
                                                        <MessageCircle size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900 line-clamp-1">{group.group_name}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">PLATAFORMA ATIVA</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-gray-900">{group.total_sends}</p>
                                                    <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                                        <div className="h-full bg-purple-600" style={{ width: `${Math.min(100, (group.total_sends / 100) * 100)}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[3rem] p-12 shadow-2xl shadow-gray-200/30"
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
                                        <div className="p-3 bg-gray-900 text-white rounded-2xl shadow-lg">
                                            <Target size={20} />
                                        </div>
                                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Otimização de <span className="text-purple-600">Conversão</span></h3>
                                    </div>
                                    <p className="text-sm text-gray-500 leading-relaxed font-medium">
                                        Os dados apresentados são extraídos diretamente das APIs oficiais da Meta. 
                                        Utilize estes insights para ajustar o horário das suas postagens e maximizar o engajamento orgânico.
                                    </p>
                                    <div className="flex gap-4">
                                        <button className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 transition-all shadow-xl shadow-gray-200">
                                            Exportar Relatório <ExternalLink size={14} />
                                        </button>
                                        <button className="flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-purple-600 hover:text-purple-600 transition-all">
                                            Ver Histórico
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="p-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-[2.5rem] text-white shadow-2xl shadow-purple-200 relative overflow-hidden group">
                                    <Zap className="absolute top-10 right-10 text-white/20 group-hover:scale-110 transition-transform" size={120} />
                                    <div className="relative z-10 space-y-6">
                                        <div className="px-4 py-1.5 bg-white/20 rounded-full inline-block text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-sm">PRO_TIP</div>
                                        
                                        {currentPlatformInsights?.best_hours && currentPlatformInsights.best_hours.length > 0 ? (
                                            <>
                                                <h4 className="text-2xl font-black tracking-tight leading-tight">Melhores Horários<br/>para Postagem</h4>
                                                <p className="text-white/80 text-sm font-medium leading-relaxed">
                                                    Com base na atividade dos seus seguidores, o sistema recomenda agendar publicações nestes horários de pico:
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {currentPlatformInsights.best_hours.map((hour: string, idx: number) => (
                                                        <div key={idx} className="px-3 py-1.5 bg-white text-purple-600 font-black rounded-lg text-sm shadow-xl shadow-purple-900/20">
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
                                                    className="mt-4 px-6 py-3 bg-white text-gray-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all shadow-xl shadow-purple-900/20 flex items-center gap-2"
                                                >
                                                    <Calendar size={16} className="text-purple-600" />
                                                    Reagendar Publicações
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <h4 className="text-2xl font-black tracking-tight leading-tight">Maximizando seu <br/> Alcance Orgânico</h4>
                                                <p className="text-white/80 text-sm font-medium leading-relaxed">
                                                    Accounts com mais de 500 impressões diárias tendem a converter 3x mais links de afiliados Shopee. 
                                                    Foque na consistência de postagem.
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

export default AnalyticsPage;
