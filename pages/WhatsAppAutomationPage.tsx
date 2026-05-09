import React, { useState, useEffect, useRef } from 'react';
import { useProducts } from '../context/ProductContext';
import { MessageCircle, Smartphone, Users, Send, Power, RefreshCw, Clock, XCircle, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { useAlert } from '../context/AlertContext';

const WhatsAppAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();
    const { showAlert, showConfirm } = useAlert();

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
    const [shopeeCategories, setShopeeCategories] = useState<any[]>([]);

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

    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);

    useEffect(() => {
        loadAccounts();
        loadShopeeCategories();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                loadAccounts();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const loadShopeeCategories = async () => {
        try {
            const response = await api.get('/shopee/categories?onlyActive=true');
            if (response.data.success) {
                setShopeeCategories(response.data.categories);
            }
        } catch (error) {
            console.error('Error loading shopee categories:', error);
        }
    };

    useEffect(() => {
        if (selectedAccountId) {
            checkStatus();
            const interval = setInterval(checkStatus, 3000);
            return () => clearInterval(interval);
        }
    }, [selectedAccountId]);

    const loadAccounts = async () => {
        try {
            const response = await api.get('/whatsapp/accounts');
            if (response.data.success) {
                const accountsList = response.data.accounts;
                setAccounts(accountsList);
                
                if (accountsList.length > 0 && !selectedAccountId) {
                    // Tenta selecionar a primeira conta que esteja conectada
                    const connectedAccount = accountsList.find((acc: any) => acc.status === 'connected');
                    if (connectedAccount) {
                        setSelectedAccountId(connectedAccount.id);
                    } else {
                        setSelectedAccountId(accountsList[0].id);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        }
    };

    const handleAddAccount = async () => {
        if (!newAccountName.trim()) return;
        try {
            const response = await api.post('/whatsapp/accounts', { name: newAccountName });
            if (response.data.success) {
                showAlert('✅ Nova conta adicionada!', 'success');
                setNewAccountName('');
                setShowAddModal(false);
                loadAccounts();
            }
        } catch (error: any) {
            showAlert('❌ Erro ao adicionar: ' + error.message, 'error');
        }
    };

    const handleDeleteAccount = async (id: number) => {
        showConfirm({
            title: 'Excluir Conexão',
            message: 'Deseja realmente excluir esta conexão? Todos os dados dela serão apagados.',
            confirmText: 'Excluir',
            onConfirm: async () => {
                try {
                    await api.delete(`/whatsapp/accounts/${id}`);
                    showAlert('✅ Conta excluída', 'success');
                    if (selectedAccountId === id) setSelectedAccountId(null);
                    loadAccounts();
                } catch (error: any) {
                    showAlert('❌ Erro ao excluir: ' + error.message, 'error');
                }
            }
        });
    };

    const checkStatus = async () => {
        if (!selectedAccountId) return;
        try {
            const response = await api.get('/whatsapp/status', { params: { accountId: selectedAccountId } });
            if (response.data.success) {
                const newStatus = response.data.status || 'disconnected';
                const oldStatus = connectionStatus;
                
                console.log(`[WHATSAPP STATUS] Account ${selectedAccountId}: ${oldStatus} -> ${newStatus}`);
                setConnectionStatus(newStatus);

                // Se estiver conectando ou inicializando, não mostramos QR ainda
                if (newStatus === 'connecting' || response.data.isInitializing) {
                    setQrCode(null);
                } else if (newStatus === 'pending_qr' || newStatus === 'qr_ready') {
                    const qrResponse = await api.get('/whatsapp/qr', { params: { accountId: selectedAccountId } });
                    if (qrResponse.data.qr) {
                        setQrCode(qrResponse.data.qr);
                    }
                } else if (newStatus === 'connected') {
                    setQrCode(null);
                    
                    if (oldStatus !== 'connected') {
                        loadAccounts();
                    }

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

    const loadGroups = async (refresh = false) => {
        if (!selectedAccountId) return;
        try {
            const response = await api.get('/whatsapp/groups', { 
                params: { 
                    accountId: selectedAccountId,
                    refresh: refresh ? 'true' : 'false'
                } 
            });
            if (response.data.success) {
                // Sincroniza seleções anteriores se existirem
                const previousSelections = new Map(groups.map(g => [g.id, g.enabled]));
                
                // Mapeia de groupId/groupName (API) para id/name (Frontend)
                const mappedGroups = response.data.groups.map((g: any) => ({
                    id: g.groupId || g.id,
                    name: g.groupName || g.name,
                    participants: g.participants || 0,
                    enabled: previousSelections.get(g.groupId || g.id) || g.enabled || false
                }));
                
                setGroups(mappedGroups);
            }
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    };

    const handleConnect = async () => {
        if (!selectedAccountId) return;
        try {
            showAlert('🔄 Iniciando conexão...', 'info');
            await api.post('/whatsapp/initialize', { accountId: selectedAccountId });
            setTimeout(checkStatus, 2000);
        } catch (error: any) {
            showAlert('❌ Erro ao conectar: ' + error.message, 'error');
        }
    };

    const handleDisconnect = async () => {
        if (!selectedAccountId) return;
        
        showConfirm({
            title: 'Desconectar WhatsApp',
            message: 'Deseja realmente desconectar do WhatsApp?',
            confirmText: 'Desconectar',
            onConfirm: async () => {
                try {
                    await api.post('/whatsapp/disconnect', { accountId: selectedAccountId });
                    setConnectionStatus('disconnected');
                    setQrCode(null);
                    setGroups([]);
                    groupsLoadedRef.current[selectedAccountId] = false;
                    showAlert('✅ Desconectado com sucesso', 'success');
                } catch (error: any) {
                    showAlert('❌ Erro ao desconectar: ' + error.message, 'error');
                }
            }
        });
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
            showAlert('❌ Selecione pelo menos um grupo!', 'error');
            return;
        }
        if (!automationEnabled) {
            showAlert('❌ Marque "Ativar agendamento automático" primeiro!', 'warning');
            return;
        }

        const confirmMsg = `Agendar para ${enabledGroups.length} grupo(s)?`;
        
        showConfirm({
            title: 'Confirmar Agendamento',
            message: confirmMsg,
            confirmText: 'Agendar',
            onConfirm: async () => {
                try {
                    const response = await api.post('/whatsapp/schedule', {
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
                        showAlert(`✅ Agendamento salvo!`, 'success');
                        setAutomationEnabled(false);
                    } else {
                        showAlert('❌ Erro ao salvar agendamento', 'error');
                    }
                } catch (error: any) {
                    showAlert('❌ Erro ao agendar: ' + error.message, 'error');
                }
            }
        });
    };

    const [sendMode, setSendMode] = useState<'auto' | 'manual'>('auto');
    const [manualMessage, setManualMessage] = useState('');

    const handleSendNow = async () => {
        if (!selectedAccountId) return;
        const enabledGroups = groups.filter(g => g.enabled);
        if (enabledGroups.length === 0) {
            showAlert('❌ Selecione pelo menos um grupo!', 'error');
            return;
        }

        if (sendMode === 'manual' && !manualMessage.trim()) {
            showAlert('❌ Digite uma mensagem para enviar!', 'warning');
            return;
        }

        if (sendMode === 'auto' && !shopeeAffiliateSettings.appId) {
            showAlert('❌ Configure suas credenciais da Shopee primeiro!', 'error');
            return;
        }

        const confirmMsg = sendMode === 'manual'
            ? `Enviar mensagem manual para ${enabledGroups.length} grupo(s)?`
            : `Enviar ${productCount} produto(s) para ${enabledGroups.length} grupo(s)?`;

        showConfirm({
            title: 'Executar Agora',
            message: confirmMsg,
            confirmText: 'Enviar Agora',
            onConfirm: async () => {
                try {
                    const totalToSend = sendMode === 'manual' ? enabledGroups.length : productCount * enabledGroups.length;
                    setSendingStatus({ active: true, current: 0, total: totalToSend, success: 0, failed: 0 });

                    const response = await api.post('/whatsapp/post-now', {
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
                        showAlert(`✅ ${details.success} enviados`, 'success');
                        setTimeout(() => setSendingStatus(null), 5000);
                    } else {
                        setSendingStatus(null);
                        showAlert('❌ Erro: ' + response.data.error, 'error');
                    }
                } catch (error: any) {
                    setSendingStatus(null);
                    showAlert('❌ Erro ao enviar: ' + error.message, 'error');
                }
            }
        });
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
                            {console.log('RENDER DEBUG - Status:', connectionStatus, 'ID:', selectedAccountId)}
                        </div>
                        
                        {/* 1. Estado de Conexão em Andamento */}
                        {(connectionStatus === 'connecting' || connectionStatus === 'starting') && (
                            <div className="text-center py-24 px-8">
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-8 text-blue-600 animate-pulse border-2 border-blue-100">
                                    <RefreshCw size={32} className="animate-spin" />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 mb-3">Conectando...</h3>
                                <p className="text-gray-500 max-w-md mx-auto text-sm">Aguarde enquanto restauramos sua conexão segura com o WhatsApp.</p>
                            </div>
                        )}

                        {/* 2. Estado Conectado */}
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

                        {/* 3. Estado QR Code (Vários status podem levar a isso) */}
                        {(connectionStatus === 'pending_qr' || connectionStatus === 'qr_ready' || (connectionStatus === 'disconnected' && qrCode)) && qrCode && (
                            <div className="text-center py-10 px-8">
                                <div className="inline-block p-8 bg-white border border-gray-100 rounded-3xl shadow-xl mb-8">
                                    <QRCodeSVG value={qrCode} size={280} level="H" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Aponte a Câmera</h3>
                                    <p className="text-gray-500 text-sm mb-4">No seu celular: WhatsApp → Configurações → Aparelhos Conectados</p>
                                    <button onClick={handleConnect} className="text-xs text-purple-600 font-bold hover:underline">GERAR NOVO QR CODE</button>
                                </div>
                            </div>
                        )}

                        {/* 4. Estado Desconectado Puro */}
                        {connectionStatus === 'disconnected' && !qrCode && (
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

                        {/* 5. Fallback para estados desconhecidos */}
                        {!['connecting', 'starting', 'connected', 'pending_qr', 'qr_ready', 'disconnected'].includes(connectionStatus) && (
                            <div className="text-center py-16 px-8">
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Status: {connectionStatus}</h3>
                                <p className="text-gray-500 text-sm">Tentando sincronizar com o servidor...</p>
                                <button onClick={checkStatus} className="mt-4 text-purple-600 font-bold">RECARREGAR STATUS</button>
                            </div>
                        )}
                    </div>

                    {(connectionStatus === 'connected' || connectionStatus === 'connecting' || groups.length > 0) && (
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
                                        onClick={() => loadGroups(true)}
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
                            {/* Actions & Config */}
                            <div className="lg:col-span-8 space-y-8">
                                <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                                    <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
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
                                            <div className="space-y-8">
                                                <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100">
                                                    <div className="flex items-center justify-between mb-8">
                                                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">AGENDAMENTO</span>
                                                        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                                                            <button
                                                                onClick={() => setScheduleMode('single')}
                                                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${scheduleMode === 'single' ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'text-gray-400 hover:text-gray-600'}`}
                                                            >
                                                                ÚNICO
                                                            </button>
                                                            <button
                                                                onClick={() => setScheduleMode('multiple')}
                                                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${scheduleMode === 'multiple' ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'text-gray-400 hover:text-gray-600'}`}
                                                            >
                                                                MÚLTIPLO
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {scheduleMode === 'single' ? (
                                                        <div className="grid grid-cols-2 gap-6 mb-8">
                                                            <div className="space-y-3">
                                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">FREQUÊNCIA</label>
                                                                <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:border-purple-500 transition-all">
                                                                    <option value="daily">DIÁRIO</option>
                                                                    <option value="weekly">SEMANAL</option>
                                                                    <option value="monthly">MENSAL</option>
                                                                </select>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">HORA</label>
                                                                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:border-purple-500 transition-all" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-4 mb-8">
                                                            <div className="flex items-center justify-between">
                                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">HORÁRIOS DO DIA</label>
                                                                {times.length < 5 && (
                                                                    <button onClick={addScheduleTime} className="text-purple-600 text-[10px] font-black uppercase hover:underline">+ Adicionar Horário</button>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                                {times.map((t, idx) => (
                                                                    <div key={idx} className="flex gap-2">
                                                                        <input type="time" value={t} onChange={(e) => updateScheduleTime(idx, e.target.value)} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold text-sm focus:outline-none focus:border-purple-500 transition-all" />
                                                                        {times.length > 1 && (
                                                                            <button onClick={() => removeScheduleTime(idx)} className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                                                                                <XCircle size={18} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="space-y-6 pt-6 border-t border-gray-100">
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">QTD PRODUTOS / POST</span>
                                                            <input type="number" value={productCount} onChange={(e) => setProductCount(parseInt(e.target.value))} className="w-full md:w-32 p-3 bg-white border border-gray-200 rounded-xl text-center font-black text-sm text-purple-600 focus:outline-none focus:border-purple-500 transition-all" />
                                                        </div>
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATEGORIA</span>
                                                            <select value={categoryType} onChange={(e) => setCategoryType(e.target.value)} className="w-full md:w-64 p-3 bg-white border border-gray-200 rounded-xl font-black text-[11px] text-gray-700 uppercase tracking-tighter focus:outline-none focus:border-purple-500 transition-all">
                                                                <option value="random">ALEATÓRIO</option>
                                                                <option value="best_sellers">MAIS VENDIDOS</option>
                                                                <option value="cheapest">MAIS BARATOS</option>
                                                                <option value="expensive">MAIS CAROS</option>
                                                                {shopeeCategories.map(cat => (
                                                                    <option key={cat.id} value={cat.slug}>{cat.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PREFERÊNCIA MÍDIA</span>
                                                            <select value={mediaType} onChange={(e) => setMediaType(e.target.value as any)} className="w-full md:w-64 p-3 bg-white border border-gray-200 rounded-xl font-black text-[11px] text-gray-700 uppercase tracking-tighter focus:outline-none focus:border-purple-500 transition-all">
                                                                <option value="auto">QUALQUER (PRIORIDADE VÍDEO)</option>
                                                                <option value="image">APENAS IMAGEM</option>
                                                                <option value="video">APENAS VÍDEO</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between px-8 py-6 bg-purple-50 border border-purple-100 rounded-3xl">
                                                    <div className="flex items-center gap-4">
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input type="checkbox" checked={automationEnabled} onChange={(e) => setAutomationEnabled(e.target.checked)} className="sr-only peer" />
                                                            <div className="w-12 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                                                        </label>
                                                        <span className="text-[11px] font-black text-purple-900 uppercase tracking-widest">ATIVAR AGENDAMENTO</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 mb-10">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 text-center block">MENSAGEM MANUAL</label>
                                                <textarea
                                                    value={manualMessage}
                                                    onChange={(e) => setManualMessage(e.target.value)}
                                                    className="w-full h-full min-h-[300px] p-6 bg-gray-50 border border-gray-200 rounded-3xl text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none shadow-inner placeholder-gray-400"
                                                    placeholder="Digite a mensagem para enviar agora..."
                                                />
                                            </div>
                                        )}

                                        <div className="grid grid-cols-3 gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-6 mt-8">
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
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                                    {sendMode === 'auto' && (
                                        <button onClick={handleSchedule} className="flex-1 py-5 bg-white border-2 border-purple-600 text-purple-600 font-bold text-sm uppercase tracking-widest rounded-2xl hover:bg-purple-600 hover:text-white transition-all active:scale-[0.98]">
                                            SALVAR AUTOMAÇÃO
                                        </button>
                                    )}
                                    <button
                                        onClick={handleSendNow}
                                        disabled={groups.filter(g => g.enabled).length === 0}
                                        className="flex-1 py-5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm uppercase tracking-widest rounded-2xl hover:shadow-xl hover:shadow-purple-200 flex items-center justify-center gap-4 transition-all active:scale-[0.98] disabled:opacity-30 disabled:shadow-none"
                                    >
                                        <Send size={20} />
                                        {sendMode === 'manual' ? 'DISPARAR MENSAGEM AGORA' : 'PROCURAR E DISPARAR AGORA'}
                                    </button>
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
