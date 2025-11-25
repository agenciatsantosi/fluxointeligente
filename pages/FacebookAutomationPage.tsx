import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Facebook, Plus, Trash2, Send, CheckCircle, XCircle, HelpCircle, X, ExternalLink, AlertCircle, Clock } from 'lucide-react';
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
            const response = await axios.get('/api/facebook/pages');
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
            const response = await axios.post('/api/facebook/add-page', newPage);

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
            await axios.delete(`/api/facebook/page/${pageId}`);
            showNotification('✅ Página removida', 'success');
            loadPages();
        } catch (error: any) {
            showNotification('❌ Erro ao remover: ' + error.message, 'error');
        }
    };

    const togglePage = async (pageId: string) => {
        try {
            await axios.post(`/api/facebook/toggle-page/${pageId}`);
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
            await axios.post('/api/facebook/schedule', {
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

            const response = await axios.post('/api/facebook/post-now', {
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
        <div className="space-y-6">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${notification.type === 'success' ? 'bg-green-500' :
                    notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    } text-white`}>
                    {notification.message}
                </div>
            )}

            {sendingStatus && (
                <div className="fixed top-20 right-4 z-50 bg-white rounded-lg shadow-2xl p-4 border-2 border-blue-500 min-w-[300px]">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="font-bold text-gray-800">
                            {sendingStatus.active ? '🚀 Enviando...' : '✅ Concluído!'}
                        </span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Progresso:</span>
                            <span className="font-medium">{sendingStatus.current}/{sendingStatus.total}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(sendingStatus.current / sendingStatus.total) * 100}%` }}
                            ></div>
                        </div>
                        {!sendingStatus.active && (
                            <div className="flex justify-between text-xs mt-2 pt-2 border-t">
                                <span className="text-green-600">✓ {sendingStatus.success} enviados</span>
                                <span className="text-red-600">✗ {sendingStatus.failed} falhas</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showErrorModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-red-600" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-gray-900 mb-3">Erro ao Conectar Página</h3>
                                    <div className="text-gray-700 whitespace-pre-line mb-6 leading-relaxed">
                                        {errorMessage}
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowErrorModal(false)}
                                            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                                        >
                                            Entendi, vou corrigir
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowErrorModal(false);
                                                setShowTutorial(true);
                                            }}
                                            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                                        >
                                            Ver Tutorial
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showTutorial && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between rounded-t-2xl">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <HelpCircle size={28} />
                                Como Conectar sua Página do Facebook
                            </h2>
                            <button onClick={() => setShowTutorial(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="border-l-4 border-blue-500 pl-4">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">📱 Passo 1: Acesse o Facebook Developers</h3>
                                <p className="text-gray-700 mb-2">Vá para <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">developers.facebook.com <ExternalLink size={14} /></a></p>
                            </div>

                            <div className="border-l-4 border-blue-500 pl-4">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">🔧 Passo 2: Crie um App</h3>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                                    <li>Clique em "Meus Apps"</li>
                                    <li>Clique em "Criar App"</li>
                                    <li>Escolha "Empresa"</li>
                                </ol>
                            </div>

                            <div className="border-l-4 border-blue-500 pl-4">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">🔑 Passo 3: Obtenha o Access Token</h3>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                                    <li>Vá em "Ferramentas" → "Explorador da API do Graph"</li>
                                    <li>Selecione sua PÁGINA (não perfil)</li>
                                    <li>Marque: pages_manage_posts, pages_read_engagement</li>
                                    <li>Copie o token</li>
                                </ol>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-bold text-blue-900 mb-2">💡 Dicas:</h4>
                                <ul className="space-y-1 text-sm text-blue-800">
                                    <li>• Consulte os logs em "Logs & Auditoria" no menu</li>
                                    <li>• Teste com uma página de teste primeiro</li>
                                </ul>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 p-4 rounded-b-2xl border-t">
                            <button
                                onClick={() => setShowTutorial(false)}
                                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                            >
                                Entendi!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Facebook size={32} />
                            Automação Facebook
                        </h1>
                        <p className="text-white/80 mt-2">Envie produtos para suas páginas automaticamente</p>
                    </div>
                    <button
                        onClick={() => setShowTutorial(true)}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition flex items-center gap-2"
                    >
                        <HelpCircle size={20} />
                        Como Conectar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Páginas Configuradas</h2>
                    <button
                        onClick={() => setShowAddPage(!showAddPage)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition flex items-center gap-2"
                    >
                        <Plus size={18} />
                        Adicionar Página
                    </button>
                </div>

                {showAddPage && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h3 className="font-medium text-gray-800 mb-3">Nova Página</h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Page ID"
                                value={newPage.pageId}
                                onChange={(e) => setNewPage({ ...newPage, pageId: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-lg"
                                title="ID da Página"
                            />
                            <input
                                type="text"
                                placeholder="Nome (opcional)"
                                value={newPage.pageName}
                                onChange={(e) => setNewPage({ ...newPage, pageName: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-lg"
                                title="Nome da Página"
                            />
                            <textarea
                                placeholder="Access Token"
                                value={newPage.accessToken}
                                onChange={(e) => setNewPage({ ...newPage, accessToken: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-lg h-20"
                                title="Token de Acesso"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddPage}
                                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                >
                                    Adicionar
                                </button>
                                <button
                                    onClick={() => setShowAddPage(false)}
                                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    {pages.length === 0 ? (
                        <div className="text-center py-12">
                            <Facebook size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 mb-4">Nenhuma página configurada</p>
                        </div>
                    ) : (
                        pages.map(page => (
                            <div
                                key={page.id}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition ${page.enabled ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                    }`}
                                onClick={() => togglePage(page.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {page.enabled ? (
                                            <CheckCircle size={20} className="text-blue-600" />
                                        ) : (
                                            <XCircle size={20} className="text-gray-400" />
                                        )}
                                        <div>
                                            <p className="font-medium text-gray-900">{page.name}</p>
                                            <p className="text-xs text-gray-500">ID: {page.id}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemovePage(page.id);
                                        }}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                        title="Remover página"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {pages.filter(p => p.enabled).length > 0 && (
                <>
                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Configuração</h2>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                                <input
                                    type="number"
                                    value={productCount}
                                    onChange={(e) => setProductCount(parseInt(e.target.value))}
                                    className="w-full p-2 border border-gray-300 rounded-lg"
                                    min="1"
                                    max="50"
                                    title="Quantidade de produtos"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Mídia</label>
                                <select
                                    value={mediaType}
                                    onChange={(e) => setMediaType(e.target.value as any)}
                                    className="w-full p-2 border border-gray-300 rounded-lg"
                                    title="Tipo de mídia"
                                >
                                    <option value="auto">Automático</option>
                                    <option value="image">Apenas Imagem</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fonte de Produtos</label>
                            <select
                                value={categoryType}
                                onChange={(e) => setCategoryType(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-lg bg-blue-50 border-blue-200 text-blue-800 font-medium"
                                title="Fonte de produtos"
                            >
                                <option value="random">🎲 Aleatório (Seus Filtros)</option>
                                <option value="cheapest">📉 Mais Baratos (Preço Baixo)</option>
                                <option value="best_sellers_week">🔥 Mais Vendidos da Semana</option>
                                <option value="best_sellers_month">📅 Mais Vendidos do Mês</option>
                                <option value="achadinhos">🕵️ Achadinhos / Promoções</option>
                            </select>
                        </div>

                        <div className="mt-4">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enableRotation}
                                    onChange={(e) => setEnableRotation(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                                    title="Evitar produtos repetidos"
                                />
                                <span className="ml-2 text-sm font-medium text-gray-700">
                                    🔄 Evitar Produtos Repetidos (24h)
                                </span>
                            </label>
                        </div>

                        <div className="mt-4">
                            <button
                                onClick={handleSendNow}
                                disabled={pages.filter(p => p.enabled).length === 0}
                                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Send size={20} />
                                Enviar Agora
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Clock size={20} className="text-orange-600" />
                            Agendamento Automático
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Modo de Agendamento</label>
                                <select
                                    value={scheduleMode}
                                    onChange={(e) => setScheduleMode(e.target.value as any)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                    title="Modo de agendamento"
                                >
                                    <option value="single">1x por dia (horário único)</option>
                                    <option value="multiple">Múltiplos horários por dia (até 5x)</option>
                                </select>
                            </div>

                            {scheduleMode === 'single' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Frequência</label>
                                        <select
                                            value={frequency}
                                            onChange={(e) => setFrequency(e.target.value as any)}
                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                            title="Frequência"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg"
                                            title="Horário"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-medium text-gray-700">Horários (máx. 5)</label>
                                        {times.length < 5 && (
                                            <button onClick={addScheduleTime} className="text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded-lg hover:bg-orange-200">+ Add</button>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {times.map((t, index) => (
                                            <div key={index} className="flex gap-2 items-center">
                                                <span className="text-sm font-medium text-gray-600 w-10">{index + 1}º</span>
                                                <input
                                                    type="time"
                                                    value={t}
                                                    onChange={(e) => updateScheduleTime(index, e.target.value)}
                                                    className="flex-1 p-2 border border-gray-300 rounded-lg"
                                                    title={`Horário ${index + 1}`}
                                                />
                                                {times.length > 1 && (
                                                    <button onClick={() => removeScheduleTime(index)} className="text-red-600 p-2" title="Remover horário"><XCircle size={20} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={automationEnabled}
                                        onChange={(e) => setAutomationEnabled(e.target.checked)}
                                        className="w-5 h-5 text-orange-600 rounded"
                                        title="Ativar agendamento"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Ativar agendamento</span>
                                </label>
                                <button
                                    onClick={handleSchedule}
                                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center gap-2"
                                >
                                    <Clock size={18} />
                                    Salvar Agendamento
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FacebookAutomationPage;
