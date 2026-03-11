import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, Clock, Trash2, Play, Pause, Facebook, MessageCircle, Send, CheckCircle, XCircle } from 'lucide-react';

interface Schedule {
    id: number;
    platform: 'facebook' | 'whatsapp' | 'telegram';
    config: any;
    active: number;
    created_at: string;
}

const SchedulesPage: React.FC = () => {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        loadSchedules();
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
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${schedule.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        {schedule.active ? 'Ativo' : 'Pausado'}
                                                    </span>
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
                                                        <span className="font-medium">Produtos:</span>
                                                        {scheduleInfo.productCount || 1} por envio
                                                    </p>

                                                    {config.categoryType && (
                                                        <p className="flex items-center gap-2">
                                                            <span className="font-medium">Fonte:</span>
                                                            {config.categoryType === 'random' ? 'Aleatório' :
                                                                config.categoryType === 'cheapest' ? 'Mais Baratos' :
                                                                    config.categoryType === 'best_sellers_week' ? 'Mais Vendidos (Semana)' :
                                                                        config.categoryType === 'best_sellers_month' ? 'Mais Vendidos (Mês)' : 'Achadinhos'}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
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

export default SchedulesPage;
