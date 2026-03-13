import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Twitter, Send, RefreshCw, Clock, CheckCircle, XCircle, User, Hash, FileText, Power, Settings, Key, Sparkles, Zap } from 'lucide-react';
import api from '../services/api';

const TwitterAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Twitter Configuration
    const [twitterConfigured, setTwitterConfigured] = useState(false);

    // Multi-account state
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]); // IDs of accounts to post to (empty = all)

    const [usage, setUsage] = useState({ count: 0, limit: 25 });

    // Automation Settings
    const [productCount, setProductCount] = useState(1);
    const [categoryType, setCategoryType] = useState('random');
    const [enableRotation, setEnableRotation] = useState(true);
    const [sendMode, setSendMode] = useState<'shopee' | 'manual'>('shopee');
    const [manualMessage, setManualMessage] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');

    // Post Configuration
    const [messageTemplate, setMessageTemplate] = useState(
        "🔥 OFERTA IMPERDÍVEL!\n\n{nome_produto}\n\n💰 DE: R$ {preco_original}\n✅ HOJE: R$ {preco_com_desconto}\n\n⭐ {avaliacao}/5\n\n🛒 {link}\n\n#Shopee #Ofertas #Desconto"
    );
    const [customHashtags, setCustomHashtags] = useState('');

    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']);
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const [schedules, setSchedules] = useState<any[]>([]);

    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), type === 'error' ? 10000 : 5000);
    };

    useEffect(() => {
        checkTwitterConfig();
        loadSchedules();
        checkUsage();
    }, []);

    const checkUsage = async () => {
        try {
            const response = await api.get('/twitter/usage');
            if (response.data.success) {
                setUsage({ count: response.data.count, limit: response.data.limit });
            }
        } catch (error) {
            console.error('Error checking usage:', error);
        }
    };

    const checkTwitterConfig = async () => {
        try {
            const response = await api.get('/twitter/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                setTwitterConfigured(response.data.accounts.length > 0);
            }
        } catch (error) {
            console.error('Error fetching accounts:', error);
            setTwitterConfigured(false);
        }
    };

    const loadSchedules = async () => {
        try {
            const response = await api.get('/schedules');
            if (response.data.success) {
                setSchedules(response.data.schedules.filter((s: any) => s.platform === 'twitter'));
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    };


    const handleDisconnectAccount = async (id: number) => {
        if (!window.confirm('Tem certeza que deseja desconectar esta conta?')) return;

        try {
            await api.delete(`/twitter/accounts/${id}`);
            showNotification('✅ Conta desconectada', 'success');
            checkTwitterConfig();
        } catch (error) {
            showNotification('❌ Erro ao desconectar', 'error');
        }
    };

    const handleRefreshAccount = async (id: number) => {
        setLoading(true);
        try {
            const response = await api.post(`/twitter/accounts/${id}/refresh`);
            if (response.data.success) {
                showNotification('✅ Dados atualizados com sucesso!', 'success');
                checkTwitterConfig();
            } else {
                showNotification(`⚠️ ${response.data.warning || response.data.error}`, 'info');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao atualizar: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
            setLoading(false);
        }
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

    const handleGenerateHashtags = async () => {
        setLoading(true);
        try {
            const topic = "Ofertas Shopee Promoções Descontos"; // Default topic for automation context
            const response = await api.post('/gemini/generate-hashtags', { topic });

            if (response.data.success) {
                // Gemini returns a string like "#tag1 #tag2"
                // We convert it to comma separated for the input
                const hashtagsString = response.data.hashtags;
                const formattedHashtags = hashtagsString.replace(/#/g, '').replace(/\s+/g, ', ');

                setCustomHashtags(prev => prev ? `${prev}, ${formattedHashtags}` : formattedHashtags);
                showNotification('✨ Hashtags geradas com sucesso!', 'success');
            } else {
                showNotification('❌ Erro ao gerar hashtags', 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro na IA: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateTemplate = async () => {
        setLoading(true);
        try {
            const response = await api.post('/gemini/generate-caption', {
                videoTitle: "Promoção Imperdível Shopee",
                context: "Crie um tweet curto e chamativo para vender produtos com desconto. Use emojis."
            });

            if (response.data.success) {
                setMessageTemplate(response.data.caption);
                showNotification('✨ Texto gerado com sucesso!', 'success');
            } else {
                showNotification('❌ Erro ao gerar texto', 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro na IA: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAutoScheduleDailyLimit = () => {
        // Generate 17 times distributed between 07:00 and 23:00
        const startHour = 7;
        const endHour = 23;
        const totalMinutes = (endHour - startHour) * 60;
        const tweetsPerDay = 17;
        const interval = Math.floor(totalMinutes / tweetsPerDay);

        const newTimes: string[] = [];
        let currentMinutes = startHour * 60;

        for (let i = 0; i < tweetsPerDay; i++) {
            const hour = Math.floor(currentMinutes / 60);
            const minute = currentMinutes % 60;
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            newTimes.push(timeStr);
            currentMinutes += interval;
        }

        setFrequency('daily');
        setScheduleMode('multiple');
        setTimes(newTimes);
        setProductCount(1); // 1 product per tweet, 17 times a day
        setAutomationEnabled(true);

        showNotification('⚡ Configurado para 17 tweets diários! Clique em "Agendar Envio" para confirmar.', 'success');
    };

    const handleSchedule = async () => {
        if (!automationEnabled) {
            showNotification('❌ Marque "Ativar agendamento automático" primeiro!', 'error');
            return;
        }

        const scheduleText = frequency === 'daily' ? 'todo dia' : frequency === 'weekly' ? 'toda semana' : 'todo mês';
        const timeText = scheduleMode === 'multiple' ? `${times.length} horários` : `às ${time}`;
        const confirmMsg = `Agendar postagem de ${productCount} produto(s) ${scheduleText} (${timeText})?`;

        if (!confirm(confirmMsg)) return;

        try {
            const response = await api.post('/schedules', {
                platform: 'twitter',
                config: {
                    schedule: {
                        frequency,
                        time,
                        times,
                        scheduleMode,
                        productCount,
                        enabled: true
                    },
                    messageTemplate,
                    hashtags: customHashtags.split(',').map(tag => tag.trim()).filter(tag => tag),
                    enableRotation,
                    categoryType,
                    twitterSettings: {
                        // Backend will use stored accounts, but we can pass selected accounts if needed for specific schedules
                        // For now, schedules might apply to all accounts or we need to update schedule schema
                        // Let's assume schedules run on ALL connected accounts for simplicity in this version
                    }
                }
            });

            if (response.data.success) {
                showNotification('✅ Agendamento salvo! Veja em "Agendamentos" no menu lateral', 'success');
                setAutomationEnabled(false);
                loadSchedules();
            } else {
                showNotification('❌ Erro ao salvar agendamento', 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao agendar: ' + error.message, 'error');
        }
    };

    const handleSendNow = async () => {
        if (!shopeeAffiliateSettings.appId) {
            showNotification('❌ Configure suas credenciais da Shopee primeiro!', 'error');
            return;
        }

        const confirmMsg = `Postar ${productCount} produto(s) agora no Twitter?`;
        if (!confirm(confirmMsg)) return;

        try {
            setSendingStatus({ active: true, current: 0, total: productCount, success: 0, failed: 0 });

            // If no specific accounts selected, use all
            const targetAccounts = selectedAccounts.length > 0
                ? selectedAccounts
                : accounts.map(a => a.id);

            if (targetAccounts.length === 0) {
                showNotification('❌ Nenhuma conta conectada!', 'error');
                setSendingStatus(null);
                return;
            }

            let totalSuccess = 0;
            let totalFailed = 0;

            // Post for each selected account
            for (const accountId of targetAccounts) {
                const response = await api.post('/twitter/post-now', {
                    productCount,
                    shopeeSettings: shopeeAffiliateSettings,
                    categoryType,
                    messageTemplate,
                    hashtags: customHashtags.split(',').map(tag => tag.trim()).filter(tag => tag),
                    enableRotation,
                    accountId: accountId, // Pass specific account ID
                    sendMode,
                    manualMessage,
                    manualImageUrl
                });

                if (response.data.success) {
                    totalSuccess += response.data.details.success;
                    totalFailed += response.data.details.failed;
                } else {
                    totalFailed += productCount; // Assuming all failed for this account
                }
            }

            setSendingStatus({
                active: false,
                current: productCount * targetAccounts.length,
                total: productCount * targetAccounts.length,
                success: totalSuccess,
                failed: totalFailed
            });

            showNotification(`✅ Processo finalizado: ${totalSuccess} sucessos, ${totalFailed} falhas`, 'success');
            setTimeout(() => setSendingStatus(null), 5000);
            checkUsage(); // Update usage after posting
        } catch (error: any) {
            setSendingStatus(null);
            showNotification('❌ Erro ao postar: ' + error.message, 'error');
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10 font-sans bg-white min-h-screen pb-24">
            {notification && (
                <div className={`fixed top-8 right-8 z-[100] px-8 py-5 border border-gray-100 flex items-center gap-5 shadow-2xl animate-in slide-in-from-right-8 duration-500 rounded-[28px] ${
                    notification.type === 'success' ? 'bg-white' :
                    notification.type === 'error' ? 'bg-red-50' :
                    'bg-purple-50'
                }`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                        notification.type === 'success' ? 'bg-green-50 text-green-600' :
                        notification.type === 'error' ? 'bg-red-100 text-red-600' :
                        'bg-purple-100 text-purple-600'
                    }`}>
                        {notification.type === 'success' ? <CheckCircle size={24} /> : 
                         notification.type === 'error' ? <XCircle size={24} /> : 
                         <RefreshCw size={24} className="animate-spin" />}
                    </div>
                    <div className="flex flex-col pr-4">
                        <span className="text-[10px] font-black uppercase tracking-widest mb-0.5 text-gray-400">NOTIFICAÇÃO_SISTEMA</span>
                        <span className="text-sm font-black text-gray-900">{notification.message}</span>
                    </div>
                </div>
            )}

            {sendingStatus && (
                <div className="fixed top-32 right-8 z-[100] bg-white border border-gray-100 p-8 rounded-[32px] shadow-2xl min-w-[360px] animate-in slide-in-from-right-12 duration-700">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-2xl ${sendingStatus.active ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
                                <Zap size={20} className={sendingStatus.active ? 'animate-pulse' : ''} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">TRANSMISSÃO_X</span>
                                <span className="text-sm font-black text-gray-900">
                                    {sendingStatus.active ? 'ENVIANDO_DADOS...' : 'PROCESSO_CONCLUÍDO'}
                                </span>
                            </div>
                        </div>
                        <span className="text-xs font-black text-purple-600 bg-purple-50 px-3 py-1 rounded-lg">
                            {sendingStatus.current}/{sendingStatus.total}
                        </span>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="w-full bg-gray-50 h-3 rounded-full overflow-hidden border border-gray-100 shadow-inner">
                            <div className="bg-gradient-to-r from-purple-600 to-pink-500 h-full transition-all duration-700 ease-out"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}></div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1 bg-green-50/50 p-4 rounded-2xl border border-green-100/50">
                                <span className="block text-[9px] font-black text-green-600 uppercase mb-1">SUCESSO</span>
                                <span className="text-xl font-black text-green-700">{sendingStatus.success}</span>
                            </div>
                            <div className="flex-1 bg-red-50/50 p-4 rounded-2xl border border-red-100/50">
                                <span className="block text-[9px] font-black text-red-600 uppercase mb-1">FALHAS</span>
                                <span className="text-xl font-black text-red-700">{sendingStatus.failed}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Header */}
            <header className="bg-white border border-gray-100 p-10 rounded-[40px] shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-purple-50/50 to-transparent -mr-40 -mt-40 rounded-full blur-3xl transition-all duration-1000 group-hover:scale-110" />
                
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-10">
                        <div className="relative">
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-[28px] flex items-center justify-center shadow-xl shadow-purple-100 transform -rotate-6 group-hover:rotate-0 transition-all duration-500">
                                <Twitter className="text-white" size={36} strokeWidth={2.5} />
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-4 border-white shadow-lg rounded-xl flex items-center justify-center">
                                <Sparkles className="text-purple-600" size={14} />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.4em] bg-purple-50 px-4 py-1.5 rounded-full">SISTEMA_AUTOMAÇÃO_X</span>
                                <div className="h-[1px] w-12 bg-gray-100" />
                            </div>
                            <h1 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Centro<span className="text-purple-600">_de_Controle_X</span></h1>
                            <p className="text-gray-400 text-sm font-medium">Potencialize sua presença no X com automação inteligente e conversão Shopee.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="bg-gray-50 border border-gray-100 px-8 py-4 rounded-3xl flex items-center gap-5 transition-all hover:border-purple-100">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">STATUS_CONEXÃO</span>
                                <span className={`text-xs font-black uppercase tracking-widest ${twitterConfigured ? 'text-purple-600' : 'text-gray-400'}`}>
                                    {twitterConfigured ? 'SISTEMA_ATIVO' : 'AGUARDANDO...'}
                                </span>
                            </div>
                            <div className={`w-3 h-3 rounded-full ${twitterConfigured ? 'bg-purple-600 shadow-[0_0_12px_rgba(147,51,234,0.5)] animate-pulse' : 'bg-gray-300'}`} />
                        </div>
                    </div>
                </div>
            </header>

            {/* Accounts Management */}
            <section className="bg-white border border-gray-100 rounded-[32px] overflow-hidden shadow-sm">
                <div className="px-10 py-6 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                            <User size={20} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ECOSSISTEMA_X</span>
                            <h2 className="font-black text-gray-900 text-sm uppercase tracking-widest">CONTAS_CONECTADAS</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-white border border-gray-100 px-4 py-2 rounded-xl">
                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{accounts.length} ATIVAS</span>
                    </div>
                </div>

                <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {accounts.length === 0 ? (
                        <div className="col-span-full text-center py-20 flex flex-col items-center gap-4">
                            <div className="w-20 h-20 bg-gray-50 rounded-[32px] flex items-center justify-center text-gray-200">
                                <Twitter size={40} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Nenhuma conta detectada</p>
                                <p className="text-xs text-gray-400">Conecte sua primeira conta X para iniciar o fluxo.</p>
                            </div>
                        </div>
                    ) : (
                        accounts.map(account => (
                            <div key={account.id} className="flex items-center gap-5 p-6 border border-gray-100 bg-white rounded-3xl hover:border-purple-100 hover:shadow-xl hover:shadow-purple-50/50 transition-all group">
                                <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-[20px] flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                                    {account.profileImage ? (
                                        <img src={account.profileImage} alt={account.username} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-purple-100 to-pink-50 flex items-center justify-center text-purple-400">
                                            <Twitter size={24} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <h3 className="font-black text-gray-900 text-sm truncate uppercase tracking-tight">@{account.username}</h3>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                        <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">CONECTADO // {new Date(account.addedAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleRefreshAccount(account.id)}
                                        className="w-10 h-10 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center text-gray-400 hover:text-purple-600 hover:border-purple-200 hover:bg-white transition-all shadow-sm"
                                        title="Atualizar Dados"
                                        disabled={loading}
                                    >
                                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                                    </button>
                                    <button
                                        onClick={() => handleDisconnectAccount(account.id)}
                                        className="w-10 h-10 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-100 hover:bg-white transition-all shadow-sm"
                                        title="Desconectar"
                                    >
                                        <XCircle size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-10">
                    {/* Settings Card */}
                    <section className="bg-white border border-gray-100 rounded-[40px] overflow-hidden shadow-sm">
                        <div className="px-10 py-8 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                                    <Settings size={18} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PARÂMETROS_X</span>
                                    <h2 className="font-black text-gray-900 text-sm uppercase tracking-widest">CONFIGURAÇÃO_DO_ENVIO</h2>
                                </div>
                            </div>
                        </div>

                        {/* Usage Progress */}
                        <div className="mx-10 mt-10 bg-gray-50 border border-gray-100 p-8 rounded-[32px] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100/20 -mr-16 -mt-16 rounded-full blur-2xl" />
                            <div className="relative z-10 flex justify-between items-center mb-6">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">COTA_DIÁRIA_DE_TRANSMISSÃO</span>
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
                                        <span className="text-xl font-black text-gray-900">{usage.count} <span className="text-gray-300">/</span> {usage.limit} TWEETS</span>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-100 px-4 py-2 rounded-xl text-[10px] font-black text-purple-600 uppercase tracking-widest animate-bounce">
                                    NÍVEL_GRATUITO_ATIVO
                                </div>
                            </div>
                            <div className="w-full bg-white h-3 rounded-full overflow-hidden border border-gray-100 shadow-inner">
                                <div
                                    className={`h-full transition-all duration-1000 ease-out ${usage.count >= usage.limit ? 'bg-red-500' : 'bg-gradient-to-r from-purple-600 to-pink-500'}`}
                                    style={{ width: `${Math.min((usage.count / usage.limit) * 100, 100)}%` }}
                                ></div>
                            </div>
                            {usage.count >= usage.limit && (
                                <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-4 animate-pulse">
                                    ⚠️ LIMITE_CRÍTICO_ATINGIDO // OPERAÇÕES_SUSPENSAS_ATÉ_RESET
                                </p>
                            )}
                        </div>

                        <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">POSTAR_EM_CONTAS_SELECIONADAS</label>
                                <div className="bg-gray-50 border border-gray-100 rounded-[32px] p-6 space-y-4">
                                    <div className="flex items-center justify-between px-2 mb-2">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{selectedAccounts.length === 0 ? 'TODAS AS CONTAS' : `${selectedAccounts.length} SELECIONADAS`}</span>
                                        <button 
                                            onClick={() => setSelectedAccounts(selectedAccounts.length === accounts.length ? [] : accounts.map(a => a.id))}
                                            className="text-[9px] font-black text-purple-600 hover:text-purple-700 transition-colors uppercase tracking-widest"
                                        >
                                            {selectedAccounts.length === accounts.length ? 'DESELECIONAR TODAS' : 'SELECIONAR TODAS'}
                                        </button>
                                    </div>
                                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                        {accounts.map(acc => {
                                            const isSelected = selectedAccounts.length === 0 || selectedAccounts.includes(acc.id);
                                            return (
                                                <button
                                                    key={acc.id}
                                                    onClick={() => {
                                                        if (selectedAccounts.includes(acc.id)) {
                                                            setSelectedAccounts(selectedAccounts.filter(id => id !== acc.id));
                                                        } else {
                                                            setSelectedAccounts([...selectedAccounts, acc.id]);
                                                        }
                                                    }}
                                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                                        isSelected 
                                                        ? 'bg-white border-purple-200 shadow-sm' 
                                                        : 'bg-transparent border-transparent opacity-50 grayscale'
                                                    }`}
                                                >
                                                    <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                                                        {acc.profileImage ? (
                                                            <img src={acc.profileImage} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-purple-300">
                                                                <Twitter size={16} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-black uppercase tracking-tight flex-1 text-left ${isSelected ? 'text-gray-900' : 'text-gray-400'}`}>
                                                        @{acc.username}
                                                    </span>
                                                    {isSelected && <CheckCircle size={16} className="text-purple-600" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-2">MULTI-SELEÇÃO INTELIGENTE ATIVA</p>
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">MODO_DE_EXECUÇÃO</label>
                                    <div className="flex p-2 bg-gray-50 rounded-2xl border border-gray-100 gap-2">
                                        <button
                                            onClick={() => setSendMode('shopee')}
                                            className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${sendMode === 'shopee'
                                                ? 'bg-white text-purple-600 shadow-lg shadow-purple-50'
                                                : 'text-gray-400 hover:text-gray-600'
                                                }`}
                                        >
                                            PRODUTOS_SHOPEE
                                        </button>
                                        <button
                                            onClick={() => setSendMode('manual')}
                                            className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${sendMode === 'manual'
                                                ? 'bg-white text-purple-600 shadow-lg shadow-purple-50'
                                                : 'text-gray-400 hover:text-gray-600'
                                                }`}
                                        >
                                            MENSAGEM_MANUAL
                                        </button>
                                    </div>
                                </div>

                                {sendMode === 'shopee' ? (
                                    <div className="grid grid-cols-1 gap-6">
                                        <div className="space-y-3">
                                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">QUANTIDADE_DE_TWEETS</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    value={productCount}
                                                    onChange={(e) => setProductCount(parseInt(e.target.value))}
                                                    className="w-full p-6 bg-gray-50 border border-gray-100 text-gray-900 font-black text-2xl focus:outline-none focus:border-purple-400 transition-all rounded-3xl"
                                                    min="1"
                                                    max="10"
                                                />
                                                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 font-black text-[10px] uppercase tracking-widest">ITENS_LOTE</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">ALGORITMO_DE_SELEÇÃO</label>
                                            <select
                                                value={categoryType}
                                                onChange={(e) => setCategoryType(e.target.value)}
                                                className="w-full p-6 bg-gray-50 border border-gray-100 text-gray-900 font-black text-xs focus:outline-none focus:border-purple-400 transition-all rounded-3xl appearance-none"
                                            >
                                                <option value="random">RANDOM_ALEATÓRIO</option>
                                                <option value="cheapest">PREÇO_MINIMO</option>
                                                <option value="best_sellers_week">MAIS_VENDIDOS_SEMANA</option>
                                                <option value="best_sellers_month">MAIS_VENDIDOS_MÊS</option>
                                                <option value="achadinhos">ACHADINHOS_PREMIUM</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">URL_DE_MÍDIA_REMOTA</label>
                                            <input
                                                type="text"
                                                value={manualImageUrl}
                                                onChange={(e) => setManualImageUrl(e.target.value)}
                                                className="w-full p-6 bg-gray-50 border border-gray-100 text-gray-900 font-medium text-xs focus:outline-none focus:border-purple-400 placeholder:text-gray-300 transition-all rounded-3xl"
                                                placeholder="HTTPS://DOMINIO.COM/IMAGEM.PNG"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">CONTEÚDO_DA_TRANSMISSÃO</label>
                                            <textarea
                                                value={manualMessage}
                                                onChange={(e) => setManualMessage(e.target.value)}
                                                className="w-full p-6 bg-gray-50 border border-gray-100 text-gray-900 font-medium text-xs focus:outline-none focus:border-purple-400 placeholder:text-gray-300 transition-all rounded-[32px] min-h-[160px] resize-none leading-relaxed"
                                                placeholder="DIGITE A MENSAGEM QUE DESEJA ENVIAR..."
                                            ></textarea>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {sendMode === 'shopee' && (
                            <div className="px-10 pb-10 space-y-8">
                                <div className="h-[1px] w-full bg-gray-50" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-1">
                                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest">TEMPLATE_DE_TWEET_INTELIGENTE</label>
                                            <button
                                                onClick={handleGenerateTemplate}
                                                disabled={loading}
                                                className="flex items-center gap-2 text-[9px] font-black text-purple-600 hover:text-purple-700 transition-colors uppercase tracking-widest"
                                            >
                                                <Sparkles size={14} /> GERAR_COM_IA
                                            </button>
                                        </div>
                                        <textarea
                                            value={messageTemplate}
                                            onChange={e => setMessageTemplate(e.target.value)}
                                            className="w-full p-8 bg-gray-50 border border-gray-100 text-gray-900 font-medium text-xs focus:outline-none focus:border-purple-400 rounded-[32px] h-56 resize-none transition-all leading-relaxed shadow-inner"
                                        />
                                    </div>
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest">HASHTAGS_DE_DISTRIBUIÇÃO</label>
                                                <button
                                                    onClick={handleGenerateHashtags}
                                                    disabled={loading}
                                                    className="flex items-center gap-2 text-[9px] font-black text-purple-600 hover:text-purple-700 transition-colors uppercase tracking-widest"
                                                >
                                                    <Sparkles size={14} /> SUGERIR_TAGS
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 p-6 rounded-3xl focus-within:border-purple-400 transition-all shadow-inner">
                                                <Hash size={20} className="text-purple-600" />
                                                <input
                                                    type="text"
                                                    value={customHashtags}
                                                    onChange={e => setCustomHashtags(e.target.value)}
                                                    className="w-full bg-transparent border-none focus:outline-none font-medium text-xs text-gray-900 placeholder:text-gray-300"
                                                    placeholder="SEPARE_POR_VIRGULA..."
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="bg-purple-50/50 border border-purple-100 p-8 rounded-[32px] flex items-center justify-between group cursor-pointer hover:bg-purple-50 transition-all" onClick={() => setEnableRotation(!enableRotation)}>
                                            <div className="flex items-center gap-5">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${enableRotation ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                                    <RefreshCw size={24} className={enableRotation ? 'animate-spin-slow' : ''} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-gray-900 uppercase tracking-tight">EVITAR_CONTEÚDO_REPETIDO</span>
                                                    <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">MEMÓRIA_DE_CACHE_24H_ATIVA</span>
                                                </div>
                                            </div>
                                            <div className={`w-14 h-7 rounded-full p-1 transition-all duration-300 ${enableRotation ? 'bg-purple-600' : 'bg-gray-300'}`}>
                                                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-all duration-300 ${enableRotation ? 'translate-x-7' : 'translate-x-0'}`} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="px-10 pb-10">
                            <button
                                onClick={handleSendNow}
                                disabled={usage.count >= usage.limit}
                                className={`w-full py-8 rounded-[32px] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all duration-500 shadow-xl ${
                                    usage.count >= usage.limit
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-[1.02] hover:shadow-purple-200 active:scale-[0.98]'
                                }`}
                            >
                                <Send size={24} />
                                {sendMode === 'manual' ? 'DISPARAR_MENSAGEM_AGORA' : 'INICIAR_POSTAGEM_AUTOMÁTICA'}
                            </button>
                        </div>
                    </section>
                </div>

                {/* Scheduling Card */}
                <div className="lg:col-span-1">
                    <section className="bg-white border border-gray-100 rounded-[40px] overflow-hidden shadow-sm sticky top-10">
                        <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <Clock size={16} />
                                </div>
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">PLANEJAMENTO_DE_PULSO</span>
                            </div>
                        </div>

                        <div className="p-8 space-y-10">
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">MODO_DE_CICLO</label>
                                <div className="flex p-1.5 bg-gray-50 rounded-2xl border border-gray-100 gap-1">
                                    <button
                                        onClick={() => setScheduleMode('single')}
                                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${scheduleMode === 'single'
                                            ? 'bg-white text-purple-600 shadow-md'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        PULSO_ÚNICO
                                    </button>
                                    <button
                                        onClick={() => setScheduleMode('multiple')}
                                        className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${scheduleMode === 'multiple'
                                            ? 'bg-white text-purple-600 shadow-md'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        MULTI_PULSO
                                    </button>
                                </div>
                                <button
                                    onClick={handleAutoScheduleDailyLimit}
                                    className="w-full mt-2 py-4 bg-purple-50 border border-purple-100 text-purple-600 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-purple-600 hover:text-white transition-all duration-500 flex items-center justify-center gap-3 group"
                                >
                                    <Zap size={16} className="group-hover:animate-bounce" />
                                    MAX_COTA_DIÁRIA (17 TWEETS)
                                </button>
                            </div>

                            {scheduleMode === 'single' ? (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">RECORRÊNCIA</label>
                                        <select
                                            value={frequency}
                                            onChange={(e) => setFrequency(e.target.value as any)}
                                            className="w-full p-6 bg-gray-50 border border-gray-100 text-gray-900 font-black text-xs focus:outline-none focus:border-purple-400 transition-all rounded-3xl"
                                        >
                                            <option value="daily">DIÁRIO_CONSTANTE</option>
                                            <option value="weekly">SEMANAL_ESTRATÉGICO</option>
                                            <option value="monthly">MENSAL_CONSOLIDAÇÃO</option>
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest px-2">PULSO_HORÁRIO</label>
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full p-6 bg-gray-50 border border-gray-100 text-gray-900 font-black text-2xl focus:outline-none focus:border-purple-400 transition-all rounded-3xl"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between px-2">
                                        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">MAPA_DE_HORÁRIOS</label>
                                        {times.length < 5 && (
                                            <button
                                                onClick={addScheduleTime}
                                                className="text-[9px] font-black text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-all uppercase tracking-widest"
                                            >
                                                + ADICIONAR_CÉLULA
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {times.map((t, index) => (
                                            <div key={index} className="flex items-center gap-4 bg-gray-50 p-4 border border-gray-100 rounded-2xl group hover:border-purple-200 transition-all">
                                                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-[10px] font-black text-purple-600">
                                                    #{index + 1}
                                                </div>
                                                <input
                                                    type="time"
                                                    value={t}
                                                    onChange={(e) => updateScheduleTime(index, e.target.value)}
                                                    className="flex-1 bg-transparent border-none focus:outline-none text-xl font-black text-gray-900 p-0"
                                                />
                                                {times.length > 1 && (
                                                    <button
                                                        onClick={() => removeScheduleTime(index)}
                                                        className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-8 border-t border-gray-50 space-y-8">
                                <div className="bg-gray-50/50 border border-gray-100 p-6 rounded-[32px] flex items-center justify-between group cursor-pointer hover:bg-gray-50 transition-all" onClick={() => setAutomationEnabled(!automationEnabled)}>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-gray-900 uppercase tracking-tight">ATIVAR_AGENDAMENTO</span>
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">SISTEMA_DE_AUTOMAÇÃO</span>
                                    </div>
                                    <div className={`w-14 h-7 rounded-full p-1 transition-all duration-300 ${automationEnabled ? 'bg-purple-600 shadow-lg shadow-purple-100' : 'bg-gray-300'}`}>
                                        <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-all duration-300 ${automationEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                                
                                <button
                                    onClick={handleSchedule}
                                    className="w-full py-8 bg-white border-2 border-gray-100 text-gray-900 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-4 hover:border-purple-600 hover:text-purple-600 hover:shadow-2xl hover:shadow-purple-50 transition-all rounded-[32px]"
                                >
                                    <Clock size={20} />
                                    COMPROMETER_ESCADA
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default TwitterAutomationPage;
