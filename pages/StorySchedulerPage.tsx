import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ImageIcon, Clock, Trash2, Play, Loader, Plus, Calendar, Upload, Link, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';

interface StorySchedulerPageProps {
    platform: 'instagram' | 'facebook';
    accounts: any[];
    pages?: any[];
}

interface UploadedFile {
    mediaUrl: string;
    mediaType: 'image' | 'video';
    originalName: string;
    preview?: string;
}

interface StoryItem {
    id: number;
    media_url: string;
    media_type: string;
    status: string;
    scheduled_time: string | null;
    platform: string;
    account_id: string;
    created_at: string;
}

const StorySchedulerPage: React.FC<StorySchedulerPageProps> = ({ platform, accounts, pages }) => {
    const entityList = platform === 'instagram' ? accounts : (pages || []);
    const [selectedAccountId, setSelectedAccountId] = useState<string>(entityList[0]?.id || '');

    // Input mode: 'upload' or 'url'
    const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');

    // File upload state
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // URL input state
    const [rawUrls, setRawUrls] = useState('');

    // Modal / schedule state
    const [showModal, setShowModal] = useState(false);
    const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState('09:00');
    const [intervalMinutes, setIntervalMinutes] = useState(60);

    // ngrok config
    const [showNgrokConfig, setShowNgrokConfig] = useState(false);
    const [ngrokUrl, setNgrokUrl] = useState('');
    const [currentPublicUrl, setCurrentPublicUrl] = useState('');

    // Queue
    const [queue, setQueue] = useState<StoryItem[]>([]);
    const [queueLoading, setQueueLoading] = useState(false);

    // Actions
    const [posting, setPosting] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    const showNotif = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), type === 'error' ? 10000 : 5000);
    };

    useEffect(() => {
        loadQueue();
        loadPublicUrl();
        const interval = setInterval(loadQueue, 15000);
        return () => clearInterval(interval);
    }, [platform]);

    const loadPublicUrl = async () => {
        try {
            const res = await api.get('/config/public-url');
            if (res.data.success) setCurrentPublicUrl(res.data.publicUrl);
        } catch { /* silent */ }
    };

    const loadQueue = async () => {
        setQueueLoading(true);
        try {
            const res = await api.get(`/story-queue?platform=${platform}&status=pending`);
            if (res.data.success) setQueue(res.data.queue);
        } catch { /* silent */ }
        finally { setQueueLoading(false); }
    };

    // ── File Upload Handler ──
    const handleFiles = useCallback(async (rawFiles: FileList | null) => {
        if (!rawFiles || rawFiles.length === 0) return;

        // Show progress UI immediately
        setUploading(true);
        setUploadProgress(10);

        const formData = new FormData();
        Array.from(rawFiles).forEach(f => formData.append('files', f));

        try {
            const res = await api.post('/story-queue/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e: any) => {
                    const percent = Math.round((e.loaded * 90) / e.total);
                    setUploadProgress(10 + percent);
                }
            });

            if (res.data.success) {
                const uploaded: UploadedFile[] = res.data.files.map((f: any) => ({
                    mediaUrl: f.url,
                    mediaType: f.mediaType,
                    originalName: f.originalName,
                    preview: f.mediaType === 'image' ? f.url : undefined
                }));
                setFiles(prev => [...prev, ...uploaded]);
                setUploadProgress(100);
                showNotif(`✅ ${uploaded.length} arquivo(s) enviado(s)!`, 'success');
            } else {
                showNotif(`❌ ${res.data.error}`, 'error');
            }
        } catch (err: any) {
            showNotif(`❌ Erro no upload: ${err.response?.data?.error || err.message}`, 'error');
        } finally {
            setUploading(false);
            setTimeout(() => setUploadProgress(0), 1500);
        }
    }, []);

    // Drag & Drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

    // ── Merge URL mode with upload mode ──
    const getAllStories = (): UploadedFile[] => {
        if (inputMode === 'upload') return files;
        const urls = rawUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
        return urls.map(u => ({
            mediaUrl: u,
            mediaType: (/\.mp4|\.mov|\.avi/i.test(u) ? 'video' : 'image') as 'image' | 'video',
            originalName: u.split('/').pop() || u
        }));
    };

    // ── Save ngrok URL ──
    const handleSaveNgrok = async () => {
        if (!ngrokUrl.startsWith('http')) { showNotif('❌ URL inválida', 'error'); return; }
        try {
            const res = await api.post('/config/public-url', { url: ngrokUrl });
            if (res.data.success) {
                setCurrentPublicUrl(res.data.publicUrl);
                showNotif(`✅ URL pública salva: ${res.data.publicUrl}`, 'success');
                setShowNgrokConfig(false);
            }
        } catch { showNotif('❌ Erro ao salvar URL', 'error'); }
    };

    // ── Confirm publish/schedule ──
    const handleConfirm = async () => {
        if (!selectedAccountId) { showNotif('❌ Selecione uma conta', 'error'); return; }
        const stories = getAllStories();
        if (stories.length === 0) { showNotif('❌ Adicione ao menos um arquivo ou URL', 'error'); return; }

        setPosting(true);
        try {
            if (scheduleMode === 'now') {
                let success = 0, failed = 0;
                for (const s of stories) {
                    try {
                        const endpoint = platform === 'instagram' ? '/instagram/post-now' : '/facebook/post-now';
                        const payload = platform === 'instagram'
                            ? { sendMode: 'manual', postType: 'story', manualImageUrl: s.mediaUrl, accountId: selectedAccountId }
                            : { sendMode: 'manual', postType: 'story', manualImageUrl: s.mediaUrl, pages: (pages || []).filter((p: any) => p.id === selectedAccountId) };
                        const res = await api.post(endpoint, payload);
                        if (res.data.success) success++; else failed++;
                        await new Promise(r => setTimeout(r, 3000));
                    } catch { failed++; }
                }
                showNotif(`✅ ${success} Story(ies) publicado(s)! ${failed > 0 ? `❌ ${failed} falharam` : ''}`, success > 0 ? 'success' : 'error');
            } else {
                const scheduledStories = stories.map((s, i) => {
                    const base = new Date(`${startDate}T${startTime}:00`);
                    base.setMinutes(base.getMinutes() + i * intervalMinutes);
                    return { mediaUrl: s.mediaUrl, mediaType: s.mediaType, scheduledTime: base.toISOString() };
                });
                const res = await api.post('/story-queue/bulk', { platform, accountId: selectedAccountId, stories: scheduledStories });
                if (res.data.success) {
                    showNotif(`✅ ${res.data.added} Stories agendados!`, 'success');
                    loadQueue();
                } else showNotif(`❌ ${res.data.error}`, 'error');
            }
        } catch (err: any) {
            showNotif(`❌ ${err.response?.data?.error || err.message}`, 'error');
        } finally {
            setPosting(false);
            setShowModal(false);
            setFiles([]);
            setRawUrls('');
        }
    };

    const handlePostQueued = async (id: number) => {
        try {
            const res = await api.post(`/story-queue/${id}/post-now`);
            if (res.data.success) { showNotif('✅ Story publicado!', 'success'); loadQueue(); }
            else showNotif(`❌ ${res.data.error}`, 'error');
        } catch (err: any) { showNotif(`❌ ${err.message}`, 'error'); }
    };

    const handleDeleteQueued = async (id: number) => {
        try { await api.delete(`/story-queue/${id}`); loadQueue(); }
        catch { showNotif('❌ Erro ao remover', 'error'); }
    };

    const formatDate = (dt: string | null) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    const allStories = getAllStories();

    return (
        <div className="space-y-5">

            {/* Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl max-w-sm text-white font-bold text-sm
                    ${notification.type === 'success' ? 'bg-green-500' : notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
                    {notification.message}
                </div>
            )}

            {/* Schedule/Post Now Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-5 text-white">
                            <h2 className="text-2xl font-bold">📸 {allStories.length} Stories Prontos</h2>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="text-sm font-bold text-gray-700 block mb-2">
                                    {platform === 'instagram' ? 'Conta Instagram' : 'Página Facebook'}
                                </label>
                                <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
                                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 outline-none">
                                    {entityList.map((acc: any) => (
                                        <option key={acc.id} value={acc.id}>{acc.name || acc.username || acc.id}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                <button onClick={() => setScheduleMode('now')}
                                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2
                                        ${scheduleMode === 'now' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}>
                                    <Play size={15} /> Postar Agora
                                </button>
                                <button onClick={() => setScheduleMode('schedule')}
                                    className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2
                                        ${scheduleMode === 'schedule' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}>
                                    <Calendar size={15} /> Agendar
                                </button>
                            </div>

                            {scheduleMode === 'schedule' && (
                                <div className="grid grid-cols-3 gap-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 block mb-1">Data</label>
                                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                            className="w-full p-2 border rounded-lg text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 block mb-1">Hora</label>
                                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                                            className="w-full p-2 border rounded-lg text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 block mb-1">Intervalo (min)</label>
                                        <input type="number" min={5} value={intervalMinutes}
                                            onChange={e => setIntervalMinutes(Number(e.target.value))}
                                            className="w-full p-2 border rounded-lg text-sm" />
                                    </div>
                                    <div className="col-span-3 text-xs text-purple-600">
                                        📅 1° story às {startDate} {startTime} — último +{(allStories.length - 1) * intervalMinutes} min
                                    </div>
                                </div>
                            )}

                            {/* Preview list */}
                            <div className="max-h-40 overflow-y-auto space-y-2">
                                {allStories.slice(0, 8).map((s, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                                            {s.preview ? (
                                                <img src={s.preview} alt="" className="w-full h-full object-cover" onError={(e: any) => e.target.style.display = 'none'} />
                                            ) : <div className="w-full h-full flex items-center justify-center text-lg">{s.mediaType === 'video' ? '🎬' : '🖼️'}</div>}
                                        </div>
                                        <span className="flex-1 text-xs text-gray-600 truncate">{s.originalName}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${s.mediaType === 'video' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                                            {s.mediaType}
                                        </span>
                                    </div>
                                ))}
                                {allStories.length > 8 && (
                                    <p className="text-center text-xs text-gray-400">+{allStories.length - 8} mais...</p>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition">
                                    Cancelar
                                </button>
                                <button onClick={handleConfirm} disabled={posting}
                                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                    {posting ? <><Loader size={15} className="animate-spin" /> Processando...</> :
                                        scheduleMode === 'now' ? `🚀 Publicar ${allStories.length}` : `📅 Agendar ${allStories.length}`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ngrok config panel */}
            {showNgrokConfig && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-amber-800 flex items-center gap-2"><Settings size={16} /> URL Pública (ngrok)</h4>
                    <p className="text-xs text-amber-700">
                        Cole aqui o URL do ngrok para que as mídias enviadas fiquem acessíveis pelo Instagram.
                        <br />URL atual: <code className="bg-amber-100 px-1 rounded">{currentPublicUrl}</code>
                    </p>
                    <div className="flex gap-2">
                        <input type="text" value={ngrokUrl} onChange={e => setNgrokUrl(e.target.value)}
                            placeholder="https://xxxx.ngrok-free.app"
                            className="flex-1 p-2 border border-amber-300 rounded-lg text-sm focus:border-amber-500 outline-none" />
                        <button onClick={handleSaveNgrok}
                            className="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600">
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main Upload Card ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <ImageIcon size={20} className="text-purple-500" />
                        Postar Stories em Massa
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowNgrokConfig(!showNgrokConfig)}
                            className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
                            title="Configurar URL ngrok">
                            <Settings size={18} />
                        </button>
                    </div>
                </div>

                {/* Mode tabs */}
                <div className="flex border-b">
                    <button onClick={() => setInputMode('upload')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition border-b-2
                            ${inputMode === 'upload' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        <Upload size={15} /> Upload de Arquivos
                    </button>
                    <button onClick={() => setInputMode('url')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition border-b-2
                            ${inputMode === 'url' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        <Link size={15} /> Colar URLs
                    </button>
                </div>

                <div className="p-6">
                    {inputMode === 'upload' ? (
                        <div className="space-y-4">
                            {/* Drop zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                                className={`relative border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all text-center
                                    ${isDragging ? 'border-purple-400 bg-purple-50 scale-[1.01]' : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'}`}
                            >
                                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden"
                                    onChange={e => handleFiles(e.target.files)} />
                                <Upload size={36} className={`mx-auto mb-3 ${isDragging ? 'text-purple-500' : 'text-gray-400'}`} />
                                <p className="font-bold text-gray-700">Arraste os arquivos ou clique para selecionar</p>
                                <p className="text-sm text-gray-400 mt-1">Imagens (JPG, PNG, GIF) e Vídeos (MP4, MOV) • Até 20 arquivos • 100MB cada</p>

                                {/* Upload progress */}
                                {uploading && uploadProgress > 0 && (
                                    <div className="mt-4">
                                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                                                style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                        <p className="text-xs text-purple-500 mt-1">{uploadProgress < 100 ? 'Enviando...' : 'Concluído!'}</p>
                                    </div>
                                )}
                            </div>

                            {/* Uploaded files preview */}
                            {files.length > 0 && (
                                <div className="grid grid-cols-4 gap-3">
                                    {files.map((f, i) => (
                                        <div key={i} className="relative group">
                                            <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border">
                                                {f.mediaType === 'image' && f.preview ? (
                                                    <img src={f.preview} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                                        <span className="text-3xl">{f.mediaType === 'video' ? '🎬' : '🖼️'}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 truncate mt-1">{f.originalName}</p>
                                            <button onClick={() => removeFile(i)}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {/* Add more button */}
                                    <button onClick={() => fileInputRef.current?.click()}
                                        className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-purple-400 flex items-center justify-center text-gray-400 hover:text-purple-500 transition">
                                        <Plus size={24} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500">Cole as URLs das imagens/vídeos (<strong>uma por linha</strong>).</p>
                            <textarea value={rawUrls} onChange={e => setRawUrls(e.target.value)}
                                placeholder={"https://exemplo.com/story1.jpg\nhttps://exemplo.com/video.mp4"}
                                className="w-full h-36 p-4 bg-gray-50 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-purple-400 outline-none resize-none" />
                        </div>
                    )}

                    {/* Continue button */}
                    <button
                        onClick={() => setShowModal(true)}
                        disabled={allStories.length === 0 || uploading}
                        className="mt-5 w-full py-3.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-bold hover:opacity-90 transition disabled:opacity-40 flex items-center justify-center gap-2 text-base"
                    >
                        <Plus size={18} />
                        Continuar ({allStories.length} {allStories.length === 1 ? 'story' : 'stories'})
                    </button>
                </div>
            </div>

            {/* ── Queue ── */}
            {queue.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b flex items-center justify-between">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Clock size={18} className="text-blue-500" />
                            Stories Agendados ({queue.length})
                        </h3>
                        {queueLoading && <Loader size={15} className="animate-spin text-gray-400" />}
                    </div>
                    <div className="divide-y">
                        {queue.map(story => (
                            <div key={story.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
                                <div className="w-11 h-11 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 border">
                                    {story.media_type === 'image'
                                        ? <img src={story.media_url} alt="" className="w-full h-full object-cover" onError={(e: any) => e.target.style.display = 'none'} />
                                        : <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{story.media_url}</p>
                                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                        <Clock size={10} /> {formatDate(story.scheduled_time)}
                                    </p>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-yellow-100 text-yellow-700 flex-shrink-0">⏳ Pendente</span>
                                <div className="flex gap-2">
                                    <button onClick={() => handlePostQueued(story.id)} title="Publicar agora"
                                        className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition">
                                        <Play size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteQueued(story.id)} title="Remover"
                                        className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StorySchedulerPage;
