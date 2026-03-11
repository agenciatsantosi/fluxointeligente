import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Pin, Clock, CheckCircle, Settings, Layout, Loader2, XCircle, Trash2 } from 'lucide-react';
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

    // Schedule Configuration
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']);
    const [productCount, setProductCount] = useState(5);
    const [categoryType, setCategoryType] = useState('random');
    const [automationEnabled, setAutomationEnabled] = useState(false);

    // Notifications
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    useEffect(() => {
        loadAccounts();
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
        if (!newAccessToken) {
            showNotification('❌ Insira o Access Token', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/pinterest/auth', { accessToken: newAccessToken });
            if (response.data.success) {
                const newAccount: PinterestAccount = {
                    id: Date.now().toString(),
                    username: response.data.user?.username || 'Pinterest User',
                    accessToken: newAccessToken,
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
        if (!selectedBoard) {
            showNotification('❌ Selecione um Board primeiro', 'error');
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
                categoryType: categoryType
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
        if (!selectedBoard) {
            showNotification('❌ Selecione um Board primeiro', 'error');
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
                    enabled: true
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
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg animate-slide-in ${notification.type === 'success' ? 'bg-green-500' :
                        notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    } text-white font-bold`}>
                    {notification.message}
                </div>
            )}

            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-pink-600 rounded-3xl p-8 text-white shadow-xl shadow-red-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <Pin size={32} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold">Automação Pinterest</h1>
                        </div>
                        <p className="text-red-100 text-lg max-w-xl">Crie e agende Pins com produtos da Shopee automaticamente.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Accounts & Boards */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Accounts */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg">
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
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {boards.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <Layout size={48} className="mx-auto mb-3 opacity-20" />
                                    <p>Nenhum board encontrado</p>
                                    <p className="text-xs mt-2 max-w-[200px] mx-auto">Adicione uma conta Pinterest para ver seus boards.</p>
                                </div>
                            ) : (
                                boards.map(board => (
                                    <div
                                        key={board.id}
                                        onClick={() => setSelectedBoard(board.id)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedBoard === board.id
                                                ? 'bg-purple-50 border-purple-200 shadow-sm'
                                                : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-md'
                                            }`}
                                    >
                                        <p className={`font-semibold truncate ${selectedBoard === board.id ? 'text-purple-900' : 'text-gray-700'}`}>
                                            {board.name}
                                        </p>
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
                            className="py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <span className="text-xl">▶️</span> Enviar Agora
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
