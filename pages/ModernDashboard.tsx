import React, { useEffect, useState } from 'react';
import api from '../services/api';
import {
    TrendingUp,
    Users,
    ShoppingBag,
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    MoreHorizontal,
    Calendar,
    Filter,
    Download,
    MessageCircle,
    Send,
    Facebook,
    Instagram,
    Bot,
    Zap
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts';

interface ModernDashboardProps {
    setActiveTab: (tab: string) => void;
}

const ModernDashboard: React.FC<ModernDashboardProps> = ({ setActiveTab }) => {
    const [stats, setStats] = useState({
        totalSends: 0,
        whatsappSends: 0,
        telegramSends: 0,
        facebookSends: 0,
        instagramVideos: 0,
        activeSchedules: 0,
        successRate: 0
    });
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Mock chart data (placeholder until we have real historical data endpoint)
    const chartData = [
        { name: 'Seg', value: stats.telegramSends, sales: stats.whatsappSends },
        { name: 'Ter', value: stats.telegramSends + 2, sales: stats.whatsappSends + 1 },
        { name: 'Qua', value: stats.telegramSends + 5, sales: stats.whatsappSends + 3 },
        { name: 'Qui', value: stats.telegramSends + 1, sales: stats.whatsappSends + 4 },
        { name: 'Sex', value: stats.telegramSends + 3, sales: stats.whatsappSends + 2 },
        { name: 'Sáb', value: stats.telegramSends + 6, sales: stats.whatsappSends + 5 },
        { name: 'Dom', value: stats.telegramSends + 4, sales: stats.whatsappSends + 3 },
    ];

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            // Load analytics stats
            const analyticsRes = await api.get('/analytics/dashboard?days=7');
            if (analyticsRes.data.success) {
                setStats(prev => ({
                    ...prev,
                    totalSends: analyticsRes.data.stats.totalSends || 0,
                    whatsappSends: analyticsRes.data.stats.whatsappSends || 0,
                    telegramSends: analyticsRes.data.stats.telegramSends || 0,
                    facebookSends: analyticsRes.data.stats.facebookSends || 0,
                    successRate: analyticsRes.data.stats.successRate || 0
                }));
            }

            // Load Instagram videos count
            const instagramRes = await api.get(`/instagram/queue?status=pending&_t=${Date.now()}`);
            if (instagramRes.data.success) {
                setStats(prev => ({
                    ...prev,
                    instagramVideos: instagramRes.data.queue.filter((v: any) => v.status === 'pending').length
                }));
            }

            // Load active schedules count
            const schedulesRes = await api.get('/schedules');
            if (schedulesRes.data.success) {
                setStats(prev => ({
                    ...prev,
                    activeSchedules: schedulesRes.data.schedules.filter((s: any) => s.active).length
                }));
            }

            // Load recent logs
            const logsRes = await api.get('/logs?limit=5');
            if (logsRes.data.success) {
                setRecentLogs(logsRes.data.logs);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Enhanced Header Section */}
            {/* Professional Hero Section */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-700 to-pink-600 rounded-[2.5rem] p-6 md:p-10 text-white shadow-2xl shadow-purple-200/50">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-400/20 rounded-full blur-3xl -ml-10 -mb-10 animate-pulse delay-700"></div>

                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-8 text-center lg:text-left">
                    <div className="flex flex-col items-center lg:items-start">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl flex items-center justify-center shadow-lg">
                                <Zap className="text-white w-6 h-6 fill-white" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-100 opacity-80">Workspace v2.1</span>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black mb-3 tracking-tight">Fluxo<span className="text-pink-300">Inteligente</span></h2>
                        <p className="text-purple-100/80 text-sm md:text-lg font-medium max-w-md">Automação de alta performance para o seu negócio.</p>
                    </div>

                    <div className="flex gap-3 w-full lg:w-auto">
                        <button
                            onClick={loadDashboardData}
                            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl text-white hover:bg-white/25 transition-all active:scale-95 text-sm font-bold"
                        >
                            <Calendar size={18} />
                            <span>Relatórios</span>
                        </button>
                        <button
                            onClick={loadDashboardData}
                            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-600 rounded-2xl hover:bg-white/90 transition-all shadow-xl active:scale-95 text-sm font-bold"
                        >
                            <Download size={18} />
                            <span>Atualizar</span>
                        </button>
                    </div>
                </div>

                {/* Feature Overview Cards with Stats */}
                {/* Platform Quick Cards - Professional Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-10">
                    {[
                        { icon: MessageCircle, label: 'WhatsApp', value: stats.whatsappSends, color: 'text-green-300' },
                        { icon: Send, label: 'Telegram', value: stats.telegramSends, color: 'text-blue-300' },
                        { icon: Facebook, label: 'Facebook', value: stats.facebookSends, color: 'text-blue-400' },
                        { icon: Instagram, label: 'Instagram', value: stats.instagramVideos, color: 'text-pink-300' },
                        { icon: Download, label: 'Downloader', value: 'Elite', color: 'text-purple-300', action: () => setActiveTab('downloader') }
                    ].map((item, idx) => (
                        <div 
                            key={idx}
                            onClick={item.action}
                            className={`bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 transition-all hover:bg-white/20 ${item.action ? 'cursor-pointer active:scale-95' : ''}`}
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <item.icon size={16} className={item.color} />
                                <span className="text-[10px] font-bold text-white/70 uppercase tracking-tighter">{item.label}</span>
                            </div>
                            <p className="text-xl font-black text-white">{item.value}</p>
                        </div>
                    ))}
                </div>

                {/* Quick Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-white/20">
                    <div className="text-center sm:text-left">
                        <p className="text-2xl md:text-3xl font-bold text-white">{stats.totalSends}</p>
                        <p className="text-[10px] md:text-xs text-purple-100 uppercase tracking-wider font-semibold">Total de Envios</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl md:text-3xl font-bold text-white">{stats.activeSchedules}</p>
                        <p className="text-[10px] md:text-xs text-purple-100 uppercase tracking-wider font-semibold">Agendamentos</p>
                    </div>
                    <div className="text-center sm:text-right">
                        <p className="text-2xl md:text-3xl font-bold text-white">{stats.successRate.toFixed(1)}%</p>
                        <p className="text-[10px] md:text-xs text-purple-100 uppercase tracking-wider font-semibold">Taxa de Sucesso</p>
                    </div>
                </div>
            </div>

            {/* Metrics Cards - Enhanced Design */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { title: 'Total Envia', value: stats.totalSends, change: '+12%', trend: 'up', icon: Send, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { title: 'Agendados', value: stats.activeSchedules, change: 'Ativos', trend: 'up', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { title: 'Fila Reel', value: stats.instagramVideos, change: 'Vídeos', trend: 'down', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
                    { title: 'Taxa Suces', value: `${stats.successRate.toFixed(1)}%`, change: 'Peak', trend: 'up', icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
                ].map((metric, index) => (
                    <div key={index} className="bg-white border border-gray-100 p-5 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-500 group overflow-hidden relative">
                        <div className="absolute -right-2 -top-2 w-12 h-12 bg-gray-50 rounded-full group-hover:scale-[3] transition-transform duration-700"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-4">
                                <div className={`p-2.5 rounded-2xl ${metric.bg} ${metric.color} shadow-sm`}>
                                    <metric.icon size={20} />
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{metric.change}</span>
                            </div>
                            <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{metric.title}</h3>
                            <p className="text-2xl font-black text-gray-900 mt-1">{metric.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <div className="lg:col-span-2 bg-white border border-gray-100 p-6 rounded-[2.5rem] shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight">Volume de Envios</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Performance Semanal</p>
                        </div>
                    </div>
                    <div className="h-64 md:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#8b5cf6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorValue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Secondary Chart */}
                <div className="bg-white border border-gray-100 p-6 rounded-[2.5rem] shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-black text-gray-900 tracking-tight">Canais</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Distribuição</p>
                        </div>
                    </div>
                    <div className="h-64 md:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { name: 'Telegram', value: stats.telegramSends },
                                { name: 'WhatsApp', value: stats.whatsappSends },
                                { name: 'Facebook', value: stats.facebookSends },
                                { name: 'Instagram', value: stats.instagramVideos }
                            ]}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af' }} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Bar dataKey="value" fill="#ec4899" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Recent Activity Section */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Atividade Recente</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monitoramento em tempo real</p>
                    </div>
                </div>

                {/* Mobile: Activity Cards */}
                <div className="md:hidden divide-y divide-gray-50">
                    {recentLogs.length > 0 ? recentLogs.map((log, index) => (
                        <div key={index} className="p-5 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-xl shadow-sm">
                                {log.platform === 'telegram' ? '✈️' : log.platform === 'whatsapp' ? '💬' : '🤖'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{log.action}</p>
                                <p className="text-[10px] text-gray-400 font-medium">{new Date(log.timestamp).toLocaleString('pt-BR')}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                                log.status === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                            }`}>
                                {log.status === 'success' ? 'OK' : 'Error'}
                            </span>
                        </div>
                    )) : (
                        <div className="p-10 text-center text-gray-400 text-sm">Sem logs recentes</div>
                    )}
                </div>

                {/* Desktop: Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Ação</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Canal</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {recentLogs.map((log, index) => (
                                <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-lg shadow-sm">
                                                {log.platform === 'telegram' ? '✈️' : log.platform === 'whatsapp' ? '💬' : '🤖'}
                                            </div>
                                            <p className="font-bold text-gray-900">{log.action}</p>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className="text-sm font-semibold text-gray-600 capitalize px-3 py-1 bg-gray-100 rounded-lg">{log.platform}</span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                            log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {log.status === 'success' ? 'Sucesso' : 'Erro'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-sm font-medium text-gray-400">
                                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ModernDashboard;
