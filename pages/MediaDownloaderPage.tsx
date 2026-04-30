import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Download, Link as LinkIcon, Instagram, Facebook, Video, Image as ImageIcon,
    Loader2, AlertCircle, CheckCircle2, Send, X, MessageSquare,
    Calendar, Clock, Trash2, RefreshCw, Play, List, ChevronDown, Plus, Users, Copy, Check
} from 'lucide-react';
import api from '../services/api';

interface MediaInfo { title: string; thumbnail: string; mediaUrl: string; type: 'video' | 'image'; platform: string; sourceUrl: string; }
interface SocialAccount { id: string; name: string; username?: string; platform: 'instagram' | 'facebook'; account_id?: string; }
interface ScheduledPost { id: number; source_url: string; media_type: string; platform: string; account_id: string; caption: string; scheduled_at: string; status: string; error_message?: string; }

// Selected account = platform + id combo
interface SelectedAccount { platform: 'instagram' | 'facebook'; accountId: string; name: string; }

const statusColor: Record<string, string> = {
    pending: 'text-yellow-600 bg-yellow-50',
    processing: 'text-blue-600 bg-blue-50',
    completed: 'text-green-600 bg-green-50',
    failed: 'text-red-600 bg-red-50',
};

const MediaDownloaderPage: React.FC = () => {
    // URL input
    const [urlsText, setUrlsText] = useState('');
    const [batchMode, setBatchMode] = useState(false);
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mediaItems, setMediaItems] = useState<MediaInfo[]>([]);

    // Accounts — multi-select
    const [accounts, setAccounts] = useState<{ facebook: SocialAccount[]; instagram: SocialAccount[] }>({ facebook: [], instagram: [] });
    const [selectedAccounts, setSelectedAccounts] = useState<SelectedAccount[]>([]);
    const [postCaption, setPostCaption] = useState('');
    const [copied, setCopied] = useState(false);

    // Post modal
    const [selectedItem, setSelectedItem] = useState<MediaInfo | null>(null);
    const [copyingId, setCopyingId] = useState<number | null>(null);
    const [isPostModalOpen, setIsPostModalOpen] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [postSuccess, setPostSuccess] = useState<string | null>(null);
    const [postError, setPostError] = useState<string | null>(null);
    const [postLogs, setPostLogs] = useState<string[]>([]);
    const [postResults, setPostResults] = useState<{ name: string; ok: boolean; msg: string }[]>([]);

    // Schedule wizard
    const [scheduleMode, setScheduleMode] = useState(false);
    const [wizardStep, setWizardStep] = useState<1 | 2>(1);
    const [postsPerDay, setPostsPerDay] = useState(2);
    const [timeSlots, setTimeSlots] = useState<string[]>(['09:00', '18:00']);
    const [newTimeInput, setNewTimeInput] = useState('12:00');
    const [queuePosition, setQueuePosition] = useState<'start' | 'end'>('end');
    const [existingQueueCount, setExistingQueueCount] = useState(0);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressAction, setProgressAction] = useState('');

    // Schedule list panel
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [showSchedulePanel, setShowSchedulePanel] = useState(false);

    const cleanCaption = (text: string) => {
        if (!text) return '';
        return text
            .replace(/https?:\/\/(?:[a-z0-9]+\.)*(?:shopee\.[a-z.]+|shope\.ee)\/\S*/gi, '')
            .replace(/@[a-zA-Z0-9._]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const fetchAccounts = useCallback(async () => {
        try {
            const resp = await api.get('/media/accounts');
            if (resp.data.success) {
                setAccounts(resp.data.accounts);
            }
        } catch {}
    }, []);

    const fetchSchedule = useCallback(async () => {
        try {
            const resp = await api.get('/media/schedule');
            if (resp.data.success) setScheduledPosts(resp.data.schedule);
        } catch {}
    }, []);

    useEffect(() => { fetchAccounts(); fetchSchedule(); }, [fetchAccounts, fetchSchedule]);

    const toggleAccount = (platform: 'instagram' | 'facebook', acc: any) => {
        const id = platform === 'instagram' ? (acc.account_id || acc.id) : acc.id;
        const key = `${platform}:${id}`;
        const exists = selectedAccounts.find(a => `${a.platform}:${a.accountId}` === key);
        if (exists) {
            setSelectedAccounts(prev => prev.filter(a => `${a.platform}:${a.accountId}` !== key));
        } else {
            setSelectedAccounts(prev => [...prev, {
                platform,
                accountId: id,
                name: platform === 'instagram' ? (acc.username ? `@${acc.username}` : acc.name) : acc.name,
            }]);
        }
    };

    const isAccountSelected = (platform: 'instagram' | 'facebook', acc: any) => {
        const id = platform === 'instagram' ? (acc.account_id || acc.id) : acc.id;
        return selectedAccounts.some(a => a.platform === platform && String(a.accountId) === String(id));
    };

    const addTimeSlot = () => {
        if (newTimeInput && !timeSlots.includes(newTimeInput) && timeSlots.length < postsPerDay) {
            setTimeSlots(prev => [...prev, newTimeInput].sort());
        }
    };
    const removeTimeSlot = (t: string) => setTimeSlots(prev => prev.filter(s => s !== t));
    
    const getFirstPostPreview = () => {
        if (!scheduleMode || timeSlots.length === 0) return null;
        const now = new Date();
        if (existingQueueCount === 0) {
            const sorted = [...timeSlots].sort();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const firstAvailable = sorted.find(t => {
                const [h, m] = t.split(':').map(Number);
                return (h * 60 + m) > (currentTime + 2); // Reduced buffer
            });
            if (firstAvailable) return `Hoje às ${firstAvailable}`;
            return `Amanhã às ${sorted[0]}`;
        } else {
            const daysAfter = Math.ceil(existingQueueCount / postsPerDay);
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + daysAfter);
            return `${targetDate.toLocaleDateString('pt-BR')} às ${timeSlots[0]}`;
        }
    };

    const analyzeUrls = async () => {
        const urls = batchMode
            ? urlsText.split('\n').map(u => u.trim()).filter(Boolean)
            : url.trim() ? [url.trim()] : [];
        if (!urls.length) return;
        setLoading(true); setError(null); setMediaItems([]);
        const results: MediaInfo[] = [];
        for (const u of urls) {
            try {
                const resp = await api.post('/media/fetch-info', { url: u });
                if (resp.data.success) results.push({ ...resp.data.info, sourceUrl: u });
            } catch {}
        }
        if (results.length === 0) setError('Nenhuma mídia encontrada. Verifique os links e tente novamente.');
        else setMediaItems(results);
        setLoading(false);
    };

    const fastBatchSchedule = () => {
        const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
        if (!urls.length) return;

        const getPlatform = (url: string) => {
            if (url.includes('instagram.com')) return 'instagram';
            if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.gg')) return 'facebook';
            if (url.includes('tiktok.com')) return 'tiktok';
            if (url.includes('kwai.com')) return 'kwai';
            return 'video';
        };

        const virtualItems = urls.map((u, index) => ({
            id: `virtual-${Date.now()}-${index}`,
            sourceUrl: u,
            mediaUrl: 'DEFERRED',
            type: 'video',
            platform: getPlatform(u),
            title: '',
            thumbnail: ''
        }));

        setMediaItems(virtualItems);
        setSelectedItem(virtualItems[0]); 
        setPostCaption(''); // Tags globais
        setIsPostModalOpen(true);
        setPostSuccess(null); setPostError(null);
        setScheduleMode(true); setWizardStep(1);
    };

    const openPostModal = (item: MediaInfo) => {
        setSelectedItem(item);
        setPostCaption(cleanCaption(item.title));
        setIsPostModalOpen(true);
        setPostSuccess(null); setPostError(null);
        setPostLogs([]); setPostResults([]);
        setScheduleMode(false); setWizardStep(1);
    };

    const openBatchModal = () => {
        if (mediaItems.length === 0) return;
        setSelectedItem(mediaItems[0]); // fallback legacy (not really needed for batch but keeping structure)
        setPostCaption(''); // Não preencher com o primeiro vídeo, deixar vazio para tags globais
        setIsPostModalOpen(true);
        setPostSuccess(null); setPostError(null);
        setScheduleMode(true); setWizardStep(1);
    };

    const addLog = (msg: string) => setPostLogs(prev => [...prev, msg].slice(-8));

    const handleCopyMediaLink = async (index: number, url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopyingId(index);
            setTimeout(() => setCopyingId(null), 2000);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const handleQuickPost = async () => {
        if (!selectedItem || selectedAccounts.length === 0) {
            setPostError('Selecione pelo menos uma conta para postar.'); return;
        }
        setIsPosting(true); setPostError(null); setPostSuccess(null);
        setPostResults([]); setPostLogs([]); setProgress(0);
        addLog(`🚀 Publicando em ${selectedAccounts.length} conta(s)...`);

        const results: { name: string; ok: boolean; msg: string }[] = [];
        let completed = 0;

        for (const acc of selectedAccounts) {
            setProgressAction(`Publicando em ${acc.name}...`);
            addLog(`📤 → ${acc.name} (${acc.platform})...`);
            try {
                const resp = await api.post('/media/quick-post', {
                    platform: acc.platform,
                    accountId: acc.accountId,
                    mediaUrl: selectedItem.mediaUrl,
                    mediaType: selectedItem.type,
                    sourcePlatform: selectedItem.platform,
                    sourceUrl: selectedItem.sourceUrl,
                    caption: postCaption
                });
                if (resp.data.success) {
                    results.push({ name: acc.name, ok: true, msg: 'Publicado!' });
                    addLog(`✅ ${acc.name} OK`);
                } else {
                    const errMsg = resp.data.error || 'Erro desconhecido';
                    results.push({ name: acc.name, ok: false, msg: errMsg });
                    addLog(`❌ ${acc.name}: ${errMsg}`);
                }
            } catch (e: any) {
                const errMsg = e.response?.data?.error || e.message;
                results.push({ name: acc.name, ok: false, msg: errMsg });
                addLog(`❌ ${acc.name}: ${errMsg}`);
            }
            completed++;
            setProgress(Math.round((completed / selectedAccounts.length) * 100));
        }

        setPostResults(results);
        const allOk = results.every(r => r.ok);
        const someOk = results.some(r => r.ok);
        if (allOk) {
            setIsPosting(false);
            setIsPostModalOpen(false);
        } else if (someOk) {
            setPostSuccess(`⚠️ ${results.filter(r => r.ok).length}/${results.length} publicadas. Veja detalhes abaixo.`);
            setIsPosting(false);
        } else {
            setPostError('Falha em todas as contas. Veja detalhes abaixo.');
            setIsPosting(false);
        }
    };

    const handleScheduleNext = async () => {
        if (selectedAccounts.length === 0) { setPostError('Selecione pelo menos uma conta.'); return; }
        if (timeSlots.length < postsPerDay) { setPostError('Adicione todos os horários necessários.'); return; }
        setPostError(null); setSavingSchedule(true); setProgress(0);
        
        let maxQueue = 0;
        let checked = 0;
        for (const acc of selectedAccounts) {
            try {
                setProgressAction(`Verificando fila de ${acc.name}...`);
                const resp = await api.get(`/media/schedule/queue-info?accountId=${acc.accountId}`);
                const count = parseInt(resp.data.info?.total || 0);
                if (count > maxQueue) maxQueue = count;
            } catch {}
            checked++;
            setProgress(Math.round((checked / selectedAccounts.length) * 100));
        }
        setExistingQueueCount(maxQueue);
        if (maxQueue > 0) {
            setWizardStep(2);
            setSavingSchedule(false);
        } else {
            await submitSchedule('end');
        }
    };

    const submitSchedule = async (position: 'start' | 'end') => {
        setSavingSchedule(true); setPostError(null); setProgress(0);
        try {
            const items = mediaItems.length > 1
                ? mediaItems.map(m => ({ sourceUrl: m.sourceUrl, mediaUrl: m.mediaUrl, mediaType: m.type, sourcePlatform: m.platform, caption: m.title }))
                : selectedItem ? [{ sourceUrl: selectedItem.sourceUrl, mediaUrl: selectedItem.mediaUrl, mediaType: selectedItem.type, sourcePlatform: selectedItem.platform, caption: postCaption }] : [];

            if (items.length === 0) { 
                setPostError('Nenhuma mídia selecionada.'); 
                setSavingSchedule(false);
                return; 
            }

            let scheduled = 0;
            for (const acc of selectedAccounts) {
                setProgressAction(`Agendando para ${acc.name}...`);
                
                const payload = {
                    items: items, 
                    postsPerDay: postsPerDay, 
                    timeSlots: timeSlots, 
                    queuePosition: position,
                    platform: acc.platform, 
                    accountId: acc.id || acc.accountId, 
                    caption: mediaItems.length > 1 ? postCaption : '', // Se for lote, usa postCaption como fallback global
                };

                const resp = await api.post('/media/schedule/batch', payload);
                
                if (!resp.data.success) {
                    throw new Error(resp.data.error || `Erro ao agendar em ${acc.name}`);
                }
                scheduled++;
                setProgress(Math.round((scheduled / selectedAccounts.length) * 100));
            }

            // Loop finished, all accounts processed successfully
            setProgressAction('Agendamento concluído!');
            setIsPostModalOpen(false);
            setSavingSchedule(false);
            fetchSchedule().catch(err => console.warn('Background refresh failed:', err));
        } catch (err: any) {
            console.error('[SUBMIT_SCHEDULE_ERROR]', err);
            setPostError(err.response?.data?.error || err.message || 'Erro ao agendar.');
            setSavingSchedule(false);
        }
    };

    const handleDeleteSchedule = async (id: number) => {
        try {
            await api.delete(`/media/schedule/${id}`);
            setScheduledPosts(prev => prev.filter(p => p.id !== id));
        } catch {}
    };

    const allAccounts = [
        ...accounts.instagram.map(a => ({ ...a, platform: 'instagram' as const })),
        ...accounts.facebook.map(a => ({ ...a, platform: 'facebook' as const })),
    ];

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 px-4 sm:px-0 animate-fade-in">
            {/* Hero */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-[28px] p-8 sm:p-12 text-white shadow-2xl">
                <div className="relative z-10">
                    <h2 className="text-3xl sm:text-4xl font-black mb-2 flex items-center gap-3">
                        <Download className="w-9 h-9" /> Downloader Elite
                    </h2>
                    <p className="text-purple-100 text-sm max-w-xl">
                        Extraia e publique vídeos do Instagram, Facebook e TikTok em múltiplas contas simultaneamente.
                    </p>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20" />
            </div>

            {/* URL Input */}
            <div className="bg-white border border-gray-100 rounded-[24px] p-6 sm:p-8 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">
                        {batchMode ? 'Links em lote (um por linha)' : 'Cole o link da publicação'}
                    </label>
                    <button onClick={() => { setBatchMode(!batchMode); setError(null); setMediaItems([]); }}
                        className={`flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl transition-all ${batchMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        <List size={14} /> {batchMode ? 'MODO LOTE ATIVO' : 'MODO LOTE'}
                    </button>
                </div>
                <div className="space-y-3">
                    {batchMode ? (
                        <textarea value={urlsText} onChange={e => setUrlsText(e.target.value)} rows={5}
                            placeholder="https://www.instagram.com/reel/...\nhttps://www.tiktok.com/@user/video/..."
                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-purple-500 outline-none text-gray-800 text-sm font-mono resize-none transition-all" />
                    ) : (
                        <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400"><LinkIcon size={20} /></div>
                            <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && analyzeUrls()}
                                placeholder="https://www.instagram.com/reel/... ou tiktok.com/... ou kwai.com/..."
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-purple-500 outline-none text-gray-800 font-bold transition-all" />
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                        <button onClick={analyzeUrls} disabled={loading || (!batchMode && !url) || (batchMode && !urlsText)}
                            className={`flex-1 py-4 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 ${batchMode ? 'bg-gray-800' : 'bg-gray-900'}`}>
                            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> ANALISANDO...</> : <><Play size={18} /> ANALISAR AGORA</>}
                        </button>
                        {batchMode && urlsText.split('\n').filter(u => u.trim()).length > 1 && (
                            <button onClick={fastBatchSchedule} disabled={loading}
                                className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50">
                                🚀 AGENDAMENTO RÁPIDO
                            </button>
                        )}
                    </div>
                </div>
                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs font-bold">
                        <AlertCircle size={18} />{error}
                    </motion.div>
                )}
            </div>

            {/* Results Grid */}
            <AnimatePresence>
                {mediaItems.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{mediaItems.length} mídia(s) encontrada(s)</p>
                            {mediaItems.length > 1 && (
                                <button onClick={openBatchModal}
                                    className="flex items-center gap-2 text-xs font-black px-4 py-2 bg-purple-600 text-white rounded-xl hover:brightness-110 transition-all active:scale-95">
                                    <Calendar size={14} /> AGENDAR TODOS
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {mediaItems.map((item, i) => (
                                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                                    className="bg-white border border-gray-100 rounded-[20px] overflow-hidden shadow-md hover:shadow-xl transition-shadow">
                                    <div className="relative aspect-video bg-gray-100">
                                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                        <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg px-2 py-1 flex items-center gap-1">
                                            {item.type === 'video' ? <Video size={12} className="text-white" /> : <ImageIcon size={12} className="text-white" />}
                                            <span className="text-[10px] font-bold text-white uppercase">{item.type}</span>
                                        </div>
                                        <button onClick={() => handleCopyMediaLink(i, item.mediaUrl)}
                                            className="absolute top-3 left-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg p-1.5 text-white hover:bg-white/40 transition-all active:scale-90"
                                            title="Copiar link direto do vídeo">
                                            {copyingId === i ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                        </button>
                                        <span className={`absolute bottom-3 left-3 text-[10px] font-black px-2 py-1 rounded-lg uppercase ${item.platform === 'instagram' ? 'bg-pink-600 text-white' : item.platform === 'tiktok' ? 'bg-black text-white' : item.platform === 'kwai' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`}>
                                            {item.platform}
                                        </span>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs font-bold text-gray-800 line-clamp-2 mb-3">{item.title}</p>
                                        <button onClick={() => openPostModal(item)}
                                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95">
                                            <Send size={14} /> POSTAR / AGENDAR
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Scheduled Posts Panel */}
            <div className="bg-white border border-gray-100 rounded-[24px] shadow-lg overflow-hidden">
                <div role="button" tabIndex={0}
                    onClick={() => { setShowSchedulePanel(!showSchedulePanel); fetchSchedule(); }}
                    onKeyDown={e => e.key === 'Enter' && setShowSchedulePanel(s => !s)}
                    className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Calendar size={18} className="text-purple-600" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-black text-gray-900">Posts Agendados</p>
                            <p className="text-xs text-gray-400">{scheduledPosts.filter(p => p.status === 'pending').length} pendente(s)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); fetchSchedule(); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Atualizar">
                            <RefreshCw size={14} className="text-gray-400" />
                        </button>
                        <ChevronDown size={18} className={`text-gray-400 transition-transform ${showSchedulePanel ? 'rotate-180' : ''}`} />
                    </div>
                </div>
                <AnimatePresence>
                    {showSchedulePanel && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                {scheduledPosts.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        <Clock size={32} className="mx-auto mb-2 opacity-30" /> Nenhum post agendado
                                    </div>
                                ) : scheduledPosts.map(post => (
                                    <div key={post.id} className="p-4 flex items-center gap-4">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${statusColor[post.status] || 'text-gray-500 bg-gray-50'}`}>
                                            {post.status}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-gray-700 truncate">{post.source_url}</p>
                                            <p className="text-[10px] text-gray-400">{post.platform} • {new Date(post.scheduled_at).toLocaleString('pt-BR')}</p>
                                            {post.error_message && <p className="text-[10px] text-red-500 truncate">{post.error_message}</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => { navigator.clipboard.writeText(post.source_url); addLog(`📋 Link copiado: ${post.source_url.slice(0, 20)}...`); }}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-purple-600 transition-colors" title="Copiar Link Original">
                                                <Copy size={13} />
                                            </button>
                                            {post.status === 'pending' && (
                                                <button onClick={() => handleDeleteSchedule(post.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Post / Schedule Modal */}
            <AnimatePresence>
                {isPostModalOpen && selectedItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white rounded-[28px] w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

                            {/* Header */}
                            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="text-base font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                                    <Send size={18} className="text-purple-600" /> Publicar Mídia
                                    {mediaItems.length > 1 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{mediaItems.length} itens</span>}
                                </h3>
                                <button onClick={() => !isPosting && !savingSchedule && setIsPostModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full">
                                    <X size={18} className="text-gray-500" />
                                </button>
                            </div>

                            <div className="p-5 space-y-4 overflow-y-auto flex-1">
                                {/* Mode Toggle */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setScheduleMode(false)} className={`py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${!scheduleMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                        <Play size={14} /> POSTAR AGORA
                                    </button>
                                    <button onClick={() => { setScheduleMode(true); setWizardStep(1); }} className={`py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${scheduleMode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                        <Calendar size={14} /> AGENDAR
                                    </button>
                                </div>

                                {/* ===== MULTI-ACCOUNT SELECTOR ===== */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                            <Users size={12} /> Contas ({selectedAccounts.length} selecionada(s))
                                        </label>
                                        {selectedAccounts.length > 0 && (
                                            <button onClick={() => setSelectedAccounts([])} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors font-bold">
                                                Limpar
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                        {accounts.instagram.length > 0 && (
                                            <div>
                                                <p className="text-[9px] font-black text-pink-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Instagram size={10} /> Instagram</p>
                                                <div className="space-y-1">
                                                    {accounts.instagram.map(acc => {
                                                        const selected = isAccountSelected('instagram', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('instagram', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-pink-300 bg-pink-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-pink-500 border-pink-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.username ? `@${acc.username}` : acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Instagram</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.facebook.length > 0 && (
                                            <div>
                                                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Facebook size={10} /> Facebook</p>
                                                <div className="space-y-1">
                                                    {accounts.facebook.map(acc => {
                                                        const selected = isAccountSelected('facebook', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('facebook', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Facebook Page</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        {allAccounts.length === 0 && ( <p className="text-xs text-gray-400 text-center py-4">Nenhuma conta conectada</p> )}
                                    </div>
                                </div>

                                {/* Caption */}
                                <div className="relative">
                                    <div className="absolute top-3 left-4 text-gray-400"><MessageSquare size={16} /></div>
                                    <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)} rows={3}
                                        placeholder={!selectedItem ? "Legenda Padrão / Tags (Será anexada a todos os vídeos, ou usada se o vídeo não tiver legenda)..." : "Legenda..."}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-purple-500 outline-none text-gray-800 text-xs font-medium resize-none" />
                                </div>

                                {/* Schedule Wizard */}
                                <AnimatePresence mode="wait">
                                    {scheduleMode && wizardStep === 1 && (
                                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                                            <div className="bg-purple-50 rounded-2xl p-4 space-y-4">
                                                <p className="text-xs font-black text-purple-700 uppercase tracking-widest">⚙️ Configurar Agendamento</p>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Posts por dia?</label>
                                                    <div className="flex gap-2">
                                                        {[1, 2, 3, 4, 5].map(n => (
                                                            <button key={n} onClick={() => { 
                                                                setPostsPerDay(n); 
                                                                setTimeSlots(prev => {
                                                                    const defs = ['09:00', '12:00', '15:00', '18:00', '21:00'];
                                                                    let next = [...prev].slice(0, n);
                                                                    for (const d of defs) {
                                                                        if (next.length >= n) break;
                                                                        if (!next.includes(d)) next.push(d);
                                                                    }
                                                                    return next.sort();
                                                                }); 
                                                            }}
                                                                className={`w-12 h-10 rounded-xl font-black text-sm transition-all ${postsPerDay === n ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-purple-100 border border-gray-200'}`}>{n}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Horários ({timeSlots.length}/{postsPerDay})</label>
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {timeSlots.map(t => (
                                                            <span key={t} className="flex items-center gap-1 bg-white border border-purple-200 text-purple-700 text-xs font-black px-3 py-1.5 rounded-lg">
                                                                <Clock size={11} /> {t}
                                                                <button onClick={() => removeTimeSlot(t)} className="ml-1 text-gray-400 hover:text-red-500 transition-colors"><X size={11} /></button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {timeSlots.length < postsPerDay && (
                                                        <div className="flex gap-2">
                                                            <input type="time" value={newTimeInput} onChange={e => setNewTimeInput(e.target.value)}
                                                                className="flex-1 px-3 py-2 bg-white border-2 border-purple-100 rounded-xl text-sm font-bold text-gray-800 focus:border-purple-400 outline-none" />
                                                            <button onClick={addTimeSlot} className="px-3 py-2 bg-purple-600 text-white rounded-xl hover:brightness-110 transition-all"><Plus size={16} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {scheduleMode && wizardStep === 2 && (
                                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                                                <p className="text-xs font-black text-yellow-800 mb-1">⚠️ Já existem {existingQueueCount} post(s) agendados</p>
                                                <p className="text-[10px] text-yellow-600">Onde inserir os novos posts?</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button onClick={() => setQueuePosition('start')} className={`p-4 rounded-2xl border-2 font-black text-sm transition-all ${queuePosition === 'start' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-purple-300'}`}>
                                                    ⬆️<br /><span className="text-xs">INÍCIO DA FILA</span>
                                                </button>
                                                <button onClick={() => setQueuePosition('end')} className={`p-4 rounded-2xl border-2 font-black text-sm transition-all ${queuePosition === 'end' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-purple-300'}`}>
                                                    ⬇️<br /><span className="text-xs">FINAL DA FILA</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Progress Bar & Status (New Tier 1 UX) */}
                                {(isPosting || savingSchedule) && (
                                    <div className="space-y-2 py-2 px-1">
                                        <div className="flex justify-between items-center text-[10px] font-black tracking-widest text-purple-600 uppercase">
                                            <span className="flex items-center gap-2">
                                                <RefreshCw size={10} className="animate-spin" />
                                                {progressAction || 'Processando...'}
                                            </span>
                                            <span className="bg-purple-100 px-1.5 py-0.5 rounded-md">{progress}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-100">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                                className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Schedule Preview Information */}
                                {scheduleMode && !isPosting && !savingSchedule && !postSuccess && (
                                    <div className="p-4 bg-indigo-50/50 border-2 border-dashed border-indigo-100 rounded-2xl flex flex-col gap-2">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                                                <Clock size={12} /> Primeiro Post Previsto
                                            </span>
                                            <span className="font-black text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
                                                {getFirstPostPreview() || '---'}
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-indigo-400 font-medium leading-relaxed italic">
                                            *Baseado em {postsPerDay} posts/dia e na fila atual de {existingQueueCount} posts.
                                         </p>
                                    </div>
                                )}

                                {/* Post Results per account */}
                                {postResults.length > 0 && (
                                    <div className="space-y-1">
                                        {postResults.map((r, i) => (
                                            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                {r.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                                <span className="truncate">{r.name}: {r.msg}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Logs */}
                                {(isPosting && postLogs.length > 0) && (
                                    <div className="bg-gray-900 rounded-xl p-3 font-mono text-[9px] text-gray-300 space-y-1 max-h-20 overflow-y-auto">
                                        {postLogs.map((log, i) => <div key={i}>{log}</div>)}
                                    </div>
                                )}

                                {postError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2"><AlertCircle size={14} />{postError}</div>}
                                {postSuccess && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-xs font-bold flex items-center gap-2"><CheckCircle2 size={14} />{postSuccess}</div>}

                                {/* Action Button */}
                                {!scheduleMode ? (
                                    <button onClick={handleQuickPost} disabled={isPosting || selectedAccounts.length === 0 || !!postSuccess}
                                        className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 text-sm">
                                        {isPosting ? <><Loader2 className="w-5 h-5 animate-spin" /> PUBLICANDO {selectedAccounts.length} CONTA(S)...</>
                                            : postSuccess ? <><CheckCircle2 size={18} /> CONCLUÍDO!</>
                                                : <><Send size={18} /> PUBLICAR EM {selectedAccounts.length || '?'} CONTA(S)</>}
                                    </button>
                                ) : wizardStep === 1 ? (
                                    <button onClick={handleScheduleNext} disabled={timeSlots.length < postsPerDay || selectedAccounts.length === 0 || savingSchedule}
                                        className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 text-sm">
                                        {savingSchedule ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar size={18} />}
                                        {savingSchedule ? 'VERIFICANDO...' 
                                            : timeSlots.length < postsPerDay ? `ADICIONE +${postsPerDay - timeSlots.length} HORÁRIO(S)`
                                            : selectedAccounts.length === 0 ? 'SELECIONE UMA CONTA'
                                            : `PRÓXIMO → (${selectedAccounts.length} conta(s))`}
                                    </button>
                                ) : (
                                    <button onClick={() => submitSchedule(queuePosition)} disabled={savingSchedule}
                                        className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 text-sm">
                                        {savingSchedule ? <><Loader2 className="w-5 h-5 animate-spin" /> AGENDANDO...</> : <><CheckCircle2 size={18} /> CONFIRMAR AGENDAMENTO</>}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MediaDownloaderPage;
