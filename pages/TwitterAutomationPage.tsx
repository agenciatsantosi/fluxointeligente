import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Twitter, Send, RefreshCw, Clock, CheckCircle, XCircle, User, Hash, FileText, Power, Settings, Key, Sparkles } from 'lucide-react';
import axios from 'axios';

const TwitterAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Twitter Configuration
    const [twitterConfigured, setTwitterConfigured] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [accessTokenSecret, setAccessTokenSecret] = useState('');

    // Multi-account state
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]); // IDs of accounts to post to (empty = all)
    const [showAddAccount, setShowAddAccount] = useState(false);

    const [usage, setUsage] = useState({ count: 0, limit: 25 });

    // Automation Settings
    const [productCount, setProductCount] = useState(1);
    const [categoryType, setCategoryType] = useState('random');
    const [enableRotation, setEnableRotation] = useState(true);

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
            const response = await axios.get('/api/twitter/usage');
            if (response.data.success) {
                setUsage({ count: response.data.count, limit: response.data.limit });
            }
        } catch (error) {
            console.error('Error checking usage:', error);
        }
    };

    const checkTwitterConfig = async () => {
        try {
            const response = await axios.get('/api/twitter/accounts');
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
            const response = await axios.get('/api/schedules');
            if (response.data.success) {
                setSchedules(response.data.schedules.filter((s: any) => s.platform === 'twitter'));
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    };

    const handleConfigureTwitter = async () => {
        if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
            showNotification('❌ Preencha todas as credenciais', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post('/api/twitter/accounts', {
                apiKey,
                apiSecret,
                accessToken,
                accessTokenSecret
            });

            if (response.data.success) {
                showNotification('✅ Conta conectada com sucesso!', 'success');
                setApiKey('');
                setApiSecret('');
                setAccessToken('');
                setAccessTokenSecret('');
                setShowAddAccount(false);
                checkTwitterConfig(); // Refresh list
            } else {
                showNotification(`❌ Erro: ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification(`❌ Erro ao conectar: ${error.response?.data?.error || error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnectAccount = async (id: number) => {
        if (!window.confirm('Tem certeza que deseja desconectar esta conta?')) return;

        try {
            await axios.delete(`/api/twitter/accounts/${id}`);
            showNotification('✅ Conta desconectada', 'success');
            checkTwitterConfig();
        } catch (error) {
            showNotification('❌ Erro ao desconectar', 'error');
        }
    };

    const handleRefreshAccount = async (id: number) => {
        setLoading(true);
        try {
            const response = await axios.post(`/api/twitter/accounts/${id}/refresh`);
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
            const response = await axios.post('/api/gemini/generate-hashtags', { topic });

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
            const response = await axios.post('/api/gemini/generate-caption', {
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
            const response = await axios.post('/api/schedules', {
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
                const response = await axios.post('/api/twitter/post-now', {
                    productCount,
                    shopeeSettings: shopeeAffiliateSettings,
                    categoryType,
                    messageTemplate,
                    hashtags: customHashtags.split(',').map(tag => tag.trim()).filter(tag => tag),
                    enableRotation,
                    accountId: accountId // Pass specific account ID
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
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl backdrop-blur-md border ${notification.type === 'success' ? 'bg-green-500/90 border-green-400' :
                    notification.type === 'error' ? 'bg-red-500/90 border-red-400' : 'bg-blue-500/90 border-blue-400'
                    } text-white animate-slide-in`}>
                    <div className="flex items-center gap-3">
                        {notification.type === 'success' ? <CheckCircle size={20} /> : notification.type === 'error' ? <XCircle size={20} /> : <Twitter size={20} />}
                        <span className="font-medium">{notification.message}</span>
                    </div>
                </div>
            )}

            {sendingStatus && (
                <div className="fixed top-24 right-4 z-50 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/20 min-w-[320px] animate-slide-in">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-3 h-3 rounded-full ${sendingStatus.active ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
                        <span className="font-bold text-gray-800 text-lg">
                            {sendingStatus.active ? '🚀 Postando...' : '✅ Concluído!'}
                        </span>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm text-gray-600 font-medium">
                            <span>Progresso</span>
                            <span>{sendingStatus.current}/{sendingStatus.total}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-12 -mb-12 blur-2xl" />

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Twitter className="text-white" size={32} />
                            Automação Twitter/X
                        </h1>
                        <p className="text-blue-100 mt-2 text-lg">Engaje seus seguidores com ofertas automáticas e aumente suas vendas.</p>
                    </div>
                    <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${twitterConfigured ? 'bg-green-500/20 text-green-100 border border-green-500/30' : 'bg-white/10 text-white/60'}`}>
                        <div className={`w-3 h-3 rounded-full ${twitterConfigured ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="font-medium">{twitterConfigured ? 'Conectado' : 'Desconectado'}</span>
                    </div>
                </div>
            </div>

            {/* Accounts Management */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <User className="text-blue-500" size={24} />
                        Contas Conectadas
                    </h2>
                    <button
                        onClick={() => setShowAddAccount(!showAddAccount)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 font-medium"
                    >
                        {showAddAccount ? <XCircle size={18} /> : <User size={18} />}
                        {showAddAccount ? 'Cancelar' : 'Adicionar Conta'}
                    </button>
                </div>

                {showAddAccount && (
                    <div className="p-6 bg-blue-50 border-b border-blue-100 animate-in fade-in slide-in-from-top-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                        placeholder="Cole sua API Key aqui"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">API Secret</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3 text-gray-400" size={18} />
                                    <input
                                        type="password"
                                        value={apiSecret}
                                        onChange={e => setApiSecret(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                        placeholder="Cole seu API Secret aqui"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Access Token</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={accessToken}
                                        onChange={e => setAccessToken(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                        placeholder="Cole seu Access Token aqui"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Access Token Secret</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3 text-gray-400" size={18} />
                                    <input
                                        type="password"
                                        value={accessTokenSecret}
                                        onChange={e => setAccessTokenSecret(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                        placeholder="Cole seu Access Token Secret aqui"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={handleConfigureTwitter}
                                disabled={loading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? <RefreshCw className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                                {loading ? 'Conectando...' : 'Conectar Conta'}
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-gray-500">
                            Nenhuma conta conectada. Adicione uma conta para começar.
                        </div>
                    ) : (
                        accounts.map(account => (
                            <div key={account.id} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:shadow-md transition-shadow bg-gray-50">
                                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm shrink-0">
                                    {account.profileImage ? (
                                        <img src={account.profileImage} alt={account.username} className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="text-blue-500" size={24} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-800 truncate">@{account.username}</h3>
                                    <p className="text-xs text-gray-500">Conectado em {new Date(account.addedAt).toLocaleDateString()}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleRefreshAccount(account.id)}
                                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Atualizar Dados"
                                        disabled={loading}
                                    >
                                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                                    </button>
                                    <button
                                        onClick={() => handleDisconnectAccount(account.id)}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Desconectar"
                                    >
                                        <XCircle size={20} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Configuration & Actions */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Settings Card */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <Settings size={24} />
                            </div>
                            Configuração do Envio
                        </h2>

                        {/* Usage Progress */}
                        <div className="mb-6 bg-blue-50 rounded-xl p-4 border border-blue-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-blue-800">Limite Diário (Free Tier)</span>
                                <span className="text-sm font-bold text-blue-600">{usage.count}/{usage.limit} tweets</span>
                            </div>
                            <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${usage.count >= usage.limit ? 'bg-red-500' : 'bg-blue-500'
                                        }`}
                                    style={{ width: `${Math.min((usage.count / usage.limit) * 100, 100)}%` }}
                                ></div>
                            </div>
                            {usage.count >= usage.limit && (
                                <p className="text-xs text-red-500 font-bold mt-2">
                                    ⚠️ Limite diário atingido! Volte amanhã.
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Postar em</label>
                                <select
                                    multiple
                                    value={selectedAccounts}
                                    onChange={(e) => {
                                        const options = Array.from(e.target.selectedOptions, option => option.value);
                                        setSelectedAccounts(options);
                                    }}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium h-[120px]"
                                >
                                    <option value="">Todas as Contas ({accounts.length})</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>@{acc.username}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Segure Ctrl para selecionar múltiplas (Vazio = Todas)</p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Quantidade de Produtos</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={productCount}
                                        onChange={(e) => setProductCount(parseInt(e.target.value))}
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-lg"
                                        min="1"
                                        max="10"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">tweets</span>
                                </div>
                                <div className="mt-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Fonte de Produtos</label>
                                    <select
                                        value={categoryType}
                                        onChange={(e) => setCategoryType(e.target.value)}
                                        className="w-full p-4 bg-blue-50/50 border border-blue-100 text-blue-800 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                    >
                                        <option value="random">🎲 Aleatório (Baseado nos seus filtros)</option>
                                        <option value="cheapest">📉 Mais Baratos (Ofertas arrasadoras)</option>
                                        <option value="best_sellers_week">🔥 Mais Vendidos da Semana</option>
                                        <option value="best_sellers_month">📅 Mais Vendidos do Mês</option>
                                        <option value="achadinhos">🕵️ Achadinhos Imperdíveis</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-4">
                            <div className="relative">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Template do Tweet</label>
                                <textarea
                                    value={messageTemplate}
                                    onChange={e => setMessageTemplate(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 h-32 text-sm font-mono"
                                />
                                <button
                                    onClick={handleGenerateTemplate}
                                    disabled={loading}
                                    className="absolute right-2 bottom-2 p-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors"
                                    title="Gerar Texto com IA"
                                >
                                    <Sparkles size={16} />
                                </button>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Hashtags (separadas por vírgula)</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-blue-500">
                                        <Hash size={20} className="text-gray-400 ml-2" />
                                        <input
                                            type="text"
                                            value={customHashtags}
                                            onChange={e => setCustomHashtags(e.target.value)}
                                            className="w-full p-2 bg-transparent border-none focus:ring-0 font-medium"
                                            placeholder="Shopee, Ofertas, Promoção"
                                        />
                                    </div>
                                    <button
                                        onClick={handleGenerateHashtags}
                                        disabled={loading}
                                        className="px-4 py-2 bg-purple-100 text-purple-600 rounded-xl hover:bg-purple-200 transition-colors font-bold flex items-center gap-2"
                                        title="Gerar com IA"
                                    >
                                        <Sparkles size={20} />
                                        <span className="hidden md:inline">IA</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <label className="flex items-center cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={enableRotation}
                                    onChange={(e) => setEnableRotation(e.target.checked)}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                />
                                <span className="ml-3 text-gray-700 font-medium group-hover:text-blue-700 transition-colors">
                                    🔄 Evitar produtos repetidos (24h)
                                </span>
                            </label>
                        </div>

                        <button
                            onClick={handleSendNow}
                            className="w-full mt-8 py-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3"
                        >
                            <Send size={24} />
                            Postar Agora
                        </button>
                        {usage.count >= usage.limit && (
                            <p className="text-center text-xs text-red-500 font-bold mt-2">
                                Limite diário atingido ({usage.limit} tweets)
                            </p>
                        )}
                    </div>
                </div>

                {/* Scheduling Card */}
                <div className="lg:col-span-1">
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg sticky top-8">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                <Clock size={24} />
                            </div>
                            Agendamento
                        </h2>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Modo</label>
                                <div className="flex p-1 bg-gray-100 rounded-xl">
                                    <button
                                        onClick={() => setScheduleMode('single')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${scheduleMode === 'single'
                                            ? 'bg-white text-gray-800 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        Único
                                    </button>
                                    <button
                                        onClick={() => setScheduleMode('multiple')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${scheduleMode === 'multiple'
                                            ? 'bg-white text-gray-800 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        Múltiplo
                                    </button>
                                </div>
                            </div>

                            {scheduleMode === 'single' ? (
                                <div className="space-y-4">
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
                                        <label className="text-sm font-medium text-gray-700">Horários</label>
                                        {times.length < 5 && (
                                            <button
                                                onClick={addScheduleTime}
                                                className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                                            >
                                                + Add
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

                            <div className="pt-6 border-t border-gray-100 flex flex-col gap-4">
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
                                    className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                                >
                                    <Clock size={18} />
                                    Agendar Envio
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TwitterAutomationPage;
