import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    BarChart3, RefreshCw, Eye, Heart, MessageCircle, Share2, Target, Image as ImageIcon,
    Video, TrendingUp, Zap, Loader2, Award, Filter
} from 'lucide-react';
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
    likes: number;
    comments: number;
    shares: number;
    views: number;
    reach: number;
    saved: number;
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
}

export default function PostPerformancePage() {
    const { showAlert } = useAlert();
    const [posts, setPosts] = useState<PostRow[]>([]);
    const [summary, setSummary] = useState<SummaryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [refreshingId, setRefreshingId] = useState<number | null>(null);
    const [days, setDays] = useState(30);
    const [platform, setPlatform] = useState('');
    const [mediaType, setMediaType] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('days', String(days));
            if (platform) params.set('platform', platform);
            if (mediaType) params.set('mediaType', mediaType);
            params.set('limit', '100');
            const [postsRes, summaryRes] = await Promise.all([
                api.get(`/post-insights/posts?${params.toString()}`),
                api.get(`/post-insights/summary?days=${days}`)
            ]);
            if (postsRes.data.success) setPosts(postsRes.data.posts || []);
            if (summaryRes.data.success) setSummary(summaryRes.data.summary || []);
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao carregar métricas.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [days, platform, mediaType]);

    const refreshAll = async () => {
        setRefreshing(true);
        try {
            const res = await api.post('/post-insights/refresh-all', { platform: platform || null, days });
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
            const res = await api.post('/post-insights/backfill', { days });
            showAlert(`${res.data.matched}/${res.data.scanned} posts antigos recuperados. Agora clique em "Atualizar métricas".`, 'success');
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
            await api.post(`/post-insights/refresh/${id}`);
            await load();
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao atualizar post.', 'error');
        } finally {
            setRefreshingId(null);
        }
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
        saved: acc.saved + (s.saved || 0)
    }), { posts: 0, likes: 0, comments: 0, shares: 0, views: 0, reach: 0, saved: 0 });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="text-indigo-600" /> Performance de Posts
                    </h1>
                    <p className="text-sm text-gray-500">Compare curtidas, views e engajamento por plataforma e tipo de mídia (Facebook / Instagram) para saber o que postar mais.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={days} onChange={e => setDays(Number(e.target.value))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <option value={7}>7 dias</option>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <StatCard title="Posts" value={totals.posts} icon={BarChart3} color="indigo" />
                <StatCard title="Views" value={totals.views} icon={Eye} color="blue" />
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

            {/* Top posts */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><TrendingUp size={14} /> Top posts por engajamento</h2>
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : posts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Nenhum post publicado com métricas ainda. Publique posts e clique em "Atualizar métricas".</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                    <th className="py-2 px-3">Post</th>
                                    <th className="py-2 px-3">Plat.</th>
                                    <th className="py-2 px-3">Tipo</th>
                                    <th className="py-2 px-3 text-right">Views</th>
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
                                            <div className="flex items-center gap-2">
                                                {p.image_url && <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover" />}
                                                <span className="line-clamp-2 max-w-xs">{p.title || `Post #${p.id}`}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 px-3">{PLATFORM_LABELS[p.platform] || p.platform}</td>
                                        <td className="py-2 px-3">{MEDIA_LABELS[p.media_type] || p.media_type}</td>
                                        <td className="py-2 px-3 text-right">{(p.views || 0).toLocaleString('pt-BR')}</td>
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
        </div>
    );
}
