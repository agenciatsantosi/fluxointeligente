import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';
import { 
    Send, Play, RefreshCw, Trash2, Clock, CheckCircle2, AlertCircle, 
    Facebook, Instagram, Video, Youtube, Flame, MessageCircle, 
    ExternalLink, AlertTriangle, ShieldAlert, Sparkles, Filter, 
    Search, ArrowUpDown, ChevronRight, Zap, Check, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DownloaderScheduleItem {
    id: number;
    user_id: number;
    platform: string;
    account_id: string;
    account_name?: string;
    source_url: string;
    media_url: string;
    media_type: 'video' | 'image' | 'carousel';
    source_platform?: string;
    caption?: string;
    scheduled_at: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error_message?: string | null;
    posted_at?: string | null;
    created_at?: string;
}

interface PausedAccount {
    key: string;
    userId: string;
    platform: string;
    accountId: string;
    pauseUntil: string;
    remainingSeconds: number;
}

interface QueueStatusSummary {
    counts: {
        total: number;
        pending: number;
        processing: number;
        completed: number;
        failed: number;
    };
    pausedAccounts: PausedAccount[];
    isRunning: boolean;
    checkIntervalSeconds: number;
}

export const DownloaderQueuePage: React.FC = () => {
    const { showAlert } = useAlert();
    const [items, setItems] = useState<DownloaderScheduleItem[]>([]);
    const [statusSummary, setStatusSummary] = useState<QueueStatusSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [triggering, setTriggering] = useState(false);
    const [actionInProgress, setActionInProgress] = useState<number | null>(null);

    // Filters
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedItemError, setSelectedItemError] = useState<{ id: number; error: string } | null>(null);

    // Fetch queue list and queue status
    const fetchQueueData = useCallback(async (isSilent = false) => {
        if (!isSilent) setRefreshing(true);
        try {
            const [scheduleRes, statusRes] = await Promise.all([
                api.get('/media/schedule').catch(() => ({ data: { success: false, schedule: [] } })),
                api.get('/downloader/queue-status').catch(() => ({ data: { success: false } }))
            ]);

            if (scheduleRes.data?.success && Array.isArray(scheduleRes.data.schedule)) {
                setItems(scheduleRes.data.schedule);
            }

            if (statusRes.data?.success) {
                setStatusSummary(statusRes.data);
            }
        } catch (err: any) {
            console.error('Erro ao carregar fila de envio:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchQueueData();
        // Polling suave a cada 10 segundos para ver envios em tempo real
        const interval = setInterval(() => {
            fetchQueueData(true);
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchQueueData]);

    // Forçar envio imediato do ciclo do robô
    const handleTriggerNow = async () => {
        setTriggering(true);
        try {
            const res = await api.post('/downloader/trigger-now');
            if (res.data?.success) {
                showAlert('success', 'Ciclo de envio disparado! O robô está processando as postagens da fila agora.');
                await fetchQueueData(true);
            } else {
                showAlert('error', res.data?.error || 'Erro ao disparar envio imediato.');
            }
        } catch (err: any) {
            showAlert('error', err.response?.data?.error || 'Falha ao acionar envio imediato.');
        } finally {
            setTriggering(false);
        }
    };

    // Publicar um item específico imediatamente
    const handleRunSingleNow = async (id: number) => {
        setActionInProgress(id);
        try {
            const res = await api.post(`/media/schedule/run-now/${id}`);
            if (res.data?.success) {
                showAlert('success', 'Post colocado em processamento prioritário imediato!');
                await fetchQueueData(true);
            } else {
                showAlert('error', res.data?.error || 'Não foi possível publicar agora.');
            }
        } catch (err: any) {
            showAlert('error', err.response?.data?.error || 'Falha ao executar postagem.');
        } finally {
            setActionInProgress(null);
        }
    };

    // Excluir post da fila
    const handleDeleteItem = async (id: number) => {
        if (!confirm('Deseja remover esta postagem da fila de envio?')) return;
        setActionInProgress(id);
        try {
            const res = await api.delete(`/media/schedule/${id}`);
            if (res.data?.success) {
                showAlert('success', 'Item removido da fila com sucesso.');
                setItems(prev => prev.filter(item => item.id !== id));
            } else {
                showAlert('error', res.data?.error || 'Erro ao remover item.');
            }
        } catch (err: any) {
            showAlert('error', err.response?.data?.error || 'Falha ao remover item.');
        } finally {
            setActionInProgress(null);
        }
    };

    // Despausar uma conta em cooldown
    const handleUnpauseAccount = async (platform?: string, accountId?: string, unpauseAll = false) => {
        try {
            const res = await api.post('/downloader/unpause', { platform, accountId, unpauseAll });
            if (res.data?.success) {
                showAlert('success', 'Pausa da conta removida! O robô voltará a enviar para ela no próximo ciclo.');
                await fetchQueueData(true);
            }
        } catch (err: any) {
            showAlert('error', err.response?.data?.error || 'Falha ao despausar conta.');
        }
    };

    // Limpar todas as falhas
    const handleClearFailed = async () => {
        if (!confirm('Deseja limpar todos os posts com falha da fila?')) return;
        setRefreshing(true);
        try {
            const res = await api.post('/media/schedule/clear-failed');
            if (res.data?.success) {
                showAlert('success', 'Posts com falha removidos com sucesso.');
                await fetchQueueData(true);
            }
        } catch (err: any) {
            showAlert('error', err.response?.data?.error || 'Falha ao limpar erros.');
        } finally {
            setRefreshing(false);
        }
    };

    // Helper de ícone de plataforma
    const getPlatformIcon = (platform: string, size = 16) => {
        switch (platform?.toLowerCase()) {
            case 'facebook': return <Facebook size={size} className="text-blue-600" />;
            case 'instagram': return <Instagram size={size} className="text-pink-600" />;
            case 'tiktok': return <Video size={size} className="text-slate-900" />;
            case 'youtube': return <Youtube size={size} className="text-red-600" />;
            case 'kwai': return <Flame size={size} className="text-orange-500" />;
            case 'whatsapp': return <MessageCircle size={size} className="text-emerald-600" />;
            default: return <Send size={size} className="text-indigo-600" />;
        }
    };

    // Helper de badge de status
    const renderStatusBadge = (status: string, errorMsg?: string | null) => {
        switch (status) {
            case 'processing':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                        <RefreshCw size={12} className="animate-spin" /> Em Envio / Baixando
                    </span>
                );
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} /> Enviado
                    </span>
                );
            case 'failed':
                return (
                    <button 
                        onClick={() => setSelectedItemError({ id: 0, error: errorMsg || 'Erro desconhecido' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                        title="Clique para ver o detalhe do erro"
                    >
                        <AlertCircle size={12} /> Falhou <Eye size={10} className="ml-0.5 opacity-70" />
                    </button>
                );
            case 'pending':
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Clock size={12} /> Na Fila (Pendente)
                    </span>
                );
        }
    };

    // Filter items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            // Platform
            if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
            // Status
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;
            // Search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const captionMatch = (item.caption || '').toLowerCase().includes(q);
                const accountMatch = (item.account_name || '').toLowerCase().includes(q);
                const urlMatch = (item.source_url || '').toLowerCase().includes(q);
                if (!captionMatch && !accountMatch && !urlMatch) return false;
            }
            return true;
        });
    }, [items, platformFilter, statusFilter, searchQuery]);

    const counts = useMemo(() => {
        return {
            total: items.length,
            pending: items.filter(i => i.status === 'pending').length,
            processing: items.filter(i => i.status === 'processing').length,
            completed: items.filter(i => i.status === 'completed').length,
            failed: items.filter(i => i.status === 'failed').length
        };
    }, [items]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
            {/* Header & Speed Status */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                            Velocidade Turbo Ativa (20s)
                        </span>
                        {statusSummary?.isRunning && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                Robô Trabalhando
                            </span>
                        )}
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
                        <Send className="text-indigo-600" size={26} />
                        Fila de Envio em Tempo Real
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Acompanhe postagens em andamento, controle pausas de segurança e dispare envios imediatos.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={handleTriggerNow}
                        disabled={triggering}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-100 active:scale-95 transition-all disabled:opacity-60"
                    >
                        <Zap size={16} className={triggering ? 'animate-bounce text-amber-300' : 'text-amber-300 fill-amber-300'} />
                        {triggering ? 'Disparando...' : 'Forçar Envio Agora'}
                    </button>

                    <button
                        onClick={() => fetchQueueData()}
                        disabled={refreshing}
                        className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors active:scale-95"
                        title="Atualizar lista"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
                    </button>
                </div>
            </div>

            {/* Alerta de Contas Pausadas (Proteção Anti-Spam da Meta) */}
            {statusSummary?.pausedAccounts && statusSummary.pausedAccounts.length > 0 && (
                <div className="space-y-3">
                    {statusSummary.pausedAccounts.map((pAcc) => (
                        <div 
                            key={pAcc.key}
                            className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                        >
                            <div className="flex items-start gap-3.5">
                                <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700 mt-0.5">
                                    <ShieldAlert size={22} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-[15px] flex items-center gap-2">
                                        Pausa Preventiva Ativa na Conta ({pAcc.platform.toUpperCase()})
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-0.5">
                                        A fila desta conta foi pausada temporariamente para respeitar o limite de frequência da Meta e evitar bloqueios.
                                        Tempo restante estimado: <strong className="text-amber-800 font-mono">{Math.ceil(pAcc.remainingSeconds / 60)} min</strong>.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleUnpauseAccount(pAcc.platform, pAcc.accountId)}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
                            >
                                <Play size={14} className="fill-white" /> Despausar Agora
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div 
                    onClick={() => setStatusFilter('pending')}
                    className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all ${
                        statusFilter === 'pending' ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md' : 'border-gray-100 hover:border-gray-200'
                    }`}
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Aguardando Envio</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-gray-900">{counts.pending}</div>
                    <p className="text-xs text-gray-400 mt-1">Prontos para postagem</p>
                </div>

                <div 
                    onClick={() => setStatusFilter('processing')}
                    className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all ${
                        statusFilter === 'processing' ? 'border-amber-500 ring-2 ring-amber-100 shadow-md' : 'border-gray-100 hover:border-gray-200'
                    }`}
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Em Envio Agora</span>
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                            <RefreshCw size={16} className={counts.processing > 0 ? 'animate-spin' : ''} />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-amber-600">{counts.processing}</div>
                    <p className="text-xs text-gray-400 mt-1">Baixando / Enviando para API</p>
                </div>

                <div 
                    onClick={() => setStatusFilter('completed')}
                    className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all ${
                        statusFilter === 'completed' ? 'border-emerald-500 ring-2 ring-emerald-100 shadow-md' : 'border-gray-100 hover:border-gray-200'
                    }`}
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Enviados</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-emerald-600">{counts.completed}</div>
                    <p className="text-xs text-gray-400 mt-1">Concluídos com sucesso</p>
                </div>

                <div 
                    onClick={() => setStatusFilter('failed')}
                    className={`cursor-pointer bg-white p-5 rounded-2xl border transition-all ${
                        statusFilter === 'failed' ? 'border-red-500 ring-2 ring-red-100 shadow-md' : 'border-gray-100 hover:border-gray-200'
                    }`}
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Falhas</span>
                        <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                            <AlertCircle size={16} />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-red-600">{counts.failed}</div>
                    <p className="text-xs text-gray-400 mt-1">Erros de API ou link</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative min-w-[220px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por legenda ou link..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                        />
                    </div>

                    {/* Platform Selector */}
                    <select
                        value={platformFilter}
                        onChange={e => setPlatformFilter(e.target.value)}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-medium text-gray-700 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="all">Todas as Redes</option>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="kwai">Kwai</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telegram">Telegram</option>
                    </select>

                    {/* Status Selector */}
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-medium text-gray-700 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="all">Todos os Status ({counts.total})</option>
                        <option value="pending">Apenas Pendentes ({counts.pending})</option>
                        <option value="processing">Em Envio ({counts.processing})</option>
                        <option value="completed">Concluídos ({counts.completed})</option>
                        <option value="failed">Falhas ({counts.failed})</option>
                    </select>
                </div>

                {counts.failed > 0 && (
                    <button
                        onClick={handleClearFailed}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                    >
                        <Trash2 size={14} /> Limpar {counts.failed} Falhas
                    </button>
                )}
            </div>

            {/* Queue Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="w-9 h-9 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-500">Sincronizando fila de envio...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="py-20 text-center px-4">
                        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-300">
                            <Send size={28} />
                        </div>
                        <h4 className="text-base font-bold text-gray-800">Nenhum post encontrado nesta visualização</h4>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                            {statusFilter === 'pending'
                                ? 'Não há vídeos aguardando envio no momento. Agende novos vídeos no Downloader!'
                                : 'Experimente trocar os filtros acima para ver outras postagens.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-400 uppercase tracking-wider font-semibold">
                                    <th className="py-3.5 px-4">Destino</th>
                                    <th className="py-3.5 px-4">Mídia / Conteúdo</th>
                                    <th className="py-3.5 px-4">Horário Programado</th>
                                    <th className="py-3.5 px-4">Status</th>
                                    <th className="py-3.5 px-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredItems.map(item => {
                                    const schedDate = new Date(item.scheduled_at);
                                    const formattedDate = isNaN(schedDate.getTime()) 
                                        ? item.scheduled_at 
                                        : schedDate.toLocaleString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        });

                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                                            {/* Destino */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                                        {getPlatformIcon(item.platform, 18)}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-gray-900 block truncate max-w-[150px]">
                                                            {item.account_name || item.account_id}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 capitalize">
                                                            {item.platform} • #{item.id}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Conteúdo */}
                                            <td className="py-3.5 px-4 max-w-[280px]">
                                                <div className="space-y-1">
                                                    <p className="text-gray-700 font-medium line-clamp-2" title={item.caption || ''}>
                                                        {item.caption ? item.caption : <span className="text-gray-400 italic">Sem legenda</span>}
                                                    </p>
                                                    {item.source_url && (
                                                        <a 
                                                            href={item.source_url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 underline truncate max-w-[240px]"
                                                        >
                                                            <ExternalLink size={11} /> Ver vídeo original
                                                        </a>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Horário */}
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 text-gray-600 font-medium">
                                                    <Clock size={13} className="text-gray-400" />
                                                    <span>{formattedDate}</span>
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                {renderStatusBadge(item.status, item.error_message)}
                                            </td>

                                            {/* Ações */}
                                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {item.status !== 'completed' && (
                                                        <button
                                                            onClick={() => handleRunSingleNow(item.id)}
                                                            disabled={actionInProgress === item.id || item.status === 'processing'}
                                                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors disabled:opacity-50"
                                                            title="Publicar este vídeo agora imediatamente"
                                                        >
                                                            <Play size={14} className={actionInProgress === item.id ? 'animate-spin' : 'fill-indigo-600'} />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        disabled={actionInProgress === item.id}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                                        title="Remover da fila"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Detalhe do Erro */}
            <AnimatePresence>
                {selectedItemError && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100"
                        >
                            <div className="flex items-start gap-3 text-red-600 mb-4">
                                <div className="p-2.5 bg-red-50 rounded-xl">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Detalhe da Falha no Envio</h3>
                                    <p className="text-xs text-gray-500">Motivo retornado pela rede social ou sistema de download</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 font-mono text-xs text-gray-800 break-words max-h-60 overflow-y-auto leading-relaxed">
                                {selectedItemError.error}
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    onClick={() => setSelectedItemError(null)}
                                    className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition-colors"
                                >
                                    Entendido, Fechar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DownloaderQueuePage;
