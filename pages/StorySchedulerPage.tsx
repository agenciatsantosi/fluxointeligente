import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageIcon, Clock, Trash2, Play, Loader, Plus, Calendar, Upload, Link, Settings, X } from 'lucide-react';
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
    const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [rawUrls, setRawUrls] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState('09:00');
    const [intervalMinutes, setIntervalMinutes] = useState(60);
    const [repeatDays, setRepeatDays] = useState(1);
    const [showNgrokConfig, setShowNgrokConfig] = useState(false);
    const [ngrokUrl, setNgrokUrl] = useState('');
    const [currentPublicUrl, setCurrentPublicUrl] = useState('');
    const [queue, setQueue] = useState<StoryItem[]>([]);
    const [queueLoading, setQueueLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [currentPostIndex, setCurrentPostIndex] = useState(0);
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
            const res = await api.get(`/story-queue?platform=${platform}&status=pending&_t=${Date.now()}`);
            if (res.data.success) setQueue(res.data.queue);
        } catch { /* silent */ }
        finally { setQueueLoading(false); }
    };

    const handleFiles = useCallback(async (rawFiles: FileList | null) => {
        if (!rawFiles || rawFiles.length === 0) return;
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
                    preview: f.url
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

    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

    const getAllStories = (): UploadedFile[] => {
        if (inputMode === 'upload') return files;
        const urls = rawUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
        return urls.map(u => ({
            mediaUrl: u,
            mediaType: (/\.mp4|\.mov|\.avi/i.test(u) ? 'video' : 'image') as 'image' | 'video',
            originalName: u.split('/').pop() || u
        }));
    };

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

    const handleConfirm = async () => {
        if (!selectedAccountId) { showNotif('❌ Selecione uma conta', 'error'); return; }
        const stories = getAllStories();
        if (stories.length === 0) { showNotif('❌ Adicione ao menos um arquivo ou URL', 'error'); return; }
        setPosting(true);
        try {
            if (scheduleMode === 'now') {
                let success = 0, failed = 0;
                setCurrentPostIndex(0);
                for (let i = 0; i < stories.length; i++) {
                    const s = stories[i];
                    setCurrentPostIndex(i + 1);
                    try {
                        const endpoint = platform === 'instagram' ? '/instagram/post-now' : '/facebook/post-now';
                        const payload = platform === 'instagram'
                            ? { sendMode: 'manual', postType: 'story', manualImageUrl: s.mediaUrl, accountId: selectedAccountId }
                            : { sendMode: 'manual', postType: 'story', manualImageUrl: s.mediaUrl, pages: (pages || []).filter((p: any) => p.id === selectedAccountId) };
                        const res = await api.post(endpoint, payload);
                        if (res.data.success) success++; else failed++;
                        if (i < stories.length - 1) await new Promise(r => setTimeout(r, 1000));
                    } catch { failed++; }
                }
                showNotif(`✅ ${success} Story(ies) publicado(s)! ${failed > 0 ? `❌ ${failed} falharam` : ''}`, success > 0 ? 'success' : 'error');
            } else {
                const scheduledStories: any[] = [];
                for (let dayOffset = 0; dayOffset < repeatDays; dayOffset++) {
                    stories.forEach((s, i) => {
                        const base = new Date(`${startDate}T${startTime}:00`);
                        base.setDate(base.getDate() + dayOffset);
                        base.setMinutes(base.getMinutes() + i * intervalMinutes);
                        scheduledStories.push({ mediaUrl: s.mediaUrl, mediaType: s.mediaType, scheduledTime: base.toISOString() });
                    });
                }
                const res = await api.post('/story-queue/bulk', { platform, accountId: selectedAccountId, stories: scheduledStories });
                if (res.data.success) { showNotif(`✅ ${res.data.added} Stories agendados!`, 'success'); loadQueue(); }
                else showNotif(`❌ ${res.data.error}`, 'error');
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
        <div className="space-y-6 font-sans">

            {/* Toast */}
            {notification && (
                <div className={`fixed top-6 right-6 z-50 px-8 py-5 border-l-4 flex items-center gap-4 bg-white shadow-2xl animate-in slide-in-from-right-8 duration-300 ${
                    notification.type === 'success' ? 'border-purple-500' :
                    notification.type === 'error' ? 'border-red-500' :
                    'border-gray-400'
                } rounded-xl`}>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] mb-0.5 text-gray-400">NOTIFICAÇÃO_SISTEMA</span>
                        <span className="text-sm font-bold text-gray-900">{notification.message}</span>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white border border-gray-100 w-full max-w-lg shadow-2xl rounded-3xl overflow-hidden"
                    >
                        <div className="px-10 py-7 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block mb-1">PROTOCOLO_DISPARO_STORY</span>
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">{allStories.length}_STORIES_PRONTOS</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-10 space-y-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {platform === 'instagram' ? 'CONTA_DESTINO' : 'PÁGINA_DESTINO'}
                                </label>
                                <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:border-purple-400 outline-none text-sm text-gray-900 font-bold uppercase tracking-widest">
                                    {entityList.map((acc: any) => (
                                        <option key={acc.id} value={acc.id}>{acc.name || acc.username || acc.id}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex p-1 bg-gray-50 border border-gray-100 rounded-2xl gap-1">
                                <button onClick={() => setScheduleMode('now')}
                                    className={`flex-1 py-4 text-[10px] font-black transition-all flex items-center justify-center gap-2 uppercase tracking-widest rounded-xl ${scheduleMode === 'now' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'}`}>
                                    <Play size={14} fill="currentColor" /> AGORA
                                </button>
                                <button onClick={() => setScheduleMode('schedule')}
                                    className={`flex-1 py-4 text-[10px] font-black transition-all flex items-center justify-center gap-2 uppercase tracking-widest rounded-xl ${scheduleMode === 'schedule' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'}`}>
                                    <Calendar size={14} /> AGENDAR
                                </button>
                            </div>

                            {scheduleMode === 'schedule' && (
                                <div className="grid grid-cols-2 gap-4 p-6 bg-purple-50 border border-purple-100 rounded-2xl">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">DATA_INÍCIO</label>
                                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:border-purple-400" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">HORA_INÍCIO</label>
                                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:border-purple-400" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">REPETIR_DIAS</label>
                                        <input type="number" min={1} max={30} value={repeatDays} onChange={e => setRepeatDays(Number(e.target.value))}
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:border-purple-400" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">INTERVALO_MIN</label>
                                        <input type="number" min={5} value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))}
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 outline-none focus:border-purple-400" />
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-[10px] text-purple-600 font-black">→ {allStories.length * repeatDays} DISPAROS EM FILA POR {repeatDays} DIA(S)</span>
                                    </div>
                                </div>
                            )}

                            {/* Preview strip */}
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                {allStories.slice(0, 8).map((s, i) => (
                                    <div key={i} className="flex-shrink-0 w-12 h-16 bg-gray-900 rounded-lg overflow-hidden relative shadow-md">
                                        {s.mediaType === 'video' ? (
                                            <video src={s.mediaUrl.startsWith('http') ? s.mediaUrl : `/${s.mediaUrl}`}
                                                className="w-full h-full object-cover" muted autoPlay loop playsInline />
                                        ) : (
                                            <img src={s.mediaUrl} alt="" className="w-full h-full object-cover"
                                                onError={(e: any) => e.target.style.display = 'none'} />
                                        )}
                                        <div className="absolute bottom-0 inset-x-0 text-[8px] text-center bg-gray-900/80 text-white font-black py-0.5">
                                            {s.mediaType === 'video' ? 'VID' : 'IMG'}
                                        </div>
                                    </div>
                                ))}
                                {allStories.length > 8 && (
                                    <div className="flex-shrink-0 w-12 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
                                        <span className="text-[10px] text-gray-400 font-black">+{allStories.length - 8}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4">
                                <button onClick={() => !posting && setShowModal(false)} disabled={posting}
                                    className="flex-1 py-4 bg-gray-50 border border-gray-200 text-gray-400 font-black text-xs uppercase tracking-widest hover:text-gray-900 hover:border-gray-300 transition-all disabled:opacity-50 rounded-2xl">
                                    CANCELAR
                                </button>
                                <button onClick={handleConfirm} disabled={posting}
                                    className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs uppercase tracking-widest hover:shadow-xl hover:shadow-purple-200 transition-all rounded-2xl flex flex-col items-center justify-center gap-1 relative overflow-hidden">
                                    {posting ? (
                                        <>
                                            <div className="absolute inset-0 bg-white/10">
                                                <div className="h-full bg-white/30 transition-all duration-500"
                                                    style={{ width: `${(currentPostIndex / allStories.length) * 100}%` }} />
                                            </div>
                                            <div className="relative flex items-center gap-2">
                                                <Loader size={14} className="animate-spin" /> {currentPostIndex} / {allStories.length}
                                            </div>
                                        </>
                                    ) : (
                                        <>{scheduleMode === 'now' ? `EXECUTAR_${allStories.length}` : `AGENDAR_${allStories.length}`}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* ngrok config */}
            {showNgrokConfig && (
                <div className="bg-white border border-gray-100 rounded-3xl p-8 space-y-6 shadow-xl">
                    <div className="flex items-center gap-3">
                        <Settings size={16} className="text-purple-600" />
                        <h4 className="font-black text-gray-900 uppercase tracking-widest text-xs">CONFIGURAÇÃO_URL_PÚBLICA</h4>
                    </div>
                    <p className="text-[11px] text-gray-400 font-bold">
                        URL atual: <span className="text-purple-600 font-black">{currentPublicUrl || 'NÃO_DEFINIDA'}</span>
                    </p>
                    <div className="flex gap-3">
                        <input type="text" value={ngrokUrl} onChange={e => setNgrokUrl(e.target.value)}
                            placeholder="https://xxxx.ngrok-free.app"
                            className="flex-1 p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:border-purple-400 outline-none text-sm text-gray-900 placeholder:text-gray-300" />
                        <button onClick={handleSaveNgrok}
                            className="px-8 py-4 bg-purple-600 text-white font-black text-xs uppercase tracking-widest hover:bg-purple-700 transition-all rounded-2xl shadow-lg shadow-purple-100">
                            SALVAR
                        </button>
                    </div>
                </div>
            )}

            {/* Main Upload Card */}
            <div className="bg-white border border-gray-100 rounded-3xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200">
                            <ImageIcon size={24} className="text-white" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block mb-0.5">UPLOAD_EM_MASSA</span>
                            <h3 className="font-black text-gray-900 text-xl tracking-tight leading-none">Distribuição de Stories</h3>
                        </div>
                    </div>
                    <button onClick={() => setShowNgrokConfig(!showNgrokConfig)}
                        className={`w-10 h-10 border flex items-center justify-center transition-all rounded-xl shadow-sm ${showNgrokConfig ? 'border-purple-600 text-purple-600 bg-purple-50' : 'bg-white border-gray-100 text-gray-400 hover:border-purple-200 hover:text-purple-600'}`}
                        title="Configurar URL pública">
                        <Settings size={18} />
                    </button>
                </div>

                {/* Mode Tabs */}
                <div className="flex p-2 bg-gray-50/50 border-b border-gray-100 gap-2">
                    <button onClick={() => setInputMode('upload')}
                        className={`flex-1 py-4 text-[11px] font-black flex items-center justify-center gap-3 transition-all uppercase tracking-widest rounded-xl ${
                            inputMode === 'upload' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'
                        }`}>
                        <Upload size={16} /> CARREGAR_ARQUIVOS
                    </button>
                    <button onClick={() => setInputMode('url')}
                        className={`flex-1 py-4 text-[11px] font-black flex items-center justify-center gap-3 transition-all uppercase tracking-widest rounded-xl ${
                            inputMode === 'url' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'
                        }`}>
                        <Link size={16} /> INJETAR_URL
                    </button>
                </div>

                <div className="p-8">
                    {inputMode === 'upload' ? (
                        <div className="space-y-6">
                            {/* Drop Zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                                className={`relative border-2 border-dashed p-14 cursor-pointer transition-all text-center rounded-3xl ${
                                    isDragging ? 'border-purple-400 bg-purple-50' : 'border-gray-100 bg-gray-50 hover:border-purple-200 hover:bg-white'
                                } group`}>
                                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden"
                                    onChange={e => handleFiles(e.target.files)} />
                                <div className="relative mx-auto w-16 h-16 mb-6">
                                    <div className={`absolute inset-0 border-2 rounded-2xl transition-all ${isDragging ? 'border-purple-400' : 'border-gray-200 group-hover:border-purple-300'}`}></div>
                                    <div className={`absolute inset-2 flex items-center justify-center transition-transform duration-300 ${isDragging ? '-translate-y-1' : ''}`}>
                                        <Upload size={28} className={isDragging ? 'text-purple-600' : 'text-gray-300 group-hover:text-purple-400'} />
                                    </div>
                                    {isDragging && <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-600 rounded-full"></div>}
                                </div>
                                <p className="font-black text-gray-900 text-sm uppercase tracking-widest mb-2">ARRASTE_ARQUIVOS // OU_CLIQUE_AQUI</p>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">JPG · PNG · MP4 · MOV · Até 20 arquivos</p>

                                {uploading && uploadProgress > 0 && (
                                    <div className="mt-8 max-w-xs mx-auto">
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                        <p className="text-[10px] text-purple-600 font-black mt-3 uppercase tracking-widest">
                                            {uploadProgress < 100 ? `CARREGANDO... ${uploadProgress}%` : 'TRANSFERÊNCIA_CONCLUÍDA'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Files Preview Grid */}
                            {files.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {files.map((f, i) => (
                                        <div key={i} className="relative group border border-gray-100 rounded-2xl overflow-hidden hover:border-purple-300 transition-all shadow-sm">
                                            <div className="aspect-[9/16] bg-gray-900">
                                                {f.mediaType === 'image' && f.preview ? (
                                                    <img src={f.preview} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-white/50">
                                                        <span className="text-2xl">{f.mediaType === 'video' ? '🎬' : '🖼️'}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all"></div>
                                            <p className="absolute bottom-2 left-2 right-2 text-[8px] text-white font-black truncate p-1 uppercase backdrop-blur-md bg-white/10 rounded-lg">{f.originalName}</p>
                                            <button onClick={() => removeFile(i)}
                                                className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-xl flex items-center justify-center shadow-lg transform scale-0 group-hover:scale-100 transition-all hover:bg-red-600">
                                                <X size={14} className="text-white" />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={() => fileInputRef.current?.click()}
                                        className="aspect-[9/16] border-2 border-dashed border-gray-100 rounded-2xl hover:border-purple-300 hover:bg-purple-50 flex items-center justify-center text-gray-300 hover:text-purple-600 transition-all">
                                        <Plus size={32} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Cole as URLs dos arquivos (<strong className="text-gray-900">uma por linha</strong>).</p>
                            <textarea value={rawUrls} onChange={e => setRawUrls(e.target.value)}
                                placeholder={"https://exemplo.com/story1.jpg\nhttps://exemplo.com/video.mp4"}
                                className="w-full h-40 p-6 bg-gray-50 border border-gray-100 rounded-2xl focus:border-purple-400 outline-none font-sans text-sm text-gray-900 placeholder:text-gray-300 resize-none shadow-inner" />
                        </div>
                    )}

                    {/* Confirm Button */}
                    <button
                        onClick={() => setShowModal(true)}
                        disabled={allStories.length === 0 || uploading}
                        className="mt-8 w-full py-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs uppercase tracking-[0.3em] hover:shadow-2xl hover:shadow-purple-200 transition-all disabled:opacity-40 flex items-center justify-center gap-4 rounded-3xl"
                    >
                        <Plus size={20} />
                        CONTINUAR_PROTOCOL ({allStories.length} {allStories.length === 1 ? 'STORY' : 'STORIES'})
                    </button>
                </div>
            </div>

            {/* Queue */}
            {queue.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-3xl shadow-xl overflow-hidden">
                    <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-sm">
                                <Clock size={22} className="text-purple-600" />
                            </div>
                            <div>
                                <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest block mb-0.5">DISPAROS_PENDENTES</span>
                                <h3 className="font-black text-gray-900 tracking-tight leading-none text-xl">Fila de Stories ({queue.length})</h3>
                            </div>
                        </div>
                        {queueLoading && <Loader size={18} className="animate-spin text-purple-400" />}
                    </div>

                    <div className="divide-y divide-gray-50">
                        {queue.map(story => (
                            <div key={story.id} className="flex items-center gap-6 px-10 py-6 hover:bg-gray-50/50 transition-all group">
                                <div className="w-16 h-24 flex-shrink-0 bg-gray-900 rounded-2xl overflow-hidden shadow-lg group-hover:scale-105 transition-all duration-500">
                                    {story.media_type === 'video' ? (
                                        <video
                                            src={story.media_url.startsWith('http') ? story.media_url : (story.media_url.startsWith('/') ? story.media_url : `/${story.media_url}`)}
                                            className="w-full h-full object-cover" muted playsInline />
                                    ) : (
                                        <img src={story.media_url} alt="" className="w-full h-full object-cover"
                                            onError={(e: any) => e.target.style.display = 'none'} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-2">
                                    <p className="text-xs font-black text-gray-900 truncate uppercase tracking-widest">{story.media_url.split('/').pop()}</p>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg text-gray-500 text-[10px] font-bold">
                                            <Clock size={12} /> {formatDate(story.scheduled_time)}
                                        </div>
                                        <div className="px-3 py-1 bg-purple-50 text-[10px] font-black text-purple-600 uppercase tracking-widest rounded-lg">
                                            PENDENTE
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => handlePostQueued(story.id)} title="Publicar agora"
                                        className="w-12 h-12 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:bg-purple-600 hover:text-white hover:border-purple-600 transition-all shadow-sm">
                                        <Play size={16} fill="currentColor" />
                                    </button>
                                    <button onClick={() => handleDeleteQueued(story.id)} title="Remover"
                                        className="w-12 h-12 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shadow-sm">
                                        <Trash2 size={16} />
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
