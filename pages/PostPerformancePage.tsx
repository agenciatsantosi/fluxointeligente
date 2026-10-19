import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    BarChart3, RefreshCw, Eye, Heart, MessageCircle, Share2, Target, Image as ImageIcon,
    Video, TrendingUp, Zap, Loader2, Award, Filter, ExternalLink, Download, Clock, MousePointerClick
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { TacticalButton } from '../components/MotionComponents';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

const PLATFORM_LABELS: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    threads: 'Threads',
    tiktok: 'TikTok'
};

const MEDIA_LABELS: Record<string, string> = {
    image: 'Imagem',
    video: 'Vídeo',
    reel: 'Reel',
    carousel: 'Carrossel',
    story: 'Story',
    desconhecido: 'Desconhecido'
};

const WINNER_SOURCES: Array<[string, string]> = [
    ['both', 'Vídeos e imagens'],
    ['scheduled', 'Só vídeos'],
    ['automation', 'Só imagens']
];

const StatCard = ({ title, value, icon: Icon, color = 'blue' }: any) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg bg-${color}-50 text-${color}-600`}>
            <Icon size={18} />
        </div>
        <div>
            <p className="text-xs text-gray-500 font-medium">{title}</p>
            <p className="text-lg font-bold text-gray-900">{Number(value || 0).toLocaleString('pt-BR')}</p>
        </div>
    </div>
);

interface PostRow {
    id: number;
    title: string;
    platform: string;
    media_type: string;
    image_url: string;
    published_date: string;
    permalink?: string | null;
    account_name?: string | null;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    reach: number;
    saved: number;
    clicks: number;
    linked?: boolean;
    score: number;
}

interface SummaryRow {
    platform: string;
    media_type: string;
    posts: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    reach: number;
    saved: number;
    clicks: number;
}

export default function PostPerformancePage() {
    const { showAlert } = useAlert();
    const [posts, setPosts] = useState<PostRow[]>([]);
    const [summary, setSummary] = useState<SummaryRow[]>([]);
    const [times, setTimes] = useState<any[]>([]);
    const [daily, setDaily] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [refreshingId, setRefreshingId] = useState<number | null>(null);
    const [days, setDays] = useState(30);
    const [platform, setPlatform] = useState('');
    const [mediaType, setMediaType] = useState('');
    const [source, setSource] = useState<'automation' | 'scheduled'>('automation');
    const [showWinners, setShowWinners] = useState(false);
    const [winnerLimit, setWinnerLimit] = useState(3);
    const [winnerMinViews, setWinnerMinViews] = useState(0);
    const [winnerSource, setWinnerSource] = useState('both');
    const [winnerGoal, setWinnerGoal] = useState('subscribe');
    const [winnerCustomText, setWinnerCustomText] = useState('');
    const [linking, setLinking] = useState(false);
    const [winnerResults, setWinnerResults] = useState<any[]>([]);
    const [winnerPreview, setWinnerPreview] = useState<any[]>([]);
    const [previewing, setPreviewing] = useState(false);
    const [promoConfig, setPromoConfig] = useState<{ enabled: boolean; hasLink: boolean; link: string } | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedPage, setSelectedPage] = useState('');
    const [pageLink, setPageLink] = useState('');
    const [pageSearch, setPageSearch] = useState('');

    const basePath = source === 'scheduled' ? '/post-insights/scheduled' : '/post-insights';

    const load = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('days', String(days));
            if (platform) params.set('platform', platform);
            if (mediaType) params.set('mediaType', mediaType);
            params.set('limit', '100');

            const params2 = new URLSearchParams();
            params2.set('days', String(days));
            params2.set('source', source);
            if (platform) params2.set('platform', platform);
            if (mediaType) params2.set('mediaType', mediaType);

            const [postsRes, summaryRes, timesRes, dailyRes] = await Promise.all([
                api.get(`${basePath}/posts?${params.toString()}`),
                api.get(`${basePath}/summary?days=${days}`),
                api.get(`/post-insights/times?${params2.toString()}`),
                api.get(`/post-insights/daily?${params2.toString()}`)
            ]);
            if (postsRes.data.success) setPosts(postsRes.data.posts || []);
            if (summaryRes.data.success) setSummary(summaryRes.data.summary || []);
            if (timesRes.data.success) setTimes(timesRes.data.times || []);
            if (dailyRes.data.success) setDaily(dailyRes.data.daily || []);
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao carregar métricas.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [days, platform, mediaType, source]);

    useEffect(() => {
        api.get('/post-insights/promo-config')
            .then(r => { if (r.data.success) setPromoConfig({ enabled: r.data.enabled, hasLink: r.data.hasLink, link: r.data.link }); })
            .catch(() => {});
    }, []);

    const loadAccounts = async () => {
        try {
            const [fb, ig] = await Promise.all([
                api.get('/facebook/pages').catch(() => ({ data: {} })),
                api.get('/instagram/accounts').catch(() => ({ data: {} }))
            ]);
            const accs: any[] = [];
            fb.data?.pages?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: '', platform: 'facebook' }));
            ig.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: p.username || '', platform: 'instagram' }));
            setAccounts(accs);
        } catch { /* ignore */ }
    };

    useEffect(() => { loadAccounts(); }, []);

    const refreshAll = async () => {
        setRefreshing(true);
        try {
            const res = await api.post(`${basePath}/refresh-all`, { platform: platform || null, mediaType: mediaType || null, days });
            showAlert(`${res.data.updated}/${res.data.total} posts atualizados.`, 'success');
            await load();
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao atualizar métricas.', 'error');
        } finally {
            setRefreshing(false);
        }
    };

    const backfill = async () => {
        setBackfilling(true);
        try {
            const res = await api.post(`${basePath}/backfill`, { days });
            const extra = res.data.clicks ? ` Cliques atribuídos: ${res.data.clicks.matched}.` : '';
            showAlert(`${res.data.matched}/${res.data.scanned} posts antigos recuperados.${extra} Agora clique em "Atualizar métricas".`, 'success');
            await load();
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao recuperar posts antigos.', 'error');
        } finally {
            setBackfilling(false);
        }
    };

    const refreshOne = async (id: number) => {
        setRefreshingId(id);
        try {
            await api.post(`${basePath}/refresh/${id}`);
            await load();
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao atualizar post.', 'error');
        } finally {
            setRefreshingId(null);
        }
    };

    const pageFilter = selectedPage ? (() => {
        const [platform, id] = selectedPage.split(':');
        return { platform, accountId: id };
    })() : null;

    const loadPreview = async (limit: number, minViews: number, src: string = winnerSource, goal: string = winnerGoal, customText: string = winnerCustomText) => {
        setPreviewing(true);
        try {
            const res = await api.post('/post-insights/scheduled/link-winners', { days, limit, minViews, source: src, goal, customText, pageFilter, customLink: pageLink, dryRun: true });
            setWinnerPreview(res.data.results || []);
        } catch { setWinnerPreview([]); }
        finally { setPreviewing(false); }
    };

    const openWinners = async () => {
        setWinnerResults([]);
        setShowWinners(true);
        setPageLink(promoConfig?.link || '');
        loadAccounts();
        await loadPreview(winnerLimit, winnerMinViews, winnerSource, winnerGoal, winnerCustomText);
    };

    const linkWinners = async () => {
        if (!promoConfig?.hasLink && !pageLink) {
            showAlert('Defina o link da oferta em Downloader → Comentário promocional antes de usar.', 'error');
            return;
        }
        setLinking(true);
        setWinnerResults([]);
        try {
            const res = await api.post('/post-insights/scheduled/link-winners', { days, limit: winnerLimit, minViews: winnerMinViews, source: winnerSource, goal: winnerGoal, customText: winnerCustomText, pageFilter, customLink: pageLink });
            setWinnerResults(res.data.results || []);
            const skipped = res.data.skipped ? ` (${res.data.skipped} já tinham link)` : '';
            showAlert(`${res.data.sent} post(s) receberam o link${skipped}.`, 'success');
            await load();
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao adicionar o link.', 'error');
        } finally {
            setLinking(false);
        }
    };

    // Agrega o score médio por hora do dia (para o gráfico de melhores horários)
    const hourly = useMemo(() => {
        const agg: Record<number, { score: number; posts: number }> = {};
        for (const t of times) {
            if (!agg[t.hour]) agg[t.hour] = { score: 0, posts: 0 };
            agg[t.hour].score += (t.avg_score || 0) * (t.posts || 0);
            agg[t.hour].posts += (t.posts || 0);
        }
        return Array.from({ length: 24 }, (_, h) => ({
            hour: `${String(h).padStart(2, '0')}h`,
            score: agg[h]?.posts ? Math.round(agg[h].score / agg[h].posts) : 0
        }));
    }, [times]);

    const chartDaily = useMemo(() => daily.map(d => ({
        day: String(d.day || '').slice(5).split('-').reverse().join('/'),
        views: d.views || 0,
        likes: d.likes || 0,
        posts: d.posts || 0
    })), [daily]);

    const topTimes = useMemo(() => times.filter(t => (t.posts || 0) > 0).slice(0, 3), [times]);

    const exportCsv = () => {
        const header = ['Página', 'Plataforma', 'Tipo', 'Data', 'Views', 'Cliques', 'CTR (%)', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Salvos', 'Score', 'Link'];
        const rows = posts.map(p => [
            p.account_name || '',
            PLATFORM_LABELS[p.platform] || p.platform || '',
            MEDIA_LABELS[p.media_type] || p.media_type || '',
            p.published_date ? new Date(p.published_date).toLocaleString('pt-BR') : '',
            p.views || 0,
            p.clicks || 0,
            p.views > 0 ? ((p.clicks || 0) / p.views * 100).toFixed(2) : '0',
            p.likes || 0, p.comments || 0, p.shares || 0, p.saved || 0, p.score || 0,
            p.permalink || ''
        ]);
        const csv = [header, ...rows]
            .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
            .join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-${source}-${days}d.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAlert('CSV exportado.', 'success');
    };

    // Recomendação: grupo com maior score médio por post
    const bestGroup = summary.length
        ? [...summary].sort((a, b) => {
            const scoreA = (a.views || 0) + (a.likes || 0) * 3 + (a.comments || 0) * 5 + (a.shares || 0) * 8;
            const scoreB = (b.views || 0) + (b.likes || 0) * 3 + (b.comments || 0) * 5 + (b.shares || 0) * 8;
            const avgA = a.posts ? scoreA / a.posts : 0;
            const avgB = b.posts ? scoreB / b.posts : 0;
            return avgB - avgA;
        })[0]
        : null;

    const totals = summary.reduce((acc, s) => ({
        posts: acc.posts + (s.posts || 0),
        likes: acc.likes + (s.likes || 0),
        comments: acc.comments + (s.comments || 0),
        shares: acc.shares + (s.shares || 0),
        views: acc.views + (s.views || 0),
        reach: acc.reach + (s.reach || 0),
        saved: acc.saved + (s.saved || 0),
        clicks: acc.clicks + (s.clicks || 0)
    }), { posts: 0, likes: 0, comments: 0, shares: 0, views: 0, reach: 0, saved: 0, clicks: 0 });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="text-indigo-600" /> Performance de Posts
                    </h1>
                    <p className="text-sm text-gray-500">Compare curtidas, views e engajamento por plataforma e tipo de mídia (Facebook / Instagram) para saber o que postar mais.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                        <button
                            onClick={() => setSource('automation')}
                            className={`px-3 py-2 flex items-center gap-1.5 ${source === 'automation' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <ImageIcon size={14} /> Automação
                        </button>
                        <button
                            onClick={() => setSource('scheduled')}
                            className={`px-3 py-2 flex items-center gap-1.5 border-l border-gray-200 ${source === 'scheduled' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Video size={14} /> Agendamentos
                        </button>
                    </div>
                    <select value={days} onChange={e => setDays(Number(e.target.value))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <option value={3}>3 dias</option>
                        <option value={7}>7 dias</option>
                        <option value={15}>15 dias</option>
                        <option value={30}>30 dias</option>
                        <option value={90}>90 dias</option>
                    </select>
                    <select value={platform} onChange={e => setPlatform(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <option value="">Todas as plataformas</option>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                    </select>
                    <select value={mediaType} onChange={e => setMediaType(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <option value="">Todos os tipos</option>
                        <option value="image">Imagem</option>
                        <option value="video">Vídeo</option>
                    </select>
                    <TacticalButton loading={backfilling} onClick={backfill} color="slate">
                        {!backfilling && <><Zap size={14} /> Recuperar posts antigos</>}
                    </TacticalButton>
                    <TacticalButton loading={refreshing} onClick={refreshAll} color="indigo">
                        {!refreshing && <><RefreshCw size={14} /> Atualizar métricas</>}
                    </TacticalButton>
                    <TacticalButton onClick={exportCsv} color="slate">
                        <Download size={14} /> Exportar CSV
                    </TacticalButton>
                    <TacticalButton onClick={openWinners} color="cyan">
                        <MousePointerClick size={14} /> Link nos campeões
                    </TacticalButton>
                </div>
            </div>

            {bestGroup && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-3">
                    <Award className="text-indigo-600" size={24} />
                    <div>
                        <p className="text-sm font-bold text-indigo-900">Recomendação: o que postar mais</p>
                        <p className="text-sm text-indigo-800">
                            <strong>{PLATFORM_LABELS[bestGroup.platform] || bestGroup.platform}</strong> com <strong>{MEDIA_LABELS[bestGroup.media_type] || bestGroup.media_type}</strong> teve o maior engajamento médio por post ({bestGroup.posts} posts).
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard title="Posts" value={totals.posts} icon={BarChart3} color="indigo" />
                <StatCard title="Views" value={totals.views} icon={Eye} color="blue" />
                <StatCard title="Cliques" value={totals.clicks} icon={MousePointerClick} color="green" />
                <StatCard title="Curtidas" value={totals.likes} icon={Heart} color="pink" />
                <StatCard title="Comentários" value={totals.comments} icon={MessageCircle} color="purple" />
                <StatCard title="Compartilhamentos" value={totals.shares} icon={Share2} color="green" />
                <StatCard title="Alcance" value={totals.reach} icon={Target} color="orange" />
                <StatCard title="Salvos" value={totals.saved} icon={TrendingUp} color="teal" />
            </div>

            {/* Resumo por plataforma/tipo */}
            {summary.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Filter size={14} /> Resumo por plataforma e tipo</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                    <th className="py-2 px-3">Plataforma</th>
                                    <th className="py-2 px-3">Tipo</th>
                                    <th className="py-2 px-3 text-right">Posts</th>
                                    <th className="py-2 px-3 text-right">Views</th>
                                    <th className="py-2 px-3 text-right">Cliques</th>
                                    <th className="py-2 px-3 text-right">Curtidas</th>
                                    <th className="py-2 px-3 text-right">Comentários</th>
                                    <th className="py-2 px-3 text-right">Compart.</th>
                                    <th className="py-2 px-3 text-right">Alcance</th>
                                    <th className="py-2 px-3 text-right">Salvos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.map((s, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                        <td className="py-2 px-3 font-medium">{PLATFORM_LABELS[s.platform] || s.platform || '—'}</td>
                                        <td className="py-2 px-3">{MEDIA_LABELS[s.media_type] || s.media_type}</td>
                                        <td className="py-2 px-3 text-right">{s.posts}</td>
                                        <td className="py-2 px-3 text-right">{(s.views || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right font-semibold text-emerald-600">{(s.clicks || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(s.likes || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(s.comments || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(s.shares || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(s.reach || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(s.saved || 0).toLocaleString('pt-BR')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Evolução diária e melhores horários */}
            {(chartDaily.length > 0 || times.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><TrendingUp size={14} /> Evolução diária</h2>
                        {chartDaily.length === 0 ? (
                            <p className="text-sm text-gray-400 py-8 text-center">Sem dados no período.</p>
                        ) : (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartDaily}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Line type="monotone" dataKey="views" name="Views" stroke="#6366f1" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="likes" name="Curtidas" stroke="#ec4899" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Clock size={14} /> Melhores horários para postar</h2>
                        {topTimes.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {topTimes.map((t, i) => (
                                    <span key={i} className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-3 py-1 font-medium">
                                        {i + 1}º {t.label} · {(t.avg_score || 0).toLocaleString('pt-BR')} pts
                                    </span>
                                ))}
                            </div>
                        )}
                        {times.length === 0 ? (
                            <p className="text-sm text-gray-400 py-8 text-center">Sem dados no período.</p>
                        ) : (
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={hourly}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} interval={2} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                                        <Bar dataKey="score" name="Score médio" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Top posts */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><TrendingUp size={14} /> Top posts por desempenho (engajamento + cliques)</h2>
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : posts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                        {source === 'scheduled'
                            ? 'Nenhum post agendado com métricas ainda. Clique em "Recuperar posts antigos" e depois em "Atualizar métricas".'
                            : 'Nenhum post publicado com métricas ainda. Publique posts e clique em "Atualizar métricas".'}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                    <th className="py-2 px-3">Post</th>
                                    <th className="py-2 px-3">Plat.</th>
                                    <th className="py-2 px-3">Tipo</th>
                                    <th className="py-2 px-3 text-right">Views</th>
                                    <th className="py-2 px-3 text-right">Cliques</th>
                                    <th className="py-2 px-3 text-right">CTR</th>
                                    <th className="py-2 px-3 text-right">Curtidas</th>
                                    <th className="py-2 px-3 text-right">Coment.</th>
                                    <th className="py-2 px-3 text-right">Compart.</th>
                                    <th className="py-2 px-3 text-right">Salvos</th>
                                    <th className="py-2 px-3 text-right">Score</th>
                                    <th className="py-2 px-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {posts.map(p => (
                                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                                        <td className="py-2 px-3">
                                            <div className="flex items-start gap-2">
                                                {p.image_url && p.media_type !== 'video' && <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                                                <div className="min-w-0">
                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800">
                                                        {p.account_name || 'Conta não identificada'}
                                                    </span>
                                                    {p.linked && (
                                                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5 align-middle">
                                                            <MousePointerClick size={10} /> com link
                                                        </span>
                                                    )}
                                                    <span className="line-clamp-2 max-w-xs text-gray-600 block">{p.title || `Post #${p.id}`}</span>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                                                        {p.published_date && (
                                                            <span>
                                                                {new Date(p.published_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                        {p.permalink && (
                                                            <a href={p.permalink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5">
                                                                <ExternalLink size={11} /> ver post
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-2 px-3">{PLATFORM_LABELS[p.platform] || p.platform}</td>
                                        <td className="py-2 px-3">{MEDIA_LABELS[p.media_type] || p.media_type}</td>
                                        <td className="py-2 px-3 text-right">{(p.views || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right font-semibold text-emerald-600">{(p.clicks || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right text-gray-500">
                                            {p.views > 0 ? `${((p.clicks || 0) / p.views * 100).toFixed(2)}%` : '—'}
                                        </td>
                                        <td className="py-2 px-3 text-right">{(p.likes || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(p.comments || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(p.shares || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right">{(p.saved || 0).toLocaleString('pt-BR')}</td>
                                        <td className="py-2 px-3 text-right font-bold text-indigo-600">{p.score}</td>
                                        <td className="py-2 px-3">
                                            <button onClick={() => refreshOne(p.id)} disabled={refreshingId === p.id} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50">
                                                {refreshingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showWinners && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !linking && setShowWinners(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MousePointerClick size={18} className="text-emerald-600" /> Link nos campeões</h3>
                            <p className="text-sm text-gray-500 mt-1">Adiciona o link da oferta apenas nos posts que mais performam. Poucos posts, textos variados e com intervalo entre eles — para reduzir risco de spam.</p>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-600">Página / Conta</label>
                                {accounts.length > 8 && (
                                    <input
                                        type="text"
                                        value={pageSearch}
                                        onChange={e => setPageSearch(e.target.value)}
                                        placeholder="Buscar página pelo nome..."
                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        disabled={linking}
                                    />
                                )}
                                <select
                                    value={selectedPage}
                                    onChange={e => { setSelectedPage(e.target.value); loadPreview(winnerLimit, winnerMinViews, winnerSource, winnerGoal, winnerCustomText); }}
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    disabled={linking}
                                >
                                    <option value="">Todas as páginas</option>
                                    {accounts
                                        .filter(a => {
                                            const q = pageSearch.trim().toLowerCase();
                                            if (!q) return true;
                                            return `${a.name} ${a.username}`.toLowerCase().includes(q);
                                        })
                                        .map(a => (
                                            <option key={`${a.platform}:${a.id}`} value={`${a.platform}:${a.id}`}>
                                                {a.platform === 'instagram' ? '📷' : '📘'} {a.name || a.username} {a.username && a.username !== a.name ? `(@${a.username})` : ''}
                                            </option>
                                        ))}
                                    {accounts.length > 0 && pageSearch.trim() && accounts.every(a => !`${a.name} ${a.username}`.toLowerCase().includes(pageSearch.trim().toLowerCase())) && (
                                        <option value="" disabled>Nenhuma página encontrada</option>
                                    )}
                                </select>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                                <p className="text-gray-500 text-xs mb-1">Link da oferta {selectedPage ? 'desta página' : ''}</p>
                                {promoConfig?.hasLink || pageLink ? (
                                    <input
                                        type="text"
                                        value={pageLink || promoConfig?.link || ''}
                                        onChange={e => setPageLink(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        disabled={linking}
                                    />
                                ) : (
                                    <p className="text-amber-700">Nenhum link configurado. Defina o link em <strong>Downloader → Comentário promocional</strong> ou digite acima.</p>
                                )}
                            </div>
                            {promoConfig?.enabled && (
                                <p className="text-[11px] text-indigo-500">Observação: o comentário automático também está ligado nos novos vídeos (alternância 1 a cada N). Para usar só nos campeões, desligue o comentário automático onde ele é configurado.</p>
                            )}
                            <div>
                                <label className="text-xs font-medium text-gray-600">Onde adicionar o link</label>
                                <div className="mt-1 flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                                    {WINNER_SOURCES.map(([val, label]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => { setWinnerSource(val); loadPreview(winnerLimit, winnerMinViews, val, winnerGoal, winnerCustomText); }}
                                            className={`flex-1 px-2 py-2 ${winnerSource === val ? 'bg-cyan-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600">Objetivo do link</label>
                                <div className="mt-1 flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                                    {([
                                        ['subscribe', 'Assinatura'],
                                        ['sell', 'Venda de produto'],
                                    ] as Array<[string, string]>).map(([val, label]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setWinnerGoal(val)}
                                            className={`flex-1 px-2 py-2 ${winnerGoal === val ? 'bg-cyan-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    {winnerGoal === 'sell' ? 'Comentário de venda (oferta/ebook/produto).' : 'Comentário convidando a assinar a página.'}
                                </p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600">Texto personalizado (opcional, use {"{link}"})</label>
                                <textarea
                                    value={winnerCustomText}
                                    onChange={e => setWinnerCustomText(e.target.value)}
                                    placeholder="Ex: Garanta o ebook completo aqui: {link}"
                                    rows={2}
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                    disabled={linking}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Se preenchido, substitui o texto gerado pela IA.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Quantos posts</label>
                                    <input type="number" min={1} max={10} value={winnerLimit} onChange={e => setWinnerLimit(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} onBlur={() => loadPreview(winnerLimit, winnerMinViews, winnerSource, winnerGoal, winnerCustomText)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" disabled={linking} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Views mínimas</label>
                                    <input type="number" min={0} value={winnerMinViews} onChange={e => setWinnerMinViews(Math.max(0, Number(e.target.value) || 0))} onBlur={() => loadPreview(winnerLimit, winnerMinViews, winnerSource, winnerGoal, winnerCustomText)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" disabled={linking} />
                                </div>
                            </div>
                            <p className="text-xs text-gray-400">O sistema pega os posts com maior pontuação que ainda não têm link, comenta com um texto variado (IA/template) e cria um link rastreável para medir os cliques.</p>

                            <div className="rounded-lg border border-gray-100 p-3">
                                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                                    {previewing ? <><Loader2 size={12} className="animate-spin" /> Selecionando…</> : <>Campeões elegíveis ({winnerPreview.length})</>}
                                </p>
                                {!previewing && winnerPreview.length === 0 && (
                                    <p className="text-xs text-gray-400">Nenhum post elegível neste período (podem já ter link, ou não ter views no período).</p>
                                )}
                                <div className="space-y-1">
                                    {winnerPreview.map((r, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                                            <span>
                                                {i + 1}º <strong className="font-bold text-gray-700">{r.account_name || 'Página'}</strong>
                                                <span className="ml-1 text-[10px] text-gray-400">· {PLATFORM_LABELS[r.platform] || r.platform}{r.source === 'automation' ? ' (imagem)' : ''}</span>
                                            </span>
                                            <span className="text-gray-500">{(r.views || 0).toLocaleString('pt-BR')} views · {(r.likes || 0).toLocaleString('pt-BR')} curtidas</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {linking && (
                                <div className="flex items-center gap-2 text-sm text-indigo-600">
                                    <Loader2 size={16} className="animate-spin" /> Publicando comentários com intervalo entre eles… (pode levar 1–3 min)
                                </div>
                            )}

                            {winnerResults.length > 0 && (
                                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-52 overflow-y-auto">
                                    {winnerResults.map((r, i) => (
                                        <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                                            <span className="text-gray-600"><strong className="font-bold text-gray-700">{r.account_name || 'Página'}</strong> · {r.source === 'automation' ? 'Imagem' : 'Vídeo'} · {PLATFORM_LABELS[r.platform] || r.platform} · {Number(r.views || 0).toLocaleString('pt-BR')} views</span>
                                            {r.ok ? <span className="text-emerald-600 font-semibold">link adicionado</span>
                                                : r.skipped ? <span className="text-gray-400">já tinha</span>
                                                : <span className="text-red-500">{r.error || 'falhou'}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setShowWinners(false)} disabled={linking} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">Fechar</button>
                            <TacticalButton loading={linking} color="cyan" onClick={linkWinners} disabled={linking || (!promoConfig?.hasLink && !pageLink) || winnerPreview.length === 0}>
                                {!linking && <><MousePointerClick size={14} /> Adicionar link</>}
                            </TacticalButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
