import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, Clock, Trash2, Play, Pause, Facebook, Video, MessageCircle, Send, CheckCircle, XCircle, Download, Instagram, RefreshCw } from 'lucide-react';


interface Schedule {
    id: number;
    platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram';
    config: any;
    active: number;
    created_at: string;
    nextExecution?: string | null;
    totalSent?: number;
    lastExecution?: string | null;
}

interface DownloaderPost { id: number; source_url: string; media_type: string; platform: string; account_id: string; account_name?: string; caption: string; scheduled_at: string; status: string; error_message?: string; }

const SchedulesPage: React.FC = () => {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [downloaderPosts, setDownloaderPosts] = useState<DownloaderPost[]>([]);
    const [loadingDownloader, setLoadingDownloader] = useState(false);

    useEffect(() => {
        loadSchedules();
        loadDownloaderSchedules();

        const timer = setInterval(() => {
            setSchedules(prev => [...prev]);
        }, 60000);

        return () => clearInterval(timer);
    }, []);

    const loadDownloaderSchedules = async () => {
        setLoadingDownloader(true);
        try {
            const resp = await api.get('/media/schedule');
            if (resp.data.success) setDownloaderPosts(resp.data.schedule || []);
        } catch {} finally { setLoadingDownloader(false); }
    };

    const clearFailedDownloaderPosts = async () => {
        const hasFailed = downloaderPosts.some(p => p.status === 'failed');
        if (!hasFailed) return;
        
        if (window.confirm('Deseja remover todas as notificações de erro da fila?')) {
            try {
                await api.post('/media/schedule/clear-failed');
                setDownloaderPosts(prev => prev.filter(p => p.status !== 'failed'));
                showNotification('Falhas removidas com sucesso', 'success');
            } catch {
                showNotification('Erro ao limpar falhas', 'error');
                loadDownloaderSchedules();
            }
        }
    };

    const clearAllDownloaderPosts = async () => {
        const hasPending = downloaderPosts.some(p => p.status === 'pending');
        if (!hasPending) {
            showNotification('Não há agendamentos pendentes para cancelar', 'error');
            return;
        }
        
        if (window.confirm('AVISO: Isso irá cancelar TODOS os agendamentos pendentes. Esta ação não pode ser desfeita. Deseja continuar?')) {
            try {
                await api.post('/media/schedule/clear-all');
                setDownloaderPosts(prev => prev.filter(p => p.status !== 'pending'));
                showNotification('Todos os agendamentos foram cancelados', 'success');
            } catch {
                showNotification('Erro ao cancelar agendamentos', 'error');
                loadDownloaderSchedules();
            }
        }
    };

    const deleteDownloaderPost = async (id: number) => {
        try {
            await api.delete(`/media/schedule/${id}`);
            setDownloaderPosts(prev => prev.filter(p => p.id !== id));
            showNotification('Post removido da fila', 'success');
        } catch { showNotification('Erro ao remover', 'error'); }
    };

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const loadSchedules = async () => {
        try {
            setLoading(true);
            const response = await api.get('/schedules');
            if (response.data.success) {
                setSchedules(response.data.schedules);
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
            showNotification('Erro ao carregar agendamentos', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleSchedule = async (id: number) => {
        try {
            const response = await api.post(`/schedule/toggle/${id}`);
            if (response.data.success) {
                setSchedules(schedules.map(s => s.id === id ? { ...s, active: s.active ? 0 : 1 } : s));
                showNotification(`Agendamento ${response.data.active ? 'ativado' : 'pausado'}`, 'success');
            }
        } catch (error) {
            showNotification('Erro ao alterar status', 'error');
        }
    };

    const deleteSchedule = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;

        try {
            const response = await api.delete(`/schedule/${id}`);
            if (response.data.success) {
                setSchedules(schedules.filter(s => s.id !== id));
                showNotification('Agendamento excluído', 'success');
            }
        } catch (error) {
            showNotification('Erro ao excluir agendamento', 'error');
        }
    };

    const runScheduleNow = async (id: number) => {
        try {
            const response = await api.post(`/schedule/run-now/${id}`);
            if (response.data.success) {
                showNotification('Módulo iniciado! Verifique os logs em alguns instantes.', 'success');
            }
        } catch (error) {
            showNotification('Erro ao iniciar execução manual', 'error');
        }
    };

    const getPlatformIcon = (platform: string) => {
        switch (platform) {
            case 'facebook': return <Facebook className="text-blue-600" size={24} />;
            case 'whatsapp': return <MessageCircle className="text-green-600" size={24} />;
            case 'telegram': return <Send className="text-blue-400" size={24} />;
            default: return <Clock className="text-gray-600" size={24} />;
        }
    };

    const parseConfig = (config: any) => {
        if (typeof config === 'object' && config !== null) return config;
        try {
            return JSON.parse(config);
        } catch (e) {
            return {};
        }
    };

    const getTimeRemaining = (nextExecution: string | null | undefined) => {
        if (!nextExecution) return null;
        
        const next = new Date(nextExecution).getTime();
        const now = new Date().getTime();
        const diff = next - now;

        if (diff <= 0) return 'Processando agora...';

        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}min`;
        return `${minutes}min`;
    };

    const pendingStats = Object.values(downloaderPosts
        .filter(post => post.status === 'pending' && post.account_name)
        .reduce((acc, post) => {
            const key = `${post.platform}-${post.account_name}`;
            if (!acc[key]) acc[key] = { platform: post.platform, account_name: post.account_name, count: 0 };
            acc[key].count++;
            return acc;
        }, {} as Record<string, { platform: string; account_name: string; count: number }>));

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 sm:px-0 animate-fade-in">
            {notification && (
                <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-3 backdrop-blur-md ${notification.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                    {notification.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                    {notification.message}
                </div>
            )}

            {/* Hero Header Minimalista */}
            <div className="mb-10 mt-4 flex items-center justify-between">
                <div>
                    <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight">Agendamentos</h1>
                    <p className="text-[14px] text-gray-500 mt-1 font-medium">Monitore a fila do downloader e automações.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Sistema Online</span>
                    </div>
                </div>
            </div>

            {/* Resumo de Agendamentos Pendentes */}
            {pendingStats.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {pendingStats.map((stat, idx) => (
                        <div key={idx} className="bg-white border border-gray-200/60 rounded-[12px] p-4 flex items-center gap-4 shadow-sm hover:border-gray-300 transition-colors">
                            <div className="shrink-0 p-2 bg-gray-50 rounded-lg">
                                {stat.platform === 'instagram' ? <Instagram size={20} className="text-pink-500" /> : stat.platform === 'facebook' ? <Facebook size={20} className="text-blue-600" /> : <Video size={20} className="text-gray-400" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-gray-900 truncate" title={stat.account_name}>{stat.account_name}</p>
                                <p className="text-[11px] font-medium text-gray-500">
                                    <span className="text-gray-900 font-bold">{stat.count}</span> {stat.count === 1 ? 'agendamento' : 'agendamentos'} em aberto
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                
                {/* Lado Esquerdo: Fila do Downloader */}
                <div className="xl:col-span-7 space-y-6">
                    <div className="bg-white rounded-[16px] border border-gray-200/60 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-[16px] font-semibold text-gray-900 flex items-center gap-2 tracking-tight">
                                    <Download size={18} className="text-gray-400" /> Fila do Downloader
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {downloaderPosts.some(p => p.status === 'pending') && (
                                    <button onClick={clearAllDownloaderPosts} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-[13px] font-medium transition-colors" title="Cancelar todos os agendamentos pendentes">
                                        <XCircle size={14} /> Cancelar Todos
                                    </button>
                                )}
                                {downloaderPosts.some(p => p.status === 'failed') && (
                                    <button onClick={clearFailedDownloaderPosts} className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-[13px] font-medium transition-colors" title="Limpar todas as falhas">
                                        <Trash2 size={14} /> Limpar Falhas
                                    </button>
                                )}
                                <button onClick={loadDownloaderSchedules} className="p-1.5 text-gray-400 hover:text-gray-900 transition-colors" title="Atualizar fila">
                                    <RefreshCw size={16} className={loadingDownloader ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        {loadingDownloader ? (
                            <div className="py-12 flex flex-col items-center justify-center">
                                <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mb-4" />
                                <p className="text-[12px] font-medium text-gray-500">Sincronizando fila...</p>
                            </div>
                        ) : downloaderPosts.length === 0 ? (
                            <div className="text-center py-16">
                                <Download size={24} className="text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-[14px] font-medium">A fila está vazia</p>
                            </div>
                        ) : (
                            <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {downloaderPosts.map((post, i) => (
                                    <div key={post.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-gray-50/50 border-b border-gray-100 last:border-0 transition-colors gap-4">
                                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                                            <div className="shrink-0 text-gray-400 mt-0.5 sm:mt-0 group-hover:text-gray-600 transition-colors">
                                                {post.platform === 'instagram' ? <Instagram size={18} /> : post.platform === 'facebook' ? <Facebook size={18} /> : post.platform === 'tiktok' ? <Video size={18} /> : <Video size={18} />}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-[13px] font-medium text-gray-900 capitalize">{post.platform}</span>
                                                    {post.account_name && (
                                                        <>
                                                            <span className="text-gray-300">•</span>
                                                            <span className="text-[13px] text-gray-500 truncate max-w-[150px]">{post.account_name}</span>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="text-[12px] text-gray-400 truncate max-w-[280px] sm:max-w-md">
                                                    {post.source_url.replace(/^https?:\/\/(www\.)?/, '')}
                                                </div>
                                                {post.error_message && <p className="text-[11px] text-red-500 truncate mt-1 font-medium">{post.error_message}</p>}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 sm:ml-4 w-full sm:w-auto">
                                            <div className="text-left sm:text-right flex flex-col sm:items-end">
                                                <span className="text-[12px] text-gray-900 font-mono">
                                                    {new Date(post.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[11px] text-gray-400">
                                                    {new Date(post.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                            <div className="w-20 sm:w-24 flex justify-end">
                                                <span className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${ post.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : post.status === 'failed' ? 'bg-red-50 text-red-700' : post.status === 'processing' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600' }`}>
                                                    {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                                                </span>
                                            </div>
                                            {post.status !== 'processing' ? (
                                                <button onClick={() => deleteDownloaderPost(post.id)} className="sm:opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all">
                                                    <Trash2 size={16} />
                                                </button>
                                            ) : (
                                                <div className="w-[28px] hidden sm:block"></div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Lado Direito: Módulos de Automação */}
                <div className="xl:col-span-5 space-y-6">
                    <div className="bg-white rounded-[16px] border border-gray-200/60 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-[16px] font-semibold text-gray-900 flex items-center gap-2 tracking-tight">
                                    <Calendar size={18} className="text-gray-400" /> Módulos Ativos
                                </h2>
                            </div>
                            <button onClick={loadSchedules} className="p-1.5 text-gray-400 hover:text-gray-900 transition-colors">
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        {loading ? (
                            <div className="py-12 flex flex-col items-center justify-center">
                                <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mb-4" />
                            </div>
                        ) : schedules.length === 0 ? (
                            <div className="text-center py-16">
                                <Calendar size={24} className="text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-[14px] font-medium">Nenhum módulo ativo</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {schedules.map(schedule => {
                                    const config = parseConfig(schedule.config);
                                    const scheduleInfo = config.schedule || {};

                                    return (
                                        <div key={schedule.id} className={`group bg-white border rounded-[12px] p-4 transition-all hover:border-gray-300 ${schedule.active ? 'border-gray-200' : 'border-gray-100 opacity-60 grayscale-[0.5]'}`}>
                                            <div className="flex items-start gap-4">
                                                <div className="pt-0.5 text-gray-400">
                                                    {getPlatformIcon(schedule.platform)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <h3 className="font-semibold text-gray-900 capitalize text-[14px] tracking-tight truncate">
                                                            Robô {schedule.platform}
                                                        </h3>
                                                        <span className="flex items-center gap-1.5">
                                                            <span className={`w-1.5 h-1.5 rounded-full ${schedule.active ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                                                            <span className="text-[11px] font-medium text-gray-500">
                                                                {schedule.active ? 'Ativo' : 'Pausado'}
                                                            </span>
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[12px] text-gray-500">
                                                        {schedule.platform === 'instagram' && config.instagramAccounts?.[0]?.username && (
                                                            <span className="truncate max-w-[120px]" title={`@${config.instagramAccounts[0].username}`}>@{config.instagramAccounts[0].username}</span>
                                                        )}
                                                        {schedule.platform === 'facebook' && config.facebookPages?.[0]?.name && (
                                                            <span className="truncate max-w-[120px]" title={config.facebookPages[0].name}>{config.facebookPages[0].name}</span>
                                                        )}
                                                        {schedule.platform === 'telegram' && config.groups?.[0]?.name && (
                                                            <span 
                                                                className="truncate max-w-[120px]" 
                                                                title={config.groups.map(g => g.name).join(', ')}
                                                            >
                                                                {config.groups[0].name}{config.groups.length > 1 ? ` (+${config.groups.length - 1})` : ''}
                                                            </span>
                                                        )}
                                                        {config.shopeeSettings && (
                                                            <div className="flex items-center gap-1.5 ml-1">
                                                                <span className="text-orange-600/80 font-medium">Shopee</span>
                                                                {(config.categoryType || config.category) && (
                                                                    <>
                                                                        <span className="text-gray-300">•</span>
                                                                        <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                                                                            {(() => {
                                                                                const cat = (config.categoryType || config.category || '').toString();
                                                                                const mapping: Record<string, string> = {
                                                                                    'random': 'ALEATÓRIO',
                                                                                    'best_sellers': 'MAIS VENDIDOS',
                                                                                    'cheapest': 'BARATOS',
                                                                                    'expensive': 'LUXO',
                                                                                    'bizarros': 'BIZARROS',
                                                                                    'evangelico': 'EVANGÉLICO',
                                                                                    'umbanda': 'UMBANDA',
                                                                                    'achadinhos': 'ACHADINHOS',
                                                                                    '0': 'ALEATÓRIO'
                                                                                };
                                                                                return mapping[cat] || cat.replace('_', ' ');
                                                                            })()}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1 mb-4">
                                                        <p className="flex items-center justify-between text-[12px] text-gray-500">
                                                            <span>Horários:</span> 
                                                            <span className="font-mono text-gray-900">{scheduleInfo.scheduleMode === 'multiple' && scheduleInfo.times ? scheduleInfo.times.join(', ') : scheduleInfo.time || 'N/A'}</span>
                                                        </p>
                                                        {schedule.active && schedule.nextExecution && (
                                                            <div className="flex items-center justify-between text-[12px]">
                                                                <span className="text-gray-500">Próximo:</span> 
                                                                <span className="font-medium text-gray-900">{getTimeRemaining(schedule.nextExecution)}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {schedule.active && (
                                                            <button onClick={() => runScheduleNow(schedule.id)} className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5">
                                                                <Play size={12} /> Agora
                                                            </button>
                                                        )}
                                                        <button onClick={() => toggleSchedule(schedule.id)} className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5">
                                                            {schedule.active ? <Pause size={12} /> : <Play size={12} />} {schedule.active ? 'Pausar' : 'Ativar'}
                                                        </button>
                                                        <div className="flex-1"></div>
                                                        <button onClick={() => deleteSchedule(schedule.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const style = document.createElement('style');
style.textContent = `
    @keyframes pulse-subtle {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(0.98); }
    }
    .animate-pulse-subtle {
        animation: pulse-subtle 3s ease-in-out infinite;
    }
`;
document.head.appendChild(style);

export default SchedulesPage;
