import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, Filter, RefreshCw } from 'lucide-react';
import api from '../services/api';

interface LogEntry {
    id: number;
    timestamp: string;
    eventType: string;
    productId?: string;
    groupId?: string;
    success: boolean;
    errorMessage?: string;
    metadata?: any;
}

const LogsAuditPage: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
    const [platformFilter, setPlatformFilter] = useState<'all' | 'facebook' | 'whatsapp' | 'telegram'>('all');

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const response = await api.get('/logs');
            if (response.data.success) {
                setLogs(response.data.logs);
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearLogs = async () => {
        if (!window.confirm('Deseja realmente limpar todos os logs? Esta ação não pode ser desfeita.')) return;
        
        try {
            const response = await api.post('/logs/clear');
            if (response.data.success) {
                setLogs([]);
            }
        } catch (error) {
            console.error('Error clearing logs:', error);
            alert('Erro ao limpar logs');
        }
    };

    const filteredLogs = logs.filter(log => {
        if (filter === 'success' && !log.success) return false;
        if (filter === 'error' && log.success) return false;

        if (platformFilter !== 'all') {
            if (!log.eventType.includes(platformFilter)) return false;
        }

        return true;
    });

    const getEventIcon = (log: LogEntry) => {
        if (log.success) {
            return <CheckCircle className="w-5 h-5 text-green-600" />;
        }
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    };

    const getEventLabel = (eventType: string) => {
        const labels: Record<string, string> = {
            'facebook_send': 'Facebook',
            'whatsapp_send': 'WhatsApp',
            'telegram_send': 'Telegram',
            'pinterest_post': 'Pinterest'
        };
        return labels[eventType] || eventType;
    };

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString('pt-BR');
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-8 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Clock size={32} />
                            Logs & Auditoria
                        </h1>
                        <p className="text-white/80 mt-2">Histórico completo de envios e erros</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleClearLogs}
                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-white rounded-lg transition flex items-center gap-2"
                        >
                            <AlertCircle size={20} />
                            Limpar Tudo
                        </button>
                        <button
                            onClick={loadLogs}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition flex items-center gap-2"
                        >
                            <RefreshCw size={20} />
                            Atualizar
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <Filter size={20} className="text-gray-600" />
                        <span className="font-medium text-gray-700">Filtros:</span>
                    </div>

                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        title="Filtrar por status"
                    >
                        <option value="all">Todos</option>
                        <option value="success">✅ Sucessos</option>
                        <option value="error">❌ Erros</option>
                    </select>

                    <select
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        title="Filtrar por plataforma"
                    >
                        <option value="all">Todas Plataformas</option>
                        <option value="facebook">Facebook</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telegram">Telegram</option>
                        <option value="pinterest">Pinterest</option>
                    </select>

                    <div className="ml-auto text-sm text-gray-600">
                        {filteredLogs.length} registro(s)
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-500 mt-3">Carregando logs...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-12">
                        <Clock size={48} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">Nenhum log encontrado</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                        {filteredLogs.map(log => (
                            <div
                                key={log.id}
                                className={`p-4 rounded-lg border-2 ${log.success
                                    ? 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    {getEventIcon(log)}
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-900">
                                                    {getEventLabel(log.eventType)}
                                                </span>
                                                {log.groupId && (
                                                    <span className="text-xs text-gray-500">
                                                        ID: {log.groupId}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {formatTimestamp(log.timestamp)}
                                            </span>
                                        </div>

                                        {log.productId && (
                                            <p className="text-sm text-gray-600 mb-1">
                                                Produto: {log.productId}
                                            </p>
                                        )}

                                        {!log.success && log.errorMessage && (
                                            <div className="mt-2 p-3 bg-red-100 border border-red-200 rounded-lg">
                                                <p className="text-sm text-red-800 font-medium mb-1">Erro:</p>
                                                <p className="text-sm text-red-700">{log.errorMessage}</p>
                                            </div>
                                        )}

                                        {log.success && (
                                            <p className="text-sm text-green-700">✓ Enviado com sucesso</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold text-blue-900 mb-2">💡 Sobre os Logs:</h4>
                <ul className="space-y-1 text-sm text-blue-800">
                    <li>• Os logs são salvos automaticamente a cada envio</li>
                    <li>• Erros incluem detalhes completos para facilitar a correção</li>
                    <li>• Use os filtros para encontrar problemas específicos</li>
                </ul>
            </div>
        </div>
    );
};

export default LogsAuditPage;
