import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Bot, Clock, CheckCircle, Settings, Users, Loader2, XCircle } from 'lucide-react';
import axios from 'axios';

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
    const [history, setHistory] = useState<Array<{
        id: string;
        date: string;
        time: string;
        productName: string;
        groups: string[];
        status: 'success' | 'failed';
    }>>([]);

    const [messageTemplate, setMessageTemplate] = useState(`🚨 *PROMOÇÃO NA SHOPEE AGORA*

{nome_produto}

🔴 *DE:* R$ {preco_original}
🟢 *SOMENTE HOJE:* R$ {preco_com_desconto}

⭐⭐⭐⭐⭐ (Bem Avaliado)

🛒 *Compre aqui:* 👇
{link}

⚠ *Esse BUG vai acabar em alguns minutos!*`);

    useEffect(() => {
        checkAutomationStatus();
        loadHistory();
        loadSettings();
        loadSavedGroups();
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
            const response = await axios.get('http://localhost:3001/api/telegram/groups');
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                setGroups(response.data);
            }
        } catch (error) {
            console.error('Erro ao carregar grupos salvos:', error);
        }
    };

    const loadSettings = () => {
        const saved = localStorage.getItem('telegram_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.botToken) setBotToken(parsed.botToken);
                // Only load groups from local storage if we didn't get them from DB (handled by loadSavedGroups)
                // But since loadSavedGroups is async, we might overwrite.
                // Let's merge or prefer DB. For now, let's allow local storage to set initial state, 
                // and then loadSavedGroups will update it if DB has data.
                if (parsed.groups && parsed.groups.length > 0) setGroups(parsed.groups);

                if (parsed.messageTemplate) setMessageTemplate(parsed.messageTemplate);
                if (parsed.scheduleMode) setScheduleMode(parsed.scheduleMode);
                if (parsed.frequency) setFrequency(parsed.frequency);
                if (parsed.time) setTime(parsed.time);
                if (parsed.times) setTimes(parsed.times);
                if (parsed.productCount) setProductCount(parsed.productCount);
                if (parsed.categoryType) setCategoryType(parsed.categoryType);
            } catch (e) {
                console.error('Erro ao carregar configurações:', e);
            }
        }
    };

    const loadHistory = () => {
        const saved = localStorage.getItem('telegram_history');
        if (saved) {
            setHistory(JSON.parse(saved));
        }
    };

    const addToHistory = (productName: string, groupNames: string[], status: 'success' | 'failed') => {
        const now = new Date();
        const newEntry = {
            id: Date.now().toString(),
            date: now.toLocaleDateString('pt-BR'),
            time: now.toLocaleTimeString('pt-BR'),
            productName,
            groups: groupNames,
            status
        };
        const updated = [newEntry, ...history].slice(0, 50); // Manter últimos 50
        setHistory(updated);
        localStorage.setItem('telegram_history', JSON.stringify(updated));
    };

    const checkAutomationStatus = async () => {
        try {
            const response = await axios.get('http://localhost:3001/api/telegram/status');
            setIsAutomationActive(response.data.active);
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const loadBotGroups = async () => {
        if (!botToken) return;
        console.log('[DEBUG] Carregando grupos...');

        try {
            const response = await axios.post('http://localhost:3001/api/telegram/list-groups', { botToken });
            console.log('[DEBUG] Resposta:', response.data);

            if (response.data.success && response.data.groups.length > 0) {
                const existingIds = new Set(groups.map(g => g.id));
                const newGroups = response.data.groups
                    .filter((g: any) => !existingIds.has(g.id))
                    .map((g: any) => ({ id: g.id, name: g.name, enabled: true }));

                if (newGroups.length > 0) {
                    setGroups([...groups, ...newGroups]);
                    alert(`✅ ${newGroups.length} grupo(s) carregado(s)!`);
                } else {
                    alert('ℹ️ Todos os grupos já estão na lista.');
                }
            } else {
                alert('⚠️ Nenhum grupo encontrado. Certifique-se de que o bot recebeu mensagens nos grupos.');
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
            const response = await axios.post('http://localhost:3001/api/telegram/test', { botToken });

            if (response.data.success) {
                setBotInfo(response.data.botInfo);
                setTestStatus('success');
                setTestMessage(`Bot conectado: @${response.data.botInfo.username}`);
                loadBotGroups();
            } else {
                setTestStatus('error');
                setTestMessage(response.data.error || 'Erro ao conectar');
            }
        } catch (error: any) {
            setTestStatus('error');
            setTestMessage(error.message);
        }
    };

    const handleAddGroup = async () => {
        if (!newGroupId || !botToken) return;

        try {
            const response = await axios.post('http://localhost:3001/api/telegram/chat-info', {
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

    const toggleGroup = (id: string) => {
        setGroups(groups.map(g => g.id === id ? { ...g, enabled: !g.enabled } : g));
    };

    const removeGroup = (id: string) => {
        setGroups(groups.filter(g => g.id !== id));
    };

    const addScheduleTime = () => {
        if (times.length < 5) {
            setTimes([...times, '09:00']);
        }
    };

    const updateScheduleTime = (index: number, value: string) => {
        const newTimes = [...times];
        newTimes[index] = value;
        setTimes(newTimes);
    };

    const removeScheduleTime = (index: number) => {
        if (times.length > 1) {
            setTimes(times.filter((_, i) => i !== index));
        }
    };

    const handleExecuteNow = async () => {
        const enabledGroups = groups.filter(g => g.enabled);

        if (!botToken || enabledGroups.length === 0) {
            alert('❌ Configure o bot e selecione pelo menos um grupo!');
            return;
        }

        if (!shopeeAffiliateSettings.appId) {
            alert('❌ Configure suas credenciais da Shopee primeiro em "Afiliado Shopee"!');
            return;
        }

        const confirmMsg = `Enviar ${productCount} produto(s) agora para ${enabledGroups.length} grupo(s)?`;
        if (!confirm(confirmMsg)) return;

        try {
            alert('🚀 Iniciando envio... Aguarde!');

            const response = await axios.post('http://localhost:3001/api/telegram/post-now', {
                botToken,
                groups: enabledGroups,
                productCount,
                shopeeSettings: shopeeAffiliateSettings,
                messageTemplate
            });

            if (response.data.success) {
                alert(`✅ ${response.data.message}`);

                // Adicionar ao histórico (simulado - em produção viria do backend)
                // Por enquanto, vamos adicionar uma entrada genérica
                const groupNames = enabledGroups.map(g => g.name);
                addToHistory(`${productCount} produto(s) enviado(s)`, groupNames, 'success');
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
            const response = await axios.post('http://localhost:3001/api/telegram/schedule', {
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
            await axios.post('http://localhost:3001/api/telegram/stop');
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
                                    <input
                                        id="botToken"
                                        type="text"
                                        value={botToken}
                                        onChange={(e) => setBotToken(e.target.value)}
                                        placeholder="1234567890:ABCdef..."
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm transition-all"
                                        title="Insira o token do seu bot do Telegram"
                                    />
                                    <button
                                        onClick={handleTestBot}
                                        disabled={testStatus === 'loading'}
                                        className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                                        title="Testar conexão com o bot"
                                    >
                                        {testStatus === 'loading' ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                                        Testar Conexão
                                    </button>
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
                                    <span className="text-sm font-bold text-gray-700">Ativar Agendamento</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={handleExecuteNow}
                            disabled={!botToken || groups.filter(g => g.enabled).length === 0}
                            className="py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title="Enviar produtos agora"
                        >
                            <span className="text-xl">▶️</span> Enviar Agora
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
            <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-8">
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
