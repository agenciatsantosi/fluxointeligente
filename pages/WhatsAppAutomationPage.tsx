import React, { useState, useEffect, useRef } from 'react';
import { useProducts } from '../context/ProductContext';
import { MessageCircle, Smartphone, Users, Send, Power, RefreshCw, Clock, XCircle, CheckCircle } from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const WhatsAppAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [accounts, setAccounts] = useState<Array<{ id: number; name: string; status: string; phone?: string }>>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');

    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [groups, setGroups] = useState<Array<{ id: string; name: string; participants: number; enabled: boolean }>>([]);
    const groupsLoadedRef = useRef<Record<number, boolean>>({});

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
        loadAccounts();
    }, []);

    useEffect(() => {
        if (selectedAccountId) {
            checkStatus();
            const interval = setInterval(checkStatus, 3000);
            return () => clearInterval(interval);
        }
    }, [selectedAccountId]);

    const loadAccounts = async () => {
        try {
            const response = await axios.get('/api/whatsapp/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(response.data.accounts[0].id);
                }
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        }
    };

    const handleAddAccount = async () => {
        if (!newAccountName.trim()) return;
        try {
            const response = await axios.post('/api/whatsapp/accounts', { name: newAccountName });
            if (response.data.success) {
                showNotification('✅ Nova conta adicionada!', 'success');
                setNewAccountName('');
                setShowAddModal(false);
                loadAccounts();
            }
        } catch (error: any) {
            showNotification('❌ Erro ao adicionar: ' + error.message, 'error');
        }
    };

    const handleDeleteAccount = async (id: number) => {
        if (!confirm('Deseja realmente excluir esta conexão? Todos os dados dela serão apagados.')) return;
        try {
            await axios.delete(`/api/whatsapp/accounts/${id}`);
            showNotification('✅ Conta excluída', 'success');
            if (selectedAccountId === id) setSelectedAccountId(null);
            loadAccounts();
        } catch (error: any) {
            showNotification('❌ Erro ao excluir: ' + error.message, 'error');
        }
    };

    const checkStatus = async () => {
        if (!selectedAccountId) return;
        try {
            const response = await axios.get('/api/whatsapp/status', { params: { accountId: selectedAccountId } });
            if (response.data.success) {
                const newStatus = response.data.status;
                setConnectionStatus(newStatus);

                if (newStatus === 'pending_qr' || newStatus === 'qr_ready') {
                    const qrResponse = await axios.get('/api/whatsapp/qr', { params: { accountId: selectedAccountId } });
                    if (qrResponse.data.qr) {
                        setQrCode(qrResponse.data.qr);
                    }
                } else if (newStatus === 'connected') {
                    setQrCode(null);
                    if (!groupsLoadedRef.current[selectedAccountId]) {
                        groupsLoadedRef.current[selectedAccountId] = true;
                        loadGroups();
                    }
                } else if (newStatus === 'disconnected') {
                    groupsLoadedRef.current[selectedAccountId] = false;
                }
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const loadGroups = async () => {
        if (!selectedAccountId) return;
        try {
            const response = await axios.get('/api/whatsapp/groups', { params: { accountId: selectedAccountId } });
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
        if (!selectedAccountId) return;
        try {
            showNotification('🔄 Iniciando conexão...', 'info');
            await axios.post('/api/whatsapp/initialize', { accountId: selectedAccountId });
            setTimeout(checkStatus, 2000);
        } catch (error: any) {
            showNotification('❌ Erro ao conectar: ' + error.message, 'error');
        }
    };

    const handleDisconnect = async () => {
        if (!selectedAccountId || !confirm('Deseja desconectar do WhatsApp?')) return;
        try {
            await axios.post('/api/whatsapp/disconnect', { accountId: selectedAccountId });
            setConnectionStatus('disconnected');
            setQrCode(null);
            setGroups([]);
            groupsLoadedRef.current[selectedAccountId] = false;
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
        if (!selectedAccountId) return;
        const enabledGroups = groups.filter(g => g.enabled);
        if (enabledGroups.length === 0) {
            showNotification('❌ Selecione pelo menos um grupo!', 'error');
            return;
        }
        if (!automationEnabled) {
            showNotification('❌ Marque "Ativar agendamento automático" primeiro!', 'error');
            return;
        }

        const confirmMsg = `Agendar para ${enabledGroups.length} grupo(s)?`;
        if (!confirm(confirmMsg)) return;

        try {
            const response = await axios.post('/api/whatsapp/schedule', {
                accountId: selectedAccountId,
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
                showNotification(`✅ Agendamento salvo!`, 'success');
                // Reset automation checkbox so user knows it was saved
                setAutomationEnabled(false);
            } else {
                showNotification('❌ Erro ao salvar agendamento', 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao agendar: ' + error.message, 'error');
        }
    };

    const [sendMode, setSendMode] = useState<'auto' | 'manual'>('auto');
    const [manualMessage, setManualMessage] = useState('');

    const handleSendNow = async () => {
        if (!selectedAccountId) return;
        const enabledGroups = groups.filter(g => g.enabled);
        if (enabledGroups.length === 0) {
            showNotification('❌ Selecione pelo menos um grupo!', 'error');
            return;
        }

        if (sendMode === 'manual' && !manualMessage.trim()) {
            showNotification('❌ Digite uma mensagem para enviar!', 'error');
            return;
        }

        if (sendMode === 'auto' && !shopeeAffiliateSettings.appId) {
            showNotification('❌ Configure suas credenciais da Shopee primeiro!', 'error');
            return;
        }

        const confirmMsg = sendMode === 'manual'
            ? `Enviar mensagem manual para ${enabledGroups.length} grupo(s)?`
            : `Enviar ${productCount} produto(s) para ${enabledGroups.length} grupo(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            const totalToSend = sendMode === 'manual' ? enabledGroups.length : productCount * enabledGroups.length;
            setSendingStatus({ active: true, current: 0, total: totalToSend, success: 0, failed: 0 });

            const response = await axios.post('/api/whatsapp/post-now', {
                accountId: selectedAccountId,
                recipients: enabledGroups.map(g => ({ ...g, accountId: selectedAccountId })),
                productCount,
                shopeeSettings: shopeeAffiliateSettings,
                filters,
                mediaType,
                messageTemplate,
                enableRotation,
                categoryType,
                sendMode,
                manualMessage,
                options: {
                    simulateTyping,
                    mentionAll,
                    postToStatus,
                    accountId: selectedAccountId
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
                showNotification(`✅ ${details.success} enviados`, 'success');
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'connected': return 'bg-green-500';
            case 'pending_qr':
            case 'qr_ready': return 'bg-blue-500';
            case 'connecting': return 'bg-yellow-500';
            default: return 'bg-gray-500';
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-12">
            {notification && (
                <div className={`fixed top-4 right-4 z-[100] p-4 rounded-xl shadow-2xl backdrop-blur-md border ${notification.type === 'success' ? 'bg-green-500/90 border-green-400' :
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
                    </div>
                </div>
            )}

            {/* Account Selection Section */}
            <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 text-green-600 rounded-2xl">
                            <Smartphone size={28} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">Minhas Conexões</h2>
                            <p className="text-sm text-gray-500">Gerencie múltiplos números de WhatsApp em uma única conta.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-500/20 font-bold flex items-center gap-2"
                    >
                        + Adicionar WhatsApp
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => setSelectedAccountId(acc.id)}
                            className={`p-6 rounded-3xl border-2 transition-all cursor-pointer relative group ${selectedAccountId === acc.id
                                ? 'bg-green-50 border-green-500 shadow-lg ring-4 ring-green-500/10 scale-[1.03]'
                                : 'bg-white border-gray-100 hover:border-green-200 hover:shadow-md'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${getStatusColor(acc.id === selectedAccountId ? connectionStatus : acc.status)} animate-pulse shadow-[0_0_8px_currentColor]`}></div>
                                    <span className="font-bold text-gray-800 text-lg">{acc.name}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                >
                                    <XCircle size={18} />
                                </button>
                            </div>
                            <p className="text-sm text-gray-400 font-medium">{acc.phone || 'Número não vinculado'}</p>
                            {selectedAccountId === acc.id && (
                                <div className="mt-4 pt-4 border-t border-green-100 flex items-center justify-between">
                                    <span className="text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-100 px-2 py-1 rounded-md">Ativo para Configuração</span>
                                    <CheckCircle size={18} className="text-green-500" />
                                </div>
                            )}
                        </div>
                    ))}
                    {accounts.length === 0 && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50">
                            <Smartphone size={48} className="mx-auto mb-4 text-gray-300" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Nenhuma conexão ativa</h3>
                            <p className="text-gray-500 max-w-sm mx-auto mb-6">Comece adicionando uma nova conexão para automatizar seus disparos.</p>
                            <button onClick={() => setShowAddModal(true)} className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all">Começar Agora</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Adição */}
            {showAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all">
                    <div className="bg-white rounded-[40px] p-10 max-w-sm w-full shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-green-100 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
                        <h3 className="text-3xl font-black text-gray-800 mb-2">Nova Conexão</h3>
                        <p className="text-gray-500 mb-8 text-sm">Dê um nome para identificar este número (ex: WhatsApp Comercial).</p>
                        <input
                            autoFocus
                            type="text"
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            placeholder="Nome da conta..."
                            className="w-full p-5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 mb-8 font-bold text-lg"
                        />
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddAccount}
                                disabled={!newAccountName.trim()}
                                className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-500/20 disabled:opacity-50"
                            >
                                Criar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAccountId && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                    {/* Status & QR Section */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-[3rem] p-10 shadow-xl overflow-hidden relative">
                        {connectionStatus === 'disconnected' && (
                            <div className="text-center py-12">
                                <div className="w-24 h-24 bg-green-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-green-600 shadow-inner">
                                    <Power size={48} />
                                </div>
                                <h3 className="text-3xl font-black text-gray-800 mb-4">Número Desconectado</h3>
                                <p className="text-gray-500 mb-10 max-w-md mx-auto text-lg font-medium">Escaneie o QR Code para conectar este número ao sistema.</p>
                                <button
                                    onClick={handleConnect}
                                    className="px-10 py-5 bg-green-600 text-white rounded-[2rem] hover:bg-green-700 transition-all shadow-2xl shadow-green-500/30 font-black text-xl hover:-translate-y-1 flex items-center gap-4 mx-auto"
                                >
                                    <RefreshCw size={24} />
                                    Gerar QR Code
                                </button>
                            </div>
                        )}

                        {(connectionStatus === 'pending_qr' || connectionStatus === 'qr_ready') && qrCode && (
                            <div className="text-center py-6">
                                <div className="inline-block p-10 bg-white rounded-[3rem] shadow-2xl border-4 border-green-50 mb-8 relative">
                                    <div className="absolute inset-0 bg-green-500/5 blur-3xl rounded-full"></div>
                                    <div className="relative z-10">
                                        <QRCodeSVG value={qrCode} size={320} level="H" />
                                    </div>
                                </div>
                                <h3 className="text-3xl font-black text-gray-800 mb-3">Escaneie o QR Code</h3>
                                <p className="text-gray-500 font-medium mb-6">Abra o WhatsApp ➝ Menu/Configurações ➝ Aparelhos Conectados</p>
                            </div>
                        )}

                        {connectionStatus === 'connected' && (
                            <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-green-50/50 p-10 rounded-[2.5rem] border-2 border-green-100">
                                <div className="flex items-center gap-8">
                                    <div className="w-20 h-20 bg-green-500 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-green-500/40">
                                        <CheckCircle size={40} />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-3xl font-black text-green-900 leading-tight">Conectado!</h3>
                                        <p className="text-green-700 text-lg font-medium">O número está ativo e sincronizado.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDisconnect}
                                    className="px-8 py-4 bg-white border-2 border-red-100 text-red-600 rounded-2xl hover:bg-red-50 transition-all font-black text-lg"
                                >
                                    Desconectar
                                </button>
                            </div>
                        )}
                    </div>

                    {connectionStatus === 'connected' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                            {/* Groups List */}
                            <div className="lg:col-span-4 bg-white/80 backdrop-blur-xl border border-white/20 rounded-[2.5rem] p-8 shadow-xl flex flex-col h-[700px]">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                        <Users size={28} className="text-green-600" />
                                        Grupos
                                        <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full">
                                            {groups.filter(g => g.enabled).length}
                                        </span>
                                    </h2>
                                    <button
                                        onClick={loadGroups}
                                        className="p-3 bg-gray-50 text-gray-400 hover:text-green-600 rounded-2xl transition-all"
                                    >
                                        <RefreshCw size={24} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                    {groups.length === 0 ? (
                                        <div className="py-20 text-center opacity-30">
                                            <Users size={64} className="mx-auto" />
                                            <p className="mt-4 font-bold">Nenhum grupo encontrado</p>
                                        </div>
                                    ) : (
                                        groups.map(group => (
                                            <div
                                                key={group.id}
                                                onClick={() => toggleGroup(group.id)}
                                                className={`p-5 rounded-[1.5rem] border-2 transition-all cursor-pointer group relative overflow-hidden ${group.enabled
                                                    ? 'bg-green-50 border-green-500 shadow-md ring-4 ring-green-500/5'
                                                    : 'bg-white border-gray-100 hover:border-green-400'
                                                    }`}
                                            >
                                                <p className={`font-bold truncate text-lg ${group.enabled ? 'text-green-900' : 'text-gray-700'}`}>{group.name}</p>
                                                <p className="text-xs text-gray-400 mt-1 font-semibold flex items-center gap-1">
                                                    <Users size={14} /> {group.participants} Membros
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Actions & Config */}
                            <div className="lg:col-span-8 space-y-10">
                                <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-[2.5rem] p-10 shadow-xl">
                                    <div className="flex items-center justify-between mb-8">
                                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                                                <Send size={28} />
                                            </div>
                                            Configuração
                                        </h2>
                                        <div className="flex p-1.5 bg-gray-100 rounded-2xl">
                                            <button onClick={() => setSendMode('auto')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${sendMode === 'auto' ? 'bg-white shadow-md' : 'text-gray-500'}`}>🚀 AUTOMÁTICO</button>
                                            <button onClick={() => setSendMode('manual')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${sendMode === 'manual' ? 'bg-white shadow-md' : 'text-gray-500'}`}>✍️ MANUAL</button>
                                        </div>
                                    </div>

                                    {sendMode === 'auto' ? (
                                        <div className="grid grid-cols-2 gap-8 mb-10">
                                            <div className="space-y-3">
                                                <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Qtd Produtos</label>
                                                <input type="number" value={productCount} onChange={(e) => setProductCount(parseInt(e.target.value))} className="w-full p-6 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-3xl font-black text-2xl shadow-inner" />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Tipo de Mídia</label>
                                                <select value={mediaType} onChange={(e) => setMediaType(e.target.value as any)} className="w-full p-6 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-3xl font-black text-lg shadow-inner appearance-none cursor-pointer">
                                                    <option value="auto">🖼️ Imagem</option>
                                                    <option value="video">🎥 Vídeo</option>
                                                </select>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 mb-10">
                                            <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Mensagem</label>
                                            <textarea
                                                value={manualMessage}
                                                onChange={(e) => setManualMessage(e.target.value)}
                                                rows={6}
                                                className="w-full p-8 bg-gray-50 border-2 border-transparent focus:border-green-500 rounded-[2rem] font-bold text-xl shadow-inner resize-none"
                                                placeholder="Sua mensagem aqui..."
                                            />
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/80 p-8 rounded-[2rem] mb-10">
                                        <label className="flex items-center gap-4 cursor-pointer p-2"><input type="checkbox" checked={simulateTyping} onChange={(e) => setSimulateTyping(e.target.checked)} className="w-6 h-6 rounded-lg text-blue-600" /><span className="font-bold">✍️ Digitação</span></label>
                                        <label className="flex items-center gap-4 cursor-pointer p-2"><input type="checkbox" checked={mentionAll} onChange={(e) => setMentionAll(e.target.checked)} className="w-6 h-6 rounded-lg text-blue-600" /><span className="font-bold">📣 Marcar Todos</span></label>
                                        <label className="flex items-center gap-4 cursor-pointer p-2"><input type="checkbox" checked={postToStatus} onChange={(e) => setPostToStatus(e.target.checked)} className="w-6 h-6 rounded-lg text-blue-600" /><span className="font-bold">📱 Status</span></label>
                                    </div>

                                    <button
                                        onClick={handleSendNow}
                                        disabled={groups.filter(g => g.enabled).length === 0}
                                        className="w-full py-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-[2rem] font-black text-2xl shadow-xl hover:-translate-y-1 transition-all disabled:opacity-30 flex items-center justify-center gap-4"
                                    >
                                        <Send size={32} />
                                        ENVIAR AGORA
                                    </button>
                                </div>

                                {/* Scheduling */}
                                <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-[2.5rem] p-10 shadow-xl">
                                    <h2 className="text-2xl font-black text-gray-800 mb-8 flex items-center gap-3">
                                        <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl shadow-inner">
                                            <Clock size={28} />
                                        </div>
                                        Agendamento
                                    </h2>
                                    <div className="flex flex-col md:flex-row gap-8 items-end">
                                        <div className="flex-1 space-y-3">
                                            <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Frequência</label>
                                            <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-2xl font-bold text-lg shadow-inner appearance-none cursor-pointer">
                                                <option value="daily">📅 Diário</option>
                                                <option value="weekly">📅 Semanal</option>
                                            </select>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Horário</label>
                                            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-orange-500 rounded-2xl font-black text-2xl shadow-inner" />
                                        </div>
                                        <button onClick={handleSchedule} className="px-10 py-5 bg-orange-500 text-white rounded-[1.5rem] font-black text-xl shadow-xl shadow-orange-500/30 hover:bg-orange-600 transition-all">
                                            AGENDAR
                                        </button>
                                    </div>
                                    <label className="flex items-center gap-3 mt-6 cursor-pointer">
                                        <input type="checkbox" checked={automationEnabled} onChange={(e) => setAutomationEnabled(e.target.checked)} className="w-5 h-5 rounded-md" />
                                        <span className="text-sm font-bold text-gray-600">Ativar automação automática</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WhatsAppAutomationPage;
