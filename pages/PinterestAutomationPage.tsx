import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Pin, Clock, CheckCircle, Settings, Layout, Loader2, XCircle, Trash2, Plus } from 'lucide-react';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

interface PinterestAccount {
    id: string;
    username: string;
    accessToken?: string;
    cookies?: string;
    loginMethod?: 'official' | 'cookie';
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
    const [connectMethod, setConnectMethod] = useState<'official' | 'cookie'>('official');
    const [newAccessToken, setNewAccessToken] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [cookiesInput, setCookiesInput] = useState('');
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
    const [mediaType, setMediaType] = useState<'auto' | 'image' | 'video'>('auto');

    // Manual Sending
    const [sendMode, setSendMode] = useState<'shopee' | 'manual'>('shopee');
    const [manualMessage, setManualMessage] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');

    const activeAccount = accounts.find(a => a.enabled);
    const isCookieAccount = activeAccount?.loginMethod === 'cookie';

    // Notifications
    const { showAlert } = useAlert();

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        showAlert(message, type as any);
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

    const handleAddAccountCookie = async () => {
        if (!usernameInput.trim()) {
            showNotification('❌ Nome de usuário é obrigatório', 'error');
            return;
        }
        if (!cookiesInput.trim()) {
            showNotification('❌ Cole os cookies da sessão', 'error');
            return;
        }

        setLoading(true);
        try {
            const cleanUsername = usernameInput.trim().replace(/^@/, '');
            const response = await api.post('/pinterest/accounts/cookie', {
                username: cleanUsername,
                cookies: cookiesInput.trim()
            });

            if (response.data.success) {
                showNotification('✅ Conta conectada via Cookies!', 'success');
                setUsernameInput('');
                setCookiesInput('');
                await loadAccounts();
            }
        } catch (error: any) {
            showNotification('❌ Erro de Validação: ' + (error.response?.data?.error || error.message), 'error');
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

    const toggleAccount = async (id: string) => {
        try {
            const response = await api.post(`/pinterest/accounts/${id}/toggle`);
            if (response.data.success) {
                await loadAccounts();
            }
        } catch (error: any) {
            showNotification('❌ Erro ao alterar status da conta: ' + error.message, 'error');
        }
    };

    const removeAccount = async (id: string) => {
        if (confirm('Remover esta conta do Pinterest?')) {
            try {
                const response = await api.delete(`/pinterest/accounts/${id}`);
                if (response.data.success) {
                    showNotification('✅ Conta removida com sucesso!', 'success');
                    await loadAccounts();
                }
            } catch (error: any) {
                showNotification('❌ Erro ao remover conta: ' + error.message, 'error');
            }
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
                manualImageUrl,
                mediaType
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
                mediaType,
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
        <div className="space-y-8 max-w-6xl mx-auto bg-gray-50 min-h-screen p-8">

            {/* Header */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 relative overflow-hidden shadow-sm">
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-400/5 -mr-16 -mt-16 blur-3xl"></div>
                <div className="relative z-10 flex items-center gap-6">
                    <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shadow-sm">
                        <Pin size={28} />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-[0.3em] block mb-1">MÓDULO</span>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Automação Pinterest</h1>
                        <p className="text-gray-500 text-xs mt-1">Crie e agende Pins com produtos Shopee automaticamente de forma prática</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Accounts & Boards */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Accounts */}
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-6 shadow-sm">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                            <div className="w-10 h-10 bg-red-50 text-red-600 flex items-center justify-center rounded-xl">
                                <Settings size={20} />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Contas Pinterest</h2>
                                <p className="text-[10px] text-gray-500 mt-0.5">Gerencie conexões da plataforma</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Accounts List */}
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                                {accounts.length === 0 ? (
                                    <div className="text-center py-6 text-gray-400">
                                        <Pin size={24} className="mx-auto mb-1.5 opacity-20" />
                                        <p className="text-[10px] font-bold">NENHUMA CONTA CONECTADA</p>
                                    </div>
                                ) : (
                                    accounts.map(account => (
                                        <div
                                            key={account.id}
                                            className={`p-3 border rounded-xl transition-all ${account.enabled
                                                ? 'bg-red-50/20 border-red-200 shadow-sm'
                                                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div
                                                    className="flex-1 min-w-0 cursor-pointer"
                                                    onClick={() => toggleAccount(account.id)}
                                                >
                                                    <p className={`text-xs font-bold truncate flex items-center gap-1.5 ${account.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                                                        {account.username}
                                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${account.loginMethod === 'cookie' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                                            {account.loginMethod === 'cookie' ? '🍪 Cookies' : '🔌 API'}
                                                        </span>
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        onClick={() => toggleAccount(account.id)}
                                                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${account.enabled
                                                            ? 'bg-red-600 border-red-600 text-white'
                                                            : 'border-gray-300 hover:border-gray-400'
                                                            }`}
                                                    >
                                                        {account.enabled && <CheckCircle size={10} className="text-white" />}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAccount(account.id)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
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
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-6 flex flex-col h-[500px] shadow-sm">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 flex items-center justify-center rounded-xl">
                                    <Layout size={20} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                        {isCookieAccount ? 'Destino do Pin' : 'Seus Boards'}
                                    </h2>
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        {isCookieAccount ? 'Pasta para publicação' : `${boards.length} pastas encontradas`}
                                    </p>
                                </div>
                            </div>
                            {!isCookieAccount && (
                                <button
                                    onClick={() => setIsCreatingBoard(!isCreatingBoard)}
                                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
                                    title="Criar Novo Board"
                                >
                                    <Plus size={16} />
                                </button>
                            )}
                        </div>

                        {isCreatingBoard && !isCookieAccount && (
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                                <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Novo Board</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={newBoardName}
                                        onChange={(e) => setNewBoardName(e.target.value)}
                                        placeholder="Nome da Pasta (ex: Ofertas)"
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-purple-500 outline-none text-gray-800 text-xs transition-all"
                                    />
                                    <input
                                        type="text"
                                        value={newBoardDescription}
                                        onChange={(e) => setNewBoardDescription(e.target.value)}
                                        placeholder="Descrição (opcional)"
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-purple-500 outline-none text-gray-800 text-xs transition-all"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreateBoard}
                                            disabled={loading}
                                            className="flex-1 py-2 bg-purple-600 text-white font-bold uppercase tracking-wider text-[10px] hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 rounded-xl"
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={12} /> : 'Criar'}
                                        </button>
                                        <button
                                            onClick={() => setIsCreatingBoard(false)}
                                            className="px-3 py-2 bg-white border border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px] hover:bg-gray-50 rounded-xl transition-all"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 overflow-y-auto flex-1 custom-scrollbar pr-1">
                            {accounts.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-[10px]">
                                    NENHUMA CONTA CONECTADA
                                </div>
                            ) : isCookieAccount ? (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-amber-50/50 border border-dashed border-amber-200 text-amber-800 rounded-2xl space-y-2">
                                        <p className="text-[10px] font-bold leading-relaxed uppercase">
                                            💡 Método de Cookies ativo para <strong className="text-gray-900">@{activeAccount?.username}</strong>.
                                        </p>
                                        <p className="text-[9px] text-gray-500 leading-relaxed">
                                            Contas sem API oficial não listam pastas. Digite o nome da pasta (board) abaixo. 
                                            O robô abrirá o Pinterest e salvará o Pin exatamente nesta pasta. 
                                            Se ela não existir, o robô poderá criá-la na hora.
                                        </p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                            Nome do Board / Pasta
                                        </label>
                                        <input
                                            type="text"
                                            value={selectedBoard}
                                            onChange={(e) => setSelectedBoard(e.target.value)}
                                            placeholder="Ex: Ofertas, Achadinhos, Casa..."
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 focus:border-red-600 rounded-xl outline-none text-gray-800 text-xs transition-all"
                                        />
                                    </div>
                                </div>
                            ) : (
                                boards.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-[10px]">
                                        NENHUM BOARD ENCONTRADO
                                    </div>
                                ) : (
                                    boards.map(board => (
                                        <div
                                            key={board.id}
                                            onClick={() => setSelectedBoard(board.id)}
                                            className={`p-3 border rounded-xl cursor-pointer transition-all ${
                                                selectedBoard === board.id
                                                    ? 'bg-red-50/15 border-red-200 shadow-sm'
                                                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className={`text-xs font-bold truncate ${selectedBoard === board.id ? 'text-gray-800' : 'text-gray-500'}`}>
                                                        📁 {board.name}
                                                    </p>
                                                    <p className="text-[9px] text-gray-400 mt-0.5">{board.id}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Scheduling & Actions */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Scheduling Card */}
                    <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-6 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
                            <div className="w-10 h-10 bg-purple-50 text-purple-600 flex items-center justify-center rounded-xl">
                                <Clock size={18} />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Configuração de Envio</h2>
                                <p className="text-[10px] text-gray-500 mt-0.5">Defina horários e frequência de automação</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Mode Selection */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">MODO AGENDAMENTO</label>
                                <div className="flex p-1 bg-gray-50 border border-gray-200 rounded-xl">
                                    <button
                                        onClick={() => setScheduleMode('single')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${scheduleMode === 'single'
                                            ? 'bg-purple-600 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-800'
                                            }`}
                                    >
                                        Horário Único
                                    </button>
                                    <button
                                        onClick={() => setScheduleMode('multiple')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${scheduleMode === 'multiple'
                                            ? 'bg-purple-600 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-800'
                                            }`}
                                    >
                                        Múltiplos Horários
                                    </button>
                                </div>
                            </div>

                            {scheduleMode === 'single' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">FREQUÊNCIA</label>
                                        <select
                                            value={frequency}
                                            onChange={(e) => setFrequency(e.target.value as any)}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-colors"
                                        >
                                            <option value="daily">Diário</option>
                                            <option value="weekly">Semanal</option>
                                            <option value="monthly">Mensal</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">HORÁRIO</label>
                                        <input
                                            type="time"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-colors"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">HORÁRIOS DE DISPARO</label>
                                        {times.length < 5 && (
                                            <button
                                                onClick={addScheduleTime}
                                                className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors"
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
                                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-800 p-0 outline-none"
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
                                            ? 'bg-white text-purple-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        🛒 Produtos Shopee
                                    </button>
                                    <button
                                        onClick={() => setSendMode('manual')}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${sendMode === 'manual'
                                            ? 'bg-white text-purple-600 shadow-sm'
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
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-medium text-lg outline-none"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">itens</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Fonte de Produtos</label>
                                            <select
                                                value={categoryType}
                                                onChange={(e) => setCategoryType(e.target.value)}
                                                className="w-full p-4 bg-purple-50/50 border border-purple-100 text-purple-800 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-medium outline-none"
                                            >
                                                <option value="random">🎲 Aleatório</option>
                                                <option value="cheapest">📉 Mais Baratos</option>
                                                <option value="best_sellers_week">🔥 Mais Vendidos (Semana)</option>
                                                <option value="best_sellers_month">📅 Mais Vendidos (Mês)</option>
                                                <option value="achadinhos">🕵️ Achadinhos</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Preferência de Mídia</label>
                                            <select
                                                value={mediaType}
                                                onChange={(e) => setMediaType(e.target.value as any)}
                                                className="w-full p-4 bg-purple-50/50 border border-purple-100 text-purple-800 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-medium outline-none"
                                            >
                                                <option value="auto">QUALQUER (VÍDEO SE HOUVER)</option>
                                                <option value="image">APENAS IMAGEM</option>
                                                <option value="video">APENAS VÍDEO</option>
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
                                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all font-medium outline-none"
                                                placeholder="https://exemplo.com/imagem.png"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">O Pinterest exige uma imagem para criar o Pin.</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Descrição do Pin</label>
                                            <textarea
                                                value={manualMessage}
                                                onChange={(e) => setManualMessage(e.target.value)}
                                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all font-medium min-h-[120px] outline-none"
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
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
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
                            className={`py-4 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-green-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                        >
                            <span className="text-lg">▶️</span> {sendMode === 'manual' ? 'Criar Pin Manual' : 'Enviar Agora'}
                        </button>

                        <button
                            onClick={handleSchedule}
                            disabled={!selectedBoard || !automationEnabled}
                            className="py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Clock size={20} /> Salvar Agendamento
                        </button>
                    </div>
                </div>
            </div>

            {/* Help Section */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-8 shadow-sm">
                <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-xs">?</div>
                    Como usar
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
                    <ol className="space-y-3 list-decimal list-inside">
                        <li>Obtenha um <strong>Access Token</strong> ou exporte os <strong>Cookies JSON</strong> do Pinterest.</li>
                        <li>Cole os dados correspondentes e clique em <strong>"Conectar"</strong>.</li>
                        <li>Selecione ou digite um <strong>Board</strong> (pasta) onde os Pins serão criados.</li>
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
