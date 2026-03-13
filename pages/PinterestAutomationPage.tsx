import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Pin, Clock, CheckCircle, Settings, Layout, Loader2, XCircle, Trash2, Plus } from 'lucide-react';
import api from '../services/api';

interface PinterestAccount {
    id: string;
    username: string;
    accessToken: string;
    enabled: boolean;
}

interface Board {
    id: string;
    name: string;
}

const PinterestAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    // Accounts
    const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
    const [newAccessToken, setNewAccessToken] = useState('');
    const [loading, setLoading] = useState(false);

    // Boards
    const [boards, setBoards] = useState<Board[]>([]);
    const [selectedBoard, setSelectedBoard] = useState('');
    const [isCreatingBoard, setIsCreatingBoard] = useState(false);
    const [newBoardName, setNewBoardName] = useState('');
    const [newBoardDescription, setNewBoardDescription] = useState('');

    // Schedule Configuration
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']);
    const [productCount, setProductCount] = useState(5);
    const [categoryType, setCategoryType] = useState('random');
    const [automationEnabled, setAutomationEnabled] = useState(false);

    // Manual Sending
    const [sendMode, setSendMode] = useState<'shopee' | 'manual'>('shopee');
    const [manualMessage, setManualMessage] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');

    // Notifications
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    useEffect(() => {
        loadAccounts();

        // Check for force_add_account flag from AutomationAccountsPage
        if (localStorage.getItem('force_add_account') === 'true') {
            // Pinterest doesn't have a separate 'showAddPage' state, we just focus the input
            const input = document.querySelector('input[placeholder="pina_..."]') as HTMLInputElement;
            if (input) input.focus();
            localStorage.removeItem('force_add_account');
        }
    }, []);

    const loadAccounts = async () => {
        try {
            const response = await api.get('/pinterest/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts || []);
                // Se tem contas, carregar boards
                if (response.data.accounts && response.data.accounts.length > 0) {
                    await loadBoards();
                }
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        }
    };

    const handleAddAccount = async () => {
        // Clean token: remove whitespace and 'Bearer ' prefix if present
        const cleanToken = newAccessToken.trim().replace(/^Bearer\s+/i, '');

        if (!cleanToken) {
            showNotification('❌ Insira o Access Token', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/pinterest/auth', { accessToken: cleanToken });
            if (response.data.success) {
                const newAccount: PinterestAccount = {
                    id: response.data.accountId || Date.now().toString(),
                    username: response.data.user?.username || 'Pinterest User',
                    accessToken: cleanToken,
                    enabled: true
                };
                setAccounts([...accounts, newAccount]);
                setNewAccessToken('');
                showNotification('✅ Conta adicionada!', 'success');

                // Load boards automatically
                await loadBoards();
            }
        } catch (error: any) {
            showNotification('❌ Erro: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadBoards = async () => {
        try {
            const response = await api.get('/pinterest/boards');
            if (response.data.success) {
                setBoards(response.data.boards || []);
            }
        } catch (error) {
            console.error('Error loading boards:', error);
        }
    };

    const handleCreateBoard = async () => {
        if (!newBoardName.trim()) {
            showNotification('❌ Nome do board é obrigatório', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/pinterest/boards', {
                name: newBoardName,
                description: newBoardDescription
            });

            if (response.data.success) {
                showNotification('✅ Board criado com sucesso!', 'success');
                setNewBoardName('');
                setNewBoardDescription('');
                setIsCreatingBoard(false);
                await loadBoards(); // Reload boards
            } else {
                showNotification('❌ Erro: ' + response.data.error, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleAccount = (id: string) => {
        setAccounts(accounts.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
    };

    const removeAccount = (id: string) => {
        if (confirm('Remover esta conta do Pinterest?')) {
            setAccounts(accounts.filter(a => a.id !== id));
        }
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

    const handlePostNow = async () => {
        const selectedAccount = accounts.find(a => a.enabled)?.id;

        if (!selectedBoard) {
            showNotification('❌ Selecione um Board primeiro', 'error');
            return;
        }

        if (!selectedAccount) {
            showNotification('❌ Ative uma conta do Pinterest', 'error');
            return;
        }

        if (!shopeeAffiliateSettings?.appId) {
            showNotification('❌ Configure a Shopee em Configurações', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/pinterest/post-now', {
                boardId: selectedBoard,
                productCount: productCount,
                shopeeSettings: shopeeAffiliateSettings,
                categoryType: categoryType,
                accountId: selectedAccount,
                sendMode,
                manualMessage,
                manualImageUrl
            });

            if (response.data.success) {
                const { success, failed, total } = response.data.details;
                showNotification(`✅ ${success}/${total} produtos postados!`, 'success');
            } else {
                showNotification(`❌ ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSchedule = async () => {
        const selectedAccount = accounts.find(a => a.enabled)?.id;

        if (!selectedBoard) {
            showNotification('❌ Selecione um Board primeiro', 'error');
            return;
        }

        if (!selectedAccount) {
            showNotification('❌ Ative uma conta do Pinterest', 'error');
            return;
        }

        if (!automationEnabled) {
            showNotification('❌ Ative o agendamento primeiro', 'error');
            return;
        }

        if (!shopeeAffiliateSettings?.appId) {
            showNotification('❌ Configure a Shopee primeiro', 'error');
            return;
        }

        try {
            const response = await api.post('/pinterest/schedule', {
                boardId: selectedBoard,
                schedule: {
                    frequency,
                    time,
                    times,
                    scheduleMode,
                    productCount,
                    enabled: true,
                    accountId: selectedAccount
                },
                categoryType,
                shopeeSettings: shopeeAffiliateSettings
            });

            if (response.data.success) {
                showNotification('✅ Agendamento salvo! Veja em "Agendamentos"', 'success');
                setAutomationEnabled(false);
            } else {
                showNotification('❌ Erro: ' + response.data.error, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro: ' + (error.response?.data?.error || error.message), 'error');
        }
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto font-mono bg-gray-50 min-h-screen p-8">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-6 right-6 z-50 px-8 py-5 border-2 flex items-center gap-4 shadow-[8px_8px_0px_rgba(0,0,0,0.5)] ${
                    notification.type === 'success' ? 'bg-cyan-400 border-slate-900 text-slate-950' :
                    notification.type === 'error' ? 'bg-red-500 border-slate-900 text-white' :
                    'bg-slate-800 border-cyan-400 text-white'
                }`}>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] mb-0.5 opacity-70">SYSTEM_NOTICE</span>
                        <span className="text-sm font-black">{notification.message}</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-slate-900 border-2 border-slate-800 p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-400/5 -mr-16 -mt-16 blur-3xl"></div>
                <div className="relative z-10 flex items-center gap-6">
                    <div className="w-14 h-14 bg-cyan-400 flex items-center justify-center">
                        <Pin size={28} className="text-slate-950" />
                    </div>
                    <div>
                        <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.3em] block mb-1">PINTEREST_AUTOMATION</span>
                        <h1 className="text-2xl font-black text-white uppercase tracking-tight">Automação Pinterest</h1>
                        <p className="text-slate-500 text-xs font-mono mt-1">Crie e agende Pins com produtos Shopee automaticamente</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Accounts & Boards */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Accounts */}
                    <div className="bg-slate-900 border-2 border-slate-800 overflow-hidden">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                <Settings size={20} />
                            </div>
                            Contas Pinterest
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Access Token
                                </label>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={newAccessToken}
                                        onChange={(e) => setNewAccessToken(e.target.value)}
                                        placeholder="pina_..."
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 font-mono text-sm transition-all"
                                    />
                                    <button
                                        onClick={handleAddAccount}
                                        disabled={loading}
                                        className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                                        Adicionar Conta
                                    </button>
                                </div>
                            </div>

                            {/* Accounts List */}
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {accounts.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <Pin size={32} className="mx-auto mb-2 opacity-20" />
                                        <p className="text-sm">Nenhuma conta conectada</p>
                                    </div>
                                ) : (
                                    accounts.map(account => (
                                        <div
                                            key={account.id}
                                            className={`p-3 rounded-xl border transition-all group ${account.enabled
                                                ? 'bg-red-50 border-red-200 shadow-sm'
                                                : 'bg-white border-gray-100 hover:border-red-200 hover:shadow-md'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div
                                                    className="flex-1 min-w-0 cursor-pointer"
                                                    onClick={() => toggleAccount(account.id)}
                                                >
                                                    <p className={`font-semibold truncate ${account.enabled ? 'text-red-900' : 'text-gray-700'}`}>
                                                        {account.username}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        onClick={() => toggleAccount(account.id)}
                                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${account.enabled
                                                            ? 'bg-red-500 border-red-500'
                                                            : 'border-gray-300 group-hover:border-red-400'
                                                            }`}
                                                    >
                                                        {account.enabled && <CheckCircle size={12} className="text-white" />}
                                                    </div>
                                                    <button
                                                        onClick={() => removeAccount(account.id)}
                                                        className="text-gray-300 hover:text-red-500 transition-colors"
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

                    {/* Boards */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg flex flex-col h-[500px]">

                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <Layout size={20} />
                                </div>
                                Seus Boards
                                <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                                    {boards.length}
                                </span>
                            </h2>
                            <button
                                onClick={() => setIsCreatingBoard(!isCreatingBoard)}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Criar Novo Board"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        {isCreatingBoard && (
                            <div className="mb-4 p-4 bg-purple-50 rounded-xl border border-purple-100 animate-fade-in">
                                <h3 className="text-sm font-bold text-purple-900 mb-3">Novo Board</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={newBoardName}
                                        onChange={(e) => setNewBoardName(e.target.value)}
                                        placeholder="Nome da Pasta (ex: Ofertas)"
                                        className="w-full p-2 bg-white border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                    />
                                    <input
                                        type="text"
                                        value={newBoardDescription}
                                        onChange={(e) => setNewBoardDescription(e.target.value)}
                                        placeholder="Descrição (opcional)"
                                        className="w-full p-2 bg-white border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreateBoard}
                                            disabled={loading}
                                            className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50"
                                        >
                                            {loading ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Criar'}
                                        </button>
                                        <button
                                            onClick={() => setIsCreatingBoard(false)}
                                            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="p-6 space-y-3">
                            {accounts.length === 0 ? (
                                <div className="text-center py-8 text-slate-600 text-xs font-mono">
                                    Nenhuma conta — add uma acima
                                </div>
                            ) : (
                                accounts.map(acc => (
                                    <div
                                        key={acc.id}
                                        onClick={() => setSelectedBoard('')}
                                        className={`p-4 border-2 cursor-pointer transition-all border-slate-800 bg-slate-950 hover:border-slate-700`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-black text-white text-sm">{acc.username}</p>
                                                <p className="text-[10px] text-slate-600 font-mono">{acc.enabled ? 'ENABLED' : 'DISABLED'}</p>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeAccount(acc.id); }}
                                                className="p-1 text-slate-700 hover:text-red-400 transition-all"
                                            >
                                                <XCircle size={14} />
                                            </button>
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
                    <div className="bg-slate-900 border-2 border-slate-800 overflow-hidden">
                        <div className="px-8 py-6 bg-slate-950 border-b border-slate-800 flex items-center gap-3">
                            <Clock size={18} className="text-cyan-400" />
                            <span className="font-black text-white text-sm uppercase tracking-widest">CONFIGURAÇÃO_DE_ENVIO</span>
                        </div>

                        <div className="p-8 space-y-6">
                            {/* Mode Selection */}
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">MODO_AGENDAMENTO</label>
                                <div className="flex border border-slate-700 overflow-hidden">
                                    <button
                                        onClick={() => setScheduleMode('single')}
                                        className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${scheduleMode === 'single'
                                            ? 'bg-cyan-400 text-slate-950'
                                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                            }`}
                                    >
                                        Horário Único
                                    </button>
                                    <button
                                        onClick={() => setScheduleMode('multiple')}
                                        className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${scheduleMode === 'multiple'
                                            ? 'bg-cyan-400 text-slate-950'
                                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                            }`}
                                    >
                                        Múltiplos Horários
                                    </button>
                                </div>
                            </div>

                            {scheduleMode === 'single' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">FREQUÊNCIA</label>
                                        <select
                                            value={frequency}
                                            onChange={(e) => setFrequency(e.target.value as any)}
                                            className="w-full p-3 bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        >
                                            <option value="daily">Diário</option>
                                            <option value="weekly">Semanal</option>
                                            <option value="monthly">Mensal</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">HORÁRIO</label>
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full p-3 bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">HORÁRIOS_DE_DISPARO</label>
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

                            <div className="mt-8 border-t border-gray-100 pt-6">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Modo de Envio</label>
                                <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                                    <button
                                        onClick={() => setSendMode('shopee')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${sendMode === 'shopee'
                                            ? 'bg-white text-orange-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        🛒 Produtos Shopee
                                    </button>
                                    <button
                                        onClick={() => setSendMode('manual')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${sendMode === 'manual'
                                            ? 'bg-white text-orange-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        ✍️ Mensagem Manual
                                    </button>
                                </div>

                                {sendMode === 'shopee' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Quantidade de Produtos</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={productCount}
                                                    onChange={(e) => setProductCount(Number(e.target.value))}
                                                    min="1"
                                                    max="20"
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all font-medium text-lg"
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
                                            >
                                                <option value="random">🎲 Aleatório</option>
                                                <option value="cheapest">📉 Mais Baratos</option>
                                                <option value="best_sellers_week">🔥 Mais Vendidos (Semana)</option>
                                                <option value="best_sellers_month">📅 Mais Vendidos (Mês)</option>
                                                <option value="achadinhos">🕵️ Achadinhos</option>
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">URL da Imagem (Obrigatória para Pinterest)</label>
                                            <input
                                                type="text"
                                                value={manualImageUrl}
                                                onChange={(e) => setManualImageUrl(e.target.value)}
                                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                                                placeholder="https://exemplo.com/imagem.png"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">O Pinterest exige uma imagem para criar o Pin.</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Descrição do Pin</label>
                                            <textarea
                                                value={manualMessage}
                                                onChange={(e) => setManualMessage(e.target.value)}
                                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 transition-all font-medium min-h-[120px]"
                                                placeholder="Digite a descrição que deseja postar manualmente..."
                                            ></textarea>
                                        </div>
                                    </div>
                                )}
                            </div>

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
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={handlePostNow}
                            disabled={loading || !selectedBoard}
                            className={`py-4 ${sendMode === 'manual' ? 'bg-gradient-to-r from-green-500 to-emerald-400 shadow-green-500/30' : 'bg-gradient-to-r from-green-600 to-emerald-600 shadow-green-500/30'} text-white rounded-xl font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                        >
                            <span className="text-xl">▶️</span> {sendMode === 'manual' ? 'Criar Pin Manual' : 'Enviar Agora'}
                        </button>

                        <button
                            onClick={handleSchedule}
                            disabled={!selectedBoard || !automationEnabled}
                            className="py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Clock size={20} /> Salvar
                        </button>
                    </div>
                </div>
            </div>

            {/* Help Section */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-8">
                <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs">?</div>
                    Como usar
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
                    <ol className="space-y-3 list-decimal list-inside">
                        <li>Obtenha um <strong>Access Token</strong> do Pinterest Developer Portal.</li>
                        <li>Cole o token e clique em <strong>"Adicionar Conta"</strong>.</li>
                        <li>Selecione um <strong>Board</strong> (pasta) onde os Pins serão criados.</li>
                    </ol>
                    <div className="p-4 bg-white/50 rounded-xl border border-blue-100">
                        <p className="font-bold mb-2">📌 Dica</p>
                        <p>Configure a Shopee em "Configurações" antes de usar. O sistema buscará produtos automaticamente e criará Pins com imagens, títulos e links de afiliado!</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PinterestAutomationPage;
