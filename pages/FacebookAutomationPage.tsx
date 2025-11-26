import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Facebook, Plus, Trash2, Send, CheckCircle, XCircle, HelpCircle, X, ExternalLink, AlertCircle, Clock, Loader2, Settings, Layout } from 'lucide-react';
import axios from 'axios';

const FacebookAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [pages, setPages] = useState<Array<{ id: string; name: string; accessToken: string; enabled: boolean }>>([]);
    const [showAddPage, setShowAddPage] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [newPage, setNewPage] = useState({ pageId: '', pageName: '', accessToken: '' });

    const [productCount, setProductCount] = useState(5);
    const [mediaType, setMediaType] = useState<'auto' | 'image'>('auto');
    const [categoryType, setCategoryType] = useState('random');
    const [enableRotation, setEnableRotation] = useState(true);

    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']);
    const [automationEnabled, setAutomationEnabled] = useState(false);

    const [messageTemplate] = useState(`🚨 PROMOÇÃO NA SHOPEE AGORA

{nome_produto}

🔴 DE: R$ {preco_original}
🟢 SOMENTE HOJE: R$ {preco_com_desconto}

⭐⭐⭐⭐⭐ (Bem Avaliado)

🛒 Compre aqui: 👇
{link}

⚠ Esse BUG vai acabar em alguns minutos!`);

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 8000);
    };

    useEffect(() => {
        loadPages();
    }, []);

    const loadPages = async () => {
        try {
            const response = await axios.get('http://localhost:3001/api/facebook/pages');
            if (response.data.success) {
                setPages(response.data.pages);
            }
        } catch (error) {
            console.error('Error loading pages:', error);
        }
    };

    const handleAddPage = async () => {
        if (!newPage.pageId || !newPage.accessToken) {
            showNotification('❌ Preencha Page ID e Access Token', 'error');
            return;
        }

        try {
            showNotification('🔄 Verificando página...', 'info');
            const response = await axios.post('http://localhost:3001/api/facebook/add-page', newPage);

            if (response.data.success) {
                showNotification('✅ Página adicionada com sucesso!', 'success');
                setNewPage({ pageId: '', pageName: '', accessToken: '' });
                setShowAddPage(false);
                loadPages();
            } else {
                setErrorMessage(response.data.error);
                setShowErrorModal(true);
            }
        } catch (error: any) {
            setErrorMessage('Erro ao adicionar página: ' + error.message);
            setShowErrorModal(true);
        }
    };

    const handleRemovePage = async (pageId: string) => {
        if (!confirm('Deseja remover esta página?')) return;

        try {
            await axios.delete(`http://localhost:3001/api/facebook/page/${pageId}`);
            showNotification('✅ Página removida', 'success');
            loadPages();
        } catch (error: any) {
            showNotification('❌ Erro ao remover: ' + error.message, 'error');
        }
    };

    const togglePage = async (pageId: string) => {
        try {
            await axios.post(`http://localhost:3001/api/facebook/toggle-page/${pageId}`);
            loadPages();
        } catch (error) {
            console.error('Error toggling page:', error);
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

    const handleSchedule = async () => {
        const enabledPages = pages.filter(p => p.enabled);
        if (enabledPages.length === 0) {
            showNotification('❌ Selecione pelo menos uma página!', 'error');
            return;
        }
        if (!automationEnabled) {
            showNotification('❌ Marque "Ativar agendamento automático" primeiro!', 'error');
            return;
        }

        const scheduleText = frequency === 'daily' ? 'todo dia' : frequency === 'weekly' ? 'toda semana' : 'todo mês';
        const confirmMsg = `Agendar envio de ${productCount} produto(s) ${scheduleText} para ${enabledPages.length} página(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            await axios.post('http://localhost:3001/api/facebook/schedule', {
                facebookPages: enabledPages,
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
                enableRotation
            });

            showNotification('✅ Agendamento salvo com sucesso!', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao agendar: ' + error.message, 'error');
        }
    };

    const handleSendNow = async () => {
        const enabledPages = pages.filter(p => p.enabled);
        if (enabledPages.length === 0) {
            showNotification('❌ Selecione pelo menos uma página!', 'error');
            return;
        }
        if (!shopeeAffiliateSettings.appId) {
            showNotification('❌ Configure suas credenciais da Shopee primeiro!', 'error');
            return;
        }

        const confirmMsg = `Enviar ${productCount} produto(s) para ${enabledPages.length} página(s)?`;
        if (!confirm(confirmMsg)) return;

        try {
            const totalToSend = productCount * enabledPages.length;
            setSendingStatus({ active: true, current: 0, total: totalToSend, success: 0, failed: 0 });

            const response = await axios.post('http://localhost:3001/api/facebook/post-now', {
                pages: enabledPages,
                productCount,
                shopeeSettings: shopeeAffiliateSettings,
                filters: {},
                mediaType,
                messageTemplate,
                enableRotation,
                categoryType
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
                showNotification(`✅ ${details.success} enviados, ${details.failed} falhas`, 'success');
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

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in ${notification.type === 'success' ? 'bg-green-500 text-white' :
                        notification.type === 'error' ? 'bg-red-500 text-white' :
                            'bg-blue-500 text-white'
                    }`}>
                    {notification.type === 'success' ? <CheckCircle size={24} /> :
                        notification.type === 'error' ? <AlertCircle size={24} /> :
                            <HelpCircle size={24} />}
                    <span className="font-bold">{notification.message}</span>
                </div>
            )}

            {/* Sending Status Overlay */}
            {sendingStatus && (
                <div className="fixed bottom-8 right-8 z-50 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-blue-100 w-80 animate-slide-up">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-3 h-3 rounded-full ${sendingStatus.active ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
                        <span className="font-bold text-gray-800">
                            {sendingStatus.active ? '🚀 Enviando...' : '✅ Concluído!'}
                        </span>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm text-gray-600 font-medium">
                            <span>Progresso</span>
                            <span>{sendingStatus.current}/{sendingStatus.total}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}
                            ></div>
                        </div>
                        {!sendingStatus.active && (
                            <div className="flex justify-between text-xs pt-3 border-t border-gray-100">
                                <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle size={12} /> {sendingStatus.success} sucesso</span>
                                <span className="text-red-600 font-bold flex items-center gap-1"><XCircle size={12} /> {sendingStatus.failed} falhas</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-8 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <Facebook size={32} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold">Automação Facebook</h1>
                        </div>
                        <p className="text-blue-100 text-lg max-w-xl">Gerencie suas páginas e automatize postagens.</p>
                    </div>
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl transition-all border border-white/20 font-medium"
                        title="Ver tutorial de conexão"
                    >
                        <HelpCircle size={20} />
                        Como Conectar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Pages List */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg flex flex-col h-[600px]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                    <Layout size={20} />
                                </div>
                                Páginas
                                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                                    {pages.length}
                                </span>
                            </h2>
                            <button
                                onClick={() => setShowAddPage(!showAddPage)}
                                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                                title="Adicionar nova página"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        {showAddPage && (
                            <div className="mb-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 animate-fade-in">
                                <h3 className="font-bold text-blue-900 mb-3 text-sm">Nova Página</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Page ID"
                                        value={newPage.pageId}
                                        onChange={(e) => setNewPage({ ...newPage, pageId: e.target.value })}
                                        className="w-full p-3 bg-white border border-blue-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        title="ID da Página do Facebook"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Nome (opcional)"
                                        value={newPage.pageName}
                                        onChange={(e) => setNewPage({ ...newPage, pageName: e.target.value })}
                                        className="w-full p-3 bg-white border border-blue-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                        title="Nome da Página (para identificação)"
                                    />
                                    <textarea
                                        placeholder="Access Token"
                                        value={newPage.accessToken}
                                        onChange={(e) => setNewPage({ ...newPage, accessToken: e.target.value })}
                                        className="w-full p-3 bg-white border border-blue-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                                        title="Token de Acesso da Página"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleAddPage}
                                            className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700"
                                        >
                                            Adicionar
                                        </button>
                                        <button
                                            onClick={() => setShowAddPage(false)}
                                            className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-300"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {pages.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <Facebook size={48} className="mx-auto mb-3 opacity-20" />
                                    <p>Nenhuma página conectada</p>
                                    <button onClick={() => setShowTutorial(true)} className="text-blue-600 text-sm font-bold mt-2 hover:underline">
                                        Ver como conectar
                                    </button>
                                </div>
                            ) : (
                                pages.map(page => (
                                    <div
                                        key={page.id}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer group ${page.enabled
                                                ? 'bg-blue-50 border-blue-200 shadow-sm'
                                                : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                                            }`}
                                        onClick={() => togglePage(page.id)}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-bold truncate ${page.enabled ? 'text-blue-900' : 'text-gray-700'}`}>
                                                    {page.name || 'Página sem nome'}
                                                </p>
                                                <p className="text-xs text-gray-400 font-mono truncate">
                                                    ID: {page.id}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${page.enabled
                                                        ? 'bg-blue-500 border-blue-500'
                                                        : 'border-gray-300 group-hover:border-blue-400'
                                                    }`}>
                                                    {page.enabled && <CheckCircle size={14} className="text-white" />}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemovePage(page.id);
                                                    }}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Remover página"
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

                {/* Right Column: Configuration */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                <Settings size={24} />
                            </div>
                            Configuração de Envio
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Quantidade de Produtos</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={productCount}
                                        onChange={(e) => setProductCount(parseInt(e.target.value))}
                                        min="1"
                                        max="50"
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium text-lg"
                                        title="Quantidade de produtos por envio"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">itens</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Tipo de Mídia</label>
                                <select
                                    value={mediaType}
                                    onChange={(e) => setMediaType(e.target.value as any)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                                    title="Tipo de mídia para postagem"
                                >
                                    <option value="auto">📸 Automático (Link + Imagem)</option>
                                    <option value="image">🖼️ Apenas Imagem</option>
                                </select>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Fonte de Produtos</label>
                            <select
                                value={categoryType}
                                onChange={(e) => setCategoryType(e.target.value)}
                                className="w-full p-4 bg-indigo-50/50 border border-indigo-100 text-indigo-900 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                                title="Fonte dos produtos"
                            >
                                <option value="random">🎲 Aleatório (Baseado nos seus filtros)</option>
                                <option value="cheapest">📉 Mais Baratos (Ofertas)</option>
                                <option value="best_sellers_week">🔥 Mais Vendidos (Semana)</option>
                                <option value="best_sellers_month">📅 Mais Vendidos (Mês)</option>
                                <option value="achadinhos">🕵️ Achadinhos</option>
                            </select>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-8">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={enableRotation}
                                        onChange={(e) => setEnableRotation(e.target.checked)}
                                        className="sr-only peer"
                                        title="Evitar produtos repetidos nas últimas 24h"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                                </div>
                                <span className="text-sm font-bold text-gray-700">Evitar produtos repetidos (24h)</span>
                            </label>
                        </div>

                        <div className="border-t border-gray-100 pt-8">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Clock size={20} className="text-orange-500" />
                                Agendamento Automático
                            </h3>

                            <div className="space-y-6">
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
                                                title="Frequência de envio"
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
                                                title="Horário de envio"
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

                                <div className="flex items-center justify-between pt-4">
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
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={handleSendNow}
                            disabled={pages.filter(p => p.enabled).length === 0}
                            className="py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title="Enviar produtos agora"
                        >
                            <span className="text-xl">▶️</span> Enviar Agora
                        </button>

                        <button
                            onClick={handleSchedule}
                            disabled={pages.filter(p => p.enabled).length === 0 || !automationEnabled}
                            className="py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            title="Salvar agendamento"
                        >
                            <Clock size={20} /> Salvar Agendamento
                        </button>
                    </div>
                </div>
            </div>

            {/* Error Modal */}
            {showErrorModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-6 animate-scale-in">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Erro ao Conectar</h3>
                        </div>
                        <p className="text-gray-600 mb-6 leading-relaxed">{errorMessage}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={() => {
                                    setShowErrorModal(false);
                                    setShowTutorial(true);
                                }}
                                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                            >
                                Ver Tutorial
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tutorial Modal */}
            {showTutorial && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in">
                        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 flex items-center justify-between rounded-t-3xl z-10">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <HelpCircle size={28} />
                                Como Conectar sua Página
                            </h2>
                            <button onClick={() => setShowTutorial(false)} className="p-2 hover:bg-white/20 rounded-xl transition">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">1</div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Acesse o Facebook Developers</h3>
                                    <p className="text-gray-600">
                                        Vá para <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold inline-flex items-center gap-1">developers.facebook.com <ExternalLink size={14} /></a> e faça login.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">2</div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Crie um Aplicativo</h3>
                                    <ul className="space-y-2 text-gray-600 list-disc list-inside">
                                        <li>Clique em "Meus Apps" e depois em "Criar App".</li>
                                        <li>Selecione o tipo "Empresa" ou "Outro".</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">3</div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Obtenha o Token de Acesso</h3>
                                    <ul className="space-y-2 text-gray-600 list-disc list-inside">
                                        <li>Vá em "Ferramentas" &gt; "Explorador da API do Graph".</li>
                                        <li>Selecione sua <strong>Página</strong> no menu dropdown (não seu usuário).</li>
                                        <li>Adicione as permissões: <code>pages_manage_posts</code>, <code>pages_read_engagement</code>.</li>
                                        <li>Clique em "Generate Access Token" e copie o código.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                                <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                                    <AlertCircle size={20} />
                                    Dica Importante
                                </h4>
                                <p className="text-blue-800 text-sm">
                                    Se o token expirar, você precisará gerar um novo. Para tokens permanentes, é necessário configurar um "Long-Lived Token" nas configurações do App.
                                </p>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl border-t border-gray-100">
                            <button
                                onClick={() => setShowTutorial(false)}
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
                            >
                                Entendi, vamos configurar!
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FacebookAutomationPage;
