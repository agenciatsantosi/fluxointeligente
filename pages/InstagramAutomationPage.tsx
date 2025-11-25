import React, { useState, useEffect } from 'react';
import { Instagram, Upload, Trash2, Edit2, Calendar, Key, CheckCircle } from 'lucide-react';
import axios from 'axios';

const InstagramAutomationPage: React.FC = () => {
    const [videos, setVideos] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Instagram Graph API state
    const [instagramConfigured, setInstagramConfigured] = useState(false);
    const [accessToken, setAccessToken] = useState('');
    const [accountId, setAccountId] = useState('');

    // Gemini AI state
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [geminiConfigured, setGeminiConfigured] = useState(false);
    const [showGeminiConfig, setShowGeminiConfig] = useState(false);

    // Scheduling options
    const [scheduleMode, setScheduleMode] = useState<'draft' | 'one_per_day' | 'two_per_day' | 'one_per_week'>('draft');

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), type === 'error' ? 10000 : 5000);
    };

    useEffect(() => {
        checkInstagramConfig();
        checkGeminiStatus();
        if (instagramConfigured) {
            loadQueue();
            const interval = setInterval(loadQueue, 5000);
            return () => clearInterval(interval);
        }
    }, [instagramConfigured]);

    const checkInstagramConfig = async () => {
        try {
            const response = await axios.get('/api/instagram/graph/status');
            if (response.data.configured) {
                setInstagramConfigured(true);
            }
        } catch (error) {
            setInstagramConfigured(false);
        }
    };

    const handleReconfigure = () => {
        setInstagramConfigured(false);
        setAccessToken('');
        setAccountId('');
        showNotification('ℹ️ Reconfigure suas credenciais do Instagram', 'info');
    };

    const handleConfigureInstagram = async () => {
        if (!accessToken.trim() || !accountId.trim()) {
            showNotification('❌ Preencha Access Token e Account ID', 'error');
            return;
        }

        try {
            const response = await axios.post('/api/instagram/graph/configure', {
                accessToken,
                accountId
            });

            if (response.data.success) {
                setInstagramConfigured(true);
                showNotification('✅ Instagram configurado!', 'success');
            } else {
                showNotification(`❌ ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao configurar: ' + error.message, 'error');
        }
    };

    const checkGeminiStatus = async () => {
        try {
            const response = await axios.get('/api/gemini/status');
            if (response.data.success) {
                setGeminiConfigured(response.data.configured);
            }
        } catch (error) {
            console.error('Error checking Gemini status:', error);
        }
    };

    const handleConfigureGemini = async () => {
        if (!geminiApiKey.trim()) {
            showNotification('❌ Digite a API Key do Gemini', 'error');
            return;
        }

        try {
            const response = await axios.post('/api/gemini/configure', { apiKey: geminiApiKey });
            if (response.data.success) {
                setGeminiConfigured(true);
                setShowGeminiConfig(false);
                showNotification('✅ Gemini AI configurado!', 'success');
            } else {
                showNotification(`❌ ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao configurar: ' + error.message, 'error');
        }
    };

    const loadQueue = async () => {
        try {
            const response = await axios.get('/api/instagram/queue');
            if (response.data.success) {
                setVideos(response.data.queue.filter((v: any) => v.status === 'pending'));
            }
        } catch (error: any) {
            console.error('Error loading queue:', error);
        }
    };

    const handleMultipleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const files = Array.from(e.target.files);

        if (files.length > 50) {
            showNotification('❌ Máximo 50 vídeos por vez!', 'error');
            return;
        }

        setUploading(true);
        showNotification(`📤 Fazendo upload de ${files.length} vídeo(s)...`, 'info');

        for (const file of files) {
            if (file.size > 100 * 1024 * 1024) {
                showNotification(`❌ ${file.name} muito grande! Máximo 100MB`, 'error');
                continue;
            }

            const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
            if (!validTypes.includes(file.type)) {
                showNotification(`❌ ${file.name} formato inválido!`, 'error');
                continue;
            }

            try {
                const formData = new FormData();
                formData.append('video', file);
                formData.append('caption', '');

                await axios.post('/api/instagram/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } catch (error: any) {
                showNotification(`❌ Erro ao enviar ${file.name}`, 'error');
            }
        }

        setUploading(false);
        showNotification('✅ Upload concluído!', 'success');
        loadQueue();
    };

    const handleGenerateCaption = async (videoId: number, videoName: string) => {
        if (!geminiConfigured) {
            showNotification('❌ Configure a API do Gemini primeiro!', 'error');
            setShowGeminiConfig(true);
            return;
        }

        try {
            showNotification('🤖 Gerando descrição...', 'info');
            const response = await axios.post('/api/gemini/generate-caption', {
                videoTitle: videoName,
                context: ''
            });

            if (response.data.success) {
                await axios.put(`/api/instagram/queue/${videoId}`, {
                    caption: response.data.caption
                });
                loadQueue();
                showNotification('✅ Descrição gerada!', 'success');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao gerar', 'error');
        }
    };

    const handleUpdateCaption = async (id: number, caption: string) => {
        try {
            await axios.put(`/api/instagram/queue/${id}`, { caption });
            loadQueue();
        } catch (error: any) {
            showNotification('❌ Erro ao atualizar', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remover este vídeo?')) return;
        try {
            await axios.delete(`/api/instagram/queue/${id}`);
            loadQueue();
            showNotification('✅ Vídeo removido', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao remover', 'error');
        }
    };

    const handlePublishAll = async () => {
        if (!confirm(`Publicar TODOS os ${videos.length} vídeos agora no Instagram?`)) return;

        try {
            showNotification(`📤 Publicando ${videos.length} vídeos...`, 'info');
            let success = 0;
            let failed = 0;

            for (const video of videos) {
                try {
                    const response = await axios.post(`/api/instagram/post-from-queue/${video.id}`, {
                        apiMethod: 'graph'
                    });

                    if (response.data.success) {
                        success++;
                    } else {
                        failed++;
                    }

                    if (videos.indexOf(video) < videos.length - 1) {
                        const delay = Math.floor(Math.random() * (120000 - 60000) + 60000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } catch (error) {
                    failed++;
                }
            }

            loadQueue();
            showNotification(`✅ Concluído! ${success} publicados, ${failed} falharam`, success > 0 ? 'success' : 'error');
        } catch (error: any) {
            showNotification('❌ Erro ao publicar em massa', 'error');
        }
    };

    const handleScheduleAll = async () => {
        if (scheduleMode === 'draft') {
            showNotification('ℹ️ Selecione um modo de agendamento primeiro', 'info');
            return;
        }

        if (!confirm(`Agendar ${videos.length} vídeos?`)) return;

        try {
            showNotification('📅 Criando agendamento...', 'info');
            const response = await axios.post('/api/instagram/configure-schedule', {
                postsPerDay: scheduleMode === 'one_per_day' ? 1 : scheduleMode === 'two_per_day' ? 2 : 0.14,
                times: scheduleMode === 'one_per_day' ? ['09:00'] :
                    scheduleMode === 'two_per_day' ? ['09:00', '18:00'] : ['09:00'],
                videoIds: videos.map(v => v.id)
            });

            if (response.data.success) {
                showNotification('✅ Agendamento criado!', 'success');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao agendar', 'error');
        }
    };

    const handleClearAll = async () => {
        if (!confirm(`Remover TODOS os ${videos.length} vídeos?`)) return;

        try {
            for (const video of videos) {
                await axios.delete(`/api/instagram/queue/${video.id}`);
            }
            loadQueue();
            showNotification('✅ Fila limpa!', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao limpar fila', 'error');
        }
    };

    // Configuration Screen
    if (!instagramConfigured) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 flex items-center justify-center p-6">
                {notification && (
                    <div className={`fixed top-4 right-4 z-50 p-6 rounded-xl shadow-2xl max-w-md border-2 ${notification.type === 'success' ? 'bg-green-500 border-green-600' :
                            notification.type === 'error' ? 'bg-red-500 border-red-600' : 'bg-blue-500 border-blue-600'
                        } text-white animate-bounce`}>
                        <p className="text-lg font-bold">{notification.message}</p>
                    </div>
                )}

                <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full mb-4">
                            <Instagram size={40} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurar Instagram</h1>
                        <p className="text-gray-600">Configure sua conta do Instagram para começar a postar vídeos</p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Key size={16} className="inline mr-2" />
                                Access Token do Instagram Graph API
                            </label>
                            <input
                                type="password"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                                className="w-full p-4 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                                placeholder="EAABsb..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <CheckCircle size={16} className="inline mr-2" />
                                Instagram Account ID
                            </label>
                            <input
                                type="text"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className="w-full p-4 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                                placeholder="17841..."
                            />
                        </div>

                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                            <h3 className="font-bold text-blue-900 mb-2">📚 Como obter essas credenciais?</h3>
                            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                                <li>Acesse <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="underline">Facebook Developers</a></li>
                                <li>Crie um App e adicione Instagram Graph API</li>
                                <li>Vá em Graph API Explorer e gere um Access Token</li>
                                <li>Use o endpoint <code className="bg-blue-100 px-1 rounded">me/accounts</code> para obter o Account ID</li>
                            </ol>
                        </div>

                        <button
                            onClick={handleConfigureInstagram}
                            className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition font-bold text-lg shadow-lg"
                        >
                            Salvar e Continuar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Main Upload Interface
    return (
        <div className="space-y-6">
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-6 rounded-xl shadow-2xl max-w-md border-2 ${notification.type === 'success' ? 'bg-green-500 border-green-600' :
                        notification.type === 'error' ? 'bg-red-500 border-red-600' : 'bg-blue-500 border-blue-600'
                    } text-white animate-bounce`}>
                    <p className="text-lg font-bold">{notification.message}</p>
                </div>
            )}

            {/* Header */}
            <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-2xl p-8 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Instagram size={32} />
                            Carregar Reels em Massa
                        </h1>
                        <p className="text-white/80 mt-2">Carregue até 50 vídeos de uma vez</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleReconfigure}
                            className="px-4 py-2 bg-white/20 border-2 border-white/30 hover:bg-white/30 rounded-lg transition"
                            title="Reconfigurar Instagram"
                        >
                            ⚙️ Reconfigurar
                        </button>
                        <button
                            onClick={() => setShowGeminiConfig(true)}
                            className={`px-4 py-2 rounded-lg transition ${geminiConfigured
                                ? 'bg-green-500/20 border-2 border-green-300'
                                : 'bg-white/20 border-2 border-white/30 hover:bg-white/30'}`}
                        >
                            {geminiConfigured ? '✅ IA' : '⚙️ IA'}
                        </button>
                        <label className="px-6 py-3 bg-white text-purple-600 rounded-lg hover:bg-gray-100 transition cursor-pointer font-bold flex items-center gap-2">
                            <Upload size={20} />
                            Adicionar vídeos
                            <input
                                type="file"
                                accept="video/mp4,video/quicktime,video/x-msvideo"
                                multiple
                                onChange={handleMultipleFileSelect}
                                className="hidden"
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Scheduling Options */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-purple-600" />
                    Opções de Programação em Grupo
                </h3>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="schedule" checked={scheduleMode === 'draft'} onChange={() => setScheduleMode('draft')} className="w-4 h-4" />
                        <span className="text-sm">Salvar como rascunho</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="schedule" checked={scheduleMode === 'one_per_day'} onChange={() => setScheduleMode('one_per_day')} className="w-4 h-4" />
                        <span className="text-sm">Uma publicação por dia</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="schedule" checked={scheduleMode === 'two_per_day'} onChange={() => setScheduleMode('two_per_day')} className="w-4 h-4" />
                        <span className="text-sm">Duas publicações por dia</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="schedule" checked={scheduleMode === 'one_per_week'} onChange={() => setScheduleMode('one_per_week')} className="w-4 h-4" />
                        <span className="text-sm">Uma publicação por semana</span>
                    </label>
                </div>
            </div>

            {/* Videos Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {videos.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <Instagram size={64} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">Carregue até 50 vídeos</p>
                        <label className="mt-4 inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition cursor-pointer">
                            Adicionar vídeos
                            <input type="file" accept="video/mp4,video/quicktime,video/x-msvideo" multiple onChange={handleMultipleFileSelect} className="hidden" />
                        </label>
                    </div>
                ) : (
                    <div>
                        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b text-sm font-medium text-gray-700">
                            <div className="col-span-1"><input type="checkbox" className="w-4 h-4" /></div>
                            <div className="col-span-1">Miniatura</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-2">Título</div>
                            <div className="col-span-3">Descrição</div>
                            <div className="col-span-3">Ações</div>
                        </div>

                        {videos.map((video, index) => (
                            <VideoRow
                                key={video.id}
                                video={video}
                                index={index}
                                onGenerateCaption={handleGenerateCaption}
                                onUpdateCaption={handleUpdateCaption}
                                onDelete={handleDelete}
                                geminiConfigured={geminiConfigured}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            {videos.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">Ações em Massa</h3>
                            <p className="text-sm text-gray-500">{videos.length} vídeo(s) na fila</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={handleClearAll} className="px-6 py-3 border-2 border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition font-medium">
                                🗑️ Limpar Fila
                            </button>
                            <button onClick={handleScheduleAll} className="px-6 py-3 border-2 border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition font-medium">
                                📅 Agendar Todos
                            </button>
                            <button onClick={handlePublishAll} className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition font-bold shadow-lg">
                                🚀 Publicar Todos Agora
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Gemini Config Modal */}
            {showGeminiConfig && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowGeminiConfig(false)}>
                    <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">🤖 Configurar Gemini AI</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">API Key do Google Gemini</label>
                                <input
                                    type="password"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg"
                                    placeholder="AIzaSy..."
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Obtenha em: <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google AI Studio</a>
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleConfigureGemini} className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition">
                                    Salvar
                                </button>
                                <button onClick={() => setShowGeminiConfig(false)} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Video Row Component
const VideoRow: React.FC<any> = ({ video, index, onGenerateCaption, onUpdateCaption, onDelete, geminiConfigured }) => {
    const [editing, setEditing] = useState(false);
    const [caption, setCaption] = useState(video.caption || '');
    const [title, setTitle] = useState(video.video_path.split('/').pop() || '');

    const handleSave = () => {
        onUpdateCaption(video.id, caption);
        setEditing(false);
    };

    return (
        <div className="grid grid-cols-12 gap-4 p-4 border-b hover:bg-gray-50 transition items-start">
            <div className="col-span-1 pt-2"><input type="checkbox" className="w-4 h-4" /></div>
            <div className="col-span-1">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center text-white">
                    <Instagram size={24} />
                </div>
            </div>
            <div className="col-span-2 pt-2">
                <p className="text-xs text-green-600">✓ Pronto para postar</p>
            </div>
            <div className="col-span-2 pt-2">
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-sm border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none" />
            </div>
            <div className="col-span-3">
                {editing ? (
                    <div className="space-y-2">
                        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full p-2 border rounded-lg text-sm h-20" />
                        <div className="flex gap-2">
                            <button onClick={handleSave} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">Salvar</button>
                            <button onClick={() => setEditing(false)} className="px-3 py-1 bg-gray-200 rounded text-xs">Cancelar</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-sm text-gray-600 line-clamp-2">{caption || 'Sem descrição'}</p>
                        <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline mt-1">Editar</button>
                    </div>
                )}
            </div>
            <div className="col-span-3 space-y-2">
                <button
                    onClick={() => onGenerateCaption(video.id, title)}
                    disabled={!geminiConfigured}
                    className="w-full px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition text-xs disabled:opacity-50"
                >
                    🤖 Gerar com IA
                </button>
                <button onClick={() => onDelete(video.id)} className="w-full px-3 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition text-xs">
                    <Trash2 size={14} className="inline mr-1" /> Remover
                </button>
            </div>
        </div>
    );
};

export default InstagramAutomationPage;
