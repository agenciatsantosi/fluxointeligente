import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, Clock, Trash2, Play, Pause, Facebook, Video, MessageCircle, Send, CheckCircle, XCircle, Download, Instagram, RefreshCw, Rocket, ShoppingBag } from 'lucide-react';


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
    const [timeOffset, setTimeOffset] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        loadSchedules(false); // Initial load with spinner
        loadDownloaderSchedules();

        const timer = setInterval(() => {
            loadSchedules(true); // Silent refresh
            loadDownloaderSchedules(true); // Silent refresh
        }, 5000);

        return () => clearInterval(timer);
    }, []);

    const loadDownloaderSchedules = async (silent = false, retries = 10) => {
        if (!silent) setLoadingDownloader(true);
        else setIsRefreshing(true);
        
        try {
            const resp = await api.get('/media/schedule');
            if (resp.data.success) setDownloaderPosts(resp.data.schedule || []);
            if (!silent) setLoadingDownloader(false);
            else setIsRefreshing(false);
        } catch (error) {
            if (retries > 0) {
                setTimeout(() => loadDownloaderSchedules(silent, retries - 1), 2000);
            } else {
                if (!silent) setLoadingDownloader(false);
                else setIsRefreshing(false);
            }
        }
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

    const loadSchedules = async (silent = false, retries = 10) => {
        try {
            // Only set loading on initial fetch to avoid flickering if we already have data
            if (!silent && schedules.length === 0) setLoading(true);
            
            const response = await api.get('/schedules');
            if (response.data.success) {
                setSchedules(response.data.schedules);
                if (response.data.serverTime) {
                    const server = new Date(response.data.serverTime).getTime();
                    const client = new Date().getTime();
                    setTimeOffset(server - client);
                    console.log(`[TIME] Server offset: ${server - client}ms`);
                }
            } else {
                console.error('API returned success:false', response.data);
                if (!silent && retries <= 1) showNotification(response.data.error || 'Erro ao carregar agendamentos', 'error');
            }
            if (!silent) setLoading(false);
        } catch (error) {
            console.error(`Error loading schedules (retries left: ${retries}):`, error);
            
            if (retries > 0) {
                // If it fails (e.g., server restarting), retry after 2s
                setTimeout(() => loadSchedules(silent, retries - 1), 2000);
            } else {
                if (!silent) {
                    showNotification('Falha ao conectar após várias tentativas.', 'error');
                    setLoading(false);
                }
            }
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

    const scheduleIn3Minutes = async (id: number) => {
        try {
            showNotification('Agendando teste para daqui a 3 min...', 'success');
            const response = await api.post(`/schedule/test-3min/${id}`);
            if (response.data.success) {
                showNotification(`✅ Agendado para ${response.data.time}`, 'success');
                loadSchedules(true);
            }
        } catch (error: any) {
            const msg = error?.response?.data?.error || error?.message || 'Erro ao agendar teste';
            showNotification('❌ ' + msg, 'error');
        }
    };

    const runScheduleNow = async (id: number) => {
        try {
            showNotification('Iniciando envio...', 'info');
            const response = await api.post(`/schedule/run-now/${id}`);
            if (response.data.success) {
                showNotification('✅ ' + (response.data.message || 'Envio iniciado! Aguarde alguns segundos.'), 'success');
            } else {
                showNotification('❌ ' + (response.data.error || 'Erro ao iniciar'), 'error');
            }
        } catch (error: any) {
            const msg = error?.response?.data?.error || error?.message || 'Erro ao iniciar execução manual';
            showNotification('❌ ' + msg, 'error');
            console.error('[run-now] error:', error?.response?.data || error);
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

    const renderTimeRemaining = (nextExecution: string | null | undefined) => {
        if (!nextExecution) return (
            <span className="text-gray-400 italic">Aguardando próximo ciclo...</span>
        );
        
        const next = new Date(nextExecution).getTime();
        const now = new Date().getTime() + timeOffset;
        const diff = next - now;

        if (diff <= 0) {
            const scheduledTime = new Date(nextExecution).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return (
                <span className="flex items-center gap-2 text-emerald-600 font-bold animate-pulse">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                    Enviando postagem das {scheduledTime}...
                </span>
            );
        }

        const totalMinutes = Math.floor(diff / 1000 / 60);
        const minutes = totalMinutes % 60;
        const hours = Math.floor(totalMinutes / 60) % 24;
        const days = Math.floor(totalMinutes / (60 * 24));

        if (totalMinutes < 1) {
            const scheduledTime = new Date(nextExecution).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return (
                <span className="flex items-center gap-2 text-blue-600 font-bold animate-pulse">
                    <Rocket size={14} className="animate-bounce" />
                    Preparando envio das {scheduledTime}...
                </span>
            );
        }

        const h = Math.floor(totalMinutes / 60);
        const d = Math.floor(h / 24);
        const m = totalMinutes % 60;

        return (
            <span className="text-blue-500 font-medium">
                {d > 0 ? `${d}d ` : ''}
                {h % 24 > 0 ? `${h % 24}h ` : ''}
                {m}min
            </span>
        );
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
                                <button onClick={() => loadDownloaderSchedules()} className="p-1.5 text-gray-400 hover:text-gray-900 transition-colors" title="Atualizar fila">
                                    <RefreshCw size={16} className={loadingDownloader || isRefreshing ? 'animate-spin text-blue-500' : ''} />
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
                            <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {(() => {
                                    const nextPost = downloaderPosts
                                        .filter(p => p.status === 'pending')
                                        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
                                    
                                    return downloaderPosts.map((post) => {
                                        const isNext = nextPost && post.id === nextPost.id;
                                        return (
                                            <div key={post.id} className={`group bg-white border rounded-[12px] p-4 transition-all hover:border-gray-300 ${isNext ? 'ring-2 ring-blue-500/20 border-blue-200 shadow-md shadow-blue-50/50' : 'border-gray-200'}`}>
                                                <div className="flex items-start gap-4">
                                                    <div className={`pt-0.5 transition-colors ${isNext ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                                        {post.platform === 'instagram' ? <Instagram size={18} /> : post.platform === 'facebook' ? <Facebook size={18} /> : <Video size={18} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-semibold text-gray-900 capitalize text-[14px] tracking-tight truncate">
                                                                    {post.platform}
                                                                </h3>
                                                                {post.account_name && (
                                                                    <>
                                                                        <span className="text-gray-300">•</span>
                                                                        <span className="text-[12px] text-gray-500 truncate max-w-[150px] font-medium">{post.account_name}</span>
                                                                    </>
                                                                )}
                                                                {isNext && (
                                                                    <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full animate-pulse shadow-sm">
                                                                        PRÓXIMO ENVIO
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className={`px-2.5 py-1 rounded-full shadow-sm border text-[10px] font-bold uppercase tracking-wider ${
                                                                post.status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                                                                post.status === 'failed' ? 'bg-red-50 border-red-100 text-red-700' :
                                                                post.status === 'processing' ? 'bg-blue-50 border-blue-100 text-blue-700 animate-pulse' :
                                                                'bg-gray-100 border-gray-200 text-gray-500'
                                                            }`}>
                                                                {post.status}
                                                            </span>
                                                        </div>

                                                        <div className={`bg-gradient-to-br rounded-2xl p-4 border mb-1 backdrop-blur-sm shadow-inner relative transition-all ${isNext ? 'from-blue-50 to-indigo-50/30 border-blue-100/50' : 'from-gray-50/80 to-blue-50/30 border-gray-100/50'}`}>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`p-1.5 rounded-lg text-white shadow-md transition-colors ${isNext ? 'bg-blue-600 shadow-blue-200' : 'bg-gray-600 shadow-gray-200'}`}>
                                                                        <Download size={12} />
                                                                    </div>
                                                                    <span className={`text-[11px] font-black uppercase tracking-widest ${isNext ? 'text-blue-500' : 'text-gray-400'}`}>Detalhes da Mídia</span>
                                                                </div>
                                                                <div className="flex flex-col items-end">
                                                                    <span className={`text-[12px] font-mono font-black ${isNext ? 'text-blue-600' : 'text-gray-700'}`}>
                                                                        {new Date(post.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                    <span className="text-[9px] text-gray-400 uppercase tracking-tighter font-bold">
                                                                        {new Date(post.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className={`text-[11px] break-all bg-white/50 p-2 rounded-lg border font-medium ${isNext ? 'text-blue-700 border-blue-100/50' : 'text-gray-500 border-gray-100/50'}`}>
                                                                {post.source_url.replace(/^https?:\/\/(www\.)?/, '')}
                                                            </div>
                                                            {post.error_message && (
                                                                <div className="mt-2 text-[10px] text-red-500 bg-red-50/50 p-2 rounded-lg border border-red-100/50 font-bold">
                                                                    {post.error_message}
                                                                </div>
                                                            )}

                                                            {post.status !== 'processing' && (
                                                                <button 
                                                                    onClick={() => deleteDownloaderPost(post.id)} 
                                                                    className="absolute -top-2 -right-2 p-1.5 bg-white text-gray-400 hover:text-red-600 rounded-full border border-gray-100 shadow-sm hover:border-red-100 transition-all sm:opacity-0 group-hover:opacity-100"
                                                                    title="Remover"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
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

                                    // Compute next execution from config if DB queue is empty
                                    const computeNextFromConfig = (): string | null => {
                                        const times = scheduleInfo.scheduleMode === 'multiple' && scheduleInfo.times?.length > 0
                                            ? scheduleInfo.times
                                            : scheduleInfo.time ? [scheduleInfo.time] : [];
                                        if (times.length === 0) return null;
                                        const now = new Date();
                                        let earliest: Date | null = null;
                                        for (const t of times) {
                                            const [h, m] = t.split(':').map(Number);
                                            const candidate = new Date(now);
                                            candidate.setHours(h, m, 0, 0);
                                            if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
                                            if (!earliest || candidate < earliest) earliest = candidate;
                                        }
                                        return earliest ? earliest.toISOString() : null;
                                    };

                                    const effectiveNextExecution = schedule.nextExecution || computeNextFromConfig();

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
                                                    </div>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
                                                            {schedule.platform === 'instagram' && config.instagramAccounts?.[0]?.username && (
                                                                <span className="font-medium text-gray-700">@{config.instagramAccounts[0].username}</span>
                                                            )}
                                                            {schedule.platform === 'facebook' && config.facebookPages?.[0]?.name && (
                                                                <span className="font-medium text-gray-700">{config.facebookPages[0].name}</span>
                                                            )}
                                                            {schedule.platform === 'telegram' && config.groups?.[0]?.name && (
                                                                <span className="font-medium text-gray-700">{config.groups[0].name}</span>
                                                            )}
                                                            {config.shopeeSettings && (
                                                                <>
                                                                    <span className="text-gray-300">•</span>
                                                                    <span className="text-orange-600 font-semibold flex items-center gap-1">
                                                                        <ShoppingBag size={10} /> Shopee
                                                                    </span>
                                                                    {(config.categoryType || config.category) && (
                                                                        <span className="ml-1 bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-extrabold tracking-wider border border-orange-100">
                                                                            {(() => {
                                                                                const cat = (config.categoryType || config.category || '').toString();
                                                                                const mapping: Record<string, string> = {
                                                                                    'evangelico': 'EVANGÉLICO', 'umbanda': 'UMBANDA', 'achadinhos': 'ACHADINHOS'
                                                                                };
                                                                                return mapping[cat] || cat.replace('_', ' ');
                                                                            })()}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-sm border transition-all ${
                                                            schedule.active 
                                                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                                                                : 'bg-gray-50 border-gray-100 text-gray-400'
                                                        }`}>
                                                            <span className={`w-2 h-2 rounded-full ${schedule.active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider">
                                                                {schedule.active ? 'Operacional' : 'Pausado'}
                                                            </span>
                                                        </span>
                                                    </div>

                                                    {/* PRÓXIMOS ENVIOS - PREMIUM DESIGN */}
                                                    <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 rounded-2xl p-4 border border-blue-100/50 mb-4 backdrop-blur-sm shadow-inner">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="p-1.5 bg-blue-600 rounded-lg text-white shadow-md shadow-blue-200">
                                                                    <Calendar size={12} />
                                                                </div>
                                                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Cronograma Diário</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 px-2.5 py-1 bg-white/80 rounded-full border border-blue-100 shadow-sm">
                                                                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">Status:</span>
                                                                <span className="text-[11px] font-bold text-blue-700">{schedule.active && effectiveNextExecution ? renderTimeRemaining(effectiveNextExecution) : '--'}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-1 gap-2 mb-3">
                                                            {schedule.active && effectiveNextExecution ? (
                                                                <div className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-blue-100 shadow-sm animate-pulse-subtle">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 bg-blue-600 rounded-full" />
                                                                        <span className="text-[12px] font-bold text-gray-700">PRÓXIMO POST</span>
                                                                    </div>
                                                                    <span className="text-[13px] font-mono font-black text-blue-600 flex flex-col items-end">
                                                                        <span className="text-[9px] text-blue-400 uppercase tracking-tighter leading-none mb-0.5">
                                                                            {(() => {
                                                                                const d = new Date(effectiveNextExecution);
                                                                                const today = new Date();
                                                                                if (d.toDateString() === today.toDateString()) return 'Hoje';
                                                                                const tomorrow = new Date();
                                                                                tomorrow.setDate(tomorrow.getDate() + 1);
                                                                                if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
                                                                                return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                                                                            })()}
                                                                        </span>
                                                                        {new Date(effectiveNextExecution).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <div className="text-[11px] text-gray-400 italic text-center py-2">Sem envios pendentes no momento</div>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-blue-50">
                                                            {(() => {
                                                                const nextExecTime = effectiveNextExecution ? new Date(effectiveNextExecution).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
                                                                const times = scheduleInfo.scheduleMode === 'multiple' && scheduleInfo.times ? scheduleInfo.times : (scheduleInfo.time ? [scheduleInfo.time] : []);
                                                                
                                                                return times.map((time: string, idx: number) => {
                                                                    const nextDate = effectiveNextExecution ? new Date(effectiveNextExecution) : null;
                                                                    const isToday = nextDate ? nextDate.toDateString() === new Date().toDateString() : false;
                                                                    const isNext = isToday && time === nextExecTime;
                                                                    
                                                                    return (
                                                                        <span 
                                                                            key={idx} 
                                                                            className={`px-2.5 py-1.5 rounded-lg text-[12px] font-mono transition-all duration-300 ${
                                                                                isNext 
                                                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black shadow-lg shadow-blue-200 ring-2 ring-blue-100 scale-105' 
                                                                                : 'bg-white text-gray-400 border border-gray-100 hover:border-blue-200 hover:text-blue-500'
                                                                            }`}
                                                                        >
                                                                            {time}
                                                                        </span>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 mt-4">
                                                        {schedule.active && (
                                                            <>
                                                                <button
                                                                    onClick={() => scheduleIn3Minutes(schedule.id)}
                                                                    className="flex-1 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-[12px] font-black transition-all active:scale-95 flex items-center justify-center gap-2 border border-purple-100/50"
                                                                    title="Agendar teste para daqui a 3 min"
                                                                >
                                                                    <Rocket size={14} /> TESTAR 3M
                                                                </button>
                                                                <button 
                                                                    onClick={() => runScheduleNow(schedule.id)} 
                                                                    className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[12px] font-black transition-all active:scale-95 flex items-center justify-center gap-2 border border-blue-100/50"
                                                                >
                                                                    <Play size={14} /> ENVIAR AGORA
                                                                </button>
                                                            </>
                                                        )}
                                                        <button 
                                                            onClick={() => toggleSchedule(schedule.id)} 
                                                            className={`p-2.5 rounded-xl transition-all active:scale-95 border ${
                                                                schedule.active 
                                                                    ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100' 
                                                                    : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
                                                            }`}
                                                            title={schedule.active ? 'Pausar Automação' : 'Ativar Automação'}
                                                        >
                                                            {schedule.active ? <Pause size={18} /> : <Play size={18} />}
                                                        </button>
                                                        <button 
                                                            onClick={() => deleteSchedule(schedule.id)} 
                                                            className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100 transition-all" 
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={18} />
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
