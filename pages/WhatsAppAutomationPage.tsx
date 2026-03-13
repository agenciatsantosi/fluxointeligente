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
        <div className="space-y-8 max-w-6xl mx-auto pb-12 font-sans bg-gray-50 min-h-screen p-8">
            {notification && (
                <div className={`fixed top-6 right-6 z-[100] px-8 py-5 border border-gray-200 flex items-center gap-4 shadow-xl ${
                    notification.type === 'success' ? 'bg-green-500 text-white' :
                    notification.type === 'error' ? 'bg-red-500 text-white' :
                    'bg-purple-600 text-white'
                } rounded-xl`}>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] mb-0.5 opacity-70">SISTEMA</span>
                        <span className="text-sm font-bold">{notification.message}</span>
                    </div>
                </div>
            )}

            {sendingStatus && (
                <div className="fixed top-24 right-6 z-50 bg-white border border-gray-200 p-8 min-w-[320px] rounded-2xl shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className={`w-3 h-3 rounded-full ${sendingStatus.active ? 'bg-purple-600 animate-pulse' : 'bg-green-500'}`}></div>
                        <span className="font-black text-gray-800 text-sm uppercase tracking-widest">
                            {sendingStatus.active ? 'TRANSMITINDO...' : 'CONCLUÍDO'}
                        </span>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between text-xs text-gray-500 font-bold uppercase tracking-widest">
                            <span>PROGRESSO</span>
                            <span>{sendingStatus.current}/{sendingStatus.total}</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-all duration-500"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Account Selection Section */}
            <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-200">
                            <Smartphone size={22} className="text-white" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.3em] block mb-0.5">WHATSAPP_CONNECTIONS</span>
                            <h2 className="font-bold text-gray-900 text-lg">Minhas Conexões</h2>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all active:scale-95"
                    >
                        + ADICIONAR CONTA
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
                    {accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => setSelectedAccountId(acc.id)}
                            className={`p-6 border-2 transition-all cursor-pointer relative group rounded-2xl ${selectedAccountId === acc.id
                                ? 'bg-purple-50/50 border-purple-500 ring-4 ring-purple-100'
                                : 'bg-white border-gray-100 hover:border-purple-200 hover:bg-gray-50/50'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(acc.id === selectedAccountId ? connectionStatus : acc.status)} ${acc.status === 'connected' ? 'shadow-lg shadow-green-200' : ''}`}></div>
                                    <span className="font-bold text-gray-900 text-sm">{acc.name}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                    <XCircle size={18} />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">{acc.phone || 'Número não vinculado'}</p>
                            {selectedAccountId === acc.id && (
                                <div className="mt-4 pt-4 border-t border-purple-100 flex items-center justify-between">
                                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">ATIVO</span>
                                    <CheckCircle size={16} className="text-purple-600" />
                                </div>
                            )}
                        </div>
                    ))}
                    {accounts.length === 0 && (
                        <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/30">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Smartphone size={40} className="text-gray-400" />
                            </div>
                            <h3 className="text-base font-bold text-gray-900 mb-2">Sem conexões ativas</h3>
                            <p className="text-sm text-gray-500 mb-8 max-w-xs mx-auto">Adicione seu primeiro número do WhatsApp para começar a automatizar seus envios.</p>
                            <button onClick={() => setShowAddModal(true)} className="px-8 py-4 bg-purple-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200">
                                CONECTAR AGORA
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Adição */}
            {showAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition-all">
                    <div className="bg-white border border-gray-200 p-8 max-w-sm w-full relative overflow-hidden rounded-3xl shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-xs font-black text-purple-600 uppercase tracking-widest">NOVA_CONEXÃO</span>
                        </div>
                        <p className="text-gray-500 mb-6 text-sm">Dê um nome amigável para identificar este número em sua lista.</p>
                        <input
                            autoFocus
                            type="text"
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            placeholder="Ex: WhatsApp Vendas..."
                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 mb-6 placeholder-gray-400 transition-all"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-all"
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={handleAddAccount}
                                disabled={!newAccountName.trim()}
                                className="flex-1 py-4 bg-purple-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 disabled:opacity-30"
                            >
                                CRIAR CONTA
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAccountId && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                    {/* Status & QR Section */}
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="px-8 py-4 bg-gray-50/50 border-b border-gray-200">
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.3em]">STATUS_CONEXÃO</span>
                        </div>
                        {connectionStatus === 'disconnected' && (
                            <div className="text-center py-16 px-8">
                                <div className="w-20 h-20 bg-gray-100 border border-gray-200 rounded-full flex items-center justify-center mx-auto mb-8 text-gray-400">
                                    <Power size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-3">Não Conectado</h3>
                                <p className="text-gray-500 mb-10 max-w-md mx-auto text-sm">Escaneie o QR Code abaixo com seu WhatsApp para vincular este número ao painel.</p>
                                <button
                                    onClick={handleConnect}
                                    className="px-8 py-4 bg-purple-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-purple-700 flex items-center gap-3 mx-auto transition-all shadow-lg shadow-purple-200"
                                >
                                    <RefreshCw size={18} />
                                    GERAR QR CODE
                                </button>
                            </div>
                        )}

                        {(connectionStatus === 'pending_qr' || connectionStatus === 'qr_ready') && qrCode && (
                            <div className="text-center py-10 px-8">
                                <div className="inline-block p-8 bg-white border border-gray-100 rounded-3xl shadow-xl mb-8">
                                    <QRCodeSVG value={qrCode} size={280} level="H" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Aponte a Câmera</h3>
                                    <p className="text-gray-500 text-sm mb-4">No seu celular: WhatsApp → Configurações → Aparelhos Conectados</p>
                                </div>
                            </div>
                        )}

                        {connectionStatus === 'connected' && (
                            <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-white p-10">
                                <div className="flex items-center gap-8">
                                    <div className="w-16 h-16 rounded-3xl bg-green-500 flex items-center justify-center text-white shadow-xl shadow-green-100">
                                        <CheckCircle size={32} />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-2xl font-bold text-gray-900 leading-tight">Vínculo Ativo</h3>
                                        <p className="text-green-600 font-bold text-sm">Dispositivo sincronizado e pronto para envios.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDisconnect}
                                    className="px-8 py-4 bg-white border border-gray-200 text-gray-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                    DESCONECTAR
                                </button>
                            </div>
                        )}
                    </div>

                    {connectionStatus === 'connected' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Groups List */}
                            <div className="lg:col-span-4 bg-white border border-gray-200 rounded-3xl overflow-hidden flex flex-col h-[750px] shadow-sm">
                                <div className="px-6 py-5 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Users size={18} className="text-purple-600" />
                                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">GRUPOS DISPONÍVEIS</span>
                                        <span className="bg-purple-600 text-white text-[9px] font-black px-2.5 py-1 rounded-full">
                                            {groups.filter(g => g.enabled).length}
                                        </span>
                                    </div>
                                    <button
                                        onClick={loadGroups}
                                        className="p-2.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                                    >
                                        <RefreshCw size={18} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                    {groups.length === 0 ? (
                                        <div className="py-24 text-center">
                                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                                <Users size={40} className="text-gray-300" />
                                            </div>
                                            <p className="text-sm font-medium text-gray-400">Nenhum grupo encontrado</p>
                                        </div>
                                    ) : (
                                        groups.map(group => (
                                            <div
                                                key={group.id}
                                                onClick={() => toggleGroup(group.id)}
                                                className={`p-5 border-2 transition-all cursor-pointer rounded-2xl ${
                                                    group.enabled
                                                        ? 'bg-purple-50/50 border-purple-500 ring-2 ring-purple-100'
                                                        : 'bg-white border-gray-100 hover:border-purple-200 hover:bg-gray-50/50'
                                                    }`}
                                            >
                                                <p className={`font-bold text-sm truncate ${group.enabled ? 'text-gray-900' : 'text-gray-600'}`}>{group.name}</p>
                                                <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1.5 font-bold">
                                                    <Users size={12} className="opacity-50" /> {group.participants} membros
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Actions & Config */}
                            <div className="lg:col-span-8 space-y-8">
                                <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                                    <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Send size={18} className="text-purple-600" />
                                            <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">CONFIGURAÇÃO DE ENVIO</span>
                                        </div>
                                        <div className="flex bg-gray-100 p-1 rounded-xl">
                                            <button onClick={() => setSendMode('auto')} className={`px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sendMode === 'auto' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>AUTOMÁTICO</button>
                                            <button onClick={() => setSendMode('manual')} className={`px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sendMode === 'manual' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>MANUAL</button>
                                        </div>
                                    </div>

                                    <div className="p-10">
                                        {sendMode === 'auto' ? (
                                            <div className="grid grid-cols-2 gap-8 mb-10">
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">QTD PRODUTOS</label>
                                                    <input type="number" value={productCount} onChange={(e) => setProductCount(parseInt(e.target.value))} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all" />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">TIPO MÍDIA</label>
                                                    <select value={mediaType} onChange={(e) => setMediaType(e.target.value as any)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all">
                                                        <option value="auto">Imagem</option>
                                                        <option value="video">Vídeo</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 mb-10">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">MENSAGEM PERSONALIZADA</label>
                                                <textarea
                                                    value={manualMessage}
                                                    onChange={(e) => setManualMessage(e.target.value)}
                                                    rows={6}
                                                    className="w-full p-5 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none placeholder-gray-400"
                                                    placeholder="Digite o texto que deseja disparar nos grupos..."
                                                />
                                            </div>
                                        )}

                                        <div className="grid grid-cols-3 gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-6 mb-10">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative">
                                                    <input type="checkbox" checked={simulateTyping} onChange={(e) => setSimulateTyping(e.target.checked)} className="peer sr-only" />
                                                    <div className="w-10 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full transition-all"></div>
                                                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-700 uppercase tracking-wide group-hover:text-purple-600 transition-colors">DIGITAÇÃO</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative">
                                                    <input type="checkbox" checked={mentionAll} onChange={(e) => setMentionAll(e.target.checked)} className="peer sr-only" />
                                                    <div className="w-10 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full transition-all"></div>
                                                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-700 uppercase tracking-wide group-hover:text-purple-600 transition-colors">MARCAR_TODOS</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative">
                                                    <input type="checkbox" checked={postToStatus} onChange={(e) => setPostToStatus(e.target.checked)} className="peer sr-only" />
                                                    <div className="w-10 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full transition-all"></div>
                                                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-4"></div>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-700 uppercase tracking-wide group-hover:text-purple-600 transition-colors">STATUS</span>
                                            </label>
                                        </div>

                                        <button
                                            onClick={handleSendNow}
                                            disabled={groups.filter(g => g.enabled).length === 0}
                                            className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-base uppercase tracking-widest rounded-2xl hover:shadow-xl hover:shadow-purple-200 flex items-center justify-center gap-4 transition-all active:scale-[0.98] disabled:opacity-30 disabled:shadow-none"
                                        >
                                            <Send size={20} />
                                            DISPARAR AGORA
                                        </button>
                                    </div>
                                </div>

                                {/* Scheduling */}
                                <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                                    <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-200 flex items-center gap-3">
                                        <Clock size={18} className="text-purple-600" />
                                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.3em]">AGENDAMENTO INTELIGENTE</span>
                                    </div>
                                    <div className="p-10">
                                        <div className="flex flex-col md:flex-row gap-8 items-end mb-8">
                                            <div className="flex-1 space-y-3">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">FREQUÊNCIA</label>
                                                <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all">
                                                    <option value="daily">Diário</option>
                                                    <option value="weekly">Semanal</option>
                                                </select>
                                            </div>
                                            <div className="flex-1 space-y-3">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">HORA DO DISPARO</label>
                                                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all" />
                                            </div>
                                            <button onClick={handleSchedule} className="px-10 py-4 bg-white border-2 border-purple-600 text-purple-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-purple-600 hover:text-white transition-all active:scale-95">
                                                SALVAR AGENDA
                                            </button>
                                        </div>
                                        <label className="flex items-center gap-4 cursor-pointer group w-fit">
                                            <div className="relative">
                                                <input type="checkbox" checked={automationEnabled} onChange={(e) => setAutomationEnabled(e.target.checked)} className="peer sr-only" />
                                                <div className="w-12 h-7 bg-gray-200 peer-checked:bg-green-500 rounded-full transition-all"></div>
                                                <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-all peer-checked:translate-x-5 shadow-sm"></div>
                                            </div>
                                            <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest group-hover:text-gray-900 transition-colors">Ativar Automação Automática</span>
                                        </label>
                                    </div>
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
