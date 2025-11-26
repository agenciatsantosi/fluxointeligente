import React, { useState, useEffect } from 'react';
import { Twitter, Save, RefreshCw, Send, Calendar, Key, User, Hash, FileText } from 'lucide-react';
import axios from 'axios';

const TwitterAutomationPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Twitter Configuration
    const [twitterConfigured, setTwitterConfigured] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [accessTokenSecret, setAccessTokenSecret] = useState('');
    const [accountInfo, setAccountInfo] = useState<any>(null);

    // Post Configuration
    const [messageTemplate, setMessageTemplate] = useState(
        "🔥 OFERTA IMPERDÍVEL!\n\n{nome_produto}\n\n💰 DE: R$ {preco_original}\n✅ HOJE: R$ {preco_com_desconto}\n\n⭐ {avaliacao}/5\n\n🛒 {link}\n\n#Shopee #Ofertas #Desconto"
    );
    const [customHashtags, setCustomHashtags] = useState('');

    // Manual Post
    const [products, setProducts] = useState<any[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    // Scheduling
    const [schedules, setSchedules] = useState<any[]>([]);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), type === 'error' ? 10000 : 5000);
    };

    useEffect(() => {
        checkTwitterConfig();
        loadProducts();
        loadSchedules();
    }, []);

    const checkTwitterConfig = async () => {
        try {
            const response = await axios.get('/api/twitter/account');
            if (response.data.success) {
                setTwitterConfigured(true);
                setAccountInfo(response.data.account);
            }
        } catch (error) {
            setTwitterConfigured(false);
        }
    };

    const loadProducts = async () => {
        try {
            // Load products from automation service (mock or real endpoint)
            // For now, we'll try to get from a generic products endpoint if available, 
            // or just use a placeholder if not implemented yet.
            // Using a mock list for demonstration if endpoint fails
            try {
                const response = await axios.get('/api/products?limit=10');
                if (response.data.success) {
                    setProducts(response.data.products);
                }
            } catch (e) {
                // Fallback or empty
            }
        } catch (error) {
            console.error('Error loading products:', error);
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
            const response = await axios.post('/api/twitter/test', {
                apiKey,
                apiSecret,
                accessToken,
                accessTokenSecret
            });

            if (response.data.success) {
                setTwitterConfigured(true);
                setAccountInfo(response.data.account);
                showNotification(`✅ Conectado como @${response.data.account.username}`, 'success');

                // Save credentials (in a real app, this would be a separate endpoint)
                // For now we assume the test endpoint initializes the service
            } else {
                showNotification(`❌ ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao conectar: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePostNow = async () => {
        if (!selectedProduct) {
            showNotification('❌ Selecione um produto', 'error');
            return;
        }

        setLoading(true);
        try {
            const hashtags = customHashtags.split(',').map(tag => tag.trim()).filter(tag => tag);

            const response = await axios.post('/api/twitter/post', {
                product: selectedProduct,
                template: messageTemplate,
                hashtags
            });

            if (response.data.success) {
                showNotification('✅ Tweet postado com sucesso!', 'success');
            } else {
                showNotification(`❌ ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao postar: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSchedule = async () => {
        try {
            const config = {
                schedule: {
                    frequency: 'daily',
                    time: '09:00',
                    productCount: 5,
                    enabled: true
                },
                messageTemplate,
                hashtags: customHashtags.split(',').map(tag => tag.trim()).filter(tag => tag),
                twitterSettings: {
                    apiKey, // In a real app, use saved ID or similar
                    // For simplicity, we might need to ensure service is initialized
                }
            };

            const response = await axios.post('/api/schedules', {
                platform: 'twitter',
                config
            });

            if (response.data.success) {
                showNotification('✅ Agendamento criado!', 'success');
                loadSchedules();
            }
        } catch (error: any) {
            showNotification('❌ Erro ao criar agendamento', 'error');
        }
    };

    const handleDeleteSchedule = async (id: number) => {
        if (!confirm('Remover agendamento?')) return;
        try {
            await axios.delete(`/api/schedules/${id}`);
            loadSchedules();
            showNotification('✅ Agendamento removido', 'success');
        } catch (error) {
            showNotification('❌ Erro ao remover', 'error');
        }
    };

    if (!twitterConfigured) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 flex items-center justify-center p-6">
                {notification && (
                    <div className={`fixed top-4 right-4 z-50 p-6 rounded-xl shadow-2xl max-w-md border-2 ${notification.type === 'success' ? 'bg-green-500 border-green-600' :
                            notification.type === 'error' ? 'bg-red-500 border-red-600' : 'bg-blue-500 border-blue-600'
                        } text-white animate-bounce`}>
                        <p className="text-lg font-bold">{notification.message}</p>
                    </div>
                )}

                <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-full mb-4">
                            <Twitter size={40} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurar Twitter/X</h1>
                        <p className="text-gray-600">Conecte sua conta Developer para postar automaticamente</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="API Key" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                            <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="API Secret" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                            <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="Access Token" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Access Token Secret</label>
                            <input type="password" value={accessTokenSecret} onChange={e => setAccessTokenSecret(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="Access Token Secret" />
                        </div>

                        <button
                            onClick={handleConfigureTwitter}
                            disabled={loading}
                            className="w-full py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold text-lg shadow-lg disabled:opacity-50"
                        >
                            {loading ? 'Conectando...' : 'Conectar Twitter'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-6 rounded-xl shadow-2xl max-w-md border-2 ${notification.type === 'success' ? 'bg-green-500 border-green-600' :
                        notification.type === 'error' ? 'bg-red-500 border-red-600' : 'bg-blue-500 border-blue-600'
                    } text-white animate-bounce`}>
                    <p className="text-lg font-bold">{notification.message}</p>
                </div>
            )}

            {/* Header & Account Info */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white">
                            {accountInfo?.profileImage ? (
                                <img src={accountInfo.profileImage} alt="Profile" className="w-full h-full rounded-full" />
                            ) : (
                                <Twitter size={32} />
                            )}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{accountInfo?.name || 'Twitter Automation'}</h1>
                            <p className="text-gray-500">@{accountInfo?.username}</p>
                        </div>
                    </div>
                    <div className="flex gap-4 text-center">
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{accountInfo?.followersCount || 0}</p>
                            <p className="text-xs text-gray-500">Seguidores</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{accountInfo?.tweetCount || 0}</p>
                            <p className="text-xs text-gray-500">Tweets</p>
                        </div>
                        <button onClick={() => setTwitterConfigured(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                            Desconectar
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Post Configuration */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <FileText size={20} className="text-blue-500" />
                        Configurar Postagem
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template da Mensagem</label>
                            <textarea
                                value={messageTemplate}
                                onChange={e => setMessageTemplate(e.target.value)}
                                className="w-full p-3 border rounded-lg h-32 text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-1">Variáveis: {'{nome_produto}, {preco_original}, {preco_com_desconto}, {link}, {avaliacao}'}</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Hashtags (separadas por vírgula)</label>
                            <div className="flex items-center gap-2">
                                <Hash size={16} className="text-gray-400" />
                                <input
                                    type="text"
                                    value={customHashtags}
                                    onChange={e => setCustomHashtags(e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Shopee, Ofertas, Promoção"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Manual Post */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Send size={20} className="text-blue-500" />
                        Postar Manualmente
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Selecione um Produto (Simulação)</label>
                            <select
                                className="w-full p-3 border rounded-lg"
                                onChange={e => {
                                    const prod = products.find(p => p.id === e.target.value);
                                    setSelectedProduct(prod);
                                }}
                            >
                                <option value="">Selecione...</option>
                                {products.map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.title || p.name}</option>
                                ))}
                                {/* Mock option if empty */}
                                {products.length === 0 && <option value="mock">Produto Exemplo (Teste)</option>}
                            </select>
                        </div>

                        {selectedProduct === 'mock' && (
                            <div className="p-3 bg-gray-50 rounded-lg text-sm">
                                <p><strong>Produto:</strong> Fone Bluetooth TWS</p>
                                <p><strong>Preço:</strong> R$ 49,90</p>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                if (selectedProduct === 'mock') {
                                    setSelectedProduct({
                                        id: 'mock-1',
                                        name: 'Fone Bluetooth TWS',
                                        price: 49.90,
                                        rating: 4.8,
                                        link: 'https://shopee.com.br/...'
                                    });
                                }
                                handlePostNow();
                            }}
                            disabled={loading}
                            className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-bold disabled:opacity-50"
                        >
                            {loading ? 'Postando...' : 'Postar Agora'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Scheduling */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Calendar size={20} className="text-blue-500" />
                        Agendamentos Ativos
                    </h2>
                    <button
                        onClick={handleCreateSchedule}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-bold"
                    >
                        + Novo Agendamento Diário
                    </button>
                </div>

                {schedules.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Nenhum agendamento ativo para Twitter</p>
                ) : (
                    <div className="space-y-3">
                        {schedules.map((schedule: any) => (
                            <div key={schedule.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                                <div>
                                    <p className="font-bold">Agendamento #{schedule.id}</p>
                                    <p className="text-sm text-gray-500">{schedule.config.schedule.frequency} às {schedule.config.schedule.time}</p>
                                </div>
                                <button
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    className="text-red-500 hover:text-red-700"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TwitterAutomationPage;
