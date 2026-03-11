import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Bot, Clock, CheckCircle, Settings, Users, Loader2, XCircle, FileText, MessageSquare, AlertCircle } from 'lucide-react';
import api from '../services/api';

const TelegramAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [botToken, setBotToken] = useState('');
    const [botInfo, setBotInfo] = useState<any>(null);
    const [groups, setGroups] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
    const [newGroupId, setNewGroupId] = useState('');
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']); // Para múltiplos horários
    const [productCount, setProductCount] = useState(5);
    const [categoryType, setCategoryType] = useState('random'); // Fonte de produtos
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [isAutomationActive, setIsAutomationActive] = useState(false);
    const [registeredBots, setRegisteredBots] = useState<Array<{ id: number, name: string, username: string, token: string }>>([]);
    const [history, setHistory] = useState<Array<{
        id: string;
        date: string;
        time: string;
        productName: string;
        groups: string[];
        status: 'success' | 'failed';
    }>>([]);

    const [sendMode, setSendMode] = useState<'auto' | 'manual'>('auto');
    const [manualMessage, setManualMessage] = useState('');

    const [messageTemplate, setMessageTemplate] = useState(`🚨 *PROMOÇÃO NA SHOPEE AGORA*

{nome_produto}

🔴 *DE:* R$ {preco_original}
🟢 *SOMENTE HOJE:* R$ {preco_com_desconto}

⭐⭐⭐⭐⭐ (Bem Avaliado)

🛒 *Compre aqui:* 👇
{link}

⚠ *Esse BUG vai acabar em alguns minutos!*`);

    const loadSettings = () => {
        const saved = localStorage.getItem('telegram_settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                setBotToken(settings.botToken || '');
                setGroups(settings.groups || []);
                setMessageTemplate(settings.messageTemplate || '');
                setScheduleMode(settings.scheduleMode || 'single');
                setFrequency(settings.frequency || 'daily');
                setTime(settings.time || '09:00');
                setTimes(settings.times || ['09:00']);
                setProductCount(settings.productCount || 5);
                setCategoryType(settings.categoryType || 'random');
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        }
    };

    const loadHistory = () => {
        const saved = localStorage.getItem('telegram_history');
        if (saved) {
            try {
                setHistory(JSON.parse(saved));
            } catch (error) {
                console.error('Error loading history:', error);
            }
        }
    };

    const addToHistory = (productName: string, selectedGroups: string[], status: 'success' | 'failed') => {
        const newEntry = {
            id: Date.now().toString(),
            date: new Date().toLocaleDateString('pt-BR'),
            time: new Date().toLocaleTimeString('pt-BR'),
            productName,
            groups: selectedGroups,
            status
        };

        setHistory(prevHistory => {
            const updatedHistory = [newEntry, ...prevHistory].slice(0, 50);
            localStorage.setItem('telegram_history', JSON.stringify(updatedHistory));
            return updatedHistory;
        });
    };

    const addScheduleTime = () => {
        if (times.length < 5) {
            setTimes([...times, '09:00']);
        }
    };

    const updateScheduleTime = (index: number, newTime: string) => {
        const newTimes = [...times];
        newTimes[index] = newTime;
        setTimes(newTimes);
    };

    const removeScheduleTime = (index: number) => {
        const newTimes = times.filter((_, i) => i !== index);
        setTimes(newTimes);
    };

    const toggleGroup = (id: string) => {
        setGroups(groups.map(g =>
            g.id === id ? { ...g, enabled: !g.enabled } : g
        ));
    };

    const removeGroup = (id: string) => {
        if (confirm('Tem certeza que deseja remover este grupo da lista?')) {
            setGroups(groups.filter(g => g.id !== id));
        }
    };

    const loadRegisteredBots = async () => {
        try {
            const response = await api.get('/telegram/accounts');
            if (response.data.success) {
                setRegisteredBots(response.data.accounts);
            }
        } catch (error) {
            console.error('Error loading registered bots:', error);
        }
    };

    useEffect(() => {
        checkAutomationStatus();
        loadHistory();
        loadSettings();
        loadSavedGroups();
        loadRegisteredBots();

        // Check for force_add_account flag from AutomationAccountsPage
        if (localStorage.getItem('force_add_account') === 'true') {
            // Focus the bot token input to guide the user
            const input = document.getElementById('botToken') as HTMLInputElement;
            if (input) input.focus();
            localStorage.removeItem('force_add_account');
        }
    }, []);

    // Salvar configurações sempre que mudarem
    useEffect(() => {
        const settings = {
            botToken,
            groups,
            messageTemplate,
            scheduleMode,
            frequency,
            time,
            times,
            productCount,
            categoryType
        };
        localStorage.setItem('telegram_settings', JSON.stringify(settings));
    }, [botToken, groups, messageTemplate, scheduleMode, frequency, time, times, productCount, categoryType]);

    const loadSavedGroups = async () => {
        try {
            const response = await api.get('/telegram/groups');
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                setGroups(response.data);
            }
        } catch (error) {
            console.error('Erro ao carregar grupos salvos:', error);
        }
    };

    const checkAutomationStatus = async () => {
        try {
            const response = await api.get('/telegram/status');
            setIsAutomationActive(response.data.active);
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const loadBotGroups = async () => {
        if (!botToken) return;
        console.log('[DEBUG] Carregando grupos...');

        try {
            const response = await api.post('/telegram/list-groups', { botToken });
            console.log('[DEBUG] Resposta:', response.data);

            if (response.data.success && response.data.groups.length > 0) {
                const existingIds = new Set(groups.map(g => g.id));
                const newGroups = response.data.groups
                    .filter((g: any) => !existingIds.has(g.id))
                    .map((g: any) => ({ id: g.id, name: g.name, enabled: true }));

                if (newGroups.length > 0) {
                    setGroups([...groups, ...newGroups]);
                    alert(`✅ ${newGroups.length} grupo(s) novo(s) carregado(s)!`);
                } else {
                    alert('ℹ️ Nenhum grupo novo encontrado. Dica: Se o grupo for antigo, envie uma mensagem nele e tente novamente!');
                }
            } else {
                alert('⚠️ Nenhum grupo encontrado. Dica: Envie uma mensagem no grupo (ou um /start) para que o bot consiga detectá-lo!');
            }
        } catch (error: any) {
            console.error('[DEBUG] Erro:', error);
            alert('❌ Erro: ' + error.message);
        }
    };

    const handleTestBot = async () => {
        if (!botToken) {
            setTestStatus('error');
            setTestMessage('Digite o token do bot');
            return;
        }

        setTestStatus('loading');
        setTestMessage('Testando conexão...');

        try {
            // Use the test endpoint so it ONLY verifies, doesn't save
            const response = await api.post('/telegram/test', { botToken });

            if (response.data.success) {
                const botData = {
                    firstName: response.data.botInfo.firstName,
                    username: response.data.botInfo.username
                };
                setBotInfo(botData);
                setTestStatus('success');
                setTestMessage(`Conexão estabelecida com: @${response.data.botInfo.username}`);
            } else {
                setTestStatus('error');
                setTestMessage(response.data.error || 'Erro ao conectar');
            }
        } catch (error: any) {
            setTestStatus('error');
            setTestMessage(error.message);
        }
    };

    const handleSaveBot = async () => {
        if (!botToken) return;

        setTestStatus('loading');
        setTestMessage('Salvando bot...');

        try {
            const response = await api.post('/telegram/accounts', { botToken });

            if (response.data.success) {
                setTestStatus('success');
                setTestMessage(`Bot salvo com sucesso: @${response.data.account.username}`);

                // Reload list of registered bots
                loadRegisteredBots();
                loadBotGroups();
            } else {
                setTestStatus('error');
                setTestMessage(response.data.error || 'Erro ao salvar');
            }
        } catch (error: any) {
            setTestStatus('error');
            setTestMessage(error.message);
        }
    };

    const handleAddGroup = async () => {
        if (!newGroupId || !botToken) return;

        try {
            const response = await api.post('/telegram/chat-info', {
                chatId: newGroupId,
                botToken
            });

            if (response.data.success) {
                setGroups([...groups, {
                    id: newGroupId,
                    name: response.data.chatInfo.title,
                    enabled: true
                }]);
                setNewGroupId('');
            } else {
                alert('Erro: ' + response.data.error);
            }
        } catch (error: any) {
            alert('Erro: ' + error.message);
        }
    };

    const handleExecuteNow = async () => {
        const enabledGroups = groups.filter(g => g.enabled);

        if (!botToken || enabledGroups.length === 0) {
            alert('❌ Configure o bot e selecione pelo menos um grupo!');
            return;
        }

        if (sendMode === 'auto' && !shopeeAffiliateSettings.appId) {
            alert('❌ Configure suas credenciais da Shopee primeiro em "Afiliado Shopee"!');
            return;
        }

        if (sendMode === 'manual' && !manualMessage.trim()) {
            alert('❌ Digite a mensagem que deseja enviar!');
            return;
        }

        const confirmMsg = sendMode === 'manual'
            ? `Enviar mensagem manual para ${enabledGroups.length} grupo(s)?`
            : `Enviar ${productCount} produto(s) agora para ${enabledGroups.length} grupo(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            alert('🚀 Iniciando envio... Aguarde!');

            const response = await api.post('/telegram/post-now', {
                botToken,
                groups: enabledGroups,
                productCount,
                shopeeSettings: shopeeAffiliateSettings,
                messageTemplate,
                sendMode,
                manualMessage
            });

            if (response.data.success) {
                alert(`✅ ${response.data.message}`);

                const groupNames = enabledGroups.map(g => g.name);
                const desc = sendMode === 'manual'
                    ? `Mensagem manual: ${manualMessage.substring(0, 30)}...`
                    : `${productCount} produto(s) enviado(s)`;

                addToHistory(desc, groupNames, 'success');
                if (sendMode === 'manual') setManualMessage('');
            } else {
                alert('❌ Erro: ' + response.data.error);
                const groupNames = enabledGroups.map(g => g.name);
                addToHistory('Falha no envio', groupNames, 'failed');
            }
        } catch (error: any) {
            alert('❌ Erro ao enviar: ' + error.message);
            const groupNames = enabledGroups.map(g => g.name);
            addToHistory('Erro: ' + error.message, groupNames, 'failed');
        }
    };

    const handleSchedule = async () => {
        const enabledGroups = groups.filter(g => g.enabled);

        if (!botToken || enabledGroups.length === 0) {
            alert('❌ Configure o bot e selecione pelo menos um grupo!');
            return;
        }

        if (!automationEnabled) {
            alert('❌ Marque "Ativar agendamento automático" primeiro!');
            return;
        }

        if (!shopeeAffiliateSettings.appId) {
            alert('❌ Configure suas credenciais da Shopee primeiro!');
            return;
        }

        const scheduleText = frequency === 'daily' ? 'todo dia' : frequency === 'weekly' ? 'toda semana' : 'todo mês';
        const timeText = scheduleMode === 'multiple' ? `${times.length} horários` : `às ${time}`;
        const confirmMsg = `Agendar envio de ${productCount} produto(s) ${scheduleText} (${timeText}) para ${enabledGroups.length} grupo(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            const response = await api.post('/telegram/schedule', {
                botToken,
                groups: enabledGroups,
                schedule: {
                    frequency,
                    time,
                    times,
                    scheduleMode,
                    productCount,
                    enabled: true
                },
                categoryType,
                shopeeSettings: shopeeAffiliateSettings
            });

            if (response.data.success) {
                alert(`✅ Agendamento salvo com sucesso!\n\n📅 Veja todos os agendamentos na página "Agendamentos" no menu lateral.`);
                // Reset automation checkbox so user knows it was saved
                setAutomationEnabled(false);
                checkAutomationStatus();
            } else {
                alert('❌ Erro: ' + response.data.error);
            }
        } catch (error: any) {
            alert('❌ Erro ao agendar: ' + error.message);
        }
    };

    const handleStop = async () => {
        if (!confirm('Parar a automação agendada?')) return;

        try {
            await api.post('/telegram/stop');
            alert('⏹️ Automação parada com sucesso!');
            setAutomationEnabled(false);
            checkAutomationStatus();
        } catch (error: any) {
            alert('❌ Erro: ' + error.message);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <Bot size={32} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold">Automação Telegram</h1>
                        </div>
                        <p className="text-blue-100 text-lg max-w-xl">Gerencie seus grupos e automatize o envio de ofertas com seu bot.</p>
                    </div>
                    {isAutomationActive && (
                        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
                            <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_currentColor]"></div>
                            <span className="font-semibold tracking-wide">Automação Ativa</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Configuration */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Bot Configuration */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <Settings size={20} />
                            </div>
                            Configuração do Bot
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="botToken" className="block text-sm font-bold text-gray-700 mb-2">
                                    Token do Bot
                                </label>
                                <div className="space-y-3">
                                    {registeredBots.length > 0 && (
                                        <select
                                            className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-sm transition-all mb-2"
                                            onChange={(e) => {
                                                const bot = registeredBots.find(b => b.token === e.target.value);
                                                if (bot) {
                                                    setBotToken(bot.token);
                                                    setBotInfo({ firstName: bot.name, username: bot.username });
                                                    setTestStatus('success');
                                                    setTestMessage(`Bot selecionado: @${bot.username}`);
                                                }
                                            }}
                                            defaultValue=""
                                            title="Selecionar um bot já cadastrado"
                                        >
                                            <option value="" disabled>Selecionar bot cadastrado...</option>
                                            {registeredBots.map(bot => (
                                                <option key={bot.id} value={bot.token}>
                                                    @{bot.username} ({bot.name})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <input
                                        id="botToken"
                                        type="text"
                                        value={botToken}
                                        onChange={(e) => {
                                            setBotToken(e.target.value);
                                            setTestStatus('idle');
                                            setBotInfo(null);
                                        }}
                                        placeholder="1234567890:ABCdef..."
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm transition-all"
                                        title="Insira o token do seu bot do Telegram"
                                    />
                                    <button
                                        onClick={handleTestBot}
                                        disabled={testStatus === 'loading'}
                                        className={`w-full py-3 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${testStatus === 'loading' ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                                            }`}
                                        title="Testar conexão com o bot"
                                    >
                                        {testStatus === 'loading' ? <Loader2 className="animate-spin" size={18} /> : <Settings size={18} />}
                                        Testar Conexão
                                    </button>

                                    {testStatus === 'success' && botInfo && (
                                        <button
                                            onClick={handleSaveBot}
                                            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
                                            title="Salvar este bot na sua lista"
                                        >
                                            <CheckCircle size={18} />
                                            Salvar este Bot
                                        </button>
                                    )}
                                </div>
                                {testStatus !== 'idle' && (
                                    <div className={`mt-3 p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${testStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                        }`}>
                                        {testStatus === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                        {testMessage}
                                    </div>
                                )}
                            </div>

                            {botInfo && (
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                                        {botInfo.firstName?.charAt(0)}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-blue-900 truncate">{botInfo.firstName}</p>
                                        <p className="text-xs text-blue-700 truncate">@{botInfo.username}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Groups List */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg flex flex-col h-[500px]">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <Users size={20} />
                                </div>
                                Grupos
                                <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                                    {groups.length}
                                </span>
                            </h2>
                            <button
                                onClick={loadBotGroups}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Recarregar lista de grupos"
                            >
                                <Loader2 size={20} className={testStatus === 'loading' ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        {/* Help Notice for Groups */}
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex gap-3 text-xs text-blue-700 animate-in fade-in slide-in-from-top-1 duration-300">
                            <AlertCircle className="shrink-0" size={16} />
                            <p>
                                <strong>Dica:</strong> Se um grupo não aparecer, envie qualquer mensagem nele (ou um <code className="bg-blue-100 px-1 rounded">/start</code>) e clique no botão de recarregar acima. O Telegram só mostra grupos com atividades nas últimas 24h.
                            </p>
                        </div>

                        <div className="mb-4 flex gap-2">
                            <input
                                type="text"
                                value={newGroupId}
                                onChange={(e) => setNewGroupId(e.target.value)}
                                placeholder="ID do grupo..."
                                className="flex-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                title="ID do grupo para adicionar manualmente"
                            />
                            <button
                                onClick={handleAddGroup}
                                disabled={!botToken}
                                className="px-3 py-2 bg-purple-600 text-white rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
                                title="Adicionar grupo manualmente"
                            >
                                +
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {groups.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <Users size={48} className="mx-auto mb-3 opacity-20" />
                                    <p>Nenhum grupo encontrado</p>
                                    <p className="text-xs mt-2 max-w-[200px] mx-auto">Envie uma mensagem no grupo após adicionar o bot para ele aparecer aqui.</p>
                                </div>
                            ) : (
                                groups.map(group => (
                                    <div
                                        key={group.id}
                                        className={`p-3 rounded-xl border transition-all group ${group.enabled
                                            ? 'bg-purple-50 border-purple-200 shadow-sm'
                                            : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div
                                                className="flex-1 min-w-0 cursor-pointer"
                                                onClick={() => toggleGroup(group.id)}
                                            >
                                                <p className={`font-semibold truncate ${group.enabled ? 'text-purple-900' : 'text-gray-700'}`}>
                                                    {group.name}
                                                </p>
                                                <p className="text-xs text-gray-400 font-mono truncate">
                                                    {group.id}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    onClick={() => toggleGroup(group.id)}
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${group.enabled
                                                        ? 'bg-purple-500 border-purple-500'
                                                        : 'border-gray-300 group-hover:border-purple-400'
                                                        }`}>
                                                    {group.enabled && <CheckCircle size={12} className="text-white" />}
                                                </div>
                                                <button
                                                    onClick={() => removeGroup(group.id)}
                                                    className="text-gray-300 hover:text-red-500 transition-colors"
                                                    title="Remover grupo da lista"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Scheduling & Actions */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Scheduling Card */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                <Clock size={24} />
                            </div>
                            Configuração de Envio
                        </h2>

                        <div className="space-y-6">
                            {/* Send Mode Toggle */}
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Modo de Envio</label>
                                <div className="flex p-1 bg-gray-100 rounded-xl">
                                    <button
                                        onClick={() => setSendMode('auto')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${sendMode === 'auto'
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <span>🎲</span> Automático (Shopee)
                                    </button>
                                    <button
                                        onClick={() => setSendMode('manual')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${sendMode === 'manual'
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <span>✍️</span> Enviar Mensagem Manual
                                    </button>
                                </div>
                            </div>

                            {sendMode === 'manual' ? (
                                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Sua Mensagem</label>
                                    <textarea
                                        value={manualMessage}
                                        onChange={(e) => setManualMessage(e.target.value)}
                                        placeholder="Digite aqui a mensagem que deseja enviar para os grupos selecionados... (markdown suportado)"
                                        className="w-full h-48 p-4 bg-blue-50/30 border border-blue-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium text-sm leading-relaxed"
                                    />
                                    <p className="mt-2 text-[10px] text-gray-400 italic">*markdown suportado: _itálico_, *negrito*, [link](url)</p>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    {/* Mode Selection */}
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
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Frequência</label>
                                                <select
                                                    value={frequency}
                                                    onChange={(e) => setFrequency(e.target.value as any)}
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all font-medium"
                                                    title="Selecione a frequência de envio"
                                                >
                                                    <option value="daily">Diário</option>
                                                    <option value="weekly">Semanal</option>
                                                    <option value="monthly">Mensal</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Horário</label>
                                                <input
                                                    type="time"
                                                    value={time}
                                                    onChange={(e) => setTime(e.target.value)}
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all font-medium"
                                                    title="Selecione o horário de envio"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-gray-700">Horários de Disparo</label>
                                                {times.length < 5 && (
                                                    <button
                                                        onClick={addScheduleTime}
                                                        className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                                                    >
                                                        + Adicionar
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {times.map((t, index) => (
                                                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                                        <span className="text-xs font-bold text-gray-400 w-6 text-center">{index + 1}º</span>
                                                        <input
                                                            type="time"
                                                            value={t}
                                                            onChange={(e) => updateScheduleTime(index, e.target.value)}
                                                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-800 p-0"
                                                            title={`Horário ${index + 1}`}
                                                        />
                                                        {times.length > 1 && (
                                                            <button
                                                                onClick={() => removeScheduleTime(index)}
                                                                className="text-gray-400 hover:text-red-500 p-1"
                                                                title="Remover horário"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Quantidade de Produtos</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={productCount}
                                                    onChange={(e) => setProductCount(Number(e.target.value))}
                                                    min="1"
                                                    max="10"
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all font-medium text-lg"
                                                    title="Quantidade de produtos por envio"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">itens</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Fonte de Produtos</label>
                                            <select
                                                value={categoryType}
                                                onChange={(e) => setCategoryType(e.target.value)}
                                                className="w-full p-4 bg-blue-50/50 border border-blue-100 text-blue-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-medium"
                                                title="Fonte dos produtos"
                                            >
                                                <option value="random">🎲 Aleatório</option>
                                                <option value="cheapest">📉 Mais Baratos</option>
                                                <option value="best_sellers_week">🔥 Mais Vendidos (Semana)</option>
                                                <option value="best_sellers_month">📅 Mais Vendidos (Mês)</option>
                                                <option value="achadinhos">🕵️ Achadinhos</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    checked={automationEnabled}
                                                    onChange={(e) => setAutomationEnabled(e.target.checked)}
                                                    className="sr-only peer"
                                                    title="Ativar agendamento automático"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                            </div>
                                            <span className="text-sm font-bold text-gray-700">Ativar Agendamento Automático</span>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Message Template Card (only for auto mode) */}
                    {sendMode === 'auto' && (
                        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg animate-in fade-in duration-500">
                            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
                                    <FileText size={20} />
                                </div>
                                Template da Mensagem
                            </h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        Conteúdo da Mensagem
                                    </label>
                                    <textarea
                                        value={messageTemplate}
                                        onChange={(e) => setMessageTemplate(e.target.value)}
                                        className="w-full h-64 p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all font-medium text-sm leading-relaxed custom-scrollbar"
                                        placeholder="Digite sua mensagem aqui..."
                                    />
                                </div>

                                <div className="bg-pink-50/50 border border-pink-100 rounded-2xl p-4">
                                    <p className="text-xs font-bold text-pink-800 mb-3 uppercase tracking-wider">Tags Disponíveis</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { tag: '{nome_produto}', desc: 'Nome do produto' },
                                            { tag: '{preco_original}', desc: 'Preço sem desconto' },
                                            { tag: '{preco_com_desconto}', desc: 'Preço final' },
                                            { tag: '{link}', desc: 'Seu link de afiliado' },
                                        ].map((item) => (
                                            <div key={item.tag} className="flex flex-col p-2 bg-white rounded-xl border border-pink-100 shadow-sm">
                                                <code className="text-[10px] font-bold text-pink-600 mb-1">{item.tag}</code>
                                                <span className="text-[10px] text-gray-500">{item.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={handleExecuteNow}
                            disabled={!botToken || groups.filter(g => g.enabled).length === 0}
                            className={`py-4 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${sendMode === 'manual'
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-blue-500/30'
                                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:shadow-green-500/30'
                                } hover:-translate-y-0.5`}
                            title={sendMode === 'manual' ? "Enviar mensagem agora" : "Enviar produtos agora"}
                        >
                            <span className="text-xl">{sendMode === 'manual' ? '✉️' : '▶️'}</span>
                            {sendMode === 'manual' ? 'Enviar Mensagem' : 'Enviar Agora'}
                        </button>

                        <button
                            onClick={handleSchedule}
                            disabled={!botToken || groups.filter(g => g.enabled).length === 0 || !automationEnabled}
                            className="py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title="Salvar agendamento"
                        >
                            <Clock size={20} /> Salvar
                        </button>

                        <button
                            onClick={handleStop}
                            disabled={!isAutomationActive}
                            className="py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-red-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title="Parar automação"
                        >
                            <XCircle size={20} /> Parar
                        </button>
                    </div>

                    {/* History */}
                    {history.length > 0 && (
                        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-gray-800">📜 Histórico de Envios</h2>
                                <button
                                    onClick={() => {
                                        if (confirm('Limpar todo o histórico?')) {
                                            setHistory([]);
                                            localStorage.removeItem('telegram_history');
                                        }
                                    }}
                                    className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                                    title="Limpar histórico"
                                >
                                    Limpar
                                </button>
                            </div>

                            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                                {history.map(entry => (
                                    <div key={entry.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center ${entry.status === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                            }`}>
                                            {entry.status === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-800 truncate">{entry.productName}</p>
                                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                                                <span className="bg-white px-2 py-1 rounded border border-gray-200">
                                                    📅 {entry.date} às {entry.time}
                                                </span>
                                                <span className="bg-white px-2 py-1 rounded border border-gray-200">
                                                    📱 {entry.groups.length} grupos
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Help Section */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-8 max-w-6xl mx-auto">
                <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs">?</div>
                    Como configurar seu Bot
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
                    <ol className="space-y-3 list-decimal list-inside">
                        <li>Crie um bot no Telegram com <strong>@BotFather</strong> e copie o token.</li>
                        <li>Adicione o bot aos seus grupos do Telegram como administrador.</li>
                        <li><strong>IMPORTANTE:</strong> Envie qualquer mensagem no grupo (ex: "oi") depois de adicionar o bot.</li>
                    </ol>
                    <div className="p-4 bg-white/50 rounded-xl border border-blue-100">
                        <p className="font-bold mb-2">⚠️ Grupos não aparecem?</p>
                        <p>O Telegram só mostra grupos onde houve mensagens recentes enquanto o bot estava presente. Se não aparecer, envie uma mensagem no grupo e clique em "Recarregar".</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TelegramAutomationPage;
