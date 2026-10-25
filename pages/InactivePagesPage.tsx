import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, RefreshCw, Facebook, Instagram, CheckCircle2,
    Video, Loader2, Calendar, ExternalLink, Clock, VideoOff, Zap,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

interface Account {
    id: string;
    name: string;
    username: string;
    platform: 'facebook' | 'instagram';
}

interface SchedulePost {
    id: number;
    platform: string;
    account_id: string;
    status: string;
    scheduled_at: string;
    caption?: string;
}

interface PageStatus {
    account: Account;
    pendingCount: number;
    nextPost: SchedulePost | null;
    recentPublished: number;
    active: boolean;
}

const ACTIVE_STATUSES = new Set(['pending', 'processing']);

function formatDate(str: string) {
    try {
        return new Date(str).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return str; }
}

function relativeTime(str: string) {
    const diff = new Date(str).getTime() - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.floor(abs / 60000);
    if (mins < 60) return diff > 0 ? `em ${mins}min` : `há ${mins}min`;
    const hrs = Math.floor(abs / 3600000);
    if (hrs < 24) return diff > 0 ? `em ${hrs}h` : `há ${hrs}h`;
    const days = Math.floor(abs / 86400000);
    return diff > 0 ? `em ${days}d` : `há ${days}d`;
}

interface Props {
    setActiveTab?: (tab: string) => void;
}

export default function InactivePagesPage({ setActiveTab }: Props) {
    const { showAlert } = useAlert();
    const [loading, setLoading] = useState(false);
    const [pages, setPages] = useState<PageStatus[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterMode, setFilterMode] = useState<'all' | 'inactive' | 'active'>('inactive');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [fbRes, igRes, schedRes] = await Promise.all([
                api.get('/facebook/pages').catch(() => ({ data: {} })),
                api.get('/instagram/accounts').catch(() => ({ data: {} })),
                api.get('/media/schedule').catch(() => ({ data: {} })),
            ]);

            const accounts: Account[] = [];
            (fbRes.data?.pages || []).forEach((p: any) =>
                accounts.push({ id: String(p.id), name: p.name || p.id, username: '', platform: 'facebook' }));
            (igRes.data?.accounts || []).forEach((a: any) =>
                accounts.push({ id: String(a.account_id || a.id), name: a.name || '', username: a.username || '', platform: 'instagram' }));

            const allPosts: SchedulePost[] = schedRes.data?.schedule || [];

            const statuses: PageStatus[] = accounts.map(account => {
                const mine = allPosts.filter(
                    p => p.platform === account.platform && String(p.account_id) === account.id
                );
                const pending = mine.filter(p => ACTIVE_STATUSES.has((p.status || '').toLowerCase()));
                const recentPublished = mine.filter(p => (p.status || '').toLowerCase() === 'completed').length;
                const nextPost = pending.length > 0
                    ? [...pending].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]
                    : null;
                return { account, pendingCount: pending.length, nextPost, recentPublished, active: pending.length > 0 };
            });

            setPages(statuses);
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao carregar dados.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    useEffect(() => { load(); }, [load]);

    const filtered = pages.filter(p => {
        if (filterMode === 'inactive') return !p.active;
        if (filterMode === 'active') return p.active;
        return true;
    });

    const inactiveCount = pages.filter(p => !p.active).length;
    const activeCount = pages.filter(p => p.active).length;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { value: inactiveCount, label: 'Páginas sem vídeo', icon: VideoOff, color: 'bg-red-50 text-red-500', text: 'text-red-500' },
                    { value: activeCount, label: 'Páginas com fila ativa', icon: Video, color: 'bg-emerald-50 text-emerald-500', text: 'text-emerald-600' },
                    { value: pages.length, label: 'Total conectadas', icon: Zap, color: 'bg-indigo-50 text-indigo-500', text: 'text-indigo-600' },
                ].map(({ value, label, icon: Icon, color, text }, i) => (
                    <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${color}`}><Icon size={20} /></div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">{label}</p>
                            <p className={`text-2xl font-black ${text}`}>{value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {([['inactive', '🔴 Sem vídeo'], ['active', '🟢 Com fila'], ['all', 'Todas']] as const).map(([mode, label]) => (
                        <button key={mode} onClick={() => setFilterMode(mode)}
                            className={`px-4 py-2 text-sm font-semibold transition-colors ${filterMode === mode ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <button onClick={load} disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 shadow-sm transition-all">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
                </button>
                {setActiveTab && (
                    <button onClick={() => setActiveTab('schedules')}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all">
                        <Calendar size={14} /> Ir para Agendamentos
                    </button>
                )}
            </div>

            {/* Alert banner */}
            {inactiveCount > 0 && filterMode !== 'active' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                    <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-amber-800">
                            {inactiveCount} página{inactiveCount > 1 ? 's' : ''} sem nenhum vídeo agendado
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                            Acesse <strong>Agendamentos</strong> para agendar novos vídeos nessas páginas.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-16">
                    <div className="flex items-center gap-3 text-gray-400">
                        <Loader2 size={22} className="animate-spin" />
                        <span className="text-sm font-medium">Verificando páginas...</span>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3" />
                    <p className="text-base font-semibold text-gray-700">
                        {filterMode === 'inactive' ? 'Todas as páginas têm vídeos na fila! 🎉' : 'Nenhuma página encontrada.'}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                        {filterMode === 'inactive'
                            ? 'Suas páginas estão todas ativas com posts agendados.'
                            : 'Conecte páginas em Automação → Facebook ou Instagram.'}
                    </p>
                </div>
            )}

            {/* Cards */}
            {!loading && filtered.length > 0 && (
                <div className="space-y-3">
                    <AnimatePresence>
                        {filtered.map((ps, idx) => {
                            const isIG = ps.account.platform === 'instagram';
                            const isExpanded = expandedId === ps.account.id;
                            const label = ps.account.username ? `@${ps.account.username}` : ps.account.name || ps.account.id;

                            return (
                                <motion.div key={`${ps.account.platform}:${ps.account.id}`}
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }} transition={{ delay: idx * 0.03 }}
                                    className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${ps.active ? 'border-emerald-200' : 'border-red-200'}`}>

                                    {/* Header row */}
                                    <button type="button" onClick={() => setExpandedId(isExpanded ? null : ps.account.id)}
                                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">

                                        {/* Platform icon */}
                                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${isIG ? 'text-pink-600 bg-pink-50 border-pink-200' : 'text-blue-600 bg-blue-50 border-blue-200'}`}>
                                            {isIG ? <Instagram size={13} /> : <Facebook size={13} />}
                                            {isIG ? 'IG' : 'FB'}
                                        </div>

                                        {/* Name */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-800 truncate">{label}</p>
                                            {ps.account.name && ps.account.username && (
                                                <p className="text-xs text-gray-400 truncate">{ps.account.name}</p>
                                            )}
                                        </div>

                                        {/* Status badge */}
                                        {ps.active ? (
                                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full shrink-0">
                                                <Video size={11} /> {ps.pendingCount} na fila
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full shrink-0">
                                                <VideoOff size={11} /> Sem vídeo
                                            </span>
                                        )}

                                        {isExpanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                                    </button>

                                    {/* Expanded */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                                <div className="px-5 pb-5 pt-0 border-t border-gray-100 bg-gray-50 space-y-3">

                                                    {/* Stats */}
                                                    <div className="flex gap-6 pt-3">
                                                        <div>
                                                            <p className="text-xs text-gray-500">Pendentes</p>
                                                            <p className={`text-xl font-black ${ps.pendingCount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{ps.pendingCount}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-500">Publicados</p>
                                                            <p className="text-xl font-black text-gray-700">{ps.recentPublished}</p>
                                                        </div>
                                                    </div>

                                                    {/* Next post */}
                                                    {ps.nextPost ? (
                                                        <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                                                            <Clock size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold text-indigo-700">
                                                                    Próximo: {relativeTime(ps.nextPost.scheduled_at)}
                                                                </p>
                                                                <p className="text-[11px] text-indigo-500">{formatDate(ps.nextPost.scheduled_at)}</p>
                                                                {ps.nextPost.caption && <p className="text-[11px] text-indigo-400 truncate mt-0.5">{ps.nextPost.caption}</p>}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
                                                            <AlertTriangle size={14} className="text-red-400 shrink-0" />
                                                            <p className="text-xs text-red-600 font-medium">Nenhum post agendado para esta página.</p>
                                                        </div>
                                                    )}

                                                    {/* Actions */}
                                                    {setActiveTab && (
                                                        <div className="flex gap-2 pt-1">
                                                            <button onClick={() => setActiveTab('schedules')}
                                                                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors">
                                                                <Calendar size={12} /> Agendar vídeos
                                                            </button>
                                                            <button onClick={() => setActiveTab('downloader')}
                                                                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-semibold rounded-lg transition-colors">
                                                                <ExternalLink size={12} /> Baixar vídeos
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
