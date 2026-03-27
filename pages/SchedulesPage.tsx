import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, Clock, Trash2, Play, Pause, Facebook, MessageCircle, Send, CheckCircle, XCircle } from 'lucide-react';

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

const SchedulesPage: React.FC = () => {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        loadSchedules();

        // Update countdowns every minute
        const timer = setInterval(() => {
            setSchedules(prev => [...prev]); // Trigger re-render to update getTimeRemaining
        }, 60000);

        return () => clearInterval(timer);
    }, []);

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

    return (
        <div className="space-y-6">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                    {notification.message}
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Calendar className="text-purple-600" />
                        Agendamentos Ativos
                    </h2>
                    <button
                        onClick={loadSchedules}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                    >
                        Atualizar
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                        <p className="text-gray-500 mt-4">Carregando agendamentos...</p>
                    </div>
                ) : schedules.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <Calendar size={48} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">Nenhum agendamento encontrado</p>
                        <p className="text-sm text-gray-400 mt-1">Crie agendamentos nas páginas de automação</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {schedules.map(schedule => {
                            const config = parseConfig(schedule.config);
                            const scheduleInfo = config.schedule || {};

                            return (
                                <div key={schedule.id} className={`bg-white border rounded-xl p-6 transition-all hover:shadow-md ${schedule.active ? 'border-purple-200 ring-1 ring-purple-100' : 'border-gray-200 opacity-75'}`}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-gray-50 rounded-lg">
                                                {getPlatformIcon(schedule.platform)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-gray-900 capitalize text-lg">
                                                        {schedule.platform} Automation
                                                    </h3>
                                                    {/* Exibição da Conta/Página */}
                                                    {schedule.platform === 'instagram' && config.instagramAccounts?.[0]?.username && (
                                                        <span className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100">
                                                            @{config.instagramAccounts[0].username}
                                                        </span>
                                                    )}
                                                    {schedule.platform === 'facebook' && config.facebookPages?.[0]?.name && (
                                                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                                                            {config.facebookPages[0].name}
                                                        </span>
                                                    )}
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${schedule.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        {schedule.active ? 'Ativo' : 'Pausado'}
                                                    </span>

                                                    {/* Badge de Plataforma + Tipo (Ex: Shopee Story, Meta Reels) */}
                                                    <div className="flex items-center gap-1.5">
                                                        {config.shopeeSettings && (
                                                            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-bold uppercase tracking-wider border border-orange-100">
                                                                Shopee
                                                            </span>
                                                        )}
                                                        
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                                            config.mediaType === 'story' || config.automationType === 'story' || config.postType === 'story' ? 'bg-pink-50 text-pink-700 border-pink-100' :
                                                            config.mediaType === 'reel' || config.mediaType === 'reels' || config.automationType === 'reel' || config.postType === 'reels' || config.postType === 'reel' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                            'bg-blue-50 text-blue-700 border-blue-100'
                                                        }`}>
                                                            {config.mediaType === 'story' || config.automationType === 'story' || config.postType === 'story' ? 'Story' :
                                                                config.mediaType === 'reel' || config.mediaType === 'reels' || config.automationType === 'reel' || config.postType === 'reels' || config.postType === 'reel' ? 'Reels' :
                                                                    config.mediaType === 'video' ? 'Vídeo' : 'Feed Post'}
                                                        </span>
                                                    </div>

                                                    {schedule.active && schedule.nextExecution && (
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-100 animate-pulse-subtle">
                                                            <Clock size={12} className="text-purple-500" />
                                                            <span className="text-xs font-semibold whitespace-nowrap">
                                                                Próximo envio: {getTimeRemaining(schedule.nextExecution)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {schedule.totalSent !== undefined && schedule.totalSent > 0 && (
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100">
                                                            <CheckCircle size={12} className="text-green-500" />
                                                            <span className="text-xs font-semibold whitespace-nowrap">
                                                                Total enviado: {schedule.totalSent}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-2 space-y-1 text-sm text-gray-600">
                                                    <p className="flex items-center gap-2">
                                                        <Clock size={14} />
                                                        <span className="font-medium">Frequência:</span>
                                                        {scheduleInfo.frequency === 'daily' ? 'Diário' :
                                                            scheduleInfo.frequency === 'weekly' ? 'Semanal' :
                                                                scheduleInfo.frequency === 'monthly' ? 'Mensal' : 'Não definido'}
                                                    </p>

                                                    <p className="flex items-center gap-2">
                                                        <span className="font-medium">Horários:</span>
                                                        {scheduleInfo.scheduleMode === 'multiple' && scheduleInfo.times && scheduleInfo.times.length > 0
                                                            ? scheduleInfo.times.join(', ')
                                                            : scheduleInfo.time ? scheduleInfo.time : 'Não definido'}
                                                    </p>

                                                    <p className="flex items-center gap-2">
                                                        <span className="font-medium">Quantidade:</span>
                                                        <span className="bg-gray-100 px-1.5 py-0.2 rounded text-[11px] font-medium text-gray-700">
                                                            {scheduleInfo.productCount || 1} {scheduleInfo.productCount === 1 ? 'item' : 'itens'} / por rodada
                                                        </span>
                                                    </p>

                                                    {(config.categoryType || config.shopeeSettings) && (
                                                        <p className="flex items-center gap-2">
                                                            <span className="font-medium">Fonte:</span>
                                                            <span className="text-gray-900">
                                                                {config.categoryType === 'random' ? 'Aleatório' :
                                                                    config.categoryType === 'cheapest' ? 'Mais Baratos' :
                                                                        config.categoryType === 'best_sellers_week' ? 'Mais Vendidos (Semana)' :
                                                                            config.categoryType === 'best_sellers_month' ? 'Mais Vendidos (Mês)' : 'Achadinhos'}
                                                            </span>
                                                            {config.shopeeSettings && <span className="text-orange-500 text-[10px] font-bold ml-1 px-1 bg-orange-50 rounded">SHOPEE API</span>}
                                                        </p>
                                                    )}

                                                    {schedule.lastExecution && (
                                                        <p className="flex items-center gap-2 text-xs text-gray-400 italic">
                                                            Último envio em: {new Date(schedule.lastExecution).toLocaleString('pt-BR')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {schedule.active && (
                                                <button
                                                    onClick={() => runScheduleNow(schedule.id)}
                                                    className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition flex items-center gap-2 px-3"
                                                    title="Executar Agora"
                                                >
                                                    <Play size={18} fill="currentColor" />
                                                    <span className="text-xs font-bold uppercase">Rodar Agora</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => toggleSchedule(schedule.id)}
                                                className={`p-2 rounded-lg transition ${schedule.active
                                                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                                    : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                                title={schedule.active ? "Pausar" : "Ativar"}
                                            >
                                                {schedule.active ? <Pause size={20} /> : <Play size={20} />}
                                            </button>
                                            <button
                                                onClick={() => deleteSchedule(schedule.id)}
                                                className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                                                title="Excluir"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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
