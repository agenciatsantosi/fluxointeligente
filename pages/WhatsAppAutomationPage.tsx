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
        const confirmMsg = `Agendar envio de ${productCount} produto(s) ${scheduleText} para ${enabledGroups.length} grupo(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            await axios.post('/api/whatsapp/schedule', {
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

            showNotification('✅ Agendamento salvo com sucesso!', 'success');
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
        <div className="space-y-6">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${notification.type === 'success' ? 'bg-green-500' :
                    notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    } text-white`}>
                    {notification.message}
                </div>
            )}

            {sendingStatus && (
                <div className="fixed top-20 right-4 z-50 bg-white rounded-lg shadow-2xl p-4 border-2 border-green-500 min-w-[300px]">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="font-bold text-gray-800">
                            {sendingStatus.active ? '🚀 Enviando...' : '✅ Concluído!'}
                        </span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Progresso:</span>
                            <span className="font-medium">{sendingStatus.current}/{sendingStatus.total}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}
                            ></div>
                        </div>
                        {!sendingStatus.active && (
                            <div className="flex justify-between text-xs mt-2 pt-2 border-t">
                                <span className="text-green-600">✓ {sendingStatus.success} enviados</span>
                                <span className="text-red-600">✗ {sendingStatus.failed} falhas</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-8 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <MessageCircle size={32} />
                            Automação WhatsApp
                        </h1>
                        <p className="text-white/80 mt-2">Envie produtos para grupos do WhatsApp automaticamente</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`}></div>
                        <span className="font-medium">{getStatusText()}</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Smartphone size={20} className="text-green-600" />
                    Conexão WhatsApp
                </h2>

                {connectionStatus === 'disconnected' && (
                    <div className="text-center py-8">
                        <button
                            onClick={handleConnect}
                            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2 mx-auto"
                        >
                            <Power size={20} />
                            Conectar WhatsApp
                        </button>
                        <p className="text-sm text-gray-500 mt-3">Clique para gerar o QR Code</p>
                    </div>
                )}

                {connectionStatus === 'qr_ready' && qrCode && (
                    <div className="text-center py-8">
                        <div className="inline-block p-4 bg-white rounded-lg border-2 border-green-500">
                            <QRCodeSVG value={qrCode} size={256} />
                        </div>
                        <p className="text-sm text-gray-600 mt-4">Escaneie este QR Code com seu WhatsApp</p>
                        <p className="text-xs text-gray-500 mt-2">WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho</p>
                    </div>
                )}

                {connectionStatus === 'connected' && (
                    <div className="text-center py-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="font-medium">WhatsApp Conectado</span>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm"
                        >
                            Desconectar
                        </button>
                    </div>
                )}
            </div>

            {connectionStatus === 'connected' && (
                <>
                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <Users size={20} className="text-green-600" />
                                Grupos ({groups.filter(g => g.enabled).length} selecionados)
                            </h2>
                            <button
                                onClick={() => {
                                    showNotification('🔄 Atualizando grupos...', 'info');
                                    loadGroups();
                                }}
                                className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2 text-sm"
                            >
                                <RefreshCw size={16} />
                                Atualizar Grupos
                            </button>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {groups.length === 0 ? (
                                <p className="text-gray-500 text-center py-4">Nenhum grupo encontrado</p>
                            ) : (
                                groups.map(group => (
                                    <div
                                        key={group.id}
                                        className={`p-3 rounded-lg border-2 cursor-pointer transition ${group.enabled ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                                            }`}
                                        onClick={() => toggleGroup(group.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-gray-900">{group.name}</p>
                                                <p className="text-xs text-gray-500">{group.participants} participantes</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={group.enabled}
                                                onChange={() => { }}
                                                className="w-5 h-5 text-green-600"
                                                title={`Selecionar grupo ${group.name}`}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Configuração</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de Produtos</label>
                                <input
                                    type="number"
                                    value={productCount}
                                    onChange={(e) => setProductCount(parseInt(e.target.value))}
                                    className="w-full p-2 border border-gray-300 rounded-lg"
                                    min="1"
                                    max="50"
                                    title="Quantidade de produtos"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Mídia</label>
                                <select
                                    value={mediaType}
                                    onChange={(e) => setMediaType(e.target.value as any)}
                                    className="w-full p-2 border border-gray-300 rounded-lg"
                                    title="Selecione o tipo de mídia"
                                >
                                    <option value="auto">Automático (Imagem se tiver)</option>
                                    <option value="image">Apenas Imagem</option>
                                    <option value="video">Priorizar Vídeo 🎥</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fonte de Produtos</label>
                            <select
                                value={categoryType}
                                onChange={(e) => setCategoryType(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg bg-green-50 border-green-200 text-green-800 font-medium"
                                title="Selecione a fonte de produtos"
                            >
                                <option value="random">🎲 Aleatório (Seus Filtros)</option>
                                <option value="cheapest">📉 Mais Baratos (Preço Baixo)</option>
                                <option value="best_sellers_week">🔥 Mais Vendidos da Semana</option>
                                <option value="best_sellers_month">📅 Mais Vendidos do Mês</option>
                                <option value="achadinhos">🕵️ Achadinhos / Promoções</option>
                            </select>
                        </div>

                        <div className="mt-4">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enableRotation}
                                    onChange={(e) => setEnableRotation(e.target.checked)}
                                    className="w-4 h-4 text-green-600 border-gray-300 rounded"
                                    title="Evitar produtos repetidos"
                                />
                                <span className="ml-2 text-sm font-medium text-gray-700">
                                    🔄 Evitar Produtos Repetidos (24h)
                                </span>
                            </label>
                        </div>

                        {/* Ferramentas Extras */}
                        <div className="mt-6 border-t pt-4">
                            <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Ferramentas Extras</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="flex items-center cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
                                    <input
                                        type="checkbox"
                                        checked={simulateTyping}
                                        onChange={(e) => setSimulateTyping(e.target.checked)}
                                        className="w-4 h-4 text-green-600 border-gray-300 rounded"
                                        title="Simular digitação"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">
                                        ✍️ Simular Digitação (Mais Humano)
                                    </span>
                                </label>

                                <label className="flex items-center cursor-pointer p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
                                    <input
                                        type="checkbox"
                                        checked={postToStatus}
                                        onChange={(e) => setPostToStatus(e.target.checked)}
                                        className="w-4 h-4 text-green-600 border-gray-300 rounded"
                                        title="Postar no status"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">
                                        📱 Postar no Status Também
                                    </span>
                                </label>
                            </div>

                            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={mentionAll}
                                        onChange={(e) => setMentionAll(e.target.checked)}
                                        className="w-4 h-4 text-red-600 border-gray-300 rounded"
                                        title="Marcar todos"
                                    />
                                    <span className="ml-2 text-sm font-bold text-red-700">
                                        📢 Marcar Todos (@todos) - CUIDADO!
                                    </span>
                                </label>
                                <p className="text-xs text-red-600 mt-1 ml-6 font-bold">
                                    ⚠️ Cuidado com o @todos! Use com moderação para evitar banimentos.
                                </p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <button
                                onClick={handleSendNow}
                                disabled={groups.filter(g => g.enabled).length === 0}
                                className="w-full px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Send size={20} />
                                Enviar Agora
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Clock size={20} className="text-orange-600" />
                            Agendamento Automático
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Modo de Agendamento</label>
                                <select
                                    value={scheduleMode}
                                    onChange={(e) => setScheduleMode(e.target.value as any)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    title="Selecione o modo de agendamento"
                                >
                                    <option value="single">1x por dia (horário único)</option>
                                    <option value="multiple">Múltiplos horários por dia (até 5x)</option>
                                </select>
                            </div>

                            {scheduleMode === 'single' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Frequência</label>
                                        <select
                                            value={frequency}
                                            onChange={(e) => setFrequency(e.target.value as any)}
                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                            title="Selecione a frequência"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                            title="Selecione o horário"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-medium text-gray-700">Horários (máx. 5)</label>
                                        {times.length < 5 && (
                                            <button onClick={addScheduleTime} className="text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded-lg hover:bg-orange-200">+ Add</button>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {times.map((t, index) => (
                                            <div key={index} className="flex gap-2 items-center">
                                                <span className="text-sm font-medium text-gray-600 w-10">{index + 1}º</span>
                                                <input
                                                    type="time"
                                                    value={t}
                                                    onChange={(e) => updateScheduleTime(index, e.target.value)}
                                                    className="flex-1 p-2 border border-gray-300 rounded-lg"
                                                    title={`Horário ${index + 1}`}
                                                />
                                                {times.length > 1 && (
                                                    <button onClick={() => removeScheduleTime(index)} className="text-red-600 p-2" title="Remover horário"><XCircle size={20} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={automationEnabled}
                                        onChange={(e) => setAutomationEnabled(e.target.checked)}
                                        className="w-5 h-5 text-orange-600 rounded"
                                        title="Ativar agendamento"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Ativar agendamento</span>
                                </label>
                                <button
                                    onClick={handleSchedule}
                                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center gap-2"
                                >
                                    <Clock size={18} />
                                    Salvar Agendamento
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default WhatsAppAutomationPage;
