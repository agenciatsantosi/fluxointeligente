import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import {
  Sparkles, Play, Pause, Trash2, RefreshCw, Loader2, Plus, AlertCircle,
  CheckCircle2, Clock, Zap, Target, ExternalLink, ThumbsUp, MessageCircle,
  Eye, Rocket, X, Flame, Star
} from 'lucide-react';

interface ViralAutomation {
  id: number;
  name: string;
  account_id: string;
  account_platform: string;
  account_name: string;
  search_query: string;
  search_mode: string;
  visual_style: string;
  image_format: string;
  frequency_hours: number;
  publish_mode: 'auto' | 'approval';
  min_viral_score: number;
  example_references?: any[];
  status: 'active' | 'paused';
  last_run_at: string | null;
  next_run_at: string | null;
  total_scouted: number;
  total_recreated: number;
  total_published: number;
  created_at: string;
}

interface RecreatedPostItem {
  id: number;
  automation_id?: number;
  source_platform: string;
  original_image_url?: string;
  recreated_image_url: string;
  format?: string;
  caption?: string;
  hashtags?: string[];
  status: 'draft' | 'published' | 'scheduled' | 'failed';
  published_url?: string;
  created_at: string;
}

interface ViralAutopilotViewProps {
  accounts: any[];
  initialExamples?: any[];
  onClearExamples?: () => void;
}

export const ViralAutopilotView: React.FC<ViralAutopilotViewProps> = ({ accounts, initialExamples = [], onClearExamples }) => {
  const [automations, setAutomations] = useState<ViralAutomation[]>([]);
  const [recreatedPosts, setRecreatedPosts] = useState<RecreatedPostItem[]>([]);
  const [selectedExamples, setSelectedExamples] = useState<any[]>(initialExamples || []);
  const [stats, setStats] = useState<any>({
    total_automations: 0,
    active_automations: 0,
    total_scouted: 0,
    total_recreated: 0,
    total_published: 0
  });

  const [loading, setLoading] = useState(false);
  const [triggeringId, setTriggeringId] = useState<number | null>(null);
  const [publishLoadingId, setPublishLoadingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sincroniza exemplos recebidos
  useEffect(() => {
    if (initialExamples && initialExamples.length > 0) {
      setSelectedExamples(initialExamples);
      const firstTarget = initialExamples.find(e => e.targetPage?.id)?.targetPage;
      if (firstTarget) {
        setFormData(prev => ({
          ...prev,
          account_key: `${firstTarget.platform}:${firstTarget.id}`,
          name: prev.name || `Robô 24h — ${firstTarget.name}`
        }));
      }
    }
  }, [initialExamples]);

  // Modal nova automação
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    account_key: '',
    search_query: '',
    search_mode: 'hashtag',
    visual_style: 'sem_estilo',
    image_format: '4:5',
    frequency_hours: 6,
    publish_mode: 'approval' as 'auto' | 'approval',
    min_viral_score: 75
  });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [autoRes, statsRes, postsRes] = await Promise.all([
        api.get('/trends/images/autopilot').catch(() => ({ data: { automations: [] } })),
        api.get('/trends/images/autopilot/stats').catch(() => ({ data: { stats: {} } })),
        api.get('/trends/images/recreated?limit=15').catch(() => ({ data: { posts: [] } }))
      ]);

      if (autoRes.data?.success) {
        setAutomations(autoRes.data.automations || []);
      }
      if (statsRes.data?.success && statsRes.data.stats) {
        setStats(statsRes.data.stats);
      }
      if (postsRes.data?.success) {
        setRecreatedPosts(postsRes.data.posts || []);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados do piloto automático.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Informe um nome para a automação.');
      return;
    }
    if (!formData.account_key) {
      setError('Selecione uma conta ou página conectada.');
      return;
    }
    if (!formData.search_query.trim()) {
      setError('Informe a palavra-chave ou hashtags de monitoramento.');
      return;
    }

    const [platform, accId] = formData.account_key.split(':');
    const accObj = accounts.find(a => `${a.platform}:${a.id}` === formData.account_key);

    const matchingExamples = selectedExamples.filter(ex => !ex.targetPage?.id || String(ex.targetPage.id) === String(accId));
    const examplesToSend = matchingExamples.length > 0 ? matchingExamples : selectedExamples;

    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/trends/images/autopilot', {
        name: formData.name.trim(),
        accountId: accId,
        accountPlatform: platform,
        accountName: accObj?.name || 'Conta Conectada',
        searchQuery: formData.search_query.trim(),
        searchMode: formData.search_mode,
        visualStyle: formData.visual_style,
        imageFormat: formData.image_format,
        frequencyHours: Number(formData.frequency_hours) || 6,
        publishMode: formData.publish_mode,
        minViralScore: Number(formData.min_viral_score) || 70,
        example_references: examplesToSend,
        exampleReferences: examplesToSend
      });

      if (res.data?.success) {
        setShowModal(false);
        setFormData({
          name: '',
          account_key: '',
          search_query: '',
          search_mode: 'hashtag',
          visual_style: 'sem_estilo',
          image_format: '4:5',
          frequency_hours: 6,
          publish_mode: 'approval',
          min_viral_score: 75
        });
        setSelectedExamples([]);
        onClearExamples?.();
        setSuccessMsg('Automação criada com sucesso! O robô usará seus exemplos de referência.');
        loadData();
      } else {
        setError(res.data?.error || 'Erro ao criar automação.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Falha ao salvar automação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await api.put(`/trends/images/autopilot/${id}/status`, { status: nextStatus });
      setAutomations(prev =>
        prev.map(a => (a.id === id ? { ...a, status: nextStatus as any } : a))
      );
    } catch (err: any) {
      setError('Erro ao atualizar status da automação.');
    }
  };

  const handleTriggerCycle = async (id: number) => {
    setTriggeringId(id);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post(`/trends/images/autopilot/${id}/trigger`);
      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Ciclo de monitoramento concluído com sucesso!');
        loadData();
      } else {
        setError(res.data?.error || 'Erro ao executar ciclo.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Falha ao disparar ciclo manual.');
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDeleteAutomation = async (id: number) => {
    if (!window.confirm('Deseja realmente excluir esta automação 24h?')) return;
    try {
      await api.delete(`/trends/images/autopilot/${id}`);
      setAutomations(prev => prev.filter(a => a.id !== id));
      setSuccessMsg('Automação removida.');
    } catch {
      setError('Erro ao excluir automação.');
    }
  };

  const handlePublishQueuedPost = async (post: RecreatedPostItem) => {
    setPublishLoadingId(post.id);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/trends/images/publish', {
        recreatedPostId: post.id
      });
      if (res.data?.success) {
        setSuccessMsg('Post publicado com sucesso na rede social!');
        loadData();
      } else {
        setError(res.data?.error || 'Erro ao publicar.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Falha ao publicar.');
    } finally {
      setPublishLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* BANNER PRINCIPAL COM MÉTRICAS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                Central de Automações — Piloto 24h
              </h2>
              <p className="text-xs text-slate-500">
                Robô inteligente que descobre imagens virais, recria versões originais e publica com IA contínua.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              title="Recarregar"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 transition-all"
            >
              <Plus size={15} /> Nova Automação 24h
            </button>
          </div>
        </div>

        {/* Grade de 4 Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Automações Ativas
            </p>
            <p className="text-2xl font-black text-slate-900">
              {stats.active_automations || 0} <span className="text-xs font-medium text-slate-400">/ {stats.total_automations || 0}</span>
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Imagens Monitoradas
            </p>
            <p className="text-2xl font-black text-indigo-600">
              {stats.total_scouted || 0}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Posts Recriados
            </p>
            <p className="text-2xl font-black text-emerald-600">
              {stats.total_recreated || 0}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Posts Publicados
            </p>
            <p className="text-2xl font-black text-slate-900">
              {stats.total_published || 0}
            </p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-xs font-bold">
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs font-bold">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* LISTA DE AUTOMAÇÕES ATIVAS */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <Target size={16} className="text-indigo-600" /> Suas Automações de Imagens Virais ({automations.length})
        </h3>

        {automations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
            <Sparkles size={40} className="mx-auto mb-3 opacity-30 text-indigo-500" />
            <p className="font-bold text-slate-700">Nenhuma automação 24h configurada ainda.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Clique em "Nova Automação 24h" para definir suas hashtags e deixar a IA caçar e recriar conteúdos automaticamente.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {automations.map(auto => {
              const isActive = auto.status === 'active';
              return (
                <div
                  key={auto.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-base text-slate-900 truncate">
                        {auto.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isActive ? <Zap size={11} /> : <Pause size={11} />}
                        {isActive ? 'Ativo 24h' : 'Pausado'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      <p className="flex items-center gap-1.5">
                        <strong className="text-slate-800">Conta:</strong> {auto.account_name} ({auto.account_platform})
                      </p>
                      <p className="flex items-center gap-1.5">
                        <strong className="text-slate-800">Hashtags / Busca:</strong> {auto.search_query}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <strong className="text-slate-800">Frequência:</strong> A cada {auto.frequency_hours} horas
                      </p>
                      <p className="flex items-center gap-1.5">
                        <strong className="text-slate-800">Modo:</strong>{' '}
                        {auto.publish_mode === 'auto' ? (
                          <span className="text-emerald-700 font-bold">Publicação Automática Direta</span>
                        ) : (
                          <span className="text-indigo-700 font-bold">Requer Aprovação Manual</span>
                        )}
                      </p>
                    </div>

                    {/* Exemplos de Referência Salvos nesta Automação */}
                    {auto.example_references && Array.isArray(auto.example_references) && auto.example_references.length > 0 && (
                      <div className="mt-3 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl">
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1.5">
                          <span className="flex items-center gap-1">
                            <Star size={12} className="fill-amber-500 text-amber-600" />
                            {auto.example_references.length} {auto.example_references.length === 1 ? 'Exemplo de Referência Ativo' : 'Exemplos de Referência Ativos'}
                          </span>
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                          {auto.example_references.slice(0, 6).map((ex: any, idx: number) => (
                            <div key={idx} className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-amber-300 relative bg-slate-100" title={ex.title || ex.caption || ''}>
                              <img src={ex.imageUrl || ex.image_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          ))}
                          {auto.example_references.length > 6 && (
                            <span className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-[10px] font-black text-amber-900 shrink-0">
                              +{auto.example_references.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center text-xs">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Varredas</span>
                        <span className="font-black text-slate-800">{auto.total_scouted || 0}</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Recriadas</span>
                        <span className="font-black text-emerald-600">{auto.total_recreated || 0}</span>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Postadas</span>
                        <span className="font-black text-indigo-600">{auto.total_published || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleTriggerCycle(auto.id)}
                      disabled={triggeringId === auto.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black transition-colors"
                    >
                      {triggeringId === auto.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Play size={13} />
                      )}
                      {triggeringId === auto.id ? 'Executando...' : 'Executar Agora'}
                    </button>

                    <button
                      onClick={() => handleToggleStatus(auto.id, auto.status)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                      title={isActive ? 'Pausar' : 'Retomar'}
                    >
                      {isActive ? <Pause size={15} /> : <Play size={15} />}
                    </button>

                    <button
                      onClick={() => handleDeleteAutomation(auto.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FILA DE POSTS GERADOS PELO PILOTO AUTOMÁTICO */}
      {recreatedPosts.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-slate-600" /> Fila de Conteúdos Criados com IA ({recreatedPosts.length})
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recreatedPosts.map(post => (
              <div
                key={post.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-[4/5] bg-slate-900 max-h-56 overflow-hidden">
                    <img
                      src={post.recreated_image_url}
                      alt="Post recriado"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 right-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          post.status === 'published'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {post.status === 'published' ? 'Publicado' : 'Aguardando Aprovação'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <p className="text-xs text-slate-700 line-clamp-3 leading-relaxed mb-3">
                      {post.caption || 'Sem legenda'}
                    </p>
                  </div>
                </div>

                <div className="p-4 pt-0 border-t border-slate-100 flex items-center justify-between mt-auto">
                  <span className="text-[10px] font-semibold text-slate-400">
                    {new Date(post.created_at).toLocaleDateString('pt-BR')}
                  </span>

                  {post.status !== 'published' ? (
                    <button
                      onClick={() => handlePublishQueuedPost(post)}
                      disabled={publishLoadingId === post.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition-colors"
                    >
                      {publishLoadingId === post.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Rocket size={12} />
                      )}
                      Aprovar & Publicar
                    </button>
                  ) : post.published_url ? (
                    <a
                      href={post.published_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      Ver post <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={13} /> Postado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL NOVA AUTOMAÇÃO 24H */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Nova Automação 24h</h3>
                  <p className="text-[11px] text-slate-500">O robô caça tendências e cria posts sozinho</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAutomation} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome da Automação</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                  placeholder="Ex: Posts Virais de Umbanda Diários"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Conta Conectada de Destino</label>
                <select
                  required
                  value={formData.account_key}
                  onChange={e => setFormData(d => ({ ...d, account_key: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione a página ou conta...</option>
                  {accounts.map(acc => (
                    <option key={`${acc.platform}:${acc.id}`} value={`${acc.platform}:${acc.id}`}>
                      {acc.platform.toUpperCase()} — {acc.name} {acc.username ? `(@${acc.username})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Hashtags ou Termo de Caça</label>
                <input
                  type="text"
                  required
                  value={formData.search_query}
                  onChange={e => setFormData(d => ({ ...d, search_query: e.target.value }))}
                  placeholder="Ex: #umbanda, caboclos, orixas, frases de fe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Frequência de Postagem</label>
                  <select
                    value={formData.frequency_hours}
                    onChange={e => setFormData(d => ({ ...d, frequency_hours: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none"
                  >
                    <option value={4}>A cada 4 horas</option>
                    <option value={6}>A cada 6 horas</option>
                    <option value={12}>A cada 12 horas</option>
                    <option value={24}>1 vez ao dia (24h)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Modo de Publicação</label>
                  <select
                    value={formData.publish_mode}
                    onChange={e => setFormData(d => ({ ...d, publish_mode: e.target.value as any }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none"
                  >
                    <option value="approval">Aprovação Manual</option>
                    <option value="auto">Publicação Automática</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estilo Visual</label>
                  <select
                    value={formData.visual_style}
                    onChange={e => setFormData(d => ({ ...d, visual_style: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none"
                  >
                    <option value="sem_estilo">Estilo Original / Sem estilo fixo</option>
                    <option value="umbanda_cuiaba">Card com Frase Embutida</option>
                    <option value="fotografia_realista">Fotografia Realista</option>
                    <option value="vintage_engraving">Gravura Vintage</option>
                    <option value="dark_moody_contraste">Dark / Moody</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mínimo Viral Score</label>
                  <select
                    value={formData.min_viral_score}
                    onChange={e => setFormData(d => ({ ...d, min_viral_score: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800 outline-none"
                  >
                    <option value={60}>60+ (Em Alta)</option>
                    <option value={75}>75+ (Alto Potencial)</option>
                    <option value={85}>85+ (Super Viral)</option>
                  </select>
                </div>
              </div>

              {/* SEÇÃO: Exemplos de Referência para a IA */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Star size={14} className="text-amber-500 fill-amber-400" />
                    Exemplos de Referência para a IA ({selectedExamples.length})
                  </label>
                  {selectedExamples.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedExamples([]);
                        onClearExamples?.();
                      }}
                      className="text-[11px] font-bold text-red-500 hover:underline"
                    >
                      Limpar exemplos
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  A IA usará esses posts como padrão visual, gancho e tom de voz ao buscar e criar novos posts sozinho.
                </p>

                {selectedExamples.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-44 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                    {selectedExamples.map((ex, idx) => (
                      <div key={idx} className="relative group bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs flex flex-col">
                        <div className="aspect-square bg-slate-100 overflow-hidden relative">
                          <img
                            src={ex.imageUrl || ex.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedExamples(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-red-600 text-white rounded-md transition-colors"
                            title="Remover este exemplo"
                          >
                            <X size={11} />
                          </button>
                        </div>
                        <div className="p-1.5 text-[10px]">
                          <p className="font-bold text-slate-700 truncate">{ex.title || ex.caption || 'Exemplo viral'}</p>
                          <div className="flex items-center justify-between text-slate-500 font-semibold mt-0.5">
                            <span>❤️ {ex.likes || 0}</span>
                            <span className="text-indigo-600 font-black">{ex.viralScore || ex.viral_score || 0} pts</span>
                          </div>
                          {ex.targetPage?.name && (
                            <span className="mt-1 block text-[9px] font-black text-amber-950 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded truncate">
                              📍 {ex.targetPage.name}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/70 border border-dashed border-amber-300 rounded-xl text-center">
                    <p className="text-xs font-semibold text-amber-900">
                      Nenhum exemplo de referência adicionado.
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Vá na aba <strong>"Imagens Virais"</strong> e clique em <strong>⭐ Exemplo</strong> nos cards que você mais gostar para guiar a IA.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-md shadow-indigo-100 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {submitting ? 'Criando...' : 'Ativar Robô 24h'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
