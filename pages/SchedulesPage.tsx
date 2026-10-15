import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';
import {
    computeQueueSummary, sortPagesByPending, sortPagesByNext, formatNextPostLabel,
    resolvePostStatus, getMediaKind, pageKeyOf, STATUS_META,
    type PageQueueStats, type QueueStatusKey, type PostLike, type PageRef,
} from '../services/scheduleQueueStats';
import { 
    Calendar, Clock, Trash2, Play, Pause, Facebook, Video, MessageCircle, Send, 
    CheckCircle, XCircle, Download, Instagram, RefreshCw, Rocket, ShoppingBag,
    ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon, MoreVertical,
    CalendarDays, CalendarRange, Filter, Search, X, Activity, ChevronDown, Image as ImageIcon, Copy,
    PauseCircle, Pencil, CalendarClock, Layers, Undo2, GripVertical, AlertTriangle, Inbox
} from 'lucide-react';
import { 
    startOfWeek, endOfWeek, eachDayOfInterval, format, addDays, subDays, 
    startOfMonth, endOfMonth, isSameDay, isToday, addMonths, subMonths,
    parseISO, setHours, setMinutes, startOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';


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
    last_error?: string;
    is_trial?: boolean;
    comment_link_in_post?: boolean;
    shopee_link?: string;
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
    const [showCancelAllModal, setShowCancelAllModal] = useState(false);
    const [isCancellingAll, setIsCancellingAll] = useState(false);
    const [timeOffset, setTimeOffset] = useState(0);
    // Filtros (redes e formatos com multi-seleção; vazio = tudo)
    const [filterPlatforms, setFilterPlatforms] = useState<string[]>([]);
    const [filterFormats, setFilterFormats] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>('all');
    const [selectedUserCluster, setSelectedUserCluster] = useState<string[] | null>(null);
    const [selectedDestPlatform, setSelectedDestPlatform] = useState<string>('all');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [showDestDropdown, setShowDestDropdown] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    // Filtro por página/perfil (clicando no card da Fila de publicação)
    const [selectedPageKey, setSelectedPageKey] = useState<string | null>(null);
    // Fila de publicação: escopo (período da visão x total geral) e ordenação
    const [queueScope, setQueueScope] = useState<'period' | 'total'>('total');
    const [queueSort, setQueueSort] = useState<'pending' | 'next'>('pending');
    const [queueExpanded, setQueueExpanded] = useState(false);
    // Sheet "+N mais" (lista completa do dia) e reagendamento no drawer
    const [daySheet, setDaySheet] = useState<Date | null>(null);
    const [rescheduleValue, setRescheduleValue] = useState('');
    const [savingReschedule, setSavingReschedule] = useState(false);
    // Toast local com "Desfazer" (arrastar entre dias)
    const [undoToast, setUndoToast] = useState<{ id: number; message: string; onUndo: () => void } | null>(null);
    const dragEventId = useRef<string | null>(null);
    const [dragOverDay, setDragOverDay] = useState<string | null>(null);

    // Esc fecha drawer/sheets
    useEffect(() => {
        if (!selectedEvent && !daySheet) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setSelectedEvent(null); setDaySheet(null); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selectedEvent, daySheet]);
    const [accounts, setAccounts] = useState<any>({
        facebook: [], instagram: [], whatsapp: [], telegram: [], tiktok: [], youtube: [], twitter: []
    });
    const [associations, setAssociations] = useState<any[]>([]);
    const { showAlert, showConfirm } = useAlert();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterHour, setFilterHour] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

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



    const fetchAccounts = async () => {
        try {
            const resp = await api.get('/media/accounts');
            if (resp.data.success) {
                setAccounts(resp.data.accounts);
            }
        } catch (err) {
            console.error('Error fetching accounts:', err);
        }
    };

    const fetchAssociations = async () => {
        try {
            const resp = await api.get('/accounts/associations');
            if (resp.data.success) {
                setAssociations(resp.data.associations);
            }
        } catch (err) {
            console.error('Error fetching associations:', err);
        }
    };

    useEffect(() => {
        loadSchedules(false);
        loadDownloaderSchedules();
        fetchAccounts();
        fetchAssociations();

        const timer = setInterval(() => {
            loadSchedules(true);
            loadDownloaderSchedules(true);
        }, 30000);

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

                setDownloaderPosts(prev => {
                    if (JSON.stringify(prev) === JSON.stringify(posts)) return prev;
                    return posts;
                });
            }
        } catch (error) {
            console.error('Error loading downloader schedules:', error);
        } finally {
            if (!silent) setLoadingDownloader(false);
            else setIsRefreshing(false);
        }
    };

    const handleCancelAll = async (backup: boolean) => {
        try {
            setIsCancellingAll(true);
            const targetPlatform = filterPlatforms.length === 1 ? filterPlatforms[0] : null;
            
            if (backup) {
                const backupContent = cancelablePosts
                    .map(p => p.source_url)
                    .filter(Boolean)
                    .join('\n');

                if (backupContent.trim()) {
                    const blob = new Blob([backupContent], { type: 'text/plain' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const suffix = targetPlatform ? `_${targetPlatform}` : '';
                    a.download = `backup_links${suffix}_${new Date().toISOString().split('T')[0]}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }
            }

            const idsToDelete = cancelablePosts.map(p => p.id);
            await api.post('/media/schedule/bulk-delete', { ids: idsToDelete });
            await loadDownloaderSchedules();
            setShowCancelAllModal(false);
            
            showAlert(targetPlatform ? `Fila do ${targetPlatform.toUpperCase()} limpa com sucesso!` : 'Fila limpa com sucesso!', 'success');
        } catch (error: any) {
            console.error('Error clearing queue:', error);
            showAlert('error', error.response?.data?.error || 'Não foi possível remover os agendamentos.');
        } finally {
            setIsCancellingAll(false);
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
                            // Verify if it's recent (last 60 seconds) to avoid spamming old history
                            const execTime = new Date(s.lastExecution).getTime();
                            const now = new Date().getTime();
                            if (now - execTime < 60000) {
                                showAlert(`🤖 Robô ${s.platform} acabou de realizar um envio!`, 'success');
                            }
                        }
                        lastNotifiedExec.current[s.id] = s.lastExecution;
                    }
                });

                setSchedules(prev => {
                    if (JSON.stringify(prev) === JSON.stringify(newSchedules)) return prev;
                    return newSchedules;
                });
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
        showConfirm({
            title: 'Excluir agendamento?',
            message: 'Tem certeza que deseja excluir este agendamento recorrente?',
            confirmText: 'Excluir',
            onConfirm: async () => {
                try {
                    const response = await api.delete(`/schedule/${id}`);
                    if (response.data.success) {
                        setSchedules(schedules.filter(s => s.id !== id));
                        showAlert('Agendamento excluído', 'success');
                    }
                } catch (error) {
                    showAlert('Erro ao excluir agendamento', 'error');
                }
            },
        });
    };

    const runDownloaderPostNow = async (id: number) => {
        try {
            showAlert('Iniciando postagem...', 'info');
            setDownloaderPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'processing' } : p));
            setSelectedEvent(prev => prev?.original?.id === id ? { ...prev, status: 'processing', original: { ...prev.original, status: 'processing', error_message: null } } : prev);
            const response = await api.post(`/media/schedule/run-now/${id}`);
            
            if (!response.data.success) {
                showAlert('❌ ' + (response.data.error || 'Erro ao iniciar'), 'error');
                loadDownloaderSchedules(true);
                return;
            }

            showAlert('⏳ Processando postagem...', 'info');

            // Poll status until completed or failed (max 90s)
            let attempts = 0;
            const maxAttempts = 30; // 30 * 3s = 90s
            const poll = async () => {
                attempts++;
                try {
                    const statusResp = await api.get('/media/schedule');
                    const tasks = statusResp.data?.schedules || statusResp.data || [];
                    const task = tasks.find((t: any) => t.id === id);

                    if (!task) {
                        showAlert('✅ Postagem concluída!', 'success');
                        loadDownloaderSchedules(true);
                        return;
                    }

                    if (task.status === 'completed') {
                        setDownloaderPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'completed' } : p));
                        setSelectedEvent(prev => prev?.original?.id === id ? { ...prev, status: 'completed', original: { ...prev.original, status: 'completed' } } : prev);
                        showAlert('✅ Postagem realizada com sucesso!', 'success');
                        loadDownloaderSchedules(true);
                        return;
                    }

                    if (task.status === 'failed') {
                        setDownloaderPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'failed' } : p));
                        setSelectedEvent(prev => prev?.original?.id === id ? { ...prev, status: 'failed', original: { ...prev.original, status: 'failed', error_message: task.error_message } } : prev);
                        showAlert('❌ Falha na postagem: ' + (task.error_message || 'Erro desconhecido'), 'error');
                        loadDownloaderSchedules(true);
                        return;
                    }

                    // Still processing
                    if (attempts < maxAttempts) {
                        setTimeout(poll, 3000);
                    } else {
                        showAlert('⚠️ Timeout: postagem ainda em processamento. Verifique a fila.', 'warning');
                        loadDownloaderSchedules(true);
                    }
                } catch {
                    if (attempts < maxAttempts) setTimeout(poll, 3000);
                }
            };
            setTimeout(poll, 3000);
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

    const togglePausePost = async (post: DownloaderPost) => {
        const pausing = post.status === 'pending';
        try {
            const resp = await api.patch(`/media/schedule/${post.id}`, { paused: pausing });
            if (resp.data.success) {
                const updated = resp.data.post;
                setDownloaderPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...updated } : p));
                setSelectedEvent((prev: any) => prev?.original?.id === post.id
                    ? { ...prev, status: updated.status, original: { ...prev.original, ...updated } }
                    : prev);
                showAlert(pausing ? 'Post pausado — não será publicado até reativar.' : 'Post reativado e de volta à fila.', 'success');
            } else {
                showAlert(resp.data.error || 'Não foi possível alterar.', 'error');
            }
        } catch (err: any) { showAlert(err.response?.data?.error || 'Erro ao pausar/ativar', 'error'); }
    };

    const reschedulePost = async (id: number, iso: string) => {
        try {
            const resp = await api.patch(`/media/schedule/${id}`, { scheduled_at: iso });
            if (resp.data.success) {
                const updated = resp.data.post;
                setDownloaderPosts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
                setSelectedEvent((prev: any) => prev?.original?.id === id
                    ? { ...prev, date: new Date(updated.scheduled_at), original: { ...prev.original, ...updated } }
                    : prev);
                return true;
            }
            showAlert(resp.data.error || 'Não foi possível reagendar.', 'error');
            return false;
        } catch (err: any) {
            showAlert(err.response?.data?.error || 'Erro ao reagendar', 'error');
            return false;
        }
    };

    const duplicatePost = async (post: DownloaderPost) => {
        try {
            const resp = await api.post(`/media/schedule/${post.id}/duplicate`, {});
            if (resp.data.success) {
                setDownloaderPosts(prev => [...prev, resp.data.post]);
                showAlert('Post duplicado no fim da fila da conta.', 'success');
            } else {
                showAlert(resp.data.error || 'Não foi possível duplicar.', 'error');
            }
        } catch (err: any) { showAlert(err.response?.data?.error || 'Erro ao duplicar', 'error'); }
    };

    const editPostInDownloader = (post: DownloaderPost, targetName: string) => {
        sessionStorage.setItem('editPendingData', JSON.stringify({ targetName, pendingPosts: [post] }));
        if (setActiveTab) setActiveTab('downloader');
    };

    /** Toast inferior com botão Desfazer (usado no arrastar entre dias). */
    const showUndoToast = (message: string, onUndo: () => void) => {
        const id = Date.now();
        setUndoToast({ id, message, onUndo });
        setTimeout(() => {
            setUndoToast(prev => (prev && prev.id === id ? null : prev));
        }, 7000);
    };

    /** Chave página/perfil de um evento: `${platform}:${account_id}` (ou null). */
    const eventPageKey = (e: any): string | null => {
        if (e.type === 'post') {
            const acc = e.original?.account_id;
            if (acc === undefined || acc === null || acc === '') return null;
            return `${e.platform}:${String(acc)}`;
        }
        const config = parseConfig(e.original?.config);
        let accountId = '';
        if (e.platform === 'instagram') accountId = String(config.instagramAccount?.id || config.instagramAccount?.account_id || '');
        else if (e.platform === 'facebook') accountId = String(config.pages?.[0]?.id || config.selectedPages?.[0]?.id || '');
        else if (e.platform === 'whatsapp') accountId = String(config.whatsappRecipients?.[0]?.id || config.groups?.[0]?.groupId || config.groups?.[0]?.id || '');
        else if (e.platform === 'telegram') accountId = String(config.groups?.[0]?.id || config.groups?.[0]?.groupId || config.channelName || '');
        if (!accountId) return null;
        return `${e.platform}:${accountId}`;
    };

    /** Status canônico de um evento do calendário (posts + robôs projetados). */
    const eventStatusKey = (e: any, now: Date = new Date()): QueueStatusKey => {
        if (e.type === 'post') return resolvePostStatus(e.original);
        return e.date < now ? 'published' : 'scheduled';
    };

    const shiftDownloaderPost = async (id: number) => {
        try {
            await api.post(`/media/schedule/shift/${id}`);
            loadDownloaderSchedules(true);
            showAlert('Fila avançada com sucesso!', 'success');
        } catch (error: any) { 
            const errMsg = error?.response?.data?.error || 'Erro ao avançar fila';
            showAlert(`❌ ${errMsg}`, 'error'); 
        }
    };

    const parseConfig = (config: any) => {
        if (typeof config === 'object' && config !== null) return config;
        try { return JSON.parse(config); } catch (e) { return {}; }
    };

    const handlePauseAllSelected = async () => {
        const idsToPause = filteredSchedules.filter(s => s.active === 1).map(s => s.id);
        
        if (idsToPause.length === 0) {
            showAlert('Nenhum agendamento ativo para pausar.', 'info');
            return;
        }

        showConfirm({
            title: `Pausar ${idsToPause.length} agendamento(s)?`,
            message: 'Deseja pausar os agendamentos recorrentes filtrados?',
            confirmText: 'Pausar',
            onConfirm: async () => {
                try {
                    const response = await api.post('/schedule/bulk-toggle', { ids: idsToPause, active: 0 });
                    if (response.data.success) {
                        showAlert(`${idsToPause.length} agendamentos pausados com sucesso.`, 'success');
                        loadSchedules(true);
                    }
                } catch (error) {
                    showAlert('Erro ao pausar agendamentos', 'error');
                }
            },
        });
    };

    const handleResumeAllSelected = async () => {
        const idsToResume = filteredSchedules.filter(s => s.active === 0).map(s => s.id);
        
        if (idsToResume.length === 0) {
            showAlert('Nenhum agendamento pausado para ativar.', 'info');
            return;
        }

        showConfirm({
            title: `Ativar ${idsToResume.length} agendamento(s)?`,
            message: 'Deseja ativar os agendamentos recorrentes filtrados?',
            confirmText: 'Ativar',
            onConfirm: async () => {
                try {
                    const response = await api.post('/schedule/bulk-toggle', { ids: idsToResume, active: 1 });
                    if (response.data.success) {
                        showAlert(`${idsToResume.length} agendamentos ativados com sucesso.`, 'success');
                        loadSchedules(true);
                    }
                } catch (error) {
                    showAlert('Erro ao ativar agendamentos', 'error');
                }
            },
        });
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

    const flatAccounts = useMemo(() => {
        const list: any[] = [];
        const getAccId = (a: any, p: string) => {
            if (!a) return '';
            if (p === 'instagram') return String(a.account_id || a.id);
            if (p === 'whatsapp') return String(a.groupId || a.id);
            if (p === 'facebook') return String(a.page_id || a.id);
            return String(a.account_id || a.id || '');
        };

        Object.entries(accounts).forEach(([platform, accs]: [string, any]) => {
            if (!Array.isArray(accs)) return;
            accs.forEach(acc => {
                const id = getAccId(acc, platform);
                let name = acc.name || acc.groupName || acc.username || acc.channel_name || 'Conta';
                if (platform === 'instagram' && acc.username) name = `@${acc.username}`;
                if (platform === 'threads' && acc.username) name = `@${acc.username}`;
                if (platform === 'whatsapp') name = acc.groupName || acc.name;
                list.push({
                    platform,
                    accountId: id,
                    name,
                    key: `${platform}:${id}`
                });
            });
        });
        return list;
    }, [accounts]);

    const userClusters = useMemo(() => {
        const clusters: { name: string; keys: string[]; accounts: any[] }[] = [];
        const visited = new Set<string>();

        const findFullGroup = (startPlat: string, startId: string) => {
            const group = new Set<string>();
            group.add(`${startPlat}:${startId}`);
            
            let added = true;
            while (added) {
                added = false;
                associations.forEach(assoc => {
                    const keyA = `${assoc.account_a_platform}:${assoc.account_a_id}`;
                    const keyB = `${assoc.account_b_platform}:${assoc.account_b_id}`;
                    
                    if (group.has(keyA) && !group.has(keyB)) {
                        group.add(keyB);
                        added = true;
                    } else if (group.has(keyB) && !group.has(keyA)) {
                        group.add(keyA);
                        added = true;
                    }
                });
            }
            return Array.from(group);
        };

        flatAccounts.forEach(acc => {
            if (visited.has(acc.key)) return;

            const groupKeys = findFullGroup(acc.platform, acc.accountId);
            const groupAccs: any[] = [];
            groupKeys.forEach(k => {
                visited.add(k);
                const found = flatAccounts.find(fa => fa.key === k);
                if (found) groupAccs.push(found);
            });

            let repName = acc.name;
            // Prioritize Instagram username as representative name if available
            const igAcc = groupAccs.find(ga => ga.platform === 'instagram');
            if (igAcc) repName = igAcc.name;
            else {
                const fbAcc = groupAccs.find(ga => ga.platform === 'facebook');
                if (fbAcc) repName = fbAcc.name;
            }

            clusters.push({
                name: repName,
                keys: groupKeys,
                accounts: groupAccs.length > 0 ? groupAccs : [acc]
            });
        });

        // Also add any targets that are in allEvents but not in flatAccounts (e.g. from historical data)
        const flatKeys = new Set(flatAccounts.map(fa => fa.key));
        allEvents.forEach(e => {
            let accountId = '';
            if (e.type === 'post') {
                accountId = String(e.original?.account_id || '');
            } else if (e.type === 'robot') {
                const config = parseConfig(e.original?.config);
                if (e.platform === 'instagram') accountId = String(config.instagramAccount?.id || config.instagramAccount?.account_id || '');
                else if (e.platform === 'facebook') accountId = String(config.pages?.[0]?.id || config.selectedPages?.[0]?.id || '');
                else if (e.platform === 'whatsapp') accountId = String(config.whatsappRecipients?.[0]?.id || config.groups?.[0]?.groupId || config.groups?.[0]?.id || '');
                else if (e.platform === 'telegram') accountId = String(config.groups?.[0]?.id || config.groups?.[0]?.groupId || config.channelName || '');
            }
            if (!accountId || !e.platform) return;
            const key = `${e.platform}:${accountId}`;
            if (!flatKeys.has(key) && !visited.has(key)) {
                visited.add(key);
                clusters.push({
                    name: e.title || key,
                    keys: [key],
                    accounts: [{ platform: e.platform, accountId, name: e.title || key, key }]
                });
            }
        });

        return clusters.sort((a, b) => a.name.localeCompare(b.name));
    }, [flatAccounts, associations, allEvents]);

    const availableDestinations = useMemo(() => {
        if (selectedUser === 'all' || !selectedUserCluster) return [];
        const clusterAccs = flatAccounts.filter(fa => selectedUserCluster.includes(fa.key));
        if (clusterAccs.length === 0) {
            return selectedUserCluster.map(k => {
                const [platform] = k.split(':');
                return { platform, name: platform, key: k };
            });
        }
        return clusterAccs;
    }, [selectedUser, selectedUserCluster, flatAccounts]);

    const events = useMemo(() => {
        let filtered = allEvents;
        
        if (filterPlatforms.length > 0) {
            filtered = filtered.filter(e => filterPlatforms.includes(e.platform));
        }

        if (filterFormats.length > 0) {
            filtered = filtered.filter(e => {
                if (e.type !== 'post') return false;
                return filterFormats.includes(getMediaKind(e.original));
            });
        }

        if (selectedPageKey) {
            filtered = filtered.filter(e => eventPageKey(e) === selectedPageKey);
        }

        if (selectedUser !== 'all' && selectedUserCluster) {
            filtered = filtered.filter(e => {
                let accountId = '';
                if (e.type === 'post') {
                    accountId = String(e.original?.account_id || '');
                } else if (e.type === 'robot') {
                    const config = parseConfig(e.original?.config);
                    if (e.platform === 'instagram') accountId = String(config.instagramAccount?.id || config.instagramAccount?.account_id || '');
                    else if (e.platform === 'facebook') accountId = String(config.pages?.[0]?.id || config.selectedPages?.[0]?.id || '');
                    else if (e.platform === 'whatsapp') accountId = String(config.whatsappRecipients?.[0]?.id || config.groups?.[0]?.groupId || config.groups?.[0]?.id || '');
                    else if (e.platform === 'telegram') accountId = String(config.groups?.[0]?.id || config.groups?.[0]?.groupId || config.channelName || '');
                }
                const eventKey = `${e.platform}:${accountId}`;
                
                if (selectedDestPlatform !== 'all') {
                    const [destPlat, destId] = selectedDestPlatform.split(':');
                    return e.platform === destPlat && accountId === destId;
                }
                
                return selectedUserCluster.includes(eventKey) || e.title === selectedUser;
            });
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(e => 
                (e.title && e.title.toLowerCase().includes(term)) || 
                (e.content && e.content.toLowerCase().includes(term))
            );
        }

        if (filterStatus !== 'all') {
            filtered = filtered.filter(e => eventStatusKey(e) === filterStatus);
        }

        return filtered;
    }, [allEvents, filterPlatforms, selectedUser, selectedUserCluster, selectedDestPlatform, searchTerm, filterStatus, filterFormats, selectedPageKey]);

    const filteredDownloaderPosts = useMemo(() => {
        let filtered = downloaderPosts;
        
        if (filterPlatforms.length > 0) {
            filtered = filtered.filter(p => filterPlatforms.includes(p.platform));
        }

        if (filterFormats.length > 0) {
            filtered = filtered.filter(p => filterFormats.includes(getMediaKind(p)));
        }

        if (selectedPageKey) {
            filtered = filtered.filter(p => `${p.platform}:${String(p.account_id)}` === selectedPageKey);
        }

        if (selectedUser !== 'all' && selectedUserCluster) {
            filtered = filtered.filter(p => {
                const postKey = `${p.platform}:${p.account_id}`;
                if (selectedDestPlatform !== 'all') {
                    const [destPlat, destId] = selectedDestPlatform.split(':');
                    return p.platform === destPlat && String(p.account_id) === destId;
                }
                return selectedUserCluster.includes(postKey) || p.account_name === selectedUser;
            });
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                (p.account_name && p.account_name.toLowerCase().includes(term)) || 
                (p.caption && p.caption.toLowerCase().includes(term)) ||
                (p.source_url && p.source_url.toLowerCase().includes(term))
            );
        }

        return filtered;
    }, [downloaderPosts, filterPlatforms, selectedUser, selectedUserCluster, selectedDestPlatform, searchTerm, filterFormats, selectedPageKey]);

    const cancelablePosts = useMemo(() => {
        return filteredDownloaderPosts.filter(p => p.status === 'pending' || p.status === 'failed');
    }, [filteredDownloaderPosts]);

    const filteredSchedules = useMemo(() => {
        let filtered = schedules;

        if (filterPlatforms.length > 0) {
            filtered = filtered.filter(s => filterPlatforms.includes(s.platform));
        }

        if (selectedUser !== 'all' && selectedUserCluster) {
            filtered = filtered.filter(s => {
                const config = parseConfig(s.config);
                let accountId = '';
                if (s.platform === 'instagram') accountId = String(config.instagramAccount?.id || config.instagramAccount?.account_id || '');
                else if (s.platform === 'facebook') accountId = String(config.pages?.[0]?.id || config.selectedPages?.[0]?.id || '');
                else if (s.platform === 'whatsapp') accountId = String(config.whatsappRecipients?.[0]?.id || config.groups?.[0]?.groupId || config.groups?.[0]?.id || '');
                else if (s.platform === 'telegram') accountId = String(config.groups?.[0]?.id || config.groups?.[0]?.groupId || config.channelName || '');
                
                const scheduleKey = `${s.platform}:${accountId}`;
                if (selectedDestPlatform !== 'all') {
                    const [destPlat, destId] = selectedDestPlatform.split(':');
                    return s.platform === destPlat && accountId === destId;
                }
                return selectedUserCluster.includes(scheduleKey);
            });
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(s => 
                s.platform.toLowerCase().includes(term) ||
                (s.config && JSON.stringify(s.config).toLowerCase().includes(term))
            );
        }

        return filtered;
    }, [schedules, filterPlatforms, selectedUser, selectedUserCluster, selectedDestPlatform, searchTerm]);

    // Escopo da Fila de publicação conforme a visão atual (Dia/Semana/Mês).
    // Em visão Lista ou toggle "Total geral", sem limites de data.
    const queuePeriod = useMemo(() => {
        if (queueScope === 'total' || viewMode === 'list') return { from: null as Date | null, to: null as Date | null };
        if (viewMode === 'day') return { from: startOfDay(currentDate), to: new Date(startOfDay(currentDate).getTime() + 24 * 60 * 60 * 1000 - 1) };
        if (viewMode === 'week') return { from: startOfDay(currentDate), to: new Date(startOfDay(addDays(currentDate, 7)).getTime() - 1) };
        return { from: startOfMonth(currentDate), to: endOfMonth(currentDate) };
    }, [queueScope, viewMode, currentDate]);

    // Base da Fila de publicação: respeita rede/formato/usuário/pesquisa,
    // mas NÃO o filtro de página (seleção do card) nem o de status.
    const queueBasePosts = useMemo(() => {
        let filtered = downloaderPosts;
        if (filterPlatforms.length > 0) {
            filtered = filtered.filter(p => filterPlatforms.includes(p.platform));
        }
        if (filterFormats.length > 0) {
            filtered = filtered.filter(p => filterFormats.includes(getMediaKind(p)));
        }
        if (selectedUser !== 'all' && selectedUserCluster) {
            filtered = filtered.filter(p => {
                const postKey = `${p.platform}:${p.account_id}`;
                if (selectedDestPlatform !== 'all') {
                    const [destPlat, destId] = selectedDestPlatform.split(':');
                    return p.platform === destPlat && String(p.account_id) === destId;
                }
                return selectedUserCluster.includes(postKey) || p.account_name === selectedUser;
            });
        }
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                (p.account_name && p.account_name.toLowerCase().includes(term)) ||
                (p.caption && p.caption.toLowerCase().includes(term)) ||
                (p.source_url && p.source_url.toLowerCase().includes(term))
            );
        }
        return filtered;
    }, [downloaderPosts, filterPlatforms, selectedUser, selectedUserCluster, selectedDestPlatform, searchTerm, filterFormats]);

    // Páginas/perfis para a Fila: união das contas conectadas + páginas dos posts
    // (contas sem posts aparecem com "Fila vazia").
    const queuePages = useMemo<PageRef[]>(() => {
        const map = new Map<string, PageRef>();
        flatAccounts.forEach((acc: any) => {
            if (!filterPlatforms.length || filterPlatforms.includes(acc.platform)) {
                map.set(acc.key, { key: acc.key, platform: acc.platform, name: acc.name });
            }
        });
        queueBasePosts.forEach(p => {
            const key = `${p.platform}:${String(p.account_id)}`;
            if (!map.has(key)) {
                map.set(key, { key, platform: p.platform, name: p.account_name || String(p.account_id) });
            }
        });
        return Array.from(map.values());
    }, [flatAccounts, queueBasePosts, filterPlatforms]);

    const queueSummary = useMemo(() => {
        const now = new Date(Date.now() + timeOffset);
        return computeQueueSummary(queueBasePosts, queuePages, { from: queuePeriod.from, to: queuePeriod.to, now });
    }, [queueBasePosts, queuePages, queuePeriod, timeOffset, downloaderPosts]);

    const queueCards = useMemo(() => {
        return queueSort === 'pending' ? sortPagesByPending(queueSummary.pages) : sortPagesByNext(queueSummary.pages);
    }, [queueSummary, queueSort]);

    const activeFilterCount =
        filterPlatforms.length + filterFormats.length +
        (filterStatus !== 'all' ? 1 : 0) +
        (selectedUser !== 'all' ? 1 : 0) +
        (selectedDestPlatform !== 'all' ? 1 : 0) +
        (searchTerm.trim() ? 1 : 0) +
        (selectedPageKey ? 1 : 0);

    const clearAllFilters = () => {
        setFilterPlatforms([]);
        setFilterFormats([]);
        setFilterStatus('all');
        setSelectedUser('all');
        setSelectedUserCluster(null);
        setSelectedDestPlatform('all');
        setSearchTerm('');
        setSelectedPageKey(null);
    };

    /** Painel "Fila de publicação": um card por página/perfil conectada. */
    const QueuePanel = () => {
        const loadingQueue = loadingDownloader && downloaderPosts.length === 0;
        const visibleCards = queueExpanded ? queueCards : queueCards.slice(0, 8);
        const scopeLabel = queueScope === 'total'
            ? 'Total geral'
            : viewMode === 'day' ? 'Neste dia' : viewMode === 'week' ? 'Nesta semana' : 'Neste mês';

        const pageCard = (stat: PageQueueStats | null, isAll: boolean) => {
            const pending = isAll ? queueSummary.totals.pending : stat!.pending;
            const nextAt = isAll ? queueSummary.totals.nextAt : stat!.nextAt;
            const published = isAll ? queueSummary.totals.published : stat!.published;
            const failed = isAll ? queueSummary.totals.failed : stat!.failed;
            const paused = isAll ? queueSummary.totals.paused : stat!.paused;
            const processing = isAll ? queueSummary.totals.processing : stat!.processing;
            const total = isAll ? queueSummary.totals.total : stat!.total;
            const key = isAll ? '__all__' : stat!.key;
            const selected = isAll ? selectedPageKey === null : selectedPageKey === key;
            const pct = total > 0 ? Math.round((published / total) * 100) : 0;

            return (
                <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPageKey(isAll ? null : (selectedPageKey === key ? null : key))}
                    aria-pressed={selected}
                    title={isAll ? 'Ver todas as páginas' : `Filtrar: ${stat!.name} (clique de novo para remover)`}
                    className={`w-60 shrink-0 snap-start text-left rounded-2xl border p-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        selected ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/40 shadow-md' : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow'
                    }`}
                >
                    <div className="flex items-center gap-1.5 min-w-0">
                        {isAll
                            ? <span className="p-1.5 rounded-lg bg-indigo-100 shrink-0"><Layers size={13} className="text-indigo-700" /></span>
                            : <span className="p-1.5 rounded-lg bg-gray-50 shrink-0">{getPlatformIcon(stat!.platform, 13)}</span>}
                        <p className="text-[11px] font-bold text-gray-700 truncate min-w-0">
                            {isAll ? 'Todas as páginas' : `${stat!.platform.charAt(0).toUpperCase() + stat!.platform.slice(1)} · ${stat!.name}`}
                        </p>
                    </div>

                    <div className="flex items-end gap-1.5 mt-2">
                        <span key={pending} className={`text-[28px] leading-none font-black tabular-nums animate-queue-pop ${pending > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                            {pending}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-500 pb-1">faltam postar</span>
                        {processing > 0 && (
                            <span className="ml-auto mb-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
                                <RefreshCw size={10} className="animate-spin" />postando
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                        Próximo post: <span className="font-bold text-gray-700">{formatNextPostLabel(nextAt)}</span>
                    </p>

                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso: ${published} de ${total} publicados`}>
                        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">{published} de {total} publicados · {scopeLabel}</p>

                    <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-emerald-600">✓ {published}</span>
                        {failed > 0 && <span className="text-red-600">✕ {failed}</span>}
                        {paused > 0 && <span className="text-gray-500">⏸ {paused}</span>}
                    </div>

                    {pending === 0 && failed === 0 && (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-1.5 py-0.5">
                            <AlertTriangle size={10} /> Fila vazia
                        </p>
                    )}
                    {failed > 0 && (
                        <p className="mt-1.5 ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-1.5 py-0.5">
                            <XCircle size={10} /> {failed} falha{failed === 1 ? '' : 's'}
                        </p>
                    )}
                </button>
            );
        };

        return (
            <section aria-label="Fila de publicação" className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 mb-4">
                <div className="flex items-center gap-2 flex-wrap mb-2.5">
                    <h2 className="text-[13px] font-black text-gray-900 flex items-center gap-1.5">
                        <Inbox size={14} className="text-indigo-600" />
                        Fila de publicação
                        {isRefreshing && <RefreshCw size={12} className="animate-spin text-gray-400" aria-label="Atualizando" />}
                    </h2>
                    <div className="flex-1" />
                    {/* Toggle Período | Total geral */}
                    <div className="flex items-center bg-gray-50 p-0.5 rounded-lg border border-gray-100" role="group" aria-label="Escopo da fila">
                        {([['period', viewMode === 'list' ? 'Período' : `Período (${viewMode === 'day' ? 'dia' : viewMode === 'week' ? 'semana' : 'mês'})`], ['total', 'Total geral']] as const).map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => setQueueScope(id)}
                                aria-pressed={queueScope === id}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${queueScope === id ? 'bg-white text-indigo-700 shadow ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setQueueSort(s => (s === 'pending' ? 'next' : 'pending'))}
                        title={queueSort === 'pending' ? 'Ordenado: mais pendentes primeiro' : 'Ordenado: próximo post mais cedo'}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                    >
                        {queueSort === 'pending' ? '↓ Pendentes' : '⏱ Próximos'}
                    </button>
                    {queueCards.length > 8 && (
                        <button onClick={() => setQueueExpanded(v => !v)} className="px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-all">
                            {queueExpanded ? 'Ver menos' : `Ver todas (${queueCards.length})`}
                        </button>
                    )}
                </div>

                {loadingQueue ? (
                    <div className="flex gap-2.5 overflow-hidden" aria-label="Carregando fila">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="w-60 shrink-0 rounded-2xl border border-gray-100 p-3 animate-pulse">
                                <div className="h-3 w-2/3 bg-gray-100 rounded" />
                                <div className="h-8 w-16 bg-gray-100 rounded mt-3" />
                                <div className="h-2 w-full bg-gray-100 rounded mt-3" />
                            </div>
                        ))}
                    </div>
                ) : queueCards.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                        <Inbox size={28} className="text-gray-300 mx-auto mb-2" />
                        <p className="text-[12px] font-bold text-gray-500">Nenhuma página com os filtros atuais</p>
                        <button onClick={clearAllFilters} className="mt-2 text-[12px] font-bold text-indigo-600 hover:underline">Limpar filtros</button>
                    </div>
                ) : (
                    <div className="flex gap-2.5 overflow-x-auto pb-1 snap-x snap-mandatory custom-scrollbar" role="list" aria-label="Pendentes por página">
                        {pageCard(null, true)}
                        {visibleCards.map(stat => pageCard(stat, false))}
                    </div>
                )}
                {selectedPageKey && (
                    <button onClick={() => setSelectedPageKey(null)} className="mt-2 text-[11px] font-bold text-indigo-600 hover:underline">
                        ✕ Remover filtro de página
                    </button>
                )}
            </section>
        );
    };


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
        ),
        TikTok: ({ size = 14, className = "" }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.23-1.13 4.48-2.92 5.89-1.6 1.25-3.69 1.7-5.69 1.41-2.48-.36-4.66-1.92-5.74-4.14-1.12-2.29-1-5.11.37-7.24 1.26-1.95 3.5-3.14 5.76-3.37v4.06c-1.34.13-2.61.9-3.26 2.05-.62 1.09-.6 2.53.07 3.6.61.97 1.76 1.61 2.91 1.72 1.48.14 3.03-.4 3.93-1.52.79-.98 1.14-2.27 1.14-3.53.02-5.38.01-10.76.01-16.14z"/>
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
            case 'tiktok': return <BrandIcons.TikTok size={size} className="text-[#000000]" />;
            case 'twitter': 
            case 'x': return <BrandIcons.X size={size} className="text-[#000000]" />;
            default: return <Clock className="text-gray-400" size={size} />;
        }
    };

    const MEDIA_LABEL: Record<string, string> = { image: 'Imagem', video: 'Vídeo', carousel: 'Carrossel' };

    const mediaInfoOf = (original: any) => {
        const kind = getMediaKind(original || {});
        return { kind, label: MEDIA_LABEL[kind] };
    };

    const StatusIcon = ({ status, size = 11 }: { status: QueueStatusKey; size?: number }) => {
        if (status === 'published') return <CheckCircle size={size} className="text-emerald-600" />;
        if (status === 'failed') return <XCircle size={size} className="text-red-600" />;
        if (status === 'paused') return <PauseCircle size={size} className="text-gray-500" />;
        if (status === 'publishing') return <RefreshCw size={size} className="text-amber-600 animate-spin" />;
        return <Clock size={size} className="text-blue-600" />;
    };

    const EventCard = React.memo(({ event, compact = false }: { event: any; compact?: boolean }) => {
        const now = new Date(Date.now() + timeOffset);
        const statusKey = eventStatusKey(event, now);
        const meta = STATUS_META[statusKey];
        const isPastDone = statusKey === 'published' && event.date < now;
        const [menuOpen, setMenuOpen] = useState(false);
        const isPost = event.type === 'post';
        const canDrag = isPost && ['pending', 'paused', 'failed'].includes(String(event.original?.status || ''));
        const canPause = isPost && ['pending', 'paused'].includes(String(event.original?.status || ''));

        const displayTitle = isPost ? (event.content || event.title) : event.title;
        const displayAccount = isPost
            ? (event.original?.account_name || event.title)
            : event.title;
        const media = mediaInfoOf(event.original);
        const sourceUrl = isPost ? event.original?.source_url : null;

        const openDetails = () => {
            if (isPost && event.original?.scheduled_at) {
                const d = new Date(event.original.scheduled_at);
                if (!isNaN(d.getTime())) {
                    const pad = (n: number) => String(n).padStart(2, '0');
                    setRescheduleValue(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                }
            } else {
                setRescheduleValue('');
            }
            setSelectedEvent(event);
        };

        const doAction = async (action: string) => {
            setMenuOpen(false);
            const post = event.original;
            if (!isPost || !post) { openDetails(); return; }
            if (action === 'run') await runDownloaderPostNow(post.id);
            else if (action === 'pause') await togglePausePost(post);
            else if (action === 'duplicate') await duplicatePost(post);
            else if (action === 'edit') editPostInDownloader(post, displayAccount);
            else if (action === 'reschedule') openDetails();
            else if (action === 'delete') {
                showConfirm({
                    title: 'Excluir agendamento?',
                    message: `Remover "${String(displayTitle).slice(0, 80)}" da fila?`,
                    confirmText: 'Excluir',
                    onConfirm: () => deleteDownloaderPost(post.id),
                });
            }
        };

        return (
            <div
                role="button"
                tabIndex={0}
                aria-label={`${displayTitle}, ${meta.label}, ${format(event.date, 'HH:mm')}`}
                onClick={(e) => { e.stopPropagation(); openDetails(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(); } }}
                draggable={canDrag}
                onDragStart={(e) => { if (!canDrag) return; e.stopPropagation(); dragEventId.current = event.id; e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { dragEventId.current = null; setDragOverDay(null); }}
                title={`${displayTitle} — ${meta.label} ${format(event.date, "dd/MM HH:mm")}`}
                className={`group relative flex flex-col min-w-0 p-2 rounded-xl border border-l-4 ${meta.border} bg-white text-[11px] transition-all cursor-pointer outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 ${compact ? 'mb-1.5' : 'mb-2'} ${isPastDone ? 'opacity-60' : ''} ${statusKey === 'publishing' ? 'animate-pulse-subtle' : ''}`}
            >
                {/* Linha 1: horário + rede + status */}
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="font-extrabold text-[12px] text-gray-900 tabular-nums shrink-0">{format(event.date, 'HH:mm')}</span>
                    <div className="flex items-center gap-1 min-w-0">
                        {getPlatformIcon(event.platform, 13)}
                        <span aria-label={`Status: ${meta.label}`} title={meta.label} className={`inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide border ${meta.badge}`}>
                            <StatusIcon status={statusKey} size={10} />
                            {statusKey === 'publishing' ? 'Postando' : meta.label}
                        </span>
                        {isPost && (
                            <div className="relative shrink-0 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                                <button
                                    type="button"
                                    aria-label="Ações do agendamento"
                                    onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                                    className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                                >
                                    <MoreVertical size={13} />
                                </button>
                                {menuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                                        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-xl shadow-xl border border-gray-100 p-1 text-left">
                                            {[
                                                { id: 'run', label: 'Postar agora', icon: <Play size={13} className="text-blue-600" /> },
                                                ...(canPause ? [{ id: 'pause', label: event.original?.status === 'paused' ? 'Ativar' : 'Pausar', icon: event.original?.status === 'paused' ? <Play size={13} className="text-emerald-600" /> : <Pause size={13} className="text-amber-600" /> }] : []),
                                                { id: 'reschedule', label: 'Reagendar', icon: <CalendarClock size={13} className="text-indigo-600" /> },
                                                { id: 'duplicate', label: 'Duplicar', icon: <Copy size={13} className="text-gray-500" /> },
                                                { id: 'edit', label: 'Editar', icon: <Pencil size={13} className="text-gray-500" /> },
                                                { id: 'delete', label: 'Excluir', icon: <Trash2 size={13} className="text-red-500" /> },
                                            ].map(a => (
                                                <button
                                                    key={a.id}
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); doAction(a.id); }}
                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                                                >
                                                    {a.icon}{a.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Título (máx. 2 linhas) */}
                <p className="mt-1 font-bold text-[11px] leading-snug text-gray-900 line-clamp-2 break-words min-w-0">
                    {displayTitle}
                </p>

                {/* Formato + conta destino */}
                <div className="mt-1 flex items-center gap-1 min-w-0 text-[10px]">
                    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-md bg-gray-100 text-gray-600 font-bold uppercase text-[9px] tracking-wide shrink-0">
                        {media.kind === 'image' ? <ImageIcon size={10} /> : media.kind === 'carousel' ? <Copy size={10} /> : <Video size={10} />}
                        {media.label}
                    </span>
                    <span className="text-gray-400 truncate min-w-0" title={displayAccount}>· {displayAccount}</span>
                </div>

                {statusKey === 'failed' && event.last_error && (
                    <p className="mt-1 text-[9px] text-red-500 font-semibold truncate" title={event.last_error}>
                        {event.last_error}
                    </p>
                )}

                {/* Tooltip rica no hover (desktop): título, URL origem, destino, legenda */}
                <div className="pointer-events-none absolute left-0 top-full mt-1 z-50 hidden md:group-hover:block w-64 max-w-[70vw] bg-gray-900 text-white rounded-xl shadow-2xl p-3 text-left">
                    <p className="text-[11px] font-bold leading-snug break-words">{displayTitle}</p>
                    {sourceUrl && <p className="mt-1.5 text-[10px] text-gray-300 break-all line-clamp-2">{sourceUrl}</p>}
                    <p className="mt-1.5 text-[10px] text-gray-400">Destino: <span className="text-gray-200 font-semibold">{displayAccount}</span> · {meta.label} {format(event.date, "dd/MM HH:mm")}</p>
                    {isPost && event.original?.caption && event.original.caption !== displayTitle && (
                        <p className="mt-1 text-[10px] text-gray-300 italic line-clamp-3 break-words">"{event.original.caption}"</p>
                    )}
                </div>
            </div>
        );
    });

    const DailyView = () => {
        const rawDayEvents = events.filter(e => isSameDay(e.date, currentDate));
        const uniqueHours = Array.from(new Set(rawDayEvents.map(e => format(e.date, 'HH:mm')))).sort();
        
        const dayEvents = filterHour === 'all' 
            ? rawDayEvents 
            : rawDayEvents.filter(e => format(e.date, 'HH:mm') === filterHour);

        return (
            <div className="bg-white border border-gray-200 rounded-[24px] overflow-hidden shadow-sm">
                <div className={`p-6 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${isToday(currentDate) ? 'bg-blue-50/30' : ''}`}>
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => {
                                setFilterHour('all');
                                setViewMode(previousViewMode);
                            }}
                            className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-2xl transition-all active:scale-90 border border-gray-100"
                            title="Voltar"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div>
                            <p className="text-[12px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1">
                                {format(currentDate, 'EEEE', { locale: ptBR })}
                            </p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <h3 className="text-3xl font-black text-gray-900">
                                    {format(currentDate, 'd \'de\' MMMM', { locale: ptBR })}
                                </h3>
                                {uniqueHours.length > 0 && (
                                    <div className="relative">
                                        <select 
                                            value={filterHour} 
                                            onChange={e => setFilterHour(e.target.value)}
                                            className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm font-bold py-2 pl-4 pr-10 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer shadow-sm hover:shadow"
                                        >
                                            <option value="all">🕒 Todos os horários</option>
                                            {uniqueHours.map(h => (
                                                <option key={h} value={h}>🕒 {h}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto bg-gray-50 sm:bg-transparent p-4 sm:p-0 rounded-xl">
                        <p className="text-[12px] sm:text-[14px] font-bold text-gray-400">Total de agendamentos</p>
                        <p className="text-xl sm:text-2xl font-black text-gray-900">{dayEvents.length}</p>
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
                                            {event.type === 'post' && (
                                                <span className="ml-2 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200 shadow-sm flex items-center gap-1">
                                                    {event.original?.media_type === 'image' || event.original?.source_url?.includes('/photo') || event.original?.source_url?.includes('/p/') ? <ImageIcon size={10} /> : event.original?.media_type === 'carousel' ? <Copy size={10} /> : <Video size={10} />}
                                                    {event.original?.media_type === 'image' || event.original?.source_url?.includes('/photo') || event.original?.source_url?.includes('/p/') ? 'Imagem' : event.original?.media_type === 'carousel' ? 'Carrossel' : 'Vídeo'}
                                                </span>
                                            )}
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

    const handleDayDrop = async (day: Date) => {
        const id = dragEventId.current;
        setDragOverDay(null);
        dragEventId.current = null;
        if (!id) return;
        const ev = allEvents.find(e => e.id === id);
        if (!ev || ev.type !== 'post') return;
        const prevIso = ev.original.scheduled_at;
        const nd = new Date(day);
        nd.setHours(ev.date.getHours(), ev.date.getMinutes(), 0, 0);
        if (new Date(prevIso).getTime() === nd.getTime()) return;
        setDownloaderPosts(prevPosts => prevPosts.map(p => p.id === ev.original.id ? { ...p, scheduled_at: nd.toISOString() } : p));
        const ok = await reschedulePost(ev.original.id, nd.toISOString());
        if (ok) {
            showUndoToast(`Reagendado para ${format(nd, "dd/MM 'às' HH:mm")}.`, () => { reschedulePost(ev.original.id, prevIso); });
        } else {
            setDownloaderPosts(prevPosts => prevPosts.map(p => p.id === ev.original.id ? { ...p, scheduled_at: prevIso } : p));
        }
    };

    const WeeklyView = () => {
        const days = eachDayOfInterval({
            start: currentDate,
            end: addDays(currentDate, 6)
        });

        return (
            <>
                {/* Desktop/tablet: 7 colunas iguais sem scroll da página.
                    <lg: scroll horizontal INTERNO com largura mínima por coluna. */}
                <div className="hidden md:block overflow-x-auto lg:overflow-visible rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex lg:grid lg:grid-cols-7 gap-px bg-gray-200 min-w-0">
                        {days.map((day, idx) => {
                            const dayKey = format(day, 'yyyy-MM-dd');
                            const dayEvents = events.filter(e => isSameDay(e.date, day));
                            const today = isToday(day);
                            const visible = dayEvents.slice(0, 4);
                            const extra = dayEvents.length - visible.length;
                            return (
                                <div
                                    key={idx}
                                    onDragOver={(e) => { if (dragEventId.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverDay(dayKey); } }}
                                    onDragLeave={() => setDragOverDay(prev => (prev === dayKey ? null : prev))}
                                    onDrop={(e) => { e.preventDefault(); handleDayDrop(day); }}
                                    className={`min-w-[228px] lg:min-w-0 max-w-full flex-1 flex flex-col min-h-[480px] max-h-[560px] transition-colors ${today ? 'bg-blue-50/50' : 'bg-white'} ${dragOverDay === dayKey ? 'outline-2 outline outline-blue-500 bg-blue-50' : ''}`}
                                >
                                    <div
                                        onClick={() => {
                                            setPreviousViewMode('week');
                                            setViewMode('day');
                                            setCurrentDate(day);
                                        }}
                                        className={`sticky top-0 z-10 p-3 text-center border-b cursor-pointer hover:bg-blue-50 transition-all ${today ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'}`}
                                    >
                                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${today ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {format(day, 'eee', { locale: ptBR })}
                                        </p>
                                        <p className={`inline-flex items-center justify-center min-w-[2rem] h-8 px-1 text-lg font-black rounded-full ${today ? 'bg-blue-600 text-white' : 'text-gray-900'}`}>
                                            {format(day, 'd')}
                                        </p>
                                        {dayEvents.length > 0 && (
                                            <p className="text-[9px] font-bold text-gray-400 mt-0.5">{dayEvents.length} {dayEvents.length === 1 ? 'post' : 'posts'}</p>
                                        )}
                                    </div>
                                    <div className="flex-1 p-1.5 overflow-y-auto custom-scrollbar min-w-0">
                                        {visible.map(event => <EventCard key={event.id} event={event} />)}
                                        {extra > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setDaySheet(day)}
                                                className="w-full py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors"
                                            >
                                                +{extra} mais
                                            </button>
                                        )}
                                        <button 
                                            onClick={handleQuickSchedule}
                                            className="w-full mt-1.5 py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-1 group active:scale-95"
                                        >
                                            <Clock size={12} className="group-hover:scale-110 transition-transform" />
                                            <span className="text-[10px] font-bold uppercase">Programar</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Mobile View */}
                <div className="grid grid-cols-1 md:hidden gap-4">
                    {days.map((day, idx) => {
                        const dayEvents = events.filter(e => isSameDay(e.date, day));
                        return (
                            <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                                <div 
                                    onClick={() => {
                                        setPreviousViewMode('week');
                                        setViewMode('day');
                                        setCurrentDate(day);
                                    }}
                                    className="flex justify-between items-center pb-2 border-b border-gray-100 cursor-pointer"
                                >
                                    <div>
                                        <span className={`text-[12px] font-black uppercase tracking-wider ${isToday(day) ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {format(day, 'EEEE', { locale: ptBR })}
                                        </span>
                                        <h4 className="text-base font-black text-gray-900 mt-0.5">{format(day, 'd \'de\' MMMM', { locale: ptBR })}</h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {dayEvents.length > 0 && (
                                            <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                                {dayEvents.length} {dayEvents.length === 1 ? 'post' : 'posts'}
                                            </span>
                                        )}
                                        {isToday(day) && (
                                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
                                                Hoje
                                            </span>
                                        )}
                                        <ChevronRight size={16} className="text-gray-400" />
                                    </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {dayEvents.length > 0 ? (
                                        dayEvents.map(event => <EventCard key={event.id} event={event} />)
                                    ) : (
                                        <p className="text-[11px] text-gray-400 text-center py-2">Nenhum agendamento</p>
                                    )}
                                    <button 
                                        onClick={handleQuickSchedule}
                                        className="w-full mt-2 py-2 border border-dashed border-gray-100 rounded-xl text-gray-400 hover:bg-gray-50 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                                    >
                                        <Clock size={12} />
                                        <span className="text-[10px] font-bold uppercase">Programar</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>
        );
    };

    const MonthlyView = () => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        const calendarDays = eachDayOfInterval({
            start: startOfWeek(start, { weekStartsOn: 0 }),
            end: endOfWeek(end, { weekStartsOn: 0 })
        });

        // For mobile, only get calendarDays in the current month
        const daysInMonth = calendarDays.filter(day => format(day, 'M') === format(currentDate, 'M'));
        const daysWithEvents = daysInMonth.filter(day => events.some(e => isSameDay(e.date, day)));

        return (
            <>
                <div className="hidden md:grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
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

                {/* Mobile View */}
                <div className="grid grid-cols-1 md:hidden gap-4">
                    {daysWithEvents.length > 0 ? (
                        daysWithEvents.map((day, idx) => {
                            const dayEvents = events.filter(e => isSameDay(e.date, day));
                            return (
                                <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                                    <div 
                                        onClick={() => {
                                            setPreviousViewMode('month');
                                            setViewMode('day');
                                            setCurrentDate(day);
                                        }}
                                        className="flex justify-between items-center pb-2 border-b border-gray-100 cursor-pointer"
                                    >
                                        <div>
                                            <span className={`text-[12px] font-black uppercase tracking-wider ${isToday(day) ? 'text-blue-600' : 'text-gray-400'}`}>
                                                {format(day, 'EEEE', { locale: ptBR })}
                                            </span>
                                            <h4 className="text-base font-black text-gray-900 mt-0.5">{format(day, 'd \'de\' MMMM', { locale: ptBR })}</h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                                {dayEvents.length} {dayEvents.length === 1 ? 'post' : 'posts'}
                                            </span>
                                            <ChevronRight size={16} className="text-gray-400" />
                                        </div>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {dayEvents.map(event => <EventCard key={event.id} event={event} />)}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                            <Calendar size={32} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-400 font-bold">Nenhum agendamento neste mês</p>
                            <button 
                                onClick={handleQuickSchedule}
                                className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100 active:scale-95 transition-all"
                            >
                                Programar Agora
                            </button>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // --- Main UI Rendering ---

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4 sm:px-0 min-w-0 animate-fade-in">
            {/* Cancel All Modal */}
            <AnimatePresence>
                {showCancelAllModal && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isCancellingAll && setShowCancelAllModal(false)}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full"
                        >
                            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                <Trash2 size={32} className="text-red-500" />
                            </div>
                            
                            <h3 className="text-[20px] font-black text-gray-900 text-center mb-2">
                                Cancelar Selecionados ({cancelablePosts.length})?
                            </h3>
                            <p className="text-gray-500 text-center text-[14px] mb-8 leading-relaxed">
                                Você está prestes a remover {cancelablePosts.length} agendamento(s) (pendentes e falhos) selecionados da fila {targetPlatform ? `do ${targetPlatform.toUpperCase()}` : 'geral'}. Deseja fazer backup dos links antes de excluir?
                            </p>

                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    disabled={isCancellingAll}
                                    onClick={() => handleCancelAll(true)}
                                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                                >
                                    {isCancellingAll ? (
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Download size={18} /> Sim, Baixar Backup e Excluir
                                        </>
                                    )}
                                </button>
                                <button
                                    disabled={isCancellingAll}
                                    onClick={() => handleCancelAll(false)}
                                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold transition-all disabled:opacity-50"
                                >
                                    Excluir Tudo Agora (Sem Backup)
                                </button>
                                <button
                                    disabled={isCancellingAll}
                                    onClick={() => setShowCancelAllModal(false)}
                                    className="w-full px-6 py-4 text-gray-400 hover:text-gray-600 font-bold transition-all"
                                >
                                    Voltar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            
            {/* Header compacto */}
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur rounded-2xl border border-gray-200/60 px-3 py-2.5 sm:px-4 shadow-sm mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-[15px] font-black text-gray-900 tracking-tight mr-1">Agendamentos</h1>

                    {/* Navegação de período */}
                    <div className="flex items-center gap-0.5">
                        <button
                            aria-label="Período anterior"
                            onClick={() => setCurrentDate(
                                viewMode === 'day' || viewMode === 'week' ? subDays(currentDate, viewMode === 'day' ? 1 : 7) :
                                subMonths(currentDate, 1)
                            )}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-all active:scale-90"
                        >
                            <ChevronLeft size={17} />
                        </button>
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="px-2.5 py-1.5 hover:bg-gray-100 rounded-lg text-[12px] font-bold text-gray-600 transition-all active:scale-95"
                        >
                            Hoje
                        </button>
                        <button
                            aria-label="Próximo período"
                            onClick={() => setCurrentDate(
                                viewMode === 'day' || viewMode === 'week' ? addDays(currentDate, viewMode === 'day' ? 1 : 7) :
                                addMonths(currentDate, 1)
                            )}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-all active:scale-90"
                        >
                            <ChevronRight size={17} />
                        </button>
                        <h2 className="text-[13px] sm:text-sm font-extrabold text-gray-900 capitalize ml-1 whitespace-nowrap">
                            {viewMode === 'day' ? format(currentDate, 'd \'de\' MMMM yyyy', { locale: ptBR }) : format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                        </h2>
                    </div>

                    <div className="flex-1" />

                    {/* Dia | Semana | Mês | Lista */}
                    <div className="flex items-center gap-0.5 bg-gray-50 p-0.5 rounded-xl border border-gray-100" role="tablist" aria-label="Modo de visualização">
                        {([
                            { id: 'day', label: 'Dia', icon: <CalendarDays size={13} /> },
                            { id: 'week', label: 'Semana', icon: <CalendarRange size={13} /> },
                            { id: 'month', label: 'Mês', icon: <LayoutGrid size={13} /> },
                            { id: 'list', label: 'Lista', icon: <ListIcon size={13} /> },
                        ] as const).map(v => (
                            <button
                                key={v.id}
                                role="tab"
                                aria-selected={viewMode === v.id}
                                onClick={() => setViewMode(v.id)}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 ${viewMode === v.id ? 'bg-white text-blue-600 shadow ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                {v.icon}<span className="hidden sm:inline">{v.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="w-px self-stretch bg-gray-200/80 hidden sm:block" />

                    {/* Ação primária */}
                    <button
                        onClick={handleQuickSchedule}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[12px] font-bold shadow-md shadow-blue-200 transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
                    >
                        <Rocket size={14} /> Programar
                    </button>
                </div>

                {/* Linha 2 — busca, filtros e ações em massa */}
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 flex-wrap">

                    {/* Busca */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-xl focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                        <Search size={13} className="text-gray-400 shrink-0" />
                        <input
                            type="text"
                            aria-label="Pesquisar agendamentos"
                            placeholder="Pesquisar"
                            className="bg-transparent border-none focus:ring-0 text-[12px] font-medium placeholder:text-gray-400 w-24 focus:w-36 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-gray-600" aria-label="Limpar pesquisa">
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* Filtros (popover) */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowFilters(v => !v); setShowUserDropdown(false); setShowDestDropdown(false); }}
                            aria-expanded={showFilters}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all border ${activeFilterCount > 0 ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                        >
                            <Filter size={13} />
                            Filtros
                            {activeFilterCount > 0 && (
                                <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-white text-indigo-700 text-[10px] font-black flex items-center justify-center">{activeFilterCount}</span>
                            )}
                            <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {showFilters && (
                                <>
                                    <div className="fixed inset-0 z-[60]" onClick={() => setShowFilters(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                        className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-100 z-[70] overflow-hidden"
                                    >
                                        <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filtros</span>
                                            {activeFilterCount > 0 && (
                                                <button onClick={clearAllFilters} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700">Limpar tudo</button>
                                            )}
                                        </div>
                                        <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Redes</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { id: 'telegram', name: 'Telegram', icon: <BrandIcons.Telegram size={13} /> },
                                                        { id: 'whatsapp', name: 'WhatsApp', icon: <BrandIcons.WhatsApp size={13} /> },
                                                        { id: 'facebook', name: 'Facebook', icon: <BrandIcons.Facebook size={13} /> },
                                                        { id: 'instagram', name: 'Instagram', icon: <BrandIcons.Instagram size={13} /> },
                                                        { id: 'tiktok', name: 'TikTok', icon: <BrandIcons.TikTok size={13} /> },
                                                        { id: 'youtube', name: 'Shorts', icon: <BrandIcons.YouTube size={13} /> },
                                                        { id: 'twitter', name: 'X', icon: <BrandIcons.X size={13} /> },
                                                    ].map(p => {
                                                        const on = filterPlatforms.includes(p.id);
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                onClick={() => setFilterPlatforms(prev => on ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                                                                aria-pressed={on}
                                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${on ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                                                            >
                                                                {p.icon}{p.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Formato</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { id: 'video', name: 'Vídeo', icon: <Video size={13} /> },
                                                        { id: 'image', name: 'Imagem', icon: <ImageIcon size={13} /> },
                                                        { id: 'carousel', name: 'Carrossel', icon: <Copy size={13} /> },
                                                    ].map(m => {
                                                        const on = filterFormats.includes(m.id);
                                                        return (
                                                            <button
                                                                key={m.id}
                                                                onClick={() => setFilterFormats(prev => on ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                                                                aria-pressed={on}
                                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${on ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                                                            >
                                                                {m.icon}{m.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Status</p>
                                                <select
                                                    value={filterStatus}
                                                    onChange={(e) => setFilterStatus(e.target.value)}
                                                    className="w-full bg-white border border-gray-200 text-gray-700 text-[12px] font-bold py-2 pl-3 pr-8 rounded-xl outline-none focus:border-blue-500 cursor-pointer"
                                                >
                                                    <option value="all">Todos os status</option>
                                                    <option value="scheduled">Agendados</option>
                                                    <option value="publishing">Publicando agora</option>
                                                    <option value="published">Publicados</option>
                                                    <option value="failed">Falhas</option>
                                                    <option value="paused">Pausados</option>
                                                </select>
                                            </div>
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                        {/* Edit Pending Button */}
                        {selectedUser !== 'all' && filteredDownloaderPosts.some(p => p.status === 'pending') && (
                            <button
                                onClick={() => {
                                    const pendingToEdit = filteredDownloaderPosts.filter(p => p.status === 'pending');
                                    sessionStorage.setItem('editPendingData', JSON.stringify({
                                        targetName: selectedUser,
                                        pendingPosts: pendingToEdit
                                    }));
                                    if (setActiveTab) setActiveTab('downloader');
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all"
                                title={`Editar pendentes de ${selectedUser}`}
                            >
                                ✏️ Editar Pendentes
                            </button>
                        )}

                        {/* Pause / Resume: desabilitados e acinzentados quando o contador é 0 */}
                        <button
                            onClick={handlePauseAllSelected}
                            disabled={filteredSchedules.filter(s => s.active === 1).length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all border disabled:opacity-40 disabled:cursor-not-allowed bg-white text-gray-600 border-gray-200 hover:border-red-200 hover:text-red-600 hover:bg-red-50"
                            title={selectedUser === 'all' ? 'Pausar Todos os Agendamentos Recorrentes' : `Pausar Agendamentos de ${selectedUser}`}
                        >
                            <Pause size={13} />
                            <span className="hidden xl:inline">
                                {selectedUser === 'all'
                                    ? `Pausar todos (${filteredSchedules.filter(s => s.active === 1).length})`
                                    : `Pausar (${filteredSchedules.filter(s => s.active === 1).length})`}
                            </span>
                        </button>

                        <button
                            onClick={handleResumeAllSelected}
                            disabled={filteredSchedules.filter(s => s.active === 0).length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all border disabled:opacity-40 disabled:cursor-not-allowed bg-white text-gray-600 border-gray-200 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50"
                            title={selectedUser === 'all' ? 'Ativar Todos os Agendamentos Recorrentes' : `Ativar Agendamentos de ${selectedUser}`}
                        >
                            <Play size={13} />
                            <span className="hidden xl:inline">
                                {selectedUser === 'all'
                                    ? `Ativar todos (${filteredSchedules.filter(s => s.active === 0).length})`
                                    : `Ativar (${filteredSchedules.filter(s => s.active === 0).length})`}
                            </span>
                        </button>

                        {/* User Selector Dropdown */}
                        <div className="relative">
                            <button 
                                onClick={() => { setShowUserDropdown(!showUserDropdown); setShowDestDropdown(false); setShowFilters(false); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all border ${
                                    selectedUser !== 'all' 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow' 
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                <Filter size={14} />
                                {selectedUser === 'all' ? 'Usuários' : selectedUser}
                                <ChevronDown size={14} className={`transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {showUserDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-[60]" onClick={() => setShowUserDropdown(false)} />
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[70] overflow-hidden"
                                        >
                                            <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selecionar Usuário</span>
                                                {selectedUser !== 'all' && (
                                                    <button 
                                                        onClick={() => { setSelectedUser('all'); setSelectedUserCluster(null); setSelectedDestPlatform('all'); setShowUserDropdown(false); }}
                                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                                                    >
                                                        Limpar
                                                    </button>
                                                )}
                                            </div>
                                            <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                                <button 
                                                    onClick={() => { setSelectedUser('all'); setSelectedUserCluster(null); setSelectedDestPlatform('all'); setShowUserDropdown(false); }}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] font-bold transition-all ${selectedUser === 'all' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <LayoutGrid size={14} />
                                                        <span>Todos os Usuários</span>
                                                    </div>
                                                </button>
                                                
                                                {userClusters.map(cluster => {
                                                    const isSelected = selectedUser === cluster.name;
                                                    return (
                                                        <button 
                                                            key={cluster.name}
                                                            onClick={() => { setSelectedUser(cluster.name); setSelectedUserCluster(cluster.keys); setSelectedDestPlatform('all'); setShowUserDropdown(false); }}
                                                            className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-[12px] font-black transition-all ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 translate-x-1' : 'hover:bg-gray-50 text-gray-700 hover:translate-x-1'}`}
                                                        >
                                                            <div className="flex items-center gap-3 truncate pr-2">
                                                                <div className="flex -space-x-1 items-center">
                                                                    {cluster.accounts.slice(0, 3).map((acc, index) => (
                                                                        <div key={index} className="p-1 rounded-full bg-white border border-gray-100 shrink-0">
                                                                            {getPlatformIcon(acc.platform, 12)}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <span className="truncate tracking-tight">{cluster.name}</span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Destination / Platform Selector Dropdown */}
                        {selectedUser !== 'all' && (
                            <div className="relative">
                                <button 
                                    onClick={() => { setShowDestDropdown(!showDestDropdown); setShowUserDropdown(false); setShowFilters(false); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all border ${
                                        selectedDestPlatform !== 'all' 
                                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-100' 
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <Send size={14} />
                                    {selectedDestPlatform === 'all' ? 'Todos os Destinos' : (flatAccounts.find(fa => fa.key === selectedDestPlatform)?.platform.toUpperCase() || 'Destino')}
                                    <ChevronDown size={14} className={`transition-transform ${showDestDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {showDestDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-[60]" onClick={() => setShowDestDropdown(false)} />
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[70] overflow-hidden"
                                            >
                                                <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filtrar Destino</span>
                                                    {selectedDestPlatform !== 'all' && (
                                                        <button 
                                                            onClick={() => { setSelectedDestPlatform('all'); setShowDestDropdown(false); }}
                                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                                                        >
                                                            Limpar
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                                    <button 
                                                        onClick={() => { setSelectedDestPlatform('all'); setShowDestDropdown(false); }}
                                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] font-bold transition-all ${selectedDestPlatform === 'all' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <LayoutGrid size={14} />
                                                            <span>Todos os Destinos Associados</span>
                                                        </div>
                                                    </button>
                                                    
                                                    {availableDestinations.map(dest => {
                                                        const isSelected = selectedDestPlatform === dest.key;
                                                        return (
                                                            <button 
                                                                key={dest.key}
                                                                onClick={() => { setSelectedDestPlatform(dest.key); setShowDestDropdown(false); }}
                                                                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-[12px] font-black transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 translate-x-1' : 'hover:bg-gray-50 text-gray-700 hover:translate-x-1'}`}
                                                            >
                                                                <div className="flex items-center gap-3 truncate pr-2">
                                                                    <div className="p-2 bg-gray-50 rounded-lg shrink-0">
                                                                        {getPlatformIcon(dest.platform, 14)}
                                                                    </div>
                                                                    <span className="truncate tracking-tight">{dest.name}</span>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                </div>
                </div>

            {/* Fila de publicação (painel por página/perfil) */}
            {viewMode !== 'list' && <QueuePanel />}

            {/* View Container */}
            <div className="transition-all duration-500 min-w-0">
                {viewMode === 'day' && DailyView()}
                {viewMode === 'week' && WeeklyView()}
                {viewMode === 'month' && MonthlyView()}
                {viewMode === 'list' && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        {/* Reusing existing list layout logic but with premium styling */}
                        <div className="xl:col-span-7 space-y-6">
                            <div className="bg-white rounded-[24px] border border-gray-200/60 p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
                                        <Download size={18} className="text-blue-500" /> Fila do Downloader
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {cancelablePosts.length > 0 && (
                                            <button 
                                                onClick={() => {
                                                    console.log('Botão cancelar clicado, mudando estado para true');
                                                    setShowCancelAllModal(true);
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[12px] font-bold transition-colors"
                                            >
                                                <Trash2 size={14} /> Cancelar Selecionados ({cancelablePosts.length})
                                            </button>
                                        )}
                                        <button onClick={() => loadDownloaderSchedules()} className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                                            <RefreshCw size={18} className={loadingDownloader || isRefreshing ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>
                                
                                {loadingDownloader ? (
                                    <div className="py-20 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-sm text-gray-500 font-medium">Sincronizando...</p></div>
                                ) : filteredDownloaderPosts.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200"><Download size={40} className="text-gray-200 mx-auto mb-4" /><p className="text-gray-400 font-medium">Nenhum post encontrado</p></div>
                                ) : (
                                    <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                                        {filteredDownloaderPosts.map(post => (
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
                                    {filteredSchedules.map(schedule => (
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
            {createPortal(
                <AnimatePresence>
                    {selectedEvent && (
                        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Detalhes do agendamento">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedEvent(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto custom-scrollbar flex flex-col"
                        >
                            <div className="p-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 bg-white z-10">
                                <span className="p-2 rounded-xl bg-gray-50">{getPlatformIcon(selectedEvent.platform, 22)}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Detalhes do agendamento</p>
                                    <p className="text-sm font-black text-gray-900 truncate">{format(selectedEvent.date, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedEvent(null)}
                                    aria-label="Fechar detalhes"
                                    className="p-2 hover:bg-gray-100 text-gray-500 rounded-full transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-4 sm:p-5 flex-1">
                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <div className="min-w-0">
                                        {(() => {
                                            const sk = eventStatusKey(selectedEvent);
                                            const meta = STATUS_META[sk];
                                            return (
                                                <span aria-label={`Status: ${meta.label}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${meta.badge}`}>
                                                    <StatusIcon status={sk} size={11} />
                                                    {sk === 'publishing' ? 'Publicando agora' : meta.label}
                                                </span>
                                            );
                                        })()}
                                        <h2 className="text-lg font-black text-gray-900 mt-2 leading-snug break-words">{selectedEvent.title}</h2>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Horário</p>
                                        <p className="text-xl font-black text-gray-900 tabular-nums">{format(selectedEvent.date, 'HH:mm')}</p>
                                    </div>
                                </div>

                                <div className="space-y-4 md:space-y-6">
                                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Activity size={14} /> Descrição
                                        </p>
                                        <p className="text-gray-700 font-medium leading-relaxed italic">"{selectedEvent.content || 'Sem descrição'}"</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Data</p>
                                            <p className="font-bold text-gray-900">{format(selectedEvent.date, 'dd/MM/yyyy')}</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Mídia</p>
                                            <p className="font-bold text-gray-900 capitalize">
                                                {selectedEvent.type === 'post' 
                                                    ? (selectedEvent.original?.media_type === 'image' || selectedEvent.original?.source_url?.includes('/photo.php') || selectedEvent.original?.source_url?.includes('/photo/') || selectedEvent.original?.source_url?.includes('/p/') ? 'Foto / Imagem' : 
                                                       selectedEvent.original?.media_type === 'carousel' ? 'Carrossel' : 
                                                       'Vídeo')
                                                    : 'Robô Automático'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                        <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                            <Send size={14} /> Destino da Publicação
                                        </p>
                                        <p className="font-black text-indigo-900">
                                            {(() => {
                                                if (selectedEvent.type === 'post') {
                                                    const platform = selectedEvent.original?.platform || selectedEvent.platform || '';
                                                    const formattedPlatform = platform.toLowerCase() === 'tiktok' ? 'TikTok' : 
                                                                              platform.toLowerCase() === 'facebook' ? 'Facebook' : 
                                                                              platform.toLowerCase() === 'instagram' ? 'Instagram' : 
                                                                              platform.toLowerCase() === 'twitter' ? 'Twitter/X' : 
                                                                              platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : '';
                                                    const accountName = selectedEvent.original?.account_name || 'Conta configurada';
                                                    return formattedPlatform ? `${formattedPlatform} — ${accountName}` : accountName;
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

                                    {selectedEvent.type === 'post' && selectedEvent.original?.source_url && (
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mt-4">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                                <Download size={14} /> Link do Download
                                            </p>
                                            <a 
                                                href={selectedEvent.original.source_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="text-[12px] font-bold text-blue-600 hover:underline break-all"
                                            >
                                                {selectedEvent.original.source_url}
                                            </a>
                                        </div>
                                    )}

                                    {/* Reagendar */}
                                    {selectedEvent.type === 'post' && ['pending', 'paused', 'failed'].includes(String(selectedEvent.original?.status || '')) && (
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <CalendarClock size={14} /> Reagendar
                                            </p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="datetime-local"
                                                    aria-label="Nova data e hora"
                                                    value={rescheduleValue}
                                                    onChange={(e) => setRescheduleValue(e.target.value)}
                                                    className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] font-semibold text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                                />
                                                <button
                                                    disabled={savingReschedule || !rescheduleValue}
                                                    onClick={async () => {
                                                        if (!rescheduleValue) return;
                                                        setSavingReschedule(true);
                                                        const ok = await reschedulePost(selectedEvent.original.id, new Date(rescheduleValue).toISOString());
                                                        setSavingReschedule(false);
                                                        if (ok) showAlert('Reagendado com sucesso.', 'success');
                                                    }}
                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-[13px] font-bold transition-all"
                                                >
                                                    {savingReschedule ? '...' : 'Salvar'}
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-1.5">Ou arraste o card para outro dia na visão semanal.</p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 pt-2">
                                        {selectedEvent.type === 'post' && (
                                            <>
                                                <button
                                                    onClick={() => runDownloaderPostNow(selectedEvent.original.id)}
                                                    className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                >
                                                    <Play size={16} /> Postar agora
                                                </button>
                                                {['pending', 'paused'].includes(String(selectedEvent.original?.status || '')) && (
                                                    <button
                                                        onClick={() => togglePausePost(selectedEvent.original)}
                                                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 h-11 rounded-2xl font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-amber-200"
                                                    >
                                                        {selectedEvent.original?.status === 'paused' ? <><Play size={15} /> Ativar</> : <><Pause size={15} /> Pausar</>}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => duplicatePost(selectedEvent.original)}
                                                    className="bg-white hover:bg-gray-50 text-gray-700 h-11 rounded-2xl font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-gray-200"
                                                >
                                                    <Copy size={15} /> Duplicar
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        editPostInDownloader(selectedEvent.original, selectedEvent.original?.account_name || selectedEvent.title);
                                                        setSelectedEvent(null);
                                                    }}
                                                    className="bg-white hover:bg-gray-50 text-gray-700 h-11 rounded-2xl font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-gray-200"
                                                >
                                                    <Pencil size={15} /> Editar
                                                </button>
                                                {selectedEvent.original?.status === 'failed' && (
                                                    <button
                                                        onClick={() => {
                                                            showConfirm({
                                                                title: 'Avançar fila?',
                                                                message: 'Pular este post falhado e avançar a fila?',
                                                                confirmText: 'Avançar',
                                                                onConfirm: () => { shiftDownloaderPost(selectedEvent.original.id); setSelectedEvent(null); },
                                                            });
                                                        }}
                                                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 h-11 rounded-2xl font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-amber-200"
                                                    >
                                                        <Rocket size={15} /> Avançar fila
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        showConfirm({
                                                            title: 'Excluir agendamento?',
                                                            message: 'Remover este post da fila? Esta ação não pode ser desfeita.',
                                                            confirmText: 'Excluir',
                                                            onConfirm: () => { deleteDownloaderPost(selectedEvent.original.id); setSelectedEvent(null); },
                                                        });
                                                    }}
                                                    className="bg-red-50 hover:bg-red-100 text-red-600 h-11 rounded-2xl font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-red-200"
                                                >
                                                    <Trash2 size={15} /> Excluir
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => setSelectedEvent(null)}
                                            className={`${selectedEvent.type === 'post' ? '' : 'col-span-2'} bg-gray-100 hover:bg-gray-200 text-gray-600 h-11 rounded-2xl font-bold text-[13px] transition-all active:scale-[0.98]`}
                                        >
                                            Fechar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
                </AnimatePresence>,
                document.body
            )}
            {/* Sheet "+N mais": lista completa do dia */}
            {createPortal(
                <AnimatePresence>
                    {daySheet && (
                        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Agendamentos do dia">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setDaySheet(null)}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                                className="relative bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
                            >
                                <div className="p-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 bg-white z-10">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            {format(daySheet, 'EEEE', { locale: ptBR })}
                                        </p>
                                        <p className="text-base font-black text-gray-900">{format(daySheet, "d 'de' MMMM", { locale: ptBR })}</p>
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-500">
                                        {events.filter(e => isSameDay(e.date, daySheet)).length} posts
                                    </span>
                                    <button onClick={() => setDaySheet(null)} aria-label="Fechar lista do dia" className="p-2 hover:bg-gray-100 text-gray-500 rounded-full transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>
                                <div className="p-3 overflow-y-auto custom-scrollbar">
                                    {events.filter(e => isSameDay(e.date, daySheet)).map(event => (
                                        <EventCard key={event.id} event={event} compact />
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Toast com Desfazer (reagendamento por arraste) */}
            {createPortal(
                <AnimatePresence>
                    {undoToast && (
                        <motion.div
                            key={undoToast.id}
                            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 pl-4 pr-2 py-2 bg-gray-900 text-white rounded-2xl shadow-2xl max-w-[92vw]"
                            role="status"
                        >
                            <span className="text-[13px] font-semibold truncate">{undoToast.message}</span>
                            <button
                                onClick={() => { undoToast.onUndo(); setUndoToast(null); }}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-[12px] font-bold transition-colors"
                            >
                                <Undo2 size={13} /> Desfazer
                            </button>
                            <button onClick={() => setUndoToast(null)} aria-label="Dispensar" className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                                <X size={14} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
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
