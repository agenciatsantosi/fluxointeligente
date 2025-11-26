import React, { useState, useEffect, useRef } from 'react';
import { useProducts } from '../context/ProductContext';
import { MessageCircle, Smartphone, Users, Send, Power, RefreshCw, Clock, XCircle, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const WhatsAppAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [groups, setGroups] = useState<Array<{ id: string; name: string; participants: number; enabled: boolean }>>([]);
    const groupsLoadedRef = useRef(false);

    const [productCount, setProductCount] = useState(5);
    const [mediaType, setMediaType] = useState<'auto' | 'image' | 'video'>('auto');
    const [categoryType, setCategoryType] = useState('random');
    const [enableRotation, setEnableRotation] = useState(true);
    const [simulateTyping, setSimulateTyping] = useState(true);
    const [mentionAll, setMentionAll] = useState(false);
    const [postToStatus, setPostToStatus] = useState(false);
    const [inviteLink, setInviteLink] = useState('');

    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']);
    const [automationEnabled, setAutomationEnabled] = useState(false);

    const [filters] = useState({
        minRating: 4.5,
        minPrice: 0,
        maxPrice: 1000,
        minCommission: 0,
        minDiscount: 0,
        category: ''
    });

    const [messageTemplate] = useState(`🚨 *PROMOÇÃO NA SHOPEE AGORA*

{nome_produto}

🔴 *DE:* R$ {preco_original}
🟢 *SOMENTE HOJE:* R$ {preco_com_desconto}

⭐⭐⭐⭐⭐ (Bem Avaliado)

🛒 *Compre aqui:* 👇
{link}

⚠ *Esse BUG vai acabar em alguns minutos!*`);

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const checkStatus = async () => {
        try {
            const response = await axios.get('/api/whatsapp/status');
            if (response.data.success) {
                const newStatus = response.data.status;
                setConnectionStatus(newStatus);

                if (newStatus === 'qr_ready') {
                    const qrResponse = await axios.get('/api/whatsapp/qr');
                    if (qrResponse.data.qr) {
                        setQrCode(qrResponse.data.qr);
                    }
                } else if (newStatus === 'connected' && !groupsLoadedRef.current) {
                    setQrCode(null);
                    groupsLoadedRef.current = true;
                    loadGroups();
                } else if (newStatus === 'disconnected') {
                    groupsLoadedRef.current = false;
                }
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const loadGroups = async () => {
        try {
            const response = await axios.get('/api/whatsapp/groups');
            if (response.data.success) {
                const previousSelections = new Map(groups.map(g => [g.id, g.enabled]));
                setGroups(response.data.groups.map((g: any) => ({
                    ...g,
                    enabled: previousSelections.get(g.id) || false
                })));
            }
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    };

    const handleConnect = async () => {
        try {
            showNotification('🔄 Iniciando conexão...', 'info');
            await axios.post('/api/whatsapp/initialize');
            setTimeout(checkStatus, 2000);
        } catch (error: any) {
            showNotification('❌ Erro ao conectar: ' + error.message, 'error');
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Deseja desconectar do WhatsApp?')) return;
        try {
            await axios.post('/api/whatsapp/disconnect');
            setConnectionStatus('disconnected');
            setQrCode(null);
            setGroups([]);
            groupsLoadedRef.current = false;
            showNotification('✅ Desconectado com sucesso', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao desconectar: ' + error.message, 'error');
        }
    };

    const toggleGroup = (id: string) => {
        setGroups(groups.map(g => g.id === id ? { ...g, enabled: !g.enabled } : g));
    };

    // Scheduling Helpers
    const addScheduleTime = () => {
        if (times.length < 5) setTimes([...times, '09:00']);
    };

    const updateScheduleTime = (index: number, value: string) => {
        const newTimes = [...times];
        newTimes[index] = value;
        setTimes(newTimes);
    };

    const removeScheduleTime = (index: number) => {
        if (times.length > 1) setTimes(times.filter((_, i) => i !== index));
    };

    const handleSchedule = async () => {
        const enabledGroups = groups.filter(g => g.enabled);
        if (enabledGroups.length === 0) {
            showNotification('❌ Selecione pelo menos um grupo!', 'error');
            return;
        }
        if (!automationEnabled) {
            showNotification('❌ Marque "Ativar agendamento automático" primeiro!', 'error');
            return;
        }

        const scheduleText = frequency === 'daily' ? 'todo dia' : frequency === 'weekly' ? 'toda semana' : 'todo mês';
        const timeText = scheduleMode === 'multiple' ? `${times.length} horários` : `às ${time}`;
        const confirmMsg = `Agendar envio de ${productCount} produto(s) ${scheduleText} (${timeText}) para ${enabledGroups.length} grupo(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            const response = await axios.post('/api/whatsapp/schedule', {
                whatsappRecipients: enabledGroups.map(g => ({ id: g.id, name: g.name, type: 'group' })),
                schedule: {
                    frequency,
                    time,
                    times,
                    scheduleMode,
                    productCount,
                    enabled: true
                },
                shopeeSettings: shopeeAffiliateSettings,
                categoryType,
                mediaType,
                messageTemplate,
                enableRotation,
                options: {
                    simulateTyping,
                    mentionAll,
                    postToStatus
                }
            });

            if (response.data.success) {
                showNotification(`✅ Agendamento salvo! Veja em "Agendamentos" no menu lateral`, 'success');
                // Reset automation checkbox so user knows it was saved
                setAutomationEnabled(false);
            } else {
                showNotification('❌ Erro ao salvar agendamento', 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao agendar: ' + error.message, 'error');
        }
    };

    const handleSendNow = async () => {
        const enabledGroups = groups.filter(g => g.enabled);
        if (enabledGroups.length === 0) {
            showNotification('❌ Selecione pelo menos um grupo!', 'error');
            return;
        }
        if (!shopeeAffiliateSettings.appId) {
            showNotification('❌ Configure suas credenciais da Shopee primeiro!', 'error');
            return;
        }

        const confirmMsg = `Enviar ${productCount} produto(s) para ${enabledGroups.length} grupo(s)?`;
        if (!confirm(confirmMsg)) return;

        try {
            const totalToSend = productCount * enabledGroups.length;
            setSendingStatus({ active: true, current: 0, total: totalToSend, success: 0, failed: 0 });

            const response = await axios.post('/api/whatsapp/post-now', {
                recipients: enabledGroups,
                productCount,
                shopeeSettings: shopeeAffiliateSettings,
                filters,
                mediaType,
                messageTemplate,
                enableRotation,
                categoryType,
                options: {
                    simulateTyping,
                    mentionAll,
                    postToStatus
                }
            });

            if (response.data.success) {
                const details = response.data.details;
                setSendingStatus({
                    active: false,
                    current: totalToSend,
                    total: totalToSend,
                    success: details.success,
                    failed: details.failed
                });
                showNotification(`✅ ${details.success} enviados, ${details.failed} falhas`, 'success');
                setTimeout(() => setSendingStatus(null), 5000);
            } else {
                setSendingStatus(null);
                showNotification('❌ Erro: ' + response.data.error, 'error');
            }
        } catch (error: any) {
            setSendingStatus(null);
            showNotification('❌ Erro ao enviar: ' + error.message, 'error');
        }
    };

    const getStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'bg-green-500';
            case 'connecting': return 'bg-yellow-500';
            case 'qr_ready': return 'bg-blue-500';
            default: return 'bg-gray-500';
        }
    };

    const getStatusText = () => {
        switch (connectionStatus) {
            case 'connected': return 'Conectado';
            case 'connecting': return 'Conectando...';
            case 'qr_ready': return 'Aguardando QR Code';
            default: return 'Desconectado';
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl backdrop-blur-md border ${notification.type === 'success' ? 'bg-green-500/90 border-green-400' :
                    notification.type === 'error' ? 'bg-red-500/90 border-red-400' : 'bg-blue-500/90 border-blue-400'
                    } text-white animate-slide-in`}>
                    <div className="flex items-center gap-3">
                        {notification.type === 'success' ? <CheckCircle size={20} /> : notification.type === 'error' ? <XCircle size={20} /> : <MessageCircle size={20} />}
                        <span className="font-medium">{notification.message}</span>
                    </div>
                </div>
            )}

            {sendingStatus && (
                <div className="fixed top-24 right-4 z-50 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/20 min-w-[320px] animate-slide-in">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-3 h-3 rounded-full ${sendingStatus.active ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`}></div>
                        <span className="font-bold text-gray-800 text-lg">
                            {sendingStatus.active ? '🚀 Enviando...' : '✅ Concluído!'}
                        </span>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm text-gray-600 font-medium">
                            <span>Progresso</span>
                            <span>{sendingStatus.current}/{sendingStatus.total}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-green-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}
                            ></div>
                        </div>
                        {!sendingStatus.active && (
                            <div className="flex justify-between text-xs mt-3 pt-3 border-t border-gray-100">
                                <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded-lg">✓ {sendingStatus.success} enviados</span>
                                <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded-lg">✗ {sendingStatus.failed} falhas</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-green-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <MessageCircle size={32} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold">Automação WhatsApp</h1>
                        </div>
                        <p className="text-green-100 text-lg max-w-xl">Envie ofertas irresistíveis para seus grupos e aumente suas comissões.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse shadow-[0_0_10px_currentColor]`}></div>
                        <span className="font-semibold tracking-wide">{getStatusText()}</span>
                    </div>
                </div>
            </div>

            {/* Connection Card */}
            <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                        <Smartphone size={24} />
                    </div>
                    Conexão do Dispositivo
                </h2>

                {connectionStatus === 'disconnected' && (
                    <div className="text-center py-12 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 hover:border-green-300 transition-colors">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                            <Power size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">WhatsApp Desconectado</h3>
                        <p className="text-gray-500 mb-8 max-w-md mx-auto">Conecte seu WhatsApp para começar a enviar ofertas automaticamente para seus grupos.</p>
                        <button
                            onClick={handleConnect}
                            className="px-8 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-500/30 hover:shadow-green-500/40 hover:-translate-y-1 font-bold flex items-center gap-3 mx-auto"
                        >
                            <Power size={20} />
                            Iniciar Conexão
                        </button>
                    </div>
                )}

                {connectionStatus === 'qr_ready' && qrCode && (
                    <div className="text-center py-10">
                        <div className="inline-block p-6 bg-white rounded-2xl shadow-xl border border-gray-100 mb-6">
                            <QRCodeSVG value={qrCode} size={280} level="H" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Escaneie o QR Code</h3>
                        <p className="text-gray-500 text-sm bg-gray-100 inline-block px-4 py-2 rounded-full">
                            WhatsApp ➝ Configurações ➝ Aparelhos conectados ➝ Conectar aparelho
                        </p>
                    </div>
                )}

                {connectionStatus === 'connected' && (
                    <div className="flex items-center justify-between bg-green-50/50 p-6 rounded-2xl border border-green-100">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                <CheckCircle size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-green-900 text-lg">Dispositivo Conectado</h3>
                                <p className="text-green-700 text-sm">Seu WhatsApp está pronto para enviar mensagens.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className="px-6 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors font-medium shadow-sm hover:shadow"
                        >
                            Desconectar
                        </button>
                    </div>
                )}
            </div>

            {connectionStatus === 'connected' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Groups Section */}
                    <div className="lg:col-span-1 bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg flex flex-col h-[600px]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <Users size={20} className="text-green-600" />
                                Grupos
                                <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                                    {groups.filter(g => g.enabled).length}
                                </span>
                            </h2>
                            <button
                                onClick={() => {
                                    showNotification('🔄 Atualizando grupos...', 'info');
                                    loadGroups();
                                }}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Atualizar lista"
                            >
                                <RefreshCw size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {groups.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <Users size={48} className="mx-auto mb-3 opacity-20" />
                                    <p>Nenhum grupo encontrado</p>
                                </div>
                            ) : (
                                groups.map(group => (
                                    <div
                                        key={group.id}
                                        onClick={() => toggleGroup(group.id)}
                                        className={`p-4 rounded-xl border transition-all cursor-pointer group ${group.enabled
                                                ? 'bg-green-50 border-green-200 shadow-sm'
                                                : 'bg-white border-gray-100 hover:border-green-200 hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0 mr-3">
                                                <p className={`font-semibold truncate ${group.enabled ? 'text-green-900' : 'text-gray-700'}`}>
                                                    {group.name}
                                                </p>
                                                <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                                                    <Users size={12} />
                                                    {group.participants} participantes
                                                </p>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${group.enabled
                                                    ? 'bg-green-500 border-green-500'
                                                    : 'border-gray-300 group-hover:border-green-400'
                                                }`}>
                                                {group.enabled && <CheckCircle size={14} className="text-white" />}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Configuration & Actions */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Settings Card */}
                        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <Smartphone size={24} />
                                </div>
                                Configuração do Envio
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Quantidade de Produtos</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={productCount}
                                            onChange={(e) => setProductCount(parseInt(e.target.value))}
                                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all font-medium text-lg"
                                            min="1"
                                            max="50"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">itens</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Tipo de Mídia</label>
                                    <select
                                        value={mediaType}
                                        onChange={(e) => setMediaType(e.target.value as any)}
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all font-medium appearance-none"
                                    >
                                        <option value="auto">📸 Automático (Imagem)</option>
                                        <option value="image">🖼️ Apenas Imagem</option>
                                        <option value="video">🎥 Priorizar Vídeo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Fonte de Produtos</label>
                                <select
                                    value={categoryType}
                                    onChange={(e) => setCategoryType(e.target.value)}
                                    className="w-full p-4 bg-blue-50/50 border border-blue-100 text-blue-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium"
                                >
                                    <option value="random">🎲 Aleatório (Baseado nos seus filtros)</option>
                                    <option value="cheapest">📉 Mais Baratos (Ofertas arrasadoras)</option>
                                    <option value="best_sellers_week">🔥 Mais Vendidos da Semana</option>
                                    <option value="best_sellers_month">📅 Mais Vendidos do Mês</option>
                                    <option value="achadinhos">🕵️ Achadinhos Imperdíveis</option>
                                </select>
                            </div>

                            <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                                <label className="flex items-center cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={enableRotation}
                                        onChange={(e) => setEnableRotation(e.target.checked)}
                                        className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300"
                                    />
                                    <span className="ml-3 text-gray-700 font-medium group-hover:text-green-700 transition-colors">
                                        🔄 Evitar produtos repetidos (24h)
                                    </span>
                                </label>
                                <label className="flex items-center cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={simulateTyping}
                                        onChange={(e) => setSimulateTyping(e.target.checked)}
                                        className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300"
                                    />
                                    <span className="ml-3 text-gray-700 font-medium group-hover:text-green-700 transition-colors">
                                        ✍️ Simular digitação (Mais humano)
                                    </span>
                                </label>
                            </div>

                            <button
                                onClick={handleSendNow}
                                disabled={groups.filter(g => g.enabled).length === 0}
                                className="w-full mt-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-3"
                            >
                                <Send size={24} />
                                Enviar Agora
                            </button>
                        </div>

                        {/* Scheduling Card */}
                        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                    <Clock size={24} />
                                </div>
                                Agendamento Automático
                            </h2>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Modo de Agendamento</label>
                                    <div className="flex p-1 bg-gray-100 rounded-xl">
                                        <button
                                            onClick={() => setScheduleMode('single')}
                                            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${scheduleMode === 'single'
                                                    ? 'bg-white text-gray-800 shadow-sm'
                                                    : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            Horário Único
                                        </button>
                                        <button
                                            onClick={() => setScheduleMode('multiple')}
                                            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${scheduleMode === 'multiple'
                                                    ? 'bg-white text-gray-800 shadow-sm'
                                                    : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            Múltiplos Horários
                                        </button>
                                    </div>
                                </div>

                                {scheduleMode === 'single' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Frequência</label>
                                            <select
                                                value={frequency}
                                                onChange={(e) => setFrequency(e.target.value as any)}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                                            >
                                                <option value="daily">Diário</option>
                                                <option value="weekly">Semanal</option>
                                                <option value="monthly">Mensal</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Horário</label>
                                            <input
                                                type="time"
                                                value={time}
                                                onChange={(e) => setTime(e.target.value)}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-gray-700">Horários de Disparo</label>
                                            {times.length < 5 && (
                                                <button
                                                    onClick={addScheduleTime}
                                                    className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                                                >
                                                    + Adicionar
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {times.map((t, index) => (
                                                <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                                    <span className="text-xs font-bold text-gray-400 w-6 text-center">{index + 1}º</span>
                                                    <input
                                                        type="time"
                                                        value={t}
                                                        onChange={(e) => updateScheduleTime(index, e.target.value)}
                                                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-800 p-0"
                                                    />
                                                    {times.length > 1 && (
                                                        <button
                                                            onClick={() => removeScheduleTime(index)}
                                                            className="text-gray-400 hover:text-red-500 p-1"
                                                        >
                                                            <XCircle size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                checked={automationEnabled}
                                                onChange={(e) => setAutomationEnabled(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">Ativar Agendamento</span>
                                    </label>
                                    <button
                                        onClick={handleSchedule}
                                        className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"
                                    >
                                        <Clock size={18} />
                                        Salvar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppAutomationPage;
