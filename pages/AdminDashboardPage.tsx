import React, { useState, useEffect } from 'react';
import {
    Activity, Database, Users, Settings, FileText,
    TrendingUp, AlertCircle, CheckCircle, XCircle, Clock,
    Server, Wifi, RefreshCw,
    DollarSign, PieChart, Search, Filter, Edit, Trash2, Lock, Unlock, Eye, MoreVertical, X,
    Bot, MessageCircle, Facebook, Instagram, Twitter, Hash
} from 'lucide-react';
import axios from 'axios';

interface SystemStats {
    totalPosts: number;
    successRate: number;
    activeUsers: number;
    totalUsers: number;
    totalRevenue: number;
    apiCalls: number;
    databaseSize: string;
    uptime: string;
}

interface APIStatus {
    platform: string;
    status: 'ok' | 'warning' | 'error';
    lastCheck: string;
    successRate: number;
    dailyLimit: string;
    usedToday: number;
}

interface SubscriptionStats {
    byPlan: Array<{
        subscription_plan: string;
        count: number;
        revenue: number;
    }>;
    total: {
        count: number;
        revenue: number;
    };
}

interface User {
    id: number;
    email: string;
    name: string;
    subscription_plan: string;
    subscription_status: string;
    total_paid: number;
    created_at: string;
    is_blocked: boolean;
    phone?: string;
    document?: string;
    role?: string;
}

const AdminDashboardPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('visao-geral');
    const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
    const [apiStatuses, setApiStatuses] = useState<APIStatus[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats | null>(null);
    const [databaseStats, setDatabaseStats] = useState<any[]>([]);
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Advanced User Management State
    const [filters, setFilters] = useState({
        search: '',
        plan: 'all',
        status: 'all',
        blocked: 'false'
    });
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'details' | 'edit'>('details');

    // Automation Accounts State
    const [automationAccounts, setAutomationAccounts] = useState<any>({
        telegram: [],
        whatsapp: [],
        facebook: [],
        instagram: [],
        twitter: [],
        pinterest: []
    });

    useEffect(() => {
        loadDashboardData();

        if (autoRefresh) {
            const interval = setInterval(loadDashboardData, 30000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh, filters]); // Reload when filters change

    useEffect(() => {
        if (activeTab === 'contas-automacao') {
            loadAutomationAccounts();
        }
    }, [activeTab]);

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleToggleSetting = async (key: string, isEnabled: boolean) => {
        try {
            // We want to set it to the opposite of current state
            // If currently enabled, we want to disable (set to 'false')
            // If currently disabled, we want to enable (set to 'true')
            const newValue = !isEnabled;

            // Store as string 'true'/'false' to match database text column, or boolean
            // Let's stick to boolean in JSON, server handles string conversion if needed
            await axios.post('/api/admin/settings', { key, value: newValue });

            setSettings(prev => ({ ...prev, [key]: newValue }));

            // Optional: Force reload to ensure consistency
            // loadDashboardData();
        } catch (error) {
            console.error('Error toggling setting:', error);
            alert('Erro ao atualizar configuração');
        }
    };

    const handleSaveSetting = async (key: string, value: any) => {
        try {
            await axios.post('/api/admin/settings', { key, value });
            setSettings(prev => ({ ...prev, [key]: value }));
            alert('Configuração salva com sucesso!');
        } catch (error) {
            console.error('Error saving setting:', error);
            alert('Erro ao salvar configuração');
        }
    };

    const handleUserAction = async (action: 'block' | 'unblock' | 'delete' | 'reset_password', userId: number) => {
        try {
            if (action === 'delete' && !confirm('Tem certeza que deseja excluir este usuário?')) return;

            if (action === 'block') {
                await axios.post(`/api/admin/users/${userId}/status`, { blocked: true });
            } else if (action === 'unblock') {
                await axios.post(`/api/admin/users/${userId}/status`, { blocked: false });
            } else if (action === 'delete') {
                await axios.delete(`/api/admin/users/${userId}`);
            } else if (action === 'reset_password') {
                const newPassword = prompt('Digite a nova senha:');
                if (!newPassword) return;
                await axios.post(`/api/admin/users/${userId}/reset-password`, { password: newPassword });
            }

            loadDashboardData();
            alert('Ação realizada com sucesso!');
        } catch (error) {
            console.error('Erro na ação:', error);
            alert('Erro ao realizar ação');
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        try {
            await axios.put(`/api/admin/users/${selectedUser.id}`, selectedUser);
            loadDashboardData();
            setIsModalOpen(false);
            alert('Usuário atualizado com sucesso!');
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            alert('Erro ao atualizar usuário');
        }
    };

    const loadDashboardData = async () => {
        try {
            setLoading(true);

            const [statsRes, apiRes, usersRes, subStatsRes, settingsRes] = await Promise.all([
                axios.get('/api/admin/system-stats'),
                axios.get('/api/admin/api-health'),
                axios.get('/api/admin/users', { params: filters }),
                axios.get('/api/admin/subscription-stats'),
                axios.get('/api/admin/settings')
            ]);

            setSystemStats(statsRes.data);
            setApiStatuses(apiRes.data);

            const dbStatsRes = await axios.get('/api/admin/database-stats');
            setDatabaseStats(dbStatsRes.data.stats || []);

            // Ensure users is always an array
            const usersData = usersRes.data.users;
            setUsers(Array.isArray(usersData) ? usersData : []);

            setSubscriptionStats(subStatsRes.data.stats);

            if (settingsRes.data.success) {
                setSettings(settingsRes.data.settings);
            }

            setLoading(false);
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            setLoading(false);
        }
    };

    const loadAutomationAccounts = async () => {
        try {
            const [telegram, whatsapp, facebook, instagram, twitter, pinterest] = await Promise.all([
                axios.get('/api/telegram/groups').catch(() => ({ data: [] })),
                axios.get('/api/whatsapp/groups').catch(() => ({ data: { groups: [] } })),
                axios.get('/api/facebook/pages').catch(() => ({ data: { pages: [] } })),
                axios.get('/api/instagram/accounts').catch(() => ({ data: { accounts: [] } })),
                axios.get('/api/twitter/accounts').catch(() => ({ data: { accounts: [] } })),
                axios.get('/api/pinterest/boards').catch(() => ({ data: { boards: [] } }))
            ]);

            setAutomationAccounts({
                telegram: Array.isArray(telegram.data) ? telegram.data : [],
                whatsapp: whatsapp.data.groups || [],
                facebook: facebook.data.pages || [],
                instagram: instagram.data.accounts || [],
                twitter: twitter.data.accounts || [],
                pinterest: pinterest.data.boards || []
            });
        } catch (error) {
            console.error('Erro ao carregar contas de automação:', error);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'ok':
                return <CheckCircle className="text-green-500" size={20} />;
            case 'warning':
                return <AlertCircle className="text-yellow-500" size={20} />;
            case 'error':
                return <XCircle className="text-red-500" size={20} />;
            default:
                return <Clock className="text-gray-500" size={20} />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ok':
                return 'bg-green-100 text-green-800';
            case 'warning':
                return 'bg-yellow-100 text-yellow-800';
            case 'error':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getPlanBadgeColor = (plan: string) => {
        switch (plan) {
            case 'free':
                return 'bg-gray-100 text-gray-800';
            case 'pro':
                return 'bg-blue-100 text-blue-800';
            case 'enterprise':
                return 'bg-purple-100 text-purple-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getPlanName = (plan: string) => {
        switch (plan) {
            case 'free':
                return 'Gratuito';
            case 'pro':
                return 'Profissional';
            case 'enterprise':
                return 'Empresarial';
            default:
                return plan;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
            {/* Cabeçalho */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
                                <Server className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo</h1>
                                <p className="text-sm text-gray-500">Sistema de Controle MeliFlow</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={loadDashboardData}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                Atualizar
                            </button>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={autoRefresh}
                                    onChange={(e) => setAutoRefresh(e.target.checked)}
                                    className="rounded"
                                />
                                Auto-atualizar
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Abas de Navegação */}
                <div className="bg-white rounded-lg shadow-sm mb-6">
                    <div className="border-b border-gray-200">
                        <nav className="flex -mb-px">
                            {[
                                { id: 'visao-geral', label: 'Visão Geral', icon: Activity },
                                { id: 'usuarios', label: 'Usuários', icon: Users },
                                { id: 'contas-automacao', label: 'Contas de Automação', icon: Bot },
                                { id: 'assinaturas', label: 'Assinaturas', icon: DollarSign },
                                { id: 'apis', label: 'Status APIs', icon: Wifi },
                                { id: 'configuracoes', label: 'Configurações', icon: Settings },
                                { id: 'banco-dados', label: 'Banco de Dados', icon: Database },
                                { id: 'logs', label: 'Logs', icon: FileText },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm transition ${activeTab === tab.id
                                        ? 'border-purple-500 text-purple-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <tab.icon size={18} />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Aba: Visão Geral */}
                {activeTab === 'visao-geral' && (
                    <div className="space-y-6">
                        {/* Cards de Estatísticas */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Total de Posts (7 dias)</p>
                                        <p className="text-3xl font-bold text-gray-900">
                                            {systemStats?.totalPosts || 0}
                                        </p>
                                    </div>
                                    <TrendingUp className="text-blue-500" size={32} />
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Taxa de Sucesso</p>
                                        <p className="text-3xl font-bold text-gray-900">
                                            {systemStats?.successRate || 0}%
                                        </p>
                                    </div>
                                    <CheckCircle className="text-green-500" size={32} />
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Usuários Ativos</p>
                                        <p className="text-3xl font-bold text-gray-900">
                                            {systemStats?.activeUsers || 0} / {systemStats?.totalUsers || 0}
                                        </p>
                                    </div>
                                    <Users className="text-purple-500" size={32} />
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Receita Total</p>
                                        <p className="text-3xl font-bold text-gray-900">
                                            R$ {systemStats?.totalRevenue?.toFixed(2) || '0.00'}
                                        </p>
                                    </div>
                                    <DollarSign className="text-orange-500" size={32} />
                                </div>
                            </div>
                        </div>

                        {/* Saúde do Sistema */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Server size={20} />
                                Saúde do Sistema
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Database className="text-blue-500" size={20} />
                                        <span className="font-medium text-gray-700">Tamanho do Banco</span>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900">{systemStats?.databaseSize || '0 MB'}</p>
                                </div>

                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Clock className="text-green-500" size={20} />
                                        <span className="font-medium text-gray-700">Tempo Online</span>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900">{systemStats?.uptime || '0h'}</p>
                                </div>

                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Activity className="text-purple-500" size={20} />
                                        <span className="font-medium text-gray-700">Status</span>
                                    </div>
                                    <p className="text-2xl font-bold text-green-600">Online</p>
                                </div>
                            </div>
                        </div>

                        {/* Distribuição de Planos */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <PieChart size={20} />
                                Distribuição de Planos
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {subscriptionStats?.byPlan.map((plan) => (
                                    <div key={plan.subscription_plan} className="p-4 bg-gray-50 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-gray-700">
                                                {getPlanName(plan.subscription_plan)}
                                            </span>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${getPlanBadgeColor(plan.subscription_plan)}`}>
                                                {plan.count} usuários
                                            </span>
                                        </div>
                                        <p className="text-xl font-bold text-gray-900">
                                            R$ {plan.revenue?.toFixed(2) || '0.00'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Aba: Usuários */}
                {activeTab === 'usuarios' && (
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Users size={20} />
                                    Gerenciamento de Usuários
                                </h2>

                                <div className="flex flex-wrap gap-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Buscar usuário..."
                                            value={filters.search}
                                            onChange={(e) => handleFilterChange('search', e.target.value)}
                                            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    <select
                                        title="Filtrar por plano"
                                        value={filters.plan}
                                        onChange={(e) => handleFilterChange('plan', e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="all">Todos os Planos</option>
                                        <option value="free">Gratuito</option>
                                        <option value="pro">Profissional</option>
                                        <option value="enterprise">Empresarial</option>
                                    </select>

                                    <select
                                        title="Filtrar por status"
                                        value={filters.status}
                                        onChange={(e) => handleFilterChange('status', e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="all">Todos os Status</option>
                                        <option value="active">Ativo</option>
                                        <option value="inactive">Inativo</option>
                                        <option value="cancelled">Cancelado</option>
                                    </select>

                                    <select
                                        title="Filtrar por bloqueio"
                                        value={filters.blocked}
                                        onChange={(e) => handleFilterChange('blocked', e.target.value)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="false">Normais</option>
                                        <option value="true">Bloqueados</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuário</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plano</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Função</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Pago</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cadastro</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {users.map((user) => (
                                        <tr key={user.id} className={`hover:bg-gray-50 ${user.is_blocked ? 'bg-red-50' : ''}`}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="flex-shrink-0 h-10 w-10">
                                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${user.is_blocked ? 'bg-red-500' : 'bg-purple-500'}`}>
                                                            {user.name?.substring(0, 2).toUpperCase() || 'US'}
                                                        </div>
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {user.name}
                                                            {user.is_blocked && <span className="ml-2 text-xs text-red-600 font-bold">(BLOQUEADO)</span>}
                                                        </div>
                                                        <div className="text-sm text-gray-500">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getPlanBadgeColor(user.subscription_plan)}`}>
                                                    {getPlanName(user.subscription_plan)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-bold rounded ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                                                    {user.role === 'admin' ? 'ADMIN' : 'USUÁRIO'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.subscription_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {user.subscription_status === 'active' ? 'Ativo' : 'Inativo'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                R$ {user.total_paid?.toFixed(2) || '0.00'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => { setSelectedUser(user); setIsModalOpen(true); }}
                                                        className="text-blue-600 hover:text-blue-900 p-1"
                                                        title="Ver Detalhes"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleUserAction(user.is_blocked ? 'unblock' : 'block', user.id)}
                                                        className={`${user.is_blocked ? 'text-green-600 hover:text-green-900' : 'text-orange-600 hover:text-orange-900'} p-1`}
                                                        title={user.is_blocked ? 'Desbloquear' : 'Bloquear'}
                                                    >
                                                        {user.is_blocked ? <Unlock size={18} /> : <Lock size={18} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUserAction('reset_password', user.id)}
                                                        className="text-gray-600 hover:text-gray-900 p-1"
                                                        title="Resetar Senha"
                                                    >
                                                        <RefreshCw size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleUserAction('delete', user.id)}
                                                        className="text-red-600 hover:text-red-900 p-1"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Aba: Status APIs */}
                {activeTab === 'apis' && (
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Wifi size={20} />
                                Monitor de Saúde das APIs
                            </h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Plataforma
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Última Verificação
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Taxa de Sucesso
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Limite Diário
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Usado Hoje
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {apiStatuses.map((api) => (
                                        <tr key={api.platform} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    {getStatusIcon(api.status)}
                                                    <span className="font-medium text-gray-900">{api.platform}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(api.status)}`}>
                                                    {api.status === 'ok' ? 'OK' : api.status === 'warning' ? 'AVISO' : 'ERRO'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {api.lastCheck}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {api.successRate}%
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {api.dailyLimit}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {api.usedToday}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Aba: Configurações */}
                {activeTab === 'configuracoes' && (
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Settings size={20} />
                                Configurações do Sistema
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Ative ou desative funcionalidades globais do sistema.
                            </p>
                        </div>

                        <div className="p-6">
                            <h3 className="text-md font-bold text-gray-800 mb-4">Controle de Menu (Funcionalidades)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { id: 'menu_shopee_affiliate', label: 'Shopee Afiliado' },
                                    { id: 'menu_shopee_video', label: 'Shopee Vídeo' },
                                    { id: 'menu_whatsapp_automation', label: 'Automação WhatsApp' },
                                    { id: 'menu_telegram_automation', label: 'Automação Telegram' },
                                    { id: 'menu_facebook_automation', label: 'Automação Facebook' },
                                    { id: 'menu_instagram_automation', label: 'Automação Instagram' },
                                    { id: 'menu_twitter_automation', label: 'Automação Twitter' },
                                    { id: 'menu_pinterest_automation', label: 'Automação Pinterest' },
                                ].map((item) => {
                                    // Default to true if not set (undefined) or explicitly true
                                    const isEnabled = settings[item.id] !== 'false' && settings[item.id] !== false;

                                    return (
                                        <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <span className="font-medium text-gray-700">{item.label}</span>
                                            <button
                                                onClick={() => handleToggleSetting(item.id, isEnabled)}
                                                title={isEnabled ? 'Desativar' : 'Ativar'}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${isEnabled ? 'bg-purple-600' : 'bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-8 pt-8 border-t border-gray-200">
                                <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <Bot size={20} className="text-blue-500" />
                                    Ponte de Vídeo (Telegram Bridge)
                                </h3>
                                <p className="text-sm text-gray-600 mb-6">
                                    Use um canal privado do Telegram como servidor temporário para uploads de vídeo no Instagram/Facebook. 
                                    Isso resolve erros de timeout e conectividade da VPS com a Meta.
                                </p>

                                <div className="space-y-6 max-w-2xl">
                                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-100">
                                        <div>
                                            <p className="font-bold text-blue-900">Ativar Ponte de Vídeo</p>
                                            <p className="text-xs text-blue-700">Roteia vídeos através do Telegram antes de postar</p>
                                        </div>
                                        <button
                                            onClick={() => handleToggleSetting('telegram_bridge_enabled', settings['telegram_bridge_enabled'] === 'true' || settings['telegram_bridge_enabled'] === true)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                (settings['telegram_bridge_enabled'] === 'true' || settings['telegram_bridge_enabled'] === true) ? 'bg-blue-600' : 'bg-gray-300'
                                            }`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                (settings['telegram_bridge_enabled'] === 'true' || settings['telegram_bridge_enabled'] === true) ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Bot Token</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="password"
                                                    placeholder="123456789:ABCDEF..."
                                                    defaultValue={settings['telegram_bridge_bot_token'] || ''}
                                                    onBlur={(e) => handleSaveSetting('telegram_bridge_bot_token', e.target.value)}
                                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">ID do Canal/Chat (Bridge)</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text"
                                                    placeholder="-100123456789"
                                                    defaultValue={settings['telegram_bridge_chat_id'] || ''}
                                                    onBlur={(e) => handleSaveSetting('telegram_bridge_chat_id', e.target.value)}
                                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 italic">
                                                Dica: O Bot deve ser administrador do canal.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Aba: Contas de Automação */}
                {activeTab === 'contas-automacao' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-200">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Bot size={20} />
                                    Contas de Automação Conectadas
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Visualize todas as contas conectadas em cada plataforma de automação
                                </p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Telegram */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Bot className="text-blue-600" size={20} />
                                            <h3 className="font-bold text-gray-800">Telegram</h3>
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                                {automationAccounts.telegram.length} grupos
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {automationAccounts.telegram.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Nenhum grupo conectado</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {automationAccounts.telegram.map((group: any) => (
                                                    <div key={group.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className={`w-2 h-2 rounded-full ${group.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">{group.name}</p>
                                                            <p className="text-xs text-gray-500">ID: {group.id}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* WhatsApp */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-green-50 px-4 py-3 border-b border-green-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <MessageCircle className="text-green-600" size={20} />
                                            <h3 className="font-bold text-gray-800">WhatsApp</h3>
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                                                {automationAccounts.whatsapp.length} grupos
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {automationAccounts.whatsapp.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Nenhum grupo conectado</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {automationAccounts.whatsapp.map((group: any) => (
                                                    <div key={group.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className={`w-2 h-2 rounded-full ${group.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">{group.name}</p>
                                                            <p className="text-xs text-gray-500">ID: {group.id}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Facebook */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Facebook className="text-blue-600" size={20} />
                                            <h3 className="font-bold text-gray-800">Facebook</h3>
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                                {automationAccounts.facebook.length} páginas
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {automationAccounts.facebook.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Nenhuma página conectada</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {automationAccounts.facebook.map((page: any) => (
                                                    <div key={page.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className={`w-2 h-2 rounded-full ${page.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">{page.name}</p>
                                                            <p className="text-xs text-gray-500">ID: {page.id}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Instagram */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-pink-50 px-4 py-3 border-b border-pink-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Instagram className="text-pink-600" size={20} />
                                            <h3 className="font-bold text-gray-800">Instagram</h3>
                                            <span className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs font-bold">
                                                {automationAccounts.instagram.length} contas
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {automationAccounts.instagram.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Nenhuma conta conectada</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {automationAccounts.instagram.map((account: any) => (
                                                    <div key={account.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">{account.username || account.name}</p>
                                                            <p className="text-xs text-gray-500">ID: {account.account_id || account.id}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Twitter */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-sky-50 px-4 py-3 border-b border-sky-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Twitter className="text-sky-600" size={20} />
                                            <h3 className="font-bold text-gray-800">Twitter/X</h3>
                                            <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-xs font-bold">
                                                {automationAccounts.twitter.length} contas
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {automationAccounts.twitter.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Nenhuma conta conectada</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {automationAccounts.twitter.map((account: any) => (
                                                    <div key={account.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">@{account.username}</p>
                                                            <p className="text-xs text-gray-500">Adicionado em {new Date(account.addedAt).toLocaleDateString('pt-BR')}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Pinterest */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Hash className="text-red-600" size={20} />
                                            <h3 className="font-bold text-gray-800">Pinterest</h3>
                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                                                {automationAccounts.pinterest.length} boards
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {automationAccounts.pinterest.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Nenhum board conectado</p>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {automationAccounts.pinterest.map((board: any) => (
                                                    <div key={board.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                        <div className={`w-2 h-2 rounded-full ${board.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate text-sm">{board.name}</p>
                                                            <p className="text-xs text-gray-500">ID: {board.id}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary Card */}
                        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-100">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <TrendingUp className="text-purple-600" size={20} />
                                Resumo das Contas
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-600">{automationAccounts.telegram.length}</div>
                                    <div className="text-xs text-gray-600 font-medium">Telegram</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-600">{automationAccounts.whatsapp.length}</div>
                                    <div className="text-xs text-gray-600 font-medium">WhatsApp</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-600">{automationAccounts.facebook.length}</div>
                                    <div className="text-xs text-gray-600 font-medium">Facebook</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-pink-600">{automationAccounts.instagram.length}</div>
                                    <div className="text-xs text-gray-600 font-medium">Instagram</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-sky-600">{automationAccounts.twitter.length}</div>
                                    <div className="text-xs text-gray-600 font-medium">Twitter</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-red-600">{automationAccounts.pinterest.length}</div>
                                    <div className="text-xs text-gray-600 font-medium">Pinterest</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Aba: Assinaturas */}
                {activeTab === 'assinaturas' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <DollarSign className="text-orange-500" size={24} />
                                Visão Geral de Receita
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {subscriptionStats?.byPlan.map((plan) => (
                                    <div key={plan.subscription_plan} className="p-6 bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-xl shadow-sm">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPlanBadgeColor(plan.subscription_plan)} uppercase tracking-wider`}>
                                                {getPlanName(plan.subscription_plan)}
                                            </span>
                                            <span className="text-gray-400 font-bold">{plan.count}</span>
                                        </div>
                                        <div className="text-3xl font-black text-gray-900 mb-1">
                                            R$ {plan.revenue?.toFixed(2) || '0.00'}
                                        </div>
                                        <div className="text-xs text-gray-500 font-medium uppercase tracking-widest">Receita Acumulada</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Ações Rápidas</h2>
                            <p className="text-gray-500 mb-4 italic text-sm">Use o Gerenciamento de Usuários para alterar planos ou resetar senhas.</p>
                        </div>
                    </div>
                )}

                {/* Aba: Banco de Dados */}
                {activeTab === 'banco-dados' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {databaseStats.map((stat) => (
                                <div key={stat.table} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-purple-200 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                            <Database size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 truncate uppercase tracking-tighter text-sm">{stat.table}</h4>
                                            <p className="text-2xl font-black text-purple-600">{stat.count.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium">Registros</div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded shadow-sm">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="text-yellow-600" size={24} />
                                <div>
                                    <h4 className="font-bold text-yellow-800">Aviso de Performance</h4>
                                    <p className="text-sm text-yellow-700">Tabelas com mais de 100.000 registros podem afetar a performance do sistema. Considere arquivar logs antigos.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Outras abas - placeholder */}
                {!['visao-geral', 'usuarios', 'contas-automacao', 'apis', 'configuracoes', 'assinaturas', 'banco-dados'].includes(activeTab) && (
                    <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                            <Settings className="text-gray-400" size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            Seção em Desenvolvimento
                        </h3>
                        <p className="text-gray-500">
                            Esta funcionalidade estará disponível em breve!
                        </p>
                    </div>
                )}

                {/* Modal de Detalhes/Edição */}
                {isModalOpen && selectedUser && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900">
                                    {modalMode === 'details' ? 'Detalhes do Usuário' : 'Editar Usuário'}
                                </h2>
                                <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700" title="Fechar modal">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateUser} className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                        <input
                                            title="Nome do usuário"
                                            type="text"
                                            value={selectedUser.name}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                        <input
                                            title="Email do usuário"
                                            type="email"
                                            value={selectedUser.email}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                                        <input
                                            type="text"
                                            value={selectedUser.phone || ''}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, phone: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Documento (CPF/CNPJ)</label>
                                        <input
                                            title="Documento do usuário"
                                            type="text"
                                            value={selectedUser.document || ''}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, document: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                                        <select
                                            title="Plano de assinatura"
                                            value={selectedUser.subscription_plan}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, subscription_plan: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        >
                                            <option value="free">Gratuito</option>
                                            <option value="pro">Profissional</option>
                                            <option value="enterprise">Empresarial</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Status da Assinatura</label>
                                        <select
                                            title="Status da assinatura"
                                            value={selectedUser.subscription_status}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, subscription_status: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        >
                                            <option value="active">Ativo</option>
                                            <option value="inactive">Inativo</option>
                                            <option value="cancelled">Cancelado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Função (Role)</label>
                                        <select
                                            title="Função do usuário"
                                            value={selectedUser.role || 'user'}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-bold"
                                        >
                                            <option value="user">Usuário Comum</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-6 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                                    >
                                        Salvar Alterações
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboardPage;
