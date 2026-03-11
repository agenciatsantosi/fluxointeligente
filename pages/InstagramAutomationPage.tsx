import React, { useState, useEffect } from 'react';
import { Instagram, Upload, Trash2, Edit2, Calendar, Key, CheckCircle, Clock, ImageIcon } from 'lucide-react';
import api from '../services/api';
import StorySchedulerPage from './StorySchedulerPage';

interface InstagramAutomationPageProps {
    setActiveTab?: (tab: string) => void;
}

const InstagramAutomationPage: React.FC<InstagramAutomationPageProps> = ({ setActiveTab }) => {
    const [videos, setVideos] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Instagram Graph API state
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>(''); // For posting

    // Gemini AI state
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [geminiConfigured, setGeminiConfigured] = useState(false);
    const [showGeminiConfig, setShowGeminiConfig] = useState(false);

    // Scheduling options
    const [scheduleMode, setScheduleMode] = useState<'draft' | 'one_per_day' | 'two_per_day' | 'one_per_week'>('draft');
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '18:00']);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedVideos, setSelectedVideos] = useState<number[]>([]);

    // Manual Post options
    const [sendMode, setSendMode] = useState<'reels' | 'manual' | 'stories'>('reels');
    const [postType, setPostType] = useState<'feed' | 'story'>('feed');
    const [manualMessage, setManualMessage] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualLoading, setManualLoading] = useState(false);

    const toggleSelection = (id: number) => {
        setSelectedVideos(prev =>
            prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedVideos.length === videos.length) {
            setSelectedVideos([]);
        } else {
            setSelectedVideos(videos.map(v => v.id));
        }
    };

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), type === 'error' ? 10000 : 5000);
    };

    useEffect(() => {
        checkGeminiStatus();
        loadAccounts();
        loadQueue();
        const interval = setInterval(loadQueue, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAddAccountRedirect = () => {
        if (setActiveTab) {
            setActiveTab('automation_accounts');
        }
    };

    const loadAccounts = async () => {
        try {
            const response = await api.get('/instagram/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                // Auto-select first account if none selected
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(response.data.accounts[0].id);
                }
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
        }
    };

    const checkInstagramConfig = async () => {
        try {
            const response = await api.get('/instagram/graph/status');
            return response.data.configured;
        } catch (error) {
            return false;
        }
    };

    const handleRemoveAccount = async (id: number) => {
        if (!confirm('Remover esta conta?')) return;
        try {
            await api.delete(`/instagram/accounts/${id}`);
            loadAccounts();
            showNotification('✅ Conta removida!', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao remover conta', 'error');
        }
    };


    const checkGeminiStatus = async () => {
        try {
            const response = await api.get('/gemini/status');
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
            const response = await api.post('/gemini/configure', { apiKey: geminiApiKey });
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
            const response = await api.get('/instagram/queue');
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

                await api.post('/instagram/upload', formData, {
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
            const response = await api.post('/gemini/generate-caption', {
                videoTitle: videoName,
                context: ''
            });

            if (response.data.success) {
                await api.put(`/instagram/queue/${videoId}`, {
                    caption: response.data.caption
                });
                loadQueue();
                showNotification('✅ Descrição gerada!', 'success');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao gerar', 'error');
        }
    };

    const handleUpdateVideo = async (id: number, updates: { caption?: string, title?: string }) => {
        try {
            await api.put(`/instagram/queue/${id}`, updates);
            loadQueue();
        } catch (error: any) {
            showNotification('❌ Erro ao atualizar', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remover este vídeo?')) return;
        try {
            await api.delete(`/instagram/queue/${id}`);
            loadQueue();
            showNotification('✅ Vídeo removido', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao remover', 'error');
        }
    };

    const handlePublishAll = async () => {
        const targetVideos = selectedVideos.length > 0
            ? videos.filter(v => selectedVideos.includes(v.id))
            : videos;

        if (!confirm(`Publicar ${targetVideos.length} vídeos agora no Instagram?`)) return;

        // Ensure account is selected
        if (!selectedAccountId) {
            showNotification('❌ Selecione uma conta do Instagram', 'error');
            return;
        }

        try {
            showNotification(`📤 Publicando ${targetVideos.length} vídeos...`, 'info');
            let success = 0;
            let failed = 0;

            for (const video of targetVideos) {
                try {
                    const response = await api.post(`/instagram/post-from-queue/${video.id}`, {
                        apiMethod: 'graph',
                        accountId: selectedAccountId
                    });

                    if (response.data.success) {
                        success++;
                    } else {
                        failed++;
                    }

                    if (targetVideos.indexOf(video) < targetVideos.length - 1) {
                        const delay = Math.floor(Math.random() * (120000 - 60000) + 60000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } catch (error) {
                    failed++;
                }
            }

            loadQueue();
            setSelectedVideos([]); // Clear selection
            showNotification(`✅ Concluído! ${success} publicados, ${failed} falharam`, success > 0 ? 'success' : 'error');
        } catch (error: any) {
            showNotification('❌ Erro ao publicar em massa', 'error');
        }
    };

    const handleManualPost = async () => {
        if (!selectedAccountId) {
            showNotification('❌ Selecione uma conta do Instagram', 'error');
            return;
        }
        if (!manualImageUrl) {
            showNotification('❌ Forneça a URL de uma Imagem.', 'error');
            return;
        }

        setManualLoading(true);
        try {
            showNotification(`📤 Publicando imagem manualmente...`, 'info');
            const response = await api.post(`/instagram/post-now`, {
                sendMode: 'manual',
                postType,
                manualImageUrl,
                manualMessage,
                accountId: selectedAccountId
            });

            if (response.data.success) {
                showNotification(`✅ Publicado com sucesso!`, 'success');
                setManualMessage('');
                setManualImageUrl('');
            } else {
                showNotification(`❌ Erro: ${response.data.error || response.data.details?.errors?.[0] || 'Desconhecido'}`, 'error');
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || error.response?.data?.details?.errors?.[0] || error.message;
            showNotification(`❌ Erro na postagem manual: ${errorMsg}`, 'error');
        } finally {
            setManualLoading(false);
        }
    };

    const handleScheduleAll = async () => {
        if (scheduleMode === 'draft') {
            showNotification('ℹ️ Selecione um modo de agendamento primeiro', 'info');
            return;
        }

        // Ensure account is selected
        if (!selectedAccountId) {
            showNotification('❌ Selecione uma conta do Instagram', 'error');
            return;
        }

        const targetVideos = selectedVideos.length > 0
            ? videos.filter(v => selectedVideos.includes(v.id))
            : videos;

        if (!confirm(`Agendar ${targetVideos.length} vídeos?`)) return;

        try {
            showNotification('📅 Criando agendamento...', 'info');
            const response = await api.post('/instagram/configure-schedule', {
                postsPerDay: scheduleMode === 'one_per_day' ? 1 : scheduleMode === 'two_per_day' ? 2 : 0.14,
                times: customTimes,
                startDate: startDate,
                videoIds: targetVideos.map(v => v.id),
                accountId: selectedAccountId
            });

            if (response.data.success) {
                setSelectedVideos([]); // Clear selection
                showNotification('✅ Agendamento criado!', 'success');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao agendar', 'error');
        }
    };

    const handleClearAll = async () => {
        const targetVideos = selectedVideos.length > 0
            ? videos.filter(v => selectedVideos.includes(v.id))
            : videos;

        if (!confirm(`Remover ${targetVideos.length} vídeos?`)) return;

        try {
            for (const video of targetVideos) {
                await api.delete(`/instagram/queue/${video.id}`);
            }
            loadQueue();
            setSelectedVideos([]); // Clear selection
            showNotification('✅ Fila limpa!', 'success');
        } catch (error: any) {
            showNotification('❌ Erro ao limpar fila', 'error');
        }
    };

    const handleGenerateCaptionForSelected = async () => {
        if (!geminiConfigured) {
            showNotification('❌ Configure a API do Gemini primeiro!', 'error');
            setShowGeminiConfig(true);
            return;
        }

        const targetVideos = selectedVideos.length > 0
            ? videos.filter(v => selectedVideos.includes(v.id))
            : videos;

        if (targetVideos.length === 0) {
            showNotification('❌ Nenhum vídeo selecionado', 'error');
            return;
        }

        try {
            showNotification(`🤖 Gerando legendas para ${targetVideos.length} vídeos...`, 'info');
            let success = 0;
            let failed = 0;

            for (const video of targetVideos) {
                try {
                    const response = await api.post('/gemini/generate-caption', {
                        videoTitle: video.title || video.video_path.split('/').pop(),
                        context: ''
                    });

                    if (response.data.success) {
                        await api.put(`/instagram/queue/${video.id}`, {
                            caption: response.data.caption
                        });
                        success++;
                    } else {
                        failed++;
                    }
                } catch (error) {
                    failed++;
                }
            }

            loadQueue();
            showNotification(`✅ Legendas geradas para ${success} vídeos! ${failed > 0 ? `(${failed} falharam)` : ''}`, success > 0 ? 'success' : 'error');
        } catch (error: any) {
            showNotification('❌ Erro ao gerar legendas', 'error');
        }
    };


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
                        {accounts.length === 0 && (
                            <button
                                onClick={handleAddAccountRedirect}
                                className="px-4 py-2 bg-white text-purple-600 hover:bg-gray-100 rounded-xl transition font-bold"
                            >
                                Conectar Conta
                            </button>
                        )}
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

            {/* Mode Selector */}
            <div className="flex bg-gray-100 p-1 rounded-xl w-full mx-auto">
                <button
                    onClick={() => setSendMode('reels')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${sendMode === 'reels'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    🎥 Fila de Reels
                </button>
                <button
                    onClick={() => setSendMode('manual')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${sendMode === 'manual'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    ✍️ Imagem Manual
                </button>
                <button
                    onClick={() => setSendMode('stories')}
                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${sendMode === 'stories'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    📸 Stories em Massa
                </button>
            </div>

            {sendMode === 'reels' ? (
                <>
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

                    {/* Time Selection */}
                    {scheduleMode !== 'draft' && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <Clock size={16} />
                                Configuração de Agendamento
                            </h4>
                            <div className="mb-4">
                                <label className="block text-xs text-gray-500 mb-1">Data de Início</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="p-2 border rounded-lg text-sm w-full md:w-auto"
                                />
                            </div>
                            <div className="flex flex-wrap gap-4">
                                {scheduleMode === 'one_per_day' && (
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Horário</label>
                                        <input
                                            type="time"
                                            value={customTimes[0] || '09:00'}
                                            onChange={(e) => {
                                                const newTimes = [...customTimes];
                                                newTimes[0] = e.target.value;
                                                setCustomTimes(newTimes);
                                            }}
                                            className="p-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                )}
                                {scheduleMode === 'two_per_day' && (
                                    <>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">1º Horário</label>
                                            <input
                                                type="time"
                                                value={customTimes[0] || '09:00'}
                                                onChange={(e) => {
                                                    const newTimes = [...customTimes];
                                                    newTimes[0] = e.target.value;
                                                    setCustomTimes(newTimes);
                                                }}
                                                className="p-2 border rounded-lg text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">2º Horário</label>
                                            <input
                                                type="time"
                                                value={customTimes[1] || '18:00'}
                                                onChange={(e) => {
                                                    const newTimes = [...customTimes];
                                                    newTimes[1] = e.target.value;
                                                    setCustomTimes(newTimes);
                                                }}
                                                className="p-2 border rounded-lg text-sm"
                                            />
                                        </div>
                                    </>
                                )}
                                {scheduleMode === 'one_per_week' && (
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Horário</label>
                                        <input
                                            type="time"
                                            value={customTimes[0] || '09:00'}
                                            onChange={(e) => {
                                                const newTimes = [...customTimes];
                                                newTimes[0] = e.target.value;
                                                setCustomTimes(newTimes);
                                            }}
                                            className="p-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


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
                                    <div className="col-span-1">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4"
                                            checked={videos.length > 0 && selectedVideos.length === videos.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </div>
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
                                        onUpdateVideo={handleUpdateVideo}
                                        onDelete={handleDelete}
                                        geminiConfigured={geminiConfigured}
                                        selected={selectedVideos.includes(video.id)}
                                        onToggleSelection={() => toggleSelection(video.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    {
                        videos.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">Ações em Massa</h3>
                                        <p className="text-sm text-gray-500">{videos.length} vídeo(s) na fila</p>
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        {/* Account Selector */}
                                        {accounts.length > 1 && (
                                            <select
                                                value={selectedAccountId}
                                                onChange={(e) => setSelectedAccountId(e.target.value)}
                                                className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 bg-white"
                                            >
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.name || acc.username || `Conta ${acc.id}`}
                                                    </option>
                                                ))}
                                            </select>
                                        )}

                                        <button onClick={handleGenerateCaptionForSelected} className="px-6 py-3 border-2 border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition font-medium">
                                            🤖 {selectedVideos.length > 0 ? `Legenda IA (${selectedVideos.length})` : 'Legenda IA Todos'}
                                        </button>
                                        <button onClick={handleClearAll} className="px-6 py-3 border-2 border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition font-medium">
                                            🗑️ {selectedVideos.length > 0 ? `Limpar (${selectedVideos.length})` : 'Limpar Fila'}
                                        </button>
                                        <button onClick={handleScheduleAll} className="px-6 py-3 border-2 border-purple-300 text-purple-600 rounded-lg hover:bg-purple-50 transition font-medium">
                                            📅 {selectedVideos.length > 0 ? `Agendar (${selectedVideos.length})` : 'Agendar Todos'}
                                        </button>
                                        <button onClick={handlePublishAll} className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition font-bold shadow-lg">
                                            🚀 {selectedVideos.length > 0 ? `Publicar (${selectedVideos.length})` : 'Publicar Todos'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                </>
            ) : sendMode === 'stories' ? (
                <StorySchedulerPage platform="instagram" accounts={accounts} />
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-lg space-y-8 animate-fade-in">
                    <h3 className="text-2xl font-bold flex items-center gap-3 text-gray-800 mb-6 border-b pb-4">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Edit2 size={24} />
                        </div>
                        Postagem Manual de Imagem
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            {/* Post Type Selector */}
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Onde postar?</label>
                                <div className="flex p-1 bg-gray-100 rounded-xl">
                                    <button
                                        onClick={() => setPostType('feed')}
                                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${postType === 'feed'
                                            ? 'bg-white text-purple-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        📄 Feed (Post)
                                    </button>
                                    <button
                                        onClick={() => setPostType('story')}
                                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${postType === 'story'
                                            ? 'bg-white text-purple-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        📸 Story
                                    </button>
                                </div>
                            </div>

                            {/* Account Selector */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Conta do Instagram</label>
                                {accounts.length === 0 ? (
                                    <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 text-sm">
                                        Nenhuma conta conectada. Conecte em "Contas".
                                    </div>
                                ) : (
                                    <select
                                        value={selectedAccountId}
                                        onChange={(e) => setSelectedAccountId(e.target.value)}
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-gray-800 font-medium"
                                    >
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.name || acc.username || `Conta ${acc.id}`}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>


                            {/* Image URL Input */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">URL da Imagem (Obrigatória)</label>
                                <input
                                    type="text"
                                    value={manualImageUrl}
                                    onChange={(e) => setManualImageUrl(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all font-medium"
                                    placeholder="https://exemplo.com/imagem.jpg"
                                />
                                <p className="text-xs text-gray-500 mt-2">O Instagram Graph API requer uma URL pública válida da imagem.</p>
                            </div>

                            {/* Caption Input */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Legenda / Texto do Post</label>
                                <textarea
                                    value={manualMessage}
                                    onChange={(e) => setManualMessage(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all font-medium min-h-[160px]"
                                    placeholder="Escreva a legenda..."
                                />
                            </div>
                        </div>

                        <div className="flex flex-col justify-end space-y-4">
                            {/* Image Preview */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 h-full flex flex-col items-center justify-center min-h-[300px] shadow-inner mb-4">
                                {manualImageUrl ? (
                                    <img src={manualImageUrl} alt="Preview do Instagram" className="object-contain max-h-[350px] rounded-lg shadow-md" onError={(e: any) => e.target.style.display = 'none'} />
                                ) : (
                                    <div className="text-center text-gray-400 p-8">
                                        <Instagram size={48} className="mx-auto mb-2 opacity-50" />
                                        <p>Preview da Imagem</p>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleManualPost}
                                disabled={manualLoading || !accounts.length || !manualImageUrl}
                                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 transition-all flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                            >
                                {manualLoading ? 'Publicando...' : '🚀 Publicar Agora'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Gemini Config Modal */}
            {
                showGeminiConfig && (
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
                )
            }
        </div >
    );
};

// Video Row Component
const VideoRow: React.FC<any> = ({ video, index, onGenerateCaption, onUpdateVideo, onDelete, geminiConfigured, selected, onToggleSelection }) => {
    const [editing, setEditing] = useState(false);
    const [caption, setCaption] = useState(video.caption || '');
    const [title, setTitle] = useState(video.title || video.video_path.split('/').pop() || '');

    const handleSaveCaption = () => {
        onUpdateVideo(video.id, { caption });
        setEditing(false);
    };

    const handleTitleBlur = () => {
        if (title !== video.title) {
            onUpdateVideo(video.id, { title });
        }
    };

    return (
        <div className={`grid grid-cols-12 gap-4 p-4 border-b transition items-start ${selected ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
            <div className="col-span-1 pt-2">
                <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={selected}
                    onChange={onToggleSelection}
                />
            </div>
            <div className="col-span-1">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center text-white">
                    <Instagram size={24} />
                </div>
            </div>
            <div className="col-span-2 pt-2">
                <p className="text-xs text-green-600">✓ Pronto para postar</p>
            </div>
            <div className="col-span-2 pt-2">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    className="w-full text-sm border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
                />
            </div>
            <div className="col-span-3">
                {editing ? (
                    <div className="space-y-2">
                        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full p-2 border rounded-lg text-sm h-20" />
                        <div className="flex gap-2">
                            <button onClick={handleSaveCaption} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">Salvar</button>
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
