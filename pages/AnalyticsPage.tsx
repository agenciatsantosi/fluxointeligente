import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, CheckCircle, Package, Users, Calendar } from 'lucide-react';

const AnalyticsPage = () => {
    const [stats, setStats] = useState(null);
    const [sendsOverTime, setSendsOverTime] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [groupPerformance, setGroupPerformance] = useState([]);
    const [days, setDays] = useState(7);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAnalytics();
    }, [days]);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            // Load dashboard stats
            const dashboardRes = await api.get(`/analytics/dashboard?days=${days}`);
            if (dashboardRes.data.success) {
                setStats(dashboardRes.data.stats);
                setSendsOverTime(dashboardRes.data.sendsOverTime);
            }

            // Load top products
            const productsRes = await api.get(`/analytics/top-products?days=${days}&limit=10`);
            if (productsRes.data.success) {
                setTopProducts(productsRes.data.products);
            }

            // Load group performance
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

    const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Carregando analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl p-8 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">📊 Analytics Dashboard</h1>
                        <p className="text-white/80 mt-2">Acompanhe o desempenho das suas automações</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setDays(7)}
                            className={`px-4 py-2 rounded-lg font-medium transition ${days === 7 ? 'bg-white text-purple-600' : 'bg-white/20 hover:bg-white/30'}`}
                        >
                            7 dias
                        </button>
                        <button
                            onClick={() => setDays(30)}
                            className={`px-4 py-2 rounded-lg font-medium transition ${days === 30 ? 'bg-white text-purple-600' : 'bg-white/20 hover:bg-white/30'}`}
                        >
                            30 dias
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total de Envios</p>
                            <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalSends || 0}</p>
                        </div>
                        <div className="p-3 bg-purple-100 rounded-xl">
                            <Package className="text-purple-600" size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Comissão Total</p>
                            <p className="text-3xl font-bold text-green-600 mt-2">
                                R$ {(stats?.totalCommission || 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="p-3 bg-green-100 rounded-xl">
                            <DollarSign className="text-green-600" size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Taxa de Sucesso</p>
                            <p className="text-3xl font-bold text-blue-600 mt-2">
                                {(stats?.successRate || 100).toFixed(1)}%
                            </p>
                        </div>
                        <div className="p-3 bg-blue-100 rounded-xl">
                            <CheckCircle className="text-blue-600" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sends Over Time */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-purple-600" />
                        Envios ao Longo do Tempo
                    </h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={sendsOverTime}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} name="Envios" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Media Type Distribution */}
                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Distribuição de Mídia</h2>
                    {stats?.mediaTypes && stats.mediaTypes.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={stats.mediaTypes}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ media_type, count }: any) => `${media_type}: ${count}`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="count"
                                >
                                    {stats.mediaTypes.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-gray-400">
                            Nenhum dado disponível
                        </div>
                    )}
                </div>
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-purple-600" />
                    Top 10 Produtos Mais Enviados
                </h2>
                {topProducts.length > 0 ? (
                    <ResponsiveContainer width="100%" height={500}>
                        <BarChart
                            data={topProducts.map(p => ({
                                ...p,
                                // Truncate long names
                                display_name: p.product_name.length > 40
                                    ? p.product_name.substring(0, 40) + '...'
                                    : p.product_name
                            }))}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis
                                dataKey="display_name"
                                type="category"
                                width={250}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                                <p className="font-semibold text-sm mb-1">{data.product_name}</p>
                                                <p className="text-purple-600 font-bold">Envios: {data.send_count}</p>
                                                <p className="text-green-600 text-sm">Comissão: R$ {data.total_commission.toFixed(2)}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend />
                            <Bar dataKey="send_count" fill="#8b5cf6" name="Envios" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="text-center py-12 text-gray-400">
                        Nenhum produto enviado ainda
                    </div>
                )}
            </div>

            {/* Group Performance Table */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-purple-600" />
                    Performance por Grupo
                </h2>
                {groupPerformance.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Grupo</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Envios</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Comissão Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupPerformance.map((group, index) => (
                                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <div>
                                                <p className="font-medium text-gray-900">{group.group_name}</p>
                                                <p className="text-xs text-gray-500">{group.group_id}</p>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-gray-900">
                                            {group.total_sends}
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-green-600">
                                            R$ {(group.total_commission || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-400">
                        Nenhum grupo com envios ainda
                    </div>
                )}
            </div>
        </div>
    );
};

export default AnalyticsPage;
