import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';
import { 
    Calendar, Clock, Trash2, Play, Pause, Facebook, Video, MessageCircle, Send, 
    CheckCircle, XCircle, Download, Instagram, RefreshCw, Rocket, ShoppingBag,
    ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon, MoreVertical,
    CalendarDays, CalendarRange, Filter, Search, X, Activity, ChevronDown
} from 'lucide-react';
import { 
    startOfWeek, endOfWeek, eachDayOfInterval, format, addDays, subDays, 
    startOfMonth, endOfMonth, isSameDay, isToday, addMonths, subMonths,
    parseISO, setHours, setMinutes, startOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '../components/Logo';


interface Schedule {
    id: number;
    platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram';
    config: any;
    active: number;
    created_at: string;
    nextExecution?: string | null;
    totalSent?: number;
    lastExecution?: string | null;
}

interface DownloaderPost { 
    id: number; 
    source_url: string; 
    media_type: string; 
    platform: string; 
    account_id: string; 
    account_name?: string; 
    caption: string; 
    scheduled_at: string; 
    status: string; 
    error_message?: string; 
}

interface SchedulesPageProps {
    setActiveTab?: (tab: string) => void;
}

const SchedulesPage: React.FC<SchedulesPageProps> = ({ setActiveTab }) => {

    const [viewMode, setViewMode] = useState<'list' | 'day' | 'week' | 'month'>('week');
    const [previousViewMode, setPreviousViewMode] = useState<'week' | 'month'>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<any>(null);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [downloaderPosts, setDownloaderPosts] = useState<DownloaderPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingDownloader, setLoadingDownloader] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [timeOffset, setTimeOffset] = useState(0);
    const [filterPlatform, setFilterPlatform] = useState<string>('all');
    const [selectedTarget, setSelectedTarget] = useState<string>('all');
    const [showTargetDropdown, setShowTargetDropdown] = useState(false);
    const { showAlert } = useAlert();
    const [searchTerm, setSearchTerm] = useState('');

    const lastNotifiedExec = React.useRef<Record<number, string>>({});
    const lastPostStatus = React.useRef<Record<number, string>>({});


    const handleQuickSchedule = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (setActiveTab) {
            setActiveTab('downloader');
        } else {
            // Fallback if prop is missing
            window.history.pushState(null, '', '/dashboard/downloader');
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
    };



    useEffect(() => {
        loadSchedules(false);
        loadDownloaderSchedules();

        const timer = setInterval(() => {
            loadSchedules(true);
            loadDownloaderSchedules(true);
        }, 5000);

        return () => clearInterval(timer);
    }, []);

    const loadDownloaderSchedules = async (silent = false) => {
        if (!silent) setLoadingDownloader(true);
        else setIsRefreshing(true);
        
        try {
            const resp = await api.get('/media/schedule');
            if (resp.data.success) {
                const posts = resp.data.schedule || [];
                
                // Check for status changes (notification logic)
                posts.forEach((p: any) => {
                    const prevStatus = lastPostStatus.current[p.id];
                    if (prevStatus && prevStatus !== p.status && p.status === 'completed') {
                        showAlert(`✅ Vídeo publicado com sucesso! (${p.platform})`, 'success');
                    }
                    lastPostStatus.current[p.id] = p.status;
                });

                setDownloaderPosts(posts);
            }
        } catch (error) {
            console.error('Error loading downloader schedules:', error);
        } finally {
            if (!silent) setLoadingDownloader(false);
            else setIsRefreshing(false);
        }
    };

    const loadSchedules = async (silent = false) => {
        try {
            if (!silent && schedules.length === 0) setLoading(true);
            const response = await api.get('/schedules');
            if (response.data.success) {
                const newSchedules = response.data.schedules || [];

                // Check for robot executions (notification logic)
                newSchedules.forEach((s: any) => {
                    if (s.lastExecution) {
                        const prevExec = lastNotifiedExec.current[s.id];
                        if (prevExec && prevExec !== s.lastExecution) {
                            // Verify if it's recent (last 30 seconds) to avoid spamming old history
                            const execTime = new Date(s.lastExecution).getTime();
                            const now = new Date().getTime();
                            if (now - execTime < 30000) {
                                showAlert(`🤖 Robô ${s.platform} acabou de realizar um envio!`, 'success');
                            }
                        }
                        lastNotifiedExec.current[s.id] = s.lastExecution;
                    }
                });

                setSchedules(newSchedules);
                if (response.data.serverTime) {
                    const server = new Date(response.data.serverTime).getTime();
                    const client = new Date().getTime();
                    setTimeOffset(server - client);
                }
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const toggleSchedule = async (id: number) => {
        try {
            const response = await api.post(`/schedule/toggle/${id}`);
            if (response.data.success) {
                setSchedules(schedules.map(s => s.id === id ? { ...s, active: s.active ? 0 : 1 } : s));
                showAlert(`Agendamento ${response.data.active ? 'ativado' : 'pausado'}`, 'success');
            }
        } catch (error) {
            showAlert('Erro ao alterar status', 'error');
        }
    };

    const deleteSchedule = async (id: number) => {
        if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
        try {
            const response = await api.delete(`/schedule/${id}`);
            if (response.data.success) {
                setSchedules(schedules.filter(s => s.id !== id));
                showAlert('Agendamento excluído', 'success');
            }
        } catch (error) {
            showAlert('Erro ao excluir agendamento', 'error');
        }
    };

    const runDownloaderPostNow = async (id: number) => {
        try {
            showAlert('Iniciando postagem...', 'info');
            setDownloaderPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'processing' } : p));
            const response = await api.post(`/media/schedule/run-now/${id}`);
            if (response.data.success) {
                showAlert('✅ Postagem iniciada!', 'success');
                setTimeout(() => loadDownloaderSchedules(true), 3000);
            } else {
                showAlert('❌ ' + (response.data.error || 'Erro ao iniciar'), 'error');
                loadDownloaderSchedules(true);
            }
        } catch (error) {
            showAlert('❌ Erro ao iniciar postagem', 'error');
            loadDownloaderSchedules(true);
        }
    };

    const deleteDownloaderPost = async (id: number) => {
        try {
            await api.delete(`/media/schedule/${id}`);
            setDownloaderPosts(prev => prev.filter(p => p.id !== id));
            showAlert('Post removido da fila', 'success');
        } catch { showAlert('Erro ao remover', 'error'); }
    };

    const parseConfig = (config: any) => {
        if (typeof config === 'object' && config !== null) return config;
        try { return JSON.parse(config); } catch (e) { return {}; }
    };

    // --- Calendar Logic ---
    const allEvents = useMemo(() => {
        const list: any[] = [];

        // 1. Add downloader posts (real events)
        downloaderPosts.forEach(post => {
            let displayTitle = post.account_name || post.platform;
            if (post.platform === 'instagram' && post.account_name && !post.account_name.startsWith('@')) {
                displayTitle = `@${post.account_name}`;
            }

            list.push({
                id: `post-${post.id}`,
                type: 'post',
                date: parseISO(post.scheduled_at),
                platform: post.platform,
                title: displayTitle,
                content: post.caption || post.source_url,
                status: post.status,
                last_error: post.error_message || post.last_error,
                contentType: 'video',
                original: post
            });
        });

        // 2. Project recurring schedules
        schedules.forEach(schedule => {
            if (!schedule.active) return;
            const config = parseConfig(schedule.config);
            const scheduleInfo = config.schedule || {};
            const times = scheduleInfo.scheduleMode === 'multiple' && scheduleInfo.times?.length > 0
                ? scheduleInfo.times
                : scheduleInfo.time ? [scheduleInfo.time] : [];

            // Extract target name for better visibility
            let targetName = '';
            if (schedule.platform === 'whatsapp') {
                const groups = config.whatsappRecipients || config.groups || config.targetGroups || [];
                targetName = groups.length > 0 
                    ? (groups.length === 1 ? groups[0].name || 'Grupo' : `${groups.length} Grupos`)
                    : 'WhatsApp';
            } else if (schedule.platform === 'facebook') {
                const pages = config.pages || config.selectedPages || config.facebookPages || [];
                targetName = pages.length > 0
                    ? (pages.length === 1 ? pages[0].name || 'Página' : `${pages.length} Páginas`)
                    : 'Facebook';
            } else if (schedule.platform === 'instagram') {
                targetName = config.accountName || config.username || config.instagramAccount?.name || 'Instagram';
                if (targetName !== 'Instagram' && !targetName.startsWith('@')) targetName = `@${targetName}`;
            } else if (schedule.platform === 'telegram') {
                const tgGroups = config.groups || config.telegramGroups || [];
                targetName = tgGroups.length > 0
                    ? (tgGroups.length === 1 ? tgGroups[0].name || 'Canal' : `${tgGroups.length} Canais`)
                    : config.channelName || config.chatId || 'Telegram';
            } else {
                targetName = schedule.platform;
            }

            if (times.length > 0) {
                // Project for the next month
                const start = startOfMonth(currentDate);
                const end = endOfMonth(currentDate);
                const interval = eachDayOfInterval({ start: subDays(start, 7), end: addDays(end, 7) });

                interval.forEach(day => {
                    times.forEach((time: string) => {
                        const [h, m] = time.split(':').map(Number);
                        const eventDate = setMinutes(setHours(startOfDay(day), h), m);
                        
                        list.push({
                            id: `proj-${schedule.id}-${eventDate.getTime()}`,
                            type: 'robot',
                            date: eventDate,
                            platform: schedule.platform,
                            title: targetName,
                            content: `Robô ${schedule.platform}`,
                            status: 'scheduled',
                            contentType: config.mediaType === 'video' ? 'video' : 'product',
                            original: schedule
                        });

                    });
                });
            }
        });

        return list.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [downloaderPosts, schedules, currentDate]);

    const availableTargets = useMemo(() => {
        let filtered = allEvents;
        if (filterPlatform !== 'all') {
            filtered = filtered.filter(e => e.platform === filterPlatform);
        }
        const targets = Array.from(new Set(filtered.map(e => e.title))).filter(Boolean).sort();
        return targets;
    }, [allEvents, filterPlatform]);

    const events = useMemo(() => {
        let filtered = allEvents;
        
        if (filterPlatform !== 'all') {
            filtered = filtered.filter(e => e.platform === filterPlatform);
        }

        if (selectedTarget !== 'all') {
            filtered = filtered.filter(e => e.title === selectedTarget);
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(e => 
                (e.title && e.title.toLowerCase().includes(term)) || 
                (e.content && e.content.toLowerCase().includes(term))
            );
        }

        return filtered;
    }, [allEvents, filterPlatform, selectedTarget, searchTerm]);


    const BrandIcons = {
        Facebook: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
        ),
        Instagram: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
            </svg>
        ),
        WhatsApp: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
        ),
        Telegram: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M11.944 0C5.346 0 0 5.346 0 11.944c0 6.598 5.346 11.944 11.944 11.944 6.598 0 11.944-5.346 11.944-11.944C23.888 5.346 18.542 0 11.944 0zm5.828 8.418l-1.996 9.418c-.15.666-.544.826-1.102.514l-3.04-2.24-1.467 1.412c-.162.162-.298.298-.612.298l.218-3.1 5.64-5.097c.245-.218-.054-.338-.38-.122l-6.972 4.39-3.003-.94c-.652-.204-.666-.652.136-.966l11.734-4.522c.544-.204 1.018.122.862.863z"/>
            </svg>
        ),
        X: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.294 19.497h2.039L6.482 3.239H4.293L17.607 20.65z"/>
            </svg>
        ),
        YouTube: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
        )
    };


    const getPlatformIcon = (platform: string, size = 14) => {
        switch (platform) {
            case 'facebook': return <BrandIcons.Facebook size={size} className="text-[#1877F2]" />;
            case 'instagram': return <BrandIcons.Instagram size={size} className="text-[#E4405F]" />;
            case 'whatsapp': return <BrandIcons.WhatsApp size={size} className="text-[#25D366]" />;
            case 'telegram': return <BrandIcons.Telegram size={size} className="text-[#0088cc]" />;
            case 'youtube': return <BrandIcons.YouTube size={size} className="text-[#FF0000]" />;
            case 'twitter': 
            case 'x': return <BrandIcons.X size={size} className="text-[#000000]" />;
            default: return <Clock className="text-gray-400" size={size} />;
        }
    };

    const EventCard = ({ event }: { event: any }) => {
        const isPast = event.date < new Date();
        const isDone = isPast && (event.type === 'robot' || event.status === 'completed');
        const isFailed = event.status === 'failed';
        const isProcessing = event.status === 'processing';

        const getPlatformColors = (platform: string) => {
            switch (platform) {
                case 'facebook': return 'border-l-blue-600 text-blue-700 bg-blue-50/30';
                case 'instagram': return 'border-l-pink-600 text-pink-700 bg-pink-50/30';
                case 'whatsapp': return 'border-l-green-500 text-green-700 bg-green-50/30';
                case 'telegram': return 'border-l-sky-500 text-sky-700 bg-sky-50/30';
                case 'youtube': return 'border-l-red-600 text-red-700 bg-red-50/30';
                case 'twitter': 
                case 'x': return 'border-l-gray-900 text-gray-900 bg-gray-50/30';
                default: return 'border-l-gray-400 text-gray-600 bg-gray-50/30';
            }
        };

        const platformColorClass = getPlatformColors(event.platform);

        return (
            <div 
                onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                className={`flex flex-col p-2.5 mb-2 rounded-xl border text-[11px] transition-all cursor-pointer hover:shadow-xl hover:scale-[1.02] active:scale-95 ${
                    isDone 
                        ? 'bg-emerald-50/60 border-emerald-100 border-l-4 border-l-emerald-500 shadow-sm shadow-emerald-50' 
                        : isFailed
                            ? 'bg-red-50/40 border-red-100 border-l-4 border-l-red-500'
                            : `border-gray-100 border-l-4 ${platformColorClass}`
                } ${isPast && !isDone && !isFailed && !isProcessing ? 'opacity-60' : ''}`}
            >
                <div className="flex items-center justify-between mb-2">
                    <span className={`font-black text-[12px] ${isDone ? 'text-emerald-700' : 'text-gray-900'}`}>{format(event.date, 'HH:mm')}</span>
                    <div className="flex items-center gap-1.5">
                        {isDone && <CheckCircle className="text-emerald-500" size={12} />}
                        {!isDone && getPlatformIcon(event.platform, 12)}
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <p className={`truncate font-black text-[11px] leading-tight ${isDone ? 'text-emerald-900' : 'text-gray-900'}`}>
                        {event.title}
                    </p>
                    
                    {event.content && (
                        <p className={`truncate text-[9px] mt-0.5 line-clamp-1 italic ${isDone ? 'text-emerald-600/70' : 'text-gray-500'}`}>
                            "{event.content}"
                        </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                            isDone ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                            {getPlatformIcon(event.platform, 10)}
                            {event.platform}
                        </div>
                        
                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                            event.contentType === 'video' 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-orange-500 text-white'
                        }`}>
                            {event.contentType === 'video' ? <Video size={10} /> : <ShoppingBag size={10} />}
                            {event.contentType === 'video' ? 'VÍDEO' : 'PRODUTO'}
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50/50">
                        {isFailed && (
                            <div className="flex flex-col gap-1 w-full">
                                <span className="text-[9px] text-red-500 font-black uppercase tracking-widest">Erro no Envio</span>
                                {event.last_error && (
                                    <span className="text-[8px] text-red-400 font-medium line-clamp-1 italic leading-tight">
                                        {event.last_error}
                                    </span>
                                )}
                            </div>
                        )}
                        {isProcessing && (
                            <span className="text-[9px] text-blue-600 font-black uppercase tracking-widest animate-pulse flex items-center gap-1">
                                <RefreshCw size={10} className="animate-spin" /> Postando...
                            </span>
                        )}
                        {isDone && event.type === 'robot' && (
                            <span className="text-[9px] text-emerald-600 font-black uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle size={10} /> Enviado com Sucesso
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const DailyView = () => {
        const dayEvents = events.filter(e => isSameDay(e.date, currentDate));

        return (
            <div className="bg-white border border-gray-200 rounded-[24px] overflow-hidden shadow-sm">
                <div className={`p-6 border-b flex items-center justify-between ${isToday(currentDate) ? 'bg-blue-50/30' : ''}`}>
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => setViewMode(previousViewMode)}
                            className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-2xl transition-all active:scale-90 border border-gray-100"
                            title="Voltar"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <p className="text-[12px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">
                                {format(currentDate, 'EEEE', { locale: ptBR })}
                            </p>
                            <h3 className="text-3xl font-black text-gray-900">
                                {format(currentDate, 'd \'de\' MMMM', { locale: ptBR })}
                            </h3>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[14px] font-bold text-gray-400">Total de agendamentos</p>
                        <p className="text-2xl font-black text-gray-900">{dayEvents.length}</p>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-gray-50/20">
                    {dayEvents.length > 0 ? (
                        dayEvents.map(event => {
                            const isPast = event.date < new Date();
                            const isDone = isPast && (event.type === 'robot' || event.status === 'completed');
                            const isFailed = event.status === 'failed';

                            return (
                                <div 
                                    key={event.id} 
                                    onClick={() => setSelectedEvent(event)}
                                    className={`p-5 rounded-[20px] border shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-95 ${
                                        isDone 
                                            ? 'bg-emerald-50/30 border-emerald-100 shadow-emerald-500/5' 
                                            : event.type === 'post' 
                                                ? 'bg-white border-blue-100' 
                                                : 'bg-white border-gray-100'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-xl ${isDone ? 'bg-emerald-600' : event.type === 'post' ? 'bg-blue-600' : 'bg-gray-600'} text-white shadow-lg`}>
                                                {isDone ? <CheckCircle size={16} /> : <Clock size={16} />}
                                            </div>
                                            <span className={`text-lg font-black ${isDone ? 'text-emerald-700' : 'text-gray-900'}`}>{format(event.date, 'HH:mm')}</span>
                                        </div>
                                        {isDone ? <div className="px-3 py-1 bg-emerald-100 text-emerald-600 text-[10px] font-black rounded-full uppercase tracking-widest">Enviado</div> : getPlatformIcon(event.platform, 20)}
                                    </div>
                                    <h4 className={`font-bold mb-2 truncate ${isDone ? 'text-emerald-800' : 'text-gray-900'}`}>{event.title}</h4>
                                    <p className={`text-[13px] line-clamp-3 mb-4 italic ${isDone ? 'text-emerald-600/70' : 'text-gray-500'}`}>"{event.content}"</p>
                                    <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                                        <div className="flex flex-col items-end">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                                                isDone ? 'bg-emerald-50 text-emerald-600' :
                                                event.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                            }`}>
                                                {isDone ? 'Concluído' : event.status}
                                            </span>
                                            {isFailed && event.last_error && (
                                                <span className="text-[9px] text-red-400 font-bold mt-1 text-right max-w-[150px] line-clamp-1 italic">
                                                    {event.last_error}
                                                </span>
                                            )}
                                        </div>
                                        {event.type === 'post' && !isDone && (
                                            <button 
                                                onClick={() => runDownloaderPostNow(event.original.id)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <Play size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="col-span-full py-20 text-center">
                            <Calendar size={40} className="text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">Nenhum agendamento para este dia</p>
                            <button 
                                onClick={handleQuickSchedule}
                                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100 active:scale-95 transition-all"
                            >
                                Programar Agora
                            </button>

                        </div>
                    )}
                </div>
            </div>
        );
    };

    const WeeklyView = () => {
        const days = eachDayOfInterval({
            start: startOfWeek(currentDate, { weekStartsOn: 0 }),
            end: endOfWeek(currentDate, { weekStartsOn: 0 })
        });

        return (
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {days.map((day, idx) => (
                    <div key={idx} className="bg-white min-h-[600px] flex flex-col">
                        <div 
                            onClick={() => {
                                setPreviousViewMode('week');
                                setViewMode('day');
                                setCurrentDate(day);
                            }}
                            className={`p-4 text-center border-b cursor-pointer hover:bg-blue-50 transition-all ${isToday(day) ? 'bg-blue-50/30' : ''}`}
                        >
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                {format(day, 'eee', { locale: ptBR })}
                            </p>
                            <p className={`text-xl font-black ${isToday(day) ? 'text-blue-600' : 'text-gray-900'}`}>
                                {format(day, 'd')}
                            </p>
                        </div>
                        <div className="flex-1 p-2 bg-gray-50/20 overflow-y-auto max-h-[500px] custom-scrollbar">
                            {events
                                .filter(e => isSameDay(e.date, day))
                                .map(event => <EventCard key={event.id} event={event} />)
                            }
                            <button 
                                onClick={handleQuickSchedule}
                                className="w-full mt-2 py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-1 group active:scale-95"
                            >
                                <Clock size={12} className="group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold uppercase">Programar</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const MonthlyView = () => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        const calendarDays = eachDayOfInterval({
            start: startOfWeek(start, { weekStartsOn: 0 }),
            end: endOfWeek(end, { weekStartsOn: 0 })
        });

        return (
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                    <div key={d} className="bg-gray-50 p-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {d}
                    </div>
                ))}
                {calendarDays.map((day, idx) => {
                    const dayEvents = events.filter(e => isSameDay(e.date, day));
                    const isCurrentMonth = format(day, 'M') === format(currentDate, 'M');
                    
                    return (
                        <div 
                            key={idx} 
                            onClick={() => {
                                setPreviousViewMode('month');
                                setViewMode('day');
                                setCurrentDate(day);
                            }}
                            className={`bg-white min-h-[120px] p-2 flex flex-col cursor-pointer hover:bg-blue-50/20 transition-colors ${!isCurrentMonth ? 'bg-gray-50/50' : ''}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-lg transition-all hover:bg-blue-600 hover:text-white ${isToday(day) ? 'bg-blue-600 text-white w-7 h-7 flex items-center justify-center' : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'}`}>
                                    {format(day, 'd')}
                                </span>
                                {dayEvents.length > 0 && (
                                    <span className="text-[9px] font-bold text-gray-400">{dayEvents.length} posts</span>
                                )}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                {dayEvents.slice(0, 3).map(event => {
                                    const isDone = event.date < new Date() && (event.type === 'robot' || event.status === 'completed');
                                    
                                    return (
                                        <div 
                                            key={event.id} 
                                            onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                                            className={`flex items-center gap-1 mb-0.5 px-1.5 py-0.5 rounded border cursor-pointer transition-all ${
                                                isDone 
                                                    ? 'bg-emerald-50 border-emerald-200' 
                                                    : 'bg-gray-100 border-gray-200/50 hover:bg-blue-50 hover:border-blue-200'
                                            }`}
                                        >
                                            {isDone ? <CheckCircle size={10} className="text-emerald-500" /> : getPlatformIcon(event.platform, 10)}
                                            <span className={`text-[9px] font-bold truncate ${isDone ? 'text-emerald-700' : 'text-gray-600'}`}>{format(event.date, 'HH:mm')}</span>
                                        </div>
                                    );
                                })}
                                {dayEvents.length > 3 && (
                                    <p className="text-[9px] text-blue-500 font-bold mt-1">+ mais {dayEvents.length - 3}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // --- Main UI Rendering ---

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4 sm:px-0 animate-fade-in">
            
            {/* Header / Planner Toolbar */}
            <div className="bg-white rounded-[24px] border border-gray-200/60 p-6 shadow-sm mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <Logo size={60} />
                        <div>
                            <h1 className="text-[28px] font-black text-gray-900 tracking-tight">
                                Planner <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500">Fluxo Inteligente</span>
                            </h1>
                            <p className="text-[13px] text-gray-500 font-medium mt-0.5">Gestão profissional de conteúdo e automação de vendas.</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-gray-50 p-1 rounded-2xl border border-gray-100">
                        <button 
                            onClick={() => setViewMode('day')}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all flex items-center gap-2 ${viewMode === 'day' ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            <CalendarDays size={14} /> Dia
                        </button>
                        <button 
                            onClick={() => setViewMode('week')}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all flex items-center gap-2 ${viewMode === 'week' ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            <CalendarRange size={14} /> Semana
                        </button>
                        <button 
                            onClick={() => setViewMode('month')}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all flex items-center gap-2 ${viewMode === 'month' ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            <LayoutGrid size={14} /> Mês
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all flex items-center gap-2 ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            <ListIcon size={14} /> Lista
                        </button>
                    </div>
                </div>

                {/* Platform Filter Row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar no-scrollbar">
                    <button 
                        onClick={() => { setFilterPlatform('all'); setSelectedTarget('all'); }}
                        className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${filterPlatform === 'all' ? 'bg-gray-900 text-white shadow-xl shadow-gray-200 translate-y-[-1px]' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                        <LayoutGrid size={14} /> Todos
                    </button>
                    {[
                        { id: 'telegram', name: 'Telegram', icon: <BrandIcons.Telegram size={14} />, color: 'text-[#0088cc]' },
                        { id: 'whatsapp', name: 'WhatsApp', icon: <BrandIcons.WhatsApp size={14} />, color: 'text-[#25D366]' },
                        { id: 'facebook', name: 'Facebook', icon: <BrandIcons.Facebook size={14} />, color: 'text-[#1877F2]' },
                        { id: 'instagram', name: 'Instagram', icon: <BrandIcons.Instagram size={14} />, color: 'text-[#E4405F]' },
                        { id: 'youtube', name: 'YouTube Shorts', icon: <BrandIcons.YouTube size={14} />, color: 'text-[#FF0000]' },
                        { id: 'twitter', name: 'X / Twitter', icon: <BrandIcons.X size={14} />, color: 'text-[#000000]' }
                    ].map(p => (
                        <button 
                            key={p.id}
                            onClick={() => { setFilterPlatform(p.id); setSelectedTarget('all'); }}
                            className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap ${filterPlatform === p.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-100 translate-y-[-1px]' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                        >
                            {p.icon}
                            <span className={filterPlatform === p.id ? 'text-white' : p.color}>{p.name}</span>
                        </button>
                    ))}
                </div>
                {viewMode !== 'list' && (

                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setCurrentDate(
                                    viewMode === 'day' ? subDays(currentDate, 1) : 
                                    viewMode === 'week' ? subDays(currentDate, 7) : 
                                    subMonths(currentDate, 1)
                                )}
                                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all active:scale-90"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button 
                                onClick={() => setCurrentDate(new Date())}
                                className="px-4 py-2 hover:bg-gray-100 rounded-xl text-[13px] font-bold text-gray-600 transition-all active:scale-95"
                            >
                                Hoje
                            </button>
                            <button 
                                onClick={() => setCurrentDate(
                                    viewMode === 'day' ? addDays(currentDate, 1) : 
                                    viewMode === 'week' ? addDays(currentDate, 7) : 
                                    addMonths(currentDate, 1)
                                )}
                                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all active:scale-90"
                            >
                                <ChevronRight size={20} />
                            </button>
                            <h2 className="text-lg font-black text-gray-900 capitalize ml-2">
                                {viewMode === 'day' ? format(currentDate, 'd \'de\' MMMM yyyy', { locale: ptBR }) : format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                            </h2>
                        </div>

                        <div className="flex items-center gap-3 relative">
                            {/* Account Selector Dropdown */}
                            <div className="relative">
                                <button 
                                    onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all border ${
                                        selectedTarget !== 'all' 
                                        ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-100' 
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <Filter size={14} />
                                    {selectedTarget === 'all' ? 'Destinos' : selectedTarget}
                                    <ChevronDown size={14} className={`transition-transform ${showTargetDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {showTargetDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-[60]" onClick={() => setShowTargetDropdown(false)} />
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[70] overflow-hidden"
                                            >
                                                <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selecionar Destino</span>
                                                    {selectedTarget !== 'all' && (
                                                        <button 
                                                            onClick={() => { setSelectedTarget('all'); setShowTargetDropdown(false); }}
                                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                                                        >
                                                            Limpar
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                                    <button 
                                                        onClick={() => { setSelectedTarget('all'); setShowTargetDropdown(false); }}
                                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] font-bold transition-all ${selectedTarget === 'all' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <LayoutGrid size={14} />
                                                            <span>Todos os Destinos</span>
                                                        </div>
                                                        <span className="text-[10px] opacity-60">
                                                            ({allEvents.filter(e => filterPlatform === 'all' || e.platform === filterPlatform).length})
                                                        </span>
                                                    </button>
                                                    
                                                    {availableTargets.map(target => {
                                                        const count = allEvents.filter(e => e.title === target && (filterPlatform === 'all' || e.platform === filterPlatform)).length;
                                                        const platform = allEvents.find(e => e.title === target)?.platform;
                                                        const isSelected = selectedTarget === target;
                                                        
                                                        const platformConfig = {
                                                            instagram: { color: 'text-[#E4405F]', bg: 'bg-[#E4405F]/10', icon: <Instagram size={14} /> },
                                                            facebook: { color: 'text-[#1877F2]', bg: 'bg-[#1877F2]/10', icon: <Facebook size={14} /> },
                                                            whatsapp: { color: 'text-[#25D366]', bg: 'bg-[#25D366]/10', icon: <MessageCircle size={14} /> },
                                                            telegram: { color: 'text-[#0088cc]', bg: 'bg-[#0088cc]/10', icon: <Send size={14} /> },
                                                            youtube: { color: 'text-[#FF0000]', bg: 'bg-[#FF0000]/10', icon: <Video size={14} /> },
                                                            twitter: { color: 'text-black', bg: 'bg-gray-100', icon: <X size={14} /> }
                                                        };

                                                        const cfg = platformConfig[platform as keyof typeof platformConfig] || { color: 'text-gray-400', bg: 'bg-gray-50', icon: <Activity size={14} /> };
                                                        
                                                        return (
                                                            <button 
                                                                key={target}
                                                                onClick={() => { setSelectedTarget(target); setShowTargetDropdown(false); }}
                                                                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-[12px] font-black transition-all ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 translate-x-1' : 'hover:bg-gray-50 text-gray-700 hover:translate-x-1'}`}
                                                            >
                                                                <div className="flex items-center gap-3 truncate pr-2">
                                                                    <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-white/20 text-white' : `${cfg.bg} ${cfg.color}`}`}>
                                                                        {cfg.icon}
                                                                    </div>
                                                                    <span className="truncate tracking-tight">{target}</span>
                                                                </div>
                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg transition-colors ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                                    {count}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl">
                                <Search size={14} className="text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Pesquisar..." 
                                    className="bg-transparent border-none focus:ring-0 text-[13px] font-medium placeholder:text-gray-400 w-32" 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-gray-600">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <button className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl text-gray-600 transition-all active:scale-95">
                                <Filter size={18} />
                            </button>
                            <button 
                                onClick={handleQuickSchedule}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-black shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Rocket size={16} /> Programar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* View Container */}
            <div className="transition-all duration-500">
                {viewMode === 'day' && <DailyView />}
                {viewMode === 'week' && <WeeklyView />}
                {viewMode === 'month' && <MonthlyView />}
                {viewMode === 'list' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        {/* Reusing existing list layout logic but with premium styling */}
                        <div className="xl:col-span-7 space-y-6">
                            <div className="bg-white rounded-[24px] border border-gray-200/60 p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                                        <Download size={18} className="text-blue-500" /> Fila do Downloader
                                    </h2>
                                    <button onClick={() => loadDownloaderSchedules()} className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                                        <RefreshCw size={18} className={loadingDownloader || isRefreshing ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                                
                                {loadingDownloader ? (
                                    <div className="py-20 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-sm text-gray-500 font-medium">Sincronizando...</p></div>
                                ) : downloaderPosts.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200"><Download size={40} className="text-gray-200 mx-auto mb-4" /><p className="text-gray-400 font-medium">Nenhum post na fila</p></div>
                                ) : (
                                    <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                                        {downloaderPosts.map(post => (
                                            <div key={post.id} className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-blue-200 hover:shadow-xl transition-all duration-300">
                                                <div className="flex items-start gap-4">
                                                    <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                                                        {getPlatformIcon(post.platform, 24)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[14px] font-black text-gray-900 capitalize">{post.account_name || post.platform}</span>
                                                                <span className="text-gray-300">•</span>
                                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                                    post.status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                                                                    post.status === 'failed' ? 'bg-red-50 border-red-100 text-red-600' :
                                                                    'bg-blue-50 border-blue-100 text-blue-600'
                                                                }`}>{post.status}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={() => runDownloaderPostNow(post.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Play size={16} /></button>
                                                                <button onClick={() => deleteDownloaderPost(post.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                                            </div>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 group-hover:border-blue-100 group-hover:bg-blue-50/30 transition-all">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12} /> Agendado para</span>
                                                                <span className="text-[12px] font-black text-gray-700">{format(new Date(post.scheduled_at), "HH:mm '·' dd/MM")}</span>
                                                            </div>
                                                            <p className="text-[12px] text-gray-600 line-clamp-2 italic font-medium">"{post.caption || post.source_url}"</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="xl:col-span-5 space-y-6">
                            <div className="bg-white rounded-[24px] border border-gray-200/60 p-6 shadow-sm">
                                <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2 mb-6">
                                    <Activity size={18} className="text-indigo-500" /> Módulos de Automação
                                </h2>
                                <div className="space-y-4">
                                    {schedules.map(schedule => (
                                        <div key={schedule.id} className={`p-5 rounded-2xl border transition-all ${schedule.active ? 'bg-white border-gray-100 hover:border-indigo-200 shadow-sm' : 'bg-gray-50/50 border-gray-100 grayscale opacity-60'}`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 bg-gray-50 rounded-xl">{getPlatformIcon(schedule.platform, 20)}</div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-900 capitalize">Robô {schedule.platform}</p>
                                                        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">{schedule.active ? 'Operacional' : 'Pausado'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => toggleSchedule(schedule.id)} className={`p-2 rounded-xl transition-all ${schedule.active ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
                                                        {schedule.active ? <Pause size={16} /> : <Play size={16} />}
                                                    </button>
                                                    <button onClick={() => deleteSchedule(schedule.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            {schedule.active && (
                                                <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100/50 flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5"><Rocket size={12} /> Próximo envio</span>
                                                    <span className="text-[12px] font-black text-indigo-700">{schedule.nextExecution ? format(new Date(schedule.nextExecution), 'HH:mm') : '--:--'}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <AnimatePresence>
                {selectedEvent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedEvent(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden"
                        >
                            <div className="relative h-48 bg-gray-900 flex items-center justify-center overflow-hidden">
                                {selectedEvent.original?.thumbnail_url ? (
                                    <img src={selectedEvent.original.thumbnail_url} className="w-full h-full object-cover opacity-50" alt="" />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-900 opacity-80" />
                                )}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="p-5 bg-white/10 backdrop-blur-xl rounded-[24px] border border-white/20 shadow-2xl">
                                        {getPlatformIcon(selectedEvent.platform, 48)}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedEvent(null)}
                                    className="absolute top-6 right-6 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        {(() => {
                                            const isDone = selectedEvent.date < new Date() && (selectedEvent.type === 'robot' || selectedEvent.status === 'completed');
                                            const statusText = isDone ? (selectedEvent.type === 'robot' ? 'Enviado' : 'Concluído') : selectedEvent.status;
                                            
                                            return (
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                    isDone ? 'bg-emerald-50 text-emerald-600' :
                                                    selectedEvent.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                                }`}>
                                                    {statusText}
                                                </span>
                                            );
                                        })()}
                                        <h2 className="text-2xl font-black text-gray-900 mt-2">{selectedEvent.title}</h2>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">Horário</p>
                                        <p className="text-xl font-black text-gray-900">{format(selectedEvent.date, 'HH:mm')}</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Activity size={14} /> Conteúdo da Publicação
                                        </p>
                                        <p className="text-gray-700 font-medium leading-relaxed italic">"{selectedEvent.content || 'Sem descrição'}"</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Data</p>
                                            <p className="font-bold text-gray-900">{format(selectedEvent.date, 'dd/MM/yyyy')}</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo</p>
                                            <p className="font-bold text-gray-900 capitalize">{selectedEvent.type === 'post' ? 'Fila Downloader' : 'Robô Automático'}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                        <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                            <Send size={14} /> Destino da Publicação
                                        </p>
                                        <p className="font-black text-indigo-900">
                                            {(() => {
                                                if (selectedEvent.type === 'post') {
                                                    return selectedEvent.original.account_name || 'Conta configurada';
                                                }

                                                const config = parseConfig(selectedEvent.original.config);
                                                
                                                // Telegram Logic
                                                if (selectedEvent.platform === 'telegram' && config.groups && Array.isArray(config.groups)) {
                                                    if (config.groups.length === 0) return 'Nenhum grupo selecionado';
                                                    if (config.groups.length === 1) return config.groups[0].name || config.groups[0].id;
                                                    return `${config.groups.length} Grupos (${config.groups.map((g: any) => g.name).slice(0, 2).join(', ')}${config.groups.length > 2 ? '...' : ''})`;
                                                }

                                                // WhatsApp Logic
                                                if (selectedEvent.platform === 'whatsapp' && config.whatsappRecipients && Array.isArray(config.whatsappRecipients)) {
                                                    if (config.whatsappRecipients.length === 0) return 'Nenhum destinatário';
                                                    if (config.whatsappRecipients.length === 1) return config.whatsappRecipients[0].name || config.whatsappRecipients[0].id;
                                                    return `${config.whatsappRecipients.length} Destinatários (${config.whatsappRecipients.map((g: any) => g.name).slice(0, 2).join(', ')}${config.whatsappRecipients.length > 2 ? '...' : ''})`;
                                                }

                                                // Default/Fallback Logic (Facebook, Instagram, etc)
                                                return config.groupName || 
                                                       config.pageName || 
                                                       config.accountName || 
                                                       config.botInfo?.firstName ||
                                                       'Canal de Automação';
                                            })()}
                                        </p>
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        {selectedEvent.type === 'post' && (
                                            <button 
                                                onClick={() => { runDownloaderPostNow(selectedEvent.original.id); setSelectedEvent(null); }}
                                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-2xl font-black text-sm shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                <Play size={18} /> Publicar Agora
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => setSelectedEvent(null)}
                                            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 h-12 rounded-2xl font-black text-sm transition-all active:scale-95"
                                        >
                                            Fechar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const style = document.createElement('style');
style.textContent = `
    @keyframes pulse-subtle {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.85; transform: scale(0.98); }
    }
    .animate-pulse-subtle {
        animation: pulse-subtle 3s ease-in-out infinite;
    }
`;
document.head.appendChild(style);

export default SchedulesPage;
