import React, { useState, useEffect } from 'react';
import {
    Activity, Database, Users, Settings, FileText,
    TrendingUp, AlertCircle, CheckCircle, XCircle, Clock,
    Server, Wifi, RefreshCw,
    DollarSign, PieChart, Search, Filter, Edit, Trash2, Lock, Unlock, Eye, MoreVertical, X,
    Bot, MessageCircle, Facebook, Instagram, Twitter, Hash, Globe, MousePointer2
} from 'lucide-react';
import axios from 'axios';

// New Premium Components
import Sidebar from '../components/admin/Sidebar';
import Header from '../components/admin/Header';
import StatsCard from '../components/admin/StatsCard';
import AdminChart from '../components/admin/AdminChart';
import DataTable from '../components/admin/DataTable';

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
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
        <div className="min-h-screen bg-[#0A0E27] text-[#F9FAFB] font-display selection:bg-[#6366F1]/30">
            {/* New Premium Sidebar */}
            <Sidebar 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                isOpen={isSidebarOpen} 
                setIsOpen={setIsSidebarOpen} 
            />

            {/* Main Content Area */}
            <div className={`transition-all duration-300 min-h-screen flex flex-col ${isSidebarOpen ? 'lg:pl-[280px]' : 'lg:pl-[80px]'}`}>
                
                {/* New Premium Header */}
                <Header 
                    loading={loading} 
                    onRefresh={loadDashboardData} 
                    autoRefresh={autoRefresh} 
                    setAutoRefresh={setAutoRefresh} 
                />

                <main className="flex-1 p-8 lg:p-12 animate-page-load">
                    
                    {/* Page Title Section */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                        <div>
                            <h2 className="text-4xl font-black tracking-tight text-white mb-2">
                                {activeTab.replace('-', ' ').toUpperCase()}
                            </h2>
                            <p className="text-[#9CA3AF] font-medium flex items-center gap-2">
                                <Globe size={16} className="text-[#6366F1]" />
                                Painel Administrativo • MeliFlow v2.0 Premium
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <div className="px-4 py-2 bg-[#1E2139] border border-[#6366F1]/20 rounded-xl flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                                <span className="text-xs font-bold uppercase tracking-wider text-[#E5E7EB]">Sistemas Operacionais</span>
                            </div>
                        </div>
                    </div>

                {/* Aba: Visão Geral */}
                {activeTab === 'visao-geral' && (
                    <div className="space-y-12">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatsCard 
                                label="Total de Posts (7d)" 
                                value={systemStats?.totalPosts || 0} 
                                icon={Activity}
                                trend={12}
                                variant="primary"
                            />
                            <StatsCard 
                                label="Taxa de Sucesso" 
                                value={`${systemStats?.successRate || 0}%`} 
                                icon={CheckCircle}
                                trend={5}
                                variant="success"
                            />
                            <StatsCard 
                                label="Usuários Ativos" 
                                value={systemStats?.activeUsers || 0} 
                                description={`De um total de ${systemStats?.totalUsers || 0}`}
                                icon={Users}
                                variant="warning"
                            />
                            <StatsCard 
                                label="Receita Total" 
                                value={`R$ ${systemStats?.totalRevenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}`} 
                                icon={DollarSign}
                                trend={8}
                                variant="danger"
                            />
                        </div>

                        {/* Main Growth Chart */}
                        <AdminChart 
                            title="Crescimento da Plataforma" 
                            subtitle="Volume de postagens e interações nos últimos 30 dias"
                            data={[
                                { name: 'Seg', value: 400 },
                                { name: 'Ter', value: 600 },
                                { name: 'Qua', value: 800 },
                                { name: 'Qui', value: 500 },
                                { name: 'Sex', value: 900 },
                                { name: 'Sab', value: 1100 },
                                { name: 'Dom', value: 1300 },
                            ]}
                        />

                        {/* System Health Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2">
                                <div className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-8 h-full">
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <MousePointer2 size={20} className="text-[#6366F1]" />
                                        Atividade Recente
                                    </h3>
                                    <div className="space-y-6">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div key={i} className="flex items-center gap-4 p-4 bg-[#0A0E27]/40 rounded-2xl border border-[#6366F1]/5 hover:border-[#6366F1]/20 transition-all cursor-pointer group">
                                                <div className="w-10 h-10 rounded-xl bg-[#6366F1]/10 flex items-center justify-center text-[#6366F1] group-hover:bg-[#6366F1] group-hover:text-white transition-all">
                                                    <Activity size={18} />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-[#F9FAFB]">Novo upload de vídeo processado</p>
                                                    <p className="text-xs text-[#9CA3AF]">Há 5 minutos • Shopee Video Bridge</p>
                                                </div>
                                                <div className="text-xs font-bold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full">SUCESSO</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gradient-to-br from-[#6366F1] to-[#764BA2] rounded-3xl p-8 text-white shadow-2xl shadow-indigo-500/20">
                                    <h4 className="text-lg font-bold mb-2">Performance do Banco</h4>
                                    <p className="text-4xl font-black mb-6">{systemStats?.databaseSize || '0 MB'}</p>
                                    <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                                        <div className="bg-white h-full w-[65%]" />
                                    </div>
                                    <p className="text-xs font-bold mt-4 opacity-80 uppercase tracking-widest">Otimizado • {systemStats?.uptime}</p>
                                </div>

                                <div className="bg-[#1E2139]/80 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-8">
                                    <h4 className="text-white font-bold mb-4">Uptime Global</h4>
                                    <div className="flex items-end gap-1 h-12">
                                        {[...Array(20)].map((_, i) => (
                                            <div 
                                                key={i} 
                                                className={`w-full rounded-full ${i === 15 ? 'bg-amber-500 h-8' : i === 18 ? 'bg-red-500 h-6' : 'bg-emerald-500 h-12'} opacity-80 hover:opacity-100 transition-opacity`} 
                                                title="99.9% Uptime"
                                            />
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-[#9CA3AF] mt-4 font-bold uppercase tracking-tighter">Status de Rede: EXCELENTE</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Aba: Usuários */}
                {activeTab === 'usuarios' && (
                    <div className="space-y-8">
                        <DataTable 
                            title="Gerenciamento de Usuários"
                            columns={['Name', 'Email', 'Plan', 'Status']}
                            data={users.map(u => ({
                              name: (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[#6366F1]/20 flex items-center justify-center text-[#6366F1] font-bold text-xs">
                                        {u.name?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-[#F9FAFB]">{u.name}</p>
                                        <p className="text-[10px] text-[#9CA3AF] uppercase tracking-tighter">{u.role}</p>
                                    </div>
                                </div>
                              ),
                              email: u.email,
                              plan: (
                                <span className="px-3 py-1 bg-[#6366F1]/10 border border-[#6366F1]/20 text-[#A78BFA] text-[10px] font-black rounded-full uppercase">
                                    {getPlanName(u.subscription_plan)}
                                </span>
                              ),
                              status: (
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${u.subscription_status === 'active' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                    {u.subscription_status}
                                </span>
                              )
                            }))}
                            onView={(item) => {
                                const user = users.find(u => u.email === item.email);
                                if (user) { setSelectedUser(user); setIsModalOpen(true); }
                            }}
                            onEdit={(item) => {
                                const user = users.find(u => u.email === item.email);
                                if (user) { setSelectedUser(user); setIsModalOpen(true); setModalMode('edit'); }
                            }}
                            onDelete={(item) => {
                                const user = users.find(u => u.email === item.email);
                                if (user) handleUserAction('delete', user.id);
                            }}
                            onLock={(item) => {
                                const user = users.find(u => u.email === item.email);
                                if (user) handleUserAction(user.is_blocked ? 'unblock' : 'block', user.id);
                            }}
                            filters={
                              <div className="flex gap-2">
                                <select
                                    title="Filtrar por plano"
                                    value={filters.plan}
                                    onChange={(e) => handleFilterChange('plan', e.target.value)}
                                    className="px-4 py-2 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-xl text-xs font-bold text-[#F9FAFB] focus:outline-none focus:border-[#6366F1] transition-all"
                                >
                                    <option value="all">Planos</option>
                                    <option value="free">Free</option>
                                    <option value="pro">Pro</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                                <select
                                    title="Filtrar por status"
                                    value={filters.status}
                                    onChange={(e) => handleFilterChange('status', e.target.value)}
                                    className="px-4 py-2 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-xl text-xs font-bold text-[#F9FAFB] focus:outline-none focus:border-[#6366F1] transition-all"
                                >
                                    <option value="all">Status</option>
                                    <option value="active">Ativo</option>
                                    <option value="inactive">Inativo</option>
                                </select>
                              </div>
                            }
                        />
                    </div>
                )}

                {/* Aba: Status APIs */}
                {activeTab === 'apis' && (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl overflow-hidden">
                            <div className="p-8 border-b border-[#6366F1]/10 flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                        <Wifi size={24} className="text-[#6366F1]" />
                                        Monitor de APIs
                                    </h2>
                                    <p className="text-sm text-[#9CA3AF] font-medium mt-1">Status de conexão em tempo real com as plataformas.</p>
                                </div>
                                <div className="px-4 py-2 bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                                    <span className="text-[10px] font-black uppercase text-[#10B981]">Sistemas Online</span>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr className="bg-[#0A0E27]/40">
                                            {['Plataforma', 'Status', 'Verificação', 'Sucesso', 'Limite', 'Uso'].map(h => (
                                                <th key={h} className="px-8 py-4 text-left text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#6366F1]/10">
                                        {apiStatuses.map((api) => (
                                            <tr key={api.platform} className="hover:bg-[#6366F1]/5 transition-colors">
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2 rounded-lg ${api.status === 'ok' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-red-500/10 text-red-500'}`}>
                                                            {getStatusIcon(api.status)}
                                                        </div>
                                                        <span className="font-bold text-[#F9FAFB]">{api.platform}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(api.status)} border border-current opacity-80`}>
                                                        {api.status === 'ok' ? 'Online' : api.status === 'warning' ? 'Atenção' : 'Erro'}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 text-xs text-[#9CA3AF] font-medium">{api.lastCheck}</td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white">{api.successRate}%</span>
                                                        <div className="w-12 h-1.5 bg-[#0A0E27] rounded-full overflow-hidden">
                                                            <div className="bg-[#6366F1] h-full" style={{ width: `${api.successRate}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-sm font-medium text-[#9CA3AF]">{api.dailyLimit}</td>
                                                <td className="px-8 py-5 text-sm font-black text-[#6366F1]">{api.usedToday}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Aba: Configurações */}
                {activeTab === 'configuracoes' && (
                    <div className="space-y-8 animate-page-load">
                        {/* Seção Principal de Funcionalidades */}
                        <div className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-8">
                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                    <Settings size={24} className="text-[#6366F1]" />
                                    Configurações do Sistema
                                </h2>
                                <p className="text-sm text-[#9CA3AF] font-medium mt-1">Gerencie os módulos globais e integrações da plataforma.</p>
                            </div>

                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6366F1] mb-6">Módulos de Automação</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { id: 'menu_shopee_affiliate', label: 'Shopee Afiliado', icon: Globe },
                                    { id: 'menu_shopee_video', label: 'Shopee Vídeo', icon: Activity },
                                    { id: 'menu_whatsapp_automation', label: 'Automação WhatsApp', icon: MessageCircle },
                                    { id: 'menu_telegram_automation', label: 'Automação Telegram', icon: Bot },
                                    { id: 'menu_facebook_automation', label: 'Automação Facebook', icon: Facebook },
                                    { id: 'menu_instagram_automation', label: 'Automação Instagram', icon: Instagram },
                                    { id: 'menu_twitter_automation', label: 'Automação Twitter', icon: Twitter },
                                    { id: 'menu_pinterest_automation', label: 'Automação Pinterest', icon: Hash },
                                ].map((item) => {
                                    const isEnabled = settings[item.id] !== 'false' && settings[item.id] !== false;
                                    const Icon = item.icon;

                                    return (
                                        <div key={item.id} className="p-5 bg-[#0A0E27]/40 rounded-2xl border border-[#6366F1]/5 hover:border-[#6366F1]/20 transition-all flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl transition-all ${isEnabled ? 'bg-[#6366F1]/10 text-[#6366F1] group-hover:bg-[#6366F1] group-hover:text-white' : 'bg-white/5 text-white/20'}`}>
                                                    <Icon size={18} />
                                                </div>
                                                <span className={`text-xs font-bold ${isEnabled ? 'text-[#F9FAFB]' : 'text-[#9CA3AF]'}`}>{item.label}</span>
                                            </div>
                                            <button
                                                onClick={() => handleToggleSetting(item.id, isEnabled)}
                                                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-all ${isEnabled ? 'bg-[#6366F1]' : 'bg-white/10'}`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-all ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* BRIDGE DO TELEGRAM - PREMIUM HIGHLIGHT */}
                        <div className="bg-gradient-to-br from-[#6366F1]/20 to-[#A78BFA]/10 backdrop-blur-xl border border-[#6366F1]/30 rounded-3xl p-8 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Bot size={120} />
                            </div>
                            
                            <div className="relative z-10">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-3 bg-[#6366F1] rounded-2xl text-white shadow-xl shadow-[#6366F1]/40">
                                                <Bot size={24} />
                                            </div>
                                            <h3 className="text-2xl font-black text-white">Configuração da Ponte de Vídeo (Backup/Bridge)</h3>
                                        </div>
                                        <p className="text-[#9CA3AF] text-sm font-medium max-w-2xl">
                                            Utilize um canal privado do Telegram como servidor de relay. <span className="text-[#A78BFA] font-bold">Essencial para VPS com instabilidade de rede junto à Meta (Facebook/Instagram).</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 bg-[#0A0E27]/60 p-4 rounded-2xl border border-[#6366F1]/20">
                                        <span className="text-[10px] font-black uppercase text-[#9CA3AF] tracking-widest">Status da Ponte</span>
                                        <button
                                            onClick={() => handleToggleSetting('telegram_bridge_enabled', settings['telegram_bridge_enabled'] === 'true' || settings['telegram_bridge_enabled'] === true)}
                                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all ${
                                                (settings['telegram_bridge_enabled'] === 'true' || settings['telegram_bridge_enabled'] === true) ? 'bg-[#10B981]' : 'bg-red-500/20'
                                            }`}
                                        >
                                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all ${(settings['telegram_bridge_enabled'] === 'true' || settings['telegram_bridge_enabled'] === true) ? 'translate-x-8' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Token do Bot Telegram</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#6366F1]">
                                                <Bot size={18} />
                                            </div>
                                            <input 
                                                type="password"
                                                placeholder="123456789:ABCDEF..."
                                                defaultValue={settings['telegram_bridge_bot_token'] || ''}
                                                onBlur={(e) => handleSaveSetting('telegram_bridge_bot_token', e.target.value)}
                                                className="w-full pl-12 pr-4 py-4 bg-[#0A0E27]/60 border border-[#6366F1]/20 rounded-2xl text-white font-mono text-sm focus:outline-none focus:border-[#6366F1] transition-all placeholder:text-white/10"
                                            />
                                        </div>
                                        <p className="text-[9px] text-[#9CA3AF] font-bold uppercase mt-1 ml-1 tracking-tighter">Obtenha via @BotFather</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">ID do Canal Private (Bridge)</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#6366F1]">
                                                <Hash size={18} />
                                            </div>
                                            <input 
                                                type="text"
                                                placeholder="-100123456789"
                                                defaultValue={settings['telegram_bridge_chat_id'] || ''}
                                                onBlur={(e) => handleSaveSetting('telegram_bridge_chat_id', e.target.value)}
                                                className="w-full pl-12 pr-4 py-4 bg-[#0A0E27]/60 border border-[#6366F1]/20 rounded-2xl text-white font-mono text-sm focus:outline-none focus:border-[#6366F1] transition-all placeholder:text-white/10"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 ml-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-tighter">O Bot deve ser administrador no canal.</p>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[
                                { title: 'Telegram', accounts: automationAccounts.telegram, icon: Bot, color: '#0088CC' },
                                { title: 'WhatsApp', accounts: automationAccounts.whatsapp, icon: MessageCircle, color: '#25D366' },
                                { title: 'Facebook', accounts: automationAccounts.facebook, icon: Facebook, color: '#1877F2' },
                                { title: 'Instagram', accounts: automationAccounts.instagram, icon: Instagram, color: '#E4405F' },
                                { title: 'Twitter/X', accounts: automationAccounts.twitter, icon: Twitter, color: '#1DA1F2' },
                                { title: 'Pinterest', accounts: automationAccounts.pinterest, icon: Hash, color: '#BD081C' },
                            ].map((plat) => (
                                <div key={plat.title} className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl overflow-hidden group hover:border-[#6366F1]/30 transition-all">
                                    <div className="p-6 border-b border-[#6366F1]/10 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-[#6366F1]/10 text-[#6366F1]">
                                                <plat.icon size={20} />
                                            </div>
                                            <h3 className="font-black text-white uppercase text-xs tracking-widest">{plat.title}</h3>
                                        </div>
                                        <span className="text-[10px] font-black text-[#6366F1] bg-[#6366F1]/10 px-3 py-1 rounded-full uppercase">
                                            {plat.accounts.length} Vinculados
                                        </span>
                                    </div>
                                    <div className="p-6 max-h-[300px] overflow-y-auto space-y-3 custom-scrollbar">
                                        {plat.accounts.length === 0 ? (
                                            <div className="text-center py-8 opacity-20">
                                                <plat.icon size={32} className="mx-auto mb-2" />
                                                <p className="text-[10px] font-bold uppercase tracking-widest">Nenhuma conta ativa</p>
                                            </div>
                                        ) : (
                                            plat.accounts.map((acc: any) => (
                                                <div key={acc.id} className="flex items-center gap-4 p-4 bg-[#0A0E27]/40 rounded-2xl border border-[#6366F1]/5 group-hover:bg-[#0A0E27]/60 transition-all">
                                                    <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_10px_#10B981]" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-white text-sm truncate">{acc.username || acc.name || 'Conta'}</p>
                                                        <p className="text-[10px] text-[#9CA3AF] font-medium truncate opacity-60">ID: {acc.account_id || acc.id}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Aba: Assinaturas */}
                {activeTab === 'assinaturas' && (
                    <div className="space-y-8 animate-page-load">
                        <div className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-8">
                            <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-3">
                                <DollarSign size={24} className="text-[#6366F1]" />
                                Métrica de Receita Real-time
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {subscriptionStats?.byPlan.map((plan) => (
                                    <div key={plan.subscription_plan} className="relative p-8 bg-[#0A0E27]/40 border border-[#6366F1]/10 rounded-3xl overflow-hidden group hover:border-[#6366F1]/40 transition-all text-center">
                                        <div className="absolute top-0 right-0 p-4 opacity-5">
                                            <TrendingUp size={64} />
                                        </div>
                                        <span className={`inline-block px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4 ${
                                            plan.subscription_plan === 'free' ? 'bg-white/5 text-white/40' :
                                            plan.subscription_plan === 'pro' ? 'bg-[#6366F1]/20 text-[#6366F1]' :
                                            'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        }`}>
                                            Plano {getPlanName(plan.subscription_plan)}
                                        </span>
                                        <div className="text-4xl font-black text-white mb-2">
                                            R$ {plan.revenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </div>
                                        <div className="text-sm font-bold text-[#9CA3AF] uppercase tracking-tighter">
                                            {plan.count} Assinantes Ativos
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Aba: Banco de Dados */}
                {activeTab === 'banco-dados' && (
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {databaseStats.map((stat) => (
                                <div key={stat.table} className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-8 group hover:border-[#6366F1]/40 transition-all">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="p-3 bg-[#6366F1]/10 text-[#6366F1] rounded-2xl group-hover:bg-[#6366F1] group-hover:text-white transition-all">
                                            <Database size={24} />
                                        </div>
                                        <span className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest">Tabela</span>
                                    </div>
                                    <h4 className="text-xs font-black text-[#9CA3AF] uppercase tracking-widest mb-1">{stat.table}</h4>
                                    <p className="text-4xl font-black text-white tabular-nums">{stat.count.toLocaleString()}</p>
                                    <p className="text-[10px] font-bold text-[#10B981] uppercase mt-2 opacity-60">Registros Ativos</p>
                                </div>
                            ))}
                        </div>

                        <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center gap-6">
                            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-[#0A0E27]">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <h4 className="font-black text-amber-500 uppercase text-xs tracking-widest mb-1">Otimização Necessária</h4>
                                <p className="text-sm text-white/60 font-medium">Tabelas com alta volumetria podem degradar a performance. <span className="text-amber-500 font-bold">Considere a limpeza automática de logs antigos.</span></p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Outras abas - placeholder */}
                {!['visao-geral', 'usuarios', 'contas-automacao', 'apis', 'configuracoes', 'assinaturas', 'banco-dados'].includes(activeTab) && (
                    <div className="bg-[#1E2139]/40 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-24 text-center">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-[#6366F1]/10 rounded-full mb-6">
                            <Globe className="text-[#6366F1] animate-spin-slow" size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2">Seção em Desenvolvimento</h3>
                        <p className="text-[#9CA3AF] font-medium">Estamos preparando algo incrível aqui. Volte em breve!</p>
                    </div>
                )}

                {/* Modal de Detalhes/Edição */}
                {isModalOpen && selectedUser && (
                    <div className="fixed inset-0 bg-[#0A0E27]/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
                        <div className="bg-gradient-to-br from-[#1E2139] to-[#0A0E27] border border-[#6366F1]/20 rounded-[2.5rem] shadow-2xl shadow-black/50 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                            
                            {/* Modal Header */}
                            <div className="p-8 border-b border-[#6366F1]/10 flex justify-between items-center bg-[#6366F1]/5">
                                <div>
                                    <h2 className="text-2xl font-black text-white">
                                        {modalMode === 'details' ? 'Perfil do Usuário' : 'Editar Credenciais'}
                                    </h2>
                                    <p className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest mt-1">ID: {selectedUser.id}</p>
                                </div>
                                <button 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-[#9CA3AF] hover:bg-red-500 hover:text-white transition-all group"
                                    title="Fechar"
                                >
                                    <X size={20} className="group-hover:rotate-90 transition-transform" />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateUser} className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Nome Completo</label>
                                        <input
                                            type="text"
                                            value={selectedUser.name}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                                            className="w-full px-5 py-4 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-2xl text-white font-bold focus:outline-none focus:border-[#6366F1] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Endereço de Email</label>
                                        <input
                                            type="email"
                                            value={selectedUser.email}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                                            className="w-full px-5 py-4 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-2xl text-white font-bold focus:outline-none focus:border-[#6366F1] transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Telefone / WhatsApp</label>
                                        <input
                                            type="text"
                                            value={selectedUser.phone || ''}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, phone: e.target.value })}
                                            className="w-full px-5 py-4 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-2xl text-white font-bold focus:outline-none focus:border-[#6366F1] transition-all"
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Documento Fiscal</label>
                                        <input
                                            type="text"
                                            value={selectedUser.document || ''}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, document: e.target.value })}
                                            className="w-full px-5 py-4 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-2xl text-white font-bold focus:outline-none focus:border-[#6366F1] transition-all"
                                            placeholder="CPF ou CNPJ"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Plano de Acesso</label>
                                        <select
                                            value={selectedUser.subscription_plan}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, subscription_plan: e.target.value })}
                                            className="w-full px-5 py-4 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-2xl text-white font-bold focus:outline-none focus:border-[#6366F1] transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="free">Gratuito (Standard)</option>
                                            <option value="pro">Profissional (Mestre)</option>
                                            <option value="enterprise">Empresarial (Elite)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Status Global</label>
                                        <select
                                            value={selectedUser.subscription_status}
                                            onChange={(e) => setSelectedUser({ ...selectedUser, subscription_status: e.target.value })}
                                            className="w-full px-5 py-4 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-2xl text-white font-bold focus:outline-none focus:border-[#6366F1] transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="active">Ativo / Regular</option>
                                            <option value="inactive">Pendente / Inativo</option>
                                            <option value="cancelled">Bloqueado / Cancelado</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-[10px] font-black uppercase text-[#6366F1] tracking-widest ml-1">Privilégio Administrativo</label>
                                        <div className="flex gap-4">
                                            {['user', 'admin'].map(r => (
                                                <button
                                                    key={r}
                                                    type="button"
                                                    onClick={() => setSelectedUser({ ...selectedUser, role: r })}
                                                    className={`flex-1 py-4 rounded-2xl border font-black uppercase text-[10px] tracking-[0.2em] transition-all ${selectedUser.role === r ? 'bg-[#6366F1] border-[#6366F1] text-white' : 'bg-[#0A0E27]/40 border-[#6366F1]/20 text-[#9CA3AF]'}`}
                                                >
                                                    {r === 'admin' ? 'Administrador' : 'Usuário Padrão'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="pt-8 border-t border-[#6366F1]/10 flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 px-8 py-4 bg-white/5 border border-white/10 rounded-2xl text-[#F9FAFB] font-bold hover:bg-white/10 transition-all"
                                    >
                                        Descartar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-[2] px-8 py-4 bg-gradient-to-r from-[#6366F1] to-[#764BA2] text-white rounded-2xl font-black uppercase tracking-widest hover:shadow-xl hover:shadow-[#6366F1]/20 transition-all"
                                    >
                                        Salvar Alterações
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                </main>
                
                <footer className="p-8 border-t border-[#6366F1]/10 bg-[#0A0E27]/40">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[#6B7280] text-[10px] font-black uppercase tracking-[0.2em]">
                        <p>© 2026 MELIFLOW AUTOMATION PRO • INFRAESTRUTURA NEBULA G3</p>
                        <div className="flex gap-8">
                            <span className="hover:text-[#6366F1] transition-colors cursor-pointer">Termos de Uso</span>
                            <span className="hover:text-[#6366F1] transition-colors cursor-pointer">Privacidade</span>
                            <span className="text-[#10B981]">AES-256 ENCRYPTED</span>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
