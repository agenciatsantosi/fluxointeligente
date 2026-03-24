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
    Bot
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

const ModernDashboard: React.FC = () => {
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
            <div className="bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-3xl p-8 text-white shadow-2xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-4xl font-bold mb-2">🚀 FluxoInteligente Auto Publisher</h2>
                        <p className="text-purple-100 text-lg">Sistema Completo de Automação Multi-Plataforma</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={loadDashboardData}
                            className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-lg border border-white/30 rounded-lg text-white hover:bg-white/30 transition-all shadow-lg"
                        >
                            <Calendar size={18} />
                            <span>Últimos 7 dias</span>
                        </button>
                        <button
                            onClick={loadDashboardData}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-purple-50 transition-all shadow-lg font-bold"
                        >
                            <Download size={18} />
                            <span>Atualizar Dados</span>
                        </button>
                    </div>
                </div>

                {/* Feature Overview Cards with Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                            <MessageCircle size={24} className="text-green-300" />
                            <h4 className="font-bold text-white">WhatsApp</h4>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.whatsappSends}</p>
                        <p className="text-sm text-purple-100">mensagens enviadas</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                            <Send size={24} className="text-blue-300" />
                            <h4 className="font-bold text-white">Telegram</h4>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.telegramSends}</p>
                        <p className="text-sm text-purple-100">mensagens enviadas</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                            <Facebook size={24} className="text-blue-400" />
                            <h4 className="font-bold text-white">Facebook</h4>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.facebookSends}</p>
                        <p className="text-sm text-purple-100">mensagens enviadas</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all">
                        <div className="flex items-center gap-3 mb-2">
                            <Instagram size={24} className="text-pink-300" />
                            <h4 className="font-bold text-white">Instagram</h4>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.instagramVideos}</p>
                        <p className="text-sm text-purple-100">vídeos na fila</p>
                    </div>
                </div>

                {/* Quick Stats Row */}
                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/20">
                    <div className="text-center">
                        <p className="text-3xl font-bold text-white">{stats.totalSends}</p>
                        <p className="text-sm text-purple-100 mt-1">Total de Envios</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-white">{stats.activeSchedules}</p>
                        <p className="text-sm text-purple-100 mt-1">Agendamentos Ativos</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-white">{stats.successRate.toFixed(1)}%</p>
                        <p className="text-sm text-purple-100 mt-1">Taxa de Sucesso</p>
                    </div>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { title: 'Total de Envios', value: stats.totalSends.toString(), change: '+100%', trend: 'up', icon: Send, color: 'text-green-600', bg: 'bg-green-100' },
                    { title: 'Agendamentos Ativos', value: stats.activeSchedules.toString(), change: 'Em execução', trend: 'up', icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-100' },
                    { title: 'Fila Instagram', value: stats.instagramVideos.toString(), change: 'Vídeos', trend: 'down', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-100' },
                    { title: 'Taxa de Sucesso', value: `${stats.successRate.toFixed(1)}%`, change: 'Performance', trend: 'up', icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-100' },
                ].map((metric, index) => (
                    <div key={index} className="bg-white/70 backdrop-blur-lg border border-white/20 p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 group">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${metric.bg} ${metric.color} group-hover:scale-110 transition-transform duration-300`}>
                                <metric.icon size={24} />
                            </div>
                            <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full ${metric.trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {metric.trend === 'up' ? <ArrowUpRight size={14} /> : <MoreHorizontal size={14} />}
                                {metric.change}
                            </div>
                        </div>
                        <h3 className="text-gray-500 text-sm font-medium">{metric.title}</h3>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{metric.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Chart */}
                <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl border border-white/20 p-6 rounded-3xl shadow-lg">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">Volume de Envios</h3>
                            <p className="text-sm text-gray-500">Telegram vs WhatsApp (Simulado)</p>
                        </div>
                    </div>
                    <div className="h-80">
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
                <div className="bg-white/80 backdrop-blur-xl border border-white/20 p-6 rounded-3xl shadow-lg">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">Por Canal</h3>
                            <p className="text-sm text-gray-500">Distribuição de envios</p>
                        </div>
                    </div>
                    <div className="h-80">
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

            {/* Recent Activity Table */}
            <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl shadow-lg overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Logs Recentes</h3>
                        <p className="text-sm text-gray-500">Últimas ações do sistema</p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ação</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Canal</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {recentLogs.length > 0 ? recentLogs.map((log, index) => (
                                <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-lg">
                                                {log.platform === 'telegram' ? '✈️' : log.platform === 'whatsapp' ? '💬' : '🤖'}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{log.action}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600 capitalize">{log.platform}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${log.status === 'success' ? 'bg-green-100 text-green-700 border border-green-200' :
                                            log.status === 'error' ? 'bg-red-100 text-red-700 border border-red-200' :
                                                'bg-blue-100 text-blue-700 border border-blue-200'
                                            }`}>
                                            {log.status === 'success' ? 'Sucesso' : log.status === 'error' ? 'Erro' : 'Info'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        Nenhum log recente encontrado.
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

export default ModernDashboard;
