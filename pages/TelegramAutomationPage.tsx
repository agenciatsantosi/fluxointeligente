import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Bot, Clock, CheckCircle, Settings, Users, Loader2, XCircle, FileText, MessageSquare, AlertCircle, Plus, Trash2, Send, Calendar } from 'lucide-react';
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

        // Se o usuário clicou em Salvar mas o toggle estava off, perguntamos se ele quer ativar
        let shouldEnable = automationEnabled;
        if (!automationEnabled) {
            if (confirm('Deseja ATIVAR este agendamento agora?\n\n(Se clicar em OK, o agendamento aparecerá na lista de Módulos Ativos)')) {
                shouldEnable = true;
                setAutomationEnabled(true);
            } else {
                return; // Só salva no localStorage (que já acontece no useEffect)
            }
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
        <div className="space-y-8 max-w-6xl mx-auto font-sans bg-gray-50 min-h-screen p-8">
            {/* Header Section */}
            <div className="bg-white border border-gray-200 p-8 rounded-3xl relative overflow-hidden shadow-sm">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 -mr-16 -mt-16 blur-3xl"></div>
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-200 text-white">
                            <Bot size={28} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.3em] block mb-1">TELEGRAM_AUTOMATION</span>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Automação Telegram</h1>
                            <p className="text-gray-500 text-sm mt-1">Gerencie grupos e automatize envio de ofertas</p>
                        </div>
                    </div>
                    {isAutomationActive && (
                        <div className="flex items-center gap-3 border border-purple-200 bg-purple-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-purple-600 transition-all">
                            <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                            AUTOMATION_ACTIVE
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
                    {/* Bot Configuration */}
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex items-center gap-3">
                            <Settings size={16} className="text-purple-600" />
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.3em]">BOT_CONFIGURATION</span>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label htmlFor="botToken" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">
                                    TOKEN_DO_BOT
                                </label>
                                <div className="space-y-3">
                                    {registeredBots.length > 0 && (
                                        <select
                                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
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
                                            <option value="" disabled>-- Selecionar bot cadastrado --</option>
                                            {registeredBots.map(bot => (
                                                <option key={bot.id} value={bot.token}>
                                                    @{bot.username} ({bot.name})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <input
                                        id="botToken"
                                        type="password"
                                        value={botToken}
                                        onChange={(e) => {
                                            setBotToken(e.target.value);
                                            setTestStatus('idle');
                                            setBotInfo(null);
                                        }}
                                        placeholder="1234567890:ABCdef..."
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all placeholder-gray-400"
                                        title="Insira o token do seu bot do Telegram"
                                    />
                                    <button
                                        onClick={handleTestBot}
                                        disabled={testStatus === 'loading'}
                                        className={`w-full py-4 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 rounded-xl transition-all ${testStatus === 'loading' ? 'bg-gray-100 text-gray-400' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
                                        title="Testar conexão com o bot"
                                    >
                                        {testStatus === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Settings size={16} />}
                                        TESTAR_CONEXÃO
                                    </button>

                                    {testStatus === 'success' && botInfo && (
                                        <button
                                            onClick={handleSaveBot}
                                            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 rounded-xl hover:shadow-lg hover:shadow-purple-100 transition-all"
                                            title="Salvar este bot na sua lista"
                                        >
                                            <CheckCircle size={16} />
                                            SALVAR_BOT
                                        </button>
                                    )}
                                </div>
                                {testStatus !== 'idle' && (
                                    <div className={`mt-4 p-4 rounded-xl text-xs flex items-center gap-3 ${testStatus === 'success' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                        {testStatus === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                        <span className="font-bold">{testMessage}</span>
                                    </div>
                                )}
                            </div>

                            {botInfo && (
                                <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-purple-100">
                                        {botInfo.firstName?.charAt(0)}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-gray-900 text-sm truncate">{botInfo.firstName}</p>
                                        <p className="text-[10px] text-purple-600 font-bold truncate">@{botInfo.username}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Groups List */}
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm flex flex-col h-[550px]">
                        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <Users size={16} className="text-purple-600" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">CANAL / GRUPO</span>
                                <span className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                                    {groups.length}
                                </span>
                            </div>
                            <button
                                onClick={loadBotGroups}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-all"
                                title="Recarregar lista de grupos"
                            >
                                <Loader2 size={16} className={testStatus === 'loading' ? 'animate-spin text-purple-600' : ''} />
                            </button>
                        </div>

                        {/* Help Notice for Groups */}
                        <div className="mx-6 mt-4 mb-2 p-3 bg-purple-50/50 border border-purple-100 rounded-xl flex gap-3 text-[11px] text-gray-600 shrink-0">
                            <AlertCircle className="shrink-0 text-purple-400" size={16} />
                            <p>
                                <strong>Dica:</strong> Se um grupo não aparecer, envie qualquer mensagem nele (ou clique em <code className="bg-purple-100 px-1.5 py-0.5 rounded text-purple-700">/start</code>) e clique no botão de recarregar.
                            </p>
                        </div>

                        <div className="px-6 py-3 flex gap-2 shrink-0">
                            <input
                                type="text"
                                value={newGroupId}
                                onChange={(e) => setNewGroupId(e.target.value)}
                                placeholder="ID do grupo (ex: -100...)"
                                className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all placeholder-gray-400 shadow-sm"
                                title="ID do grupo para adicionar manualmente"
                            />
                            <button
                                onClick={handleAddGroup}
                                disabled={!botToken}
                                className="px-4 py-2 bg-purple-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-purple-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-100"
                                title="Adicionar grupo manualmente"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
                            {groups.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Users size={32} className="text-gray-300" />
                                    </div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">NENHUM_GRUPO</p>
                                </div>
                            ) : (
                                groups.map(group => (
                                    <div
                                        key={group.id}
                                        className={`p-4 border transition-all rounded-2xl group ${group.enabled
                                            ? 'border-purple-500 bg-purple-50/30 ring-2 ring-purple-100'
                                            : 'border-gray-100 bg-white hover:border-purple-200 hover:bg-gray-50/50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div
                                                className="flex-1 min-w-0 cursor-pointer"
                                                onClick={() => toggleGroup(group.id)}
                                            >
                                                <p className={`font-bold text-sm truncate ${group.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                                    {group.name}
                                                </p>
                                                <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate uppercase tracking-tighter">
                                                    {group.id}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    onClick={() => toggleGroup(group.id)}
                                                    className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${group.enabled
                                                        ? 'bg-purple-600 border-purple-600 shadow-lg shadow-purple-200'
                                                        : 'bg-white border-gray-200 group-hover:border-purple-300'
                                                        }`}>
                                                    {group.enabled && <CheckCircle size={12} className="text-white" />}
                                                </div>
                                                <button
                                                    onClick={() => removeGroup(group.id)}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    title="Remover grupo da lista"
                                                >
                                                    <Trash2 size={16} />
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
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Clock size={18} className="text-purple-600" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">CONFIGURAÇÃO_DE_ENVIO</span>
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setSendMode('auto')}
                                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sendMode === 'auto' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    AUTO
                                </button>
                                <button
                                    onClick={() => setSendMode('manual')}
                                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${sendMode === 'manual' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    MANUAL
                                </button>
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    {sendMode === 'auto' ? (
                                        <div className="space-y-6">
                                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                                <div className="flex items-center justify-between mb-6">
                                                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">AGENDAMENTO</span>
                                                    <div className="flex bg-white p-1 rounded-lg border border-gray-200">
                                                        <button
                                                            onClick={() => setScheduleMode('single')}
                                                            className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${scheduleMode === 'single' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-400'}`}
                                                        >
                                                            ÚNICO
                                                        </button>
                                                        <button
                                                            onClick={() => setScheduleMode('multiple')}
                                                            className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${scheduleMode === 'multiple' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-400'}`}
                                                        >
                                                            MÚLTIPLO
                                                        </button>
                                                    </div>
                                                </div>

                                                {scheduleMode === 'single' ? (
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">FREQUÊNCIA</label>
                                                            <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold text-xs focus:outline-none focus:border-purple-500">
                                                                <option value="daily">DIÁRIO</option>
                                                                <option value="weekly">SEMANAL</option>
                                                                <option value="monthly">MENSAL</option>
                                                            </select>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">HORA</label>
                                                            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold text-xs focus:outline-none focus:border-purple-500" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">HORÁRIOS DO DIA</label>
                                                            {times.length < 5 && (
                                                                <button onClick={addScheduleTime} className="text-purple-600 text-[10px] font-black uppercase hover:underline">+ Adicionar</button>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                                            {times.map((t, idx) => (
                                                                <div key={idx} className="flex gap-1">
                                                                    <input type="time" value={t} onChange={(e) => updateScheduleTime(idx, e.target.value)} className="flex-1 p-2 bg-white border border-gray-200 rounded-lg text-gray-900 font-bold text-xs focus:outline-none focus:border-purple-500" />
                                                                    <button onClick={() => removeScheduleTime(idx)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="mt-8 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PRODUTOS / POST</span>
                                                        <input
                                                            type="number"
                                                            value={productCount}
                                                            onChange={(e) => setProductCount(parseInt(e.target.value))}
                                                            className="w-16 p-2 bg-white border border-gray-200 rounded-lg text-center font-black text-xs text-purple-600 focus:outline-none focus:border-purple-500"
                                                        />
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATEGORIA</span>
                                                        <select
                                                            value={categoryType}
                                                            onChange={(e) => setCategoryType(e.target.value)}
                                                            className="p-2 bg-white border border-gray-200 rounded-lg font-black text-[10px] text-gray-700 uppercase tracking-tighter focus:outline-none focus:border-purple-500"
                                                        >
                                                            <option value="random">ALEATÓRIO</option>
                                                            <option value="best_sellers">MAIS VENDIDOS</option>
                                                            <option value="cheapest">MAIS BARATOS</option>
                                                            <option value="expensive">MAIS CAROS</option>
                                                            <option value="bizarros">BIZARROS</option>
                                                            <option value="evangelico">EVANGÉLICOS</option>
                                                            <option value="umbanda">UMBANDA | CANDOMBLÉ</option>
                                                            <option value="achadinhos">ACHADINHOS</option>
                                                            <option value="moda_feminina">MODA FEMININA</option>
                                                            <option value="moda_masculina">MODA MASCULINA</option>
                                                            <option value="celulares">CELULARES</option>
                                                            <option value="casa">CASA & DECOR</option>
                                                            <option value="beleza">SAÚDE & BELEZA</option>
                                                            <option value="brinquedos">BRINQUEDOS</option>
                                                            <option value="eletronicos">ELETRÔNICOS</option>
                                                            <option value="acessorios">ACESSÓRIOS</option>
                                                            <option value="bebes">BEBÊS</option>
                                                            <option value="esportes">ESPORTES</option>
                                                            <option value="automotivo">AUTOMOTIVO</option>
                                                            <option value="relogios">RELÓGIOS</option>
                                                            <option value="bolsas">BOLSAS</option>
                                                            <option value="calcados_fem">CALÇADOS FEM</option>
                                                            <option value="calcados_masc">CALÇADOS MASC</option>
                                                            <option value="cozinha">COZINHA</option>
                                                            <option value="games">GAMES</option>
                                                            <option value="informatica">INFORMÁTICA</option>
                                                            <option value="pet">PET SHOP</option>
                                                            <option value="papelaria">PAPELARIA</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between px-6 py-4 bg-purple-50 border border-purple-100 rounded-2xl">
                                                <div className="flex items-center gap-3">
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input
                                                            id="automation-toggle"
                                                            type="checkbox"
                                                            checked={automationEnabled}
                                                            onChange={(e) => setAutomationEnabled(e.target.checked)}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                                    </label>
                                                    <span className="text-[10px] font-black text-purple-900 uppercase tracking-widest">ATIVAR_AGENDAMENTO</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 text-center block">MENSAGEM MANUAL</label>
                                            <textarea
                                                value={manualMessage}
                                                onChange={(e) => setManualMessage(e.target.value)}
                                                className="w-full h-full min-h-[300px] p-6 bg-gray-50 border border-gray-200 rounded-3xl text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none shadow-inner"
                                                placeholder="Digite a mensagem para enviar agora..."
                                            />
                                            <p className="text-[10px] text-gray-400 font-medium text-center">O envio manual ignora as configurações de agendamento e envia imediatamente para todos os grupos ativos.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    {sendMode === 'auto' ? (
                                        <div className="h-full flex flex-col">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-2 block">TEMPLATE DA MENSAGEM</label>
                                            <div className="flex-1 relative flex flex-col min-h-[300px]">
                                                <textarea
                                                    value={messageTemplate}
                                                    onChange={(e) => setMessageTemplate(e.target.value)}
                                                    className="w-full flex-1 p-6 bg-gray-50 border border-gray-200 rounded-3xl text-gray-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none shadow-inner"
                                                    placeholder="Digite o template da mensagem..."
                                                />
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {['{nome_produto}', '{link}', '{preco_original}', '{preco_com_desconto}'].map(tag => (
                                                        <span key={tag} className="px-2 py-1 bg-white border border-gray-200 rounded text-[9px] text-gray-400 font-bold uppercase tracking-tighter hover:border-purple-200 hover:text-purple-400 cursor-help transition-colors">{tag}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full bg-purple-50/50 border border-purple-100 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
                                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                                                <MessageSquare className="text-purple-600" size={32} />
                                            </div>
                                            <h4 className="font-bold text-purple-900 mb-2">Modo Manual Ativado</h4>
                                            <p className="text-sm text-purple-700/70 max-w-[200px]">Neste modo você pode enviar uma mensagem personalizada instantaneamente.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col md:flex-row gap-4">
                                {automationEnabled ? (
                                    <>
                                        <button
                                            onClick={handleSchedule}
                                            className="flex-1 py-4 bg-purple-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-3 active:scale-95"
                                        >
                                            <Calendar size={16} />
                                            AGENDAR AGORA
                                        </button>
                                        <button
                                            onClick={handleExecuteNow}
                                            className="px-8 py-4 bg-white border-2 border-gray-200 text-gray-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:border-purple-600 hover:text-purple-600 transition-all flex items-center justify-center gap-3 active:scale-95"
                                        >
                                            <Send size={16} />
                                            EXECUTAR UMA VEZ
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleExecuteNow}
                                            disabled={!botToken || groups.filter(g => g.enabled).length === 0}
                                            className="flex-1 py-4 bg-purple-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                                        >
                                            <Send size={16} />
                                            {sendMode === 'manual' ? 'ENVIAR AGORA' : 'EXECUTAR AGORA'}
                                        </button>
                                        <button
                                            onClick={handleSchedule}
                                            className="px-8 py-4 bg-white border-2 border-gray-200 text-gray-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:border-purple-600 hover:text-purple-600 transition-all flex items-center justify-center gap-3 active:scale-95"
                                        >
                                            <CheckCircle size={16} />
                                            SALVAR CONFIGS
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={handleStop}
                                    className="px-8 py-4 bg-gray-50 text-gray-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-red-50 hover:text-red-600 hover:border-red-100 border border-transparent transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                    <XCircle size={16} />
                                    PARAR
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Automation Preview/History */}
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText size={16} className="text-purple-600" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">HISTÓRICO_RECENTE</span>
                            </div>
                            {history.length > 0 && (
                                <button
                                    onClick={() => {
                                        if (confirm('Limpar todo o histórico?')) {
                                            setHistory([]);
                                            localStorage.removeItem('telegram_history');
                                        }
                                    }}
                                    className="text-[9px] font-black text-red-500 uppercase hover:underline"
                                >
                                    Limpar Histórico
                                </button>
                            )}
                        </div>
                        <div className="p-0 overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar">
                            {history.length === 0 ? (
                                <div className="p-16 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <FileText size={32} className="text-gray-200" />
                                    </div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">NENHUMA_ATIVIDADE</p>
                                </div>
                            ) : (
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/50 border-b border-gray-100">
                                            <th className="px-6 py-4 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">DATA/HORA</th>
                                            <th className="px-6 py-4 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">PRODUTO / EVENTO</th>
                                            <th className="px-6 py-4 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">GRUPOS</th>
                                            <th className="px-6 py-4 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest">STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-xs">
                                        {history.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-900">{item.date}</div>
                                                    <div className="text-[10px] text-gray-400">{item.time}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-700">{item.productName}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.groups.map((g, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-gray-100 text-[9px] font-bold text-gray-500 rounded uppercase">{g}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${item.status === 'success' ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-red-100 text-red-600 border border-red-200'}`}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
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
