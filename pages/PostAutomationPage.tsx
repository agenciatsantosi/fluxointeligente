import React, { useState, useEffect } from 'react';
import { Bot, Plus, Pause, Play, Trash2, Edit, Calendar, Image as ImageIcon, Settings, CheckCircle2, Clock, AlertTriangle, Search, Facebook, Instagram, Send, MessageCircle, Twitter, AtSign, Wand2, RefreshCw, Sparkles, Sliders, X } from 'lucide-react';
import api from '../services/api';

// Estilos de card (frase escrita dentro da imagem) vêm do módulo único
// services/cardStyles.js — o MESMO arquivo usado pelo backend, para
// não duplicar a lista de estilos entre front e back.
import { CARD_STYLES, getCardStyle, emotionsForStyle } from '../services/cardStyles';

// Estilos jornalísticos: passam pelo prompt de IA que PROÍBE texto na imagem
const JOURNALISM_STYLES = [
  'Fotografia realista, profissional e moderna|📸 Fotorealista & Cinematográfico (Padrão)',
  'Minimalista e elegante com iluminação suave|🎨 Minimalista & Elegante',
  '3D Render moderno e futurista|🚀 3D Render & Futurista',
  'Culinário gourmet realista com iluminação estúdio|🍔 Culinário Gourmet',
  'Corporativo e negócios de alto nível|💼 Corporativo & Negócios',
  'Editorial de alta moda e estética luxo|✨ Editorial & Alta Moda',
  'Vibrante, colorido e criativo|⚡ Vibrante & Criativo',
  'Paisagem natural com iluminação de luz dourada|🌿 Paisagem & Natureza'
];

const VISUAL_STYLES = [
  ...JOURNALISM_STYLES.map(s => { const [value, label] = s.split('|'); return { value, label }; }),
  ...CARD_STYLES.map(s => ({ value: s.value, label: s.label }))
];

/** O estilo selecionado é um dos cards com a frase escrita na imagem? */
const isCardSelected = (style: string): boolean => !!getCardStyle(style);

/** Emoções disponíveis para o estilo (só os cards com personagem têm várias) */
const emotionOptions = (style: string) => emotionsForStyle(style);

const PostAutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'posts'
  const [selectedAutomation, setSelectedAutomation] = useState<any>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [pageSearchTerm, setPageSearchTerm] = useState('');
  const [automationPosts, setAutomationPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [regeneratingPostId, setRegeneratingPostId] = useState<number | null>(null);
  const [editingAutomationId, setEditingAutomationId] = useState<number | null>(null);
  const [postsPerDay, setPostsPerDay] = useState<number>(2);
  const [customPostsInput, setCustomPostsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approvingPostId, setApprovingPostId] = useState<number | null>(null);

  // Modal State
  const [formData, setFormData] = useState({
    name: '',
    page_ids: [],
    visual_identity: { style: 'Fotografia realista, profissional e moderna', colors: '', emotion: 'auto', watermark: '' },
    start_date: '',
    end_date: '',
    schedule_times: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
    post_mode: 'now', // 'now' | 'schedule'
    schedule_mode: 'single', // 'single' | 'interval' | 'multiple'
    time: '09:00',
    times: ['09:00', '15:00'],
    auto_approve: true,
    titles: ''
  });

  useEffect(() => {
    loadAutomations();
  }, []);

  const [showCompleted, setShowCompleted] = useState(false);
  const [cleaningImages, setCleaningImages] = useState(false);

  const handleCleanupImages = async () => {
    if (!window.confirm('Remover imagens de posts já publicados? Esta ação não pode ser desfeita.')) return;
    setCleaningImages(true);
    try {
      const res = await api.post('/automations/cleanup-images');
      if (res.data.success) {
        alert(res.data.message || 'Limpeza concluída!');
        loadAutomations(showCompleted);
      } else {
        alert('Erro: ' + (res.data.error || 'Falha na limpeza'));
      }
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.error || err.message));
    } finally {
      setCleaningImages(false);
    }
  };

  const loadAutomations = async (includeCompleted = false) => {
    try {
      setLoading(true);
      const res = await api.get(`/automations${includeCompleted ? '?includeCompleted=true' : ''}`);
      if (res.data.success) {
        setAutomations(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const [fbRes, igRes, tgRes, waRes, twRes, thRes] = await Promise.all([
        api.get('/facebook/pages').catch(() => ({ data: { success: false } })),
        api.get('/instagram/accounts').catch(() => ({ data: { success: false } })),
        api.get('/telegram/accounts').catch(() => ({ data: { success: false } })),
        api.get('/whatsapp/accounts').catch(() => ({ data: { success: false } })),
        api.get('/twitter/accounts').catch(() => ({ data: { success: false } })),
        api.get('/threads/accounts').catch(() => ({ data: { success: false } }))
      ]);
      
      let accs = [];
      if (fbRes.data?.success) {
        accs = [...accs, ...fbRes.data.pages.map((p: any) => ({ ...p, platform: 'facebook' }))];
      }
      if (igRes.data?.success) {
        accs = [...accs, ...igRes.data.accounts.map((p: any) => ({ ...p, platform: 'instagram' }))];
      }
      if (tgRes.data?.success) {
        accs = [...accs, ...tgRes.data.accounts.map((p: any) => ({ ...p, platform: 'telegram' }))];
      }
      if (waRes.data?.success) {
        accs = [...accs, ...waRes.data.accounts.map((p: any) => ({ ...p, platform: 'whatsapp' }))];
      }
      if (twRes.data?.success) {
        accs = [...accs, ...twRes.data.accounts.map((p: any) => ({ ...p, platform: 'twitter' }))];
      }
      if (thRes.data?.success) {
        accs = [...accs, ...thRes.data.accounts.map((p: any) => ({ ...p, platform: 'threads' }))];
      }
      setAvailableAccounts(accs);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (showModal) {
      setPageSearchTerm('');
      loadAccounts();
    }
  }, [showModal]);

  const handleGeneratePreview = async () => {
    if (!formData.titles.trim()) {
      alert("Insira pelo menos uma frase para gerar o preview.");
      return;
    }
    const firstTitle = formData.titles.split('\n').filter(t => t.trim() !== '')[0];
    if (!firstTitle) return;

    // Validação de chave apenas se explicitamente escolher OpenAI sem chave
    if (isCardSelected(formData.visual_identity.style)) {
      try {
        const provider = formData.visual_identity.imageProvider || 'auto';
        if (provider === 'openai') {
          const cfg = await api.get('/ai/test?provider=openai');
          if (!cfg.data?.success) {
            alert(
              "⚠️ Provedor OpenAI selecionado, mas a chave OpenAI não está válida ou configurada.\n\n" +
              "Configure sua chave em Configurações do Sistema ou selecione outro provedor (Cloudflare, Pollinations, Hugging Face)."
            );
            return;
          }
        }
      } catch {
        // segue normalmente
      }
    }

    setGeneratingPreview(true);
    setPreviewData(null);
    try {
      const res = await api.post('/automations/preview', {
        title: firstTitle,
        visual_identity: formData.visual_identity
      });
      if (res.data.success) {
        setPreviewData(res.data.data);
      } else {
        alert("Erro ao gerar preview: " + res.data.error);
      }
    } catch (err: any) {
      alert("Erro ao gerar preview: " + (err.response?.data?.error || err.message));
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleCreateAutomation = async (e: React.FormEvent) => {
    console.log('[PostAutomation] handleCreateAutomation acionado!', { editingAutomationId, titles: formData.titles, page_ids: formData.page_ids });
    e.preventDefault();
    if (!formData.page_ids || formData.page_ids.length === 0) {
      alert("⚠️ Por favor, selecione pelo menos uma conta ou página para postar na seção 'Onde Postar'.");
      return;
    }
    const titlesArray = formData.titles.split('\n').filter(t => t.trim() !== '');
    if (titlesArray.length === 0 && !editingAutomationId) {
      alert("⚠️ Por favor, insira pelo menos um título ou frase para a postagem no campo de texto acima.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        auto_approve: formData.post_mode === 'now' ? true : formData.auto_approve,
        schedule_times: formData.post_mode === 'now' 
          ? { mode: 'now' }
          : {
              mode: formData.schedule_mode,
              times: formData.schedule_mode === 'single' ? [formData.time] : formData.times
            }
      };

      if (editingAutomationId) {
        const autoRes = await api.put(`/automations/${editingAutomationId}`, payload);
        if (autoRes.data.success) {
          setShowModal(false);
          setEditingAutomationId(null);
          loadAutomations();
          alert("✅ Automação atualizada com sucesso!");
        } else {
          alert("❌ Erro ao atualizar: " + (autoRes.data.error || "Tente novamente."));
        }
      } else {
        const autoRes = await api.post('/automations', payload);
        if (autoRes.data.success) {
          const autoId = autoRes.data.data.id;
          
          if (titlesArray.length > 0) {
            await api.post(`/automations/${autoId}/posts`, { titles: titlesArray });
          }
          
          setShowModal(false);
          loadAutomations();
          if (formData.post_mode === 'now') {
            alert("🚀 Automação criada com sucesso! O sistema gerou e enviou os posts para as redes selecionadas.");
          } else {
            alert("✅ Automação agendada com sucesso!");
          }
        } else {
          alert("❌ Erro ao criar automação: " + (autoRes.data.error || "Verifique os dados."));
        }
      }
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert("❌ Erro ao salvar automação: " + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (id: number, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'paused' : 'active';
      await api.put(`/automations/${id}`, { status: newStatus });
      loadAutomations();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm('Tem certeza que deseja excluir esta automação?')) return;
    try {
      await api.delete(`/automations/${id}`);
      loadAutomations();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegeneratePost = async (postId: number) => {
    try {
      setRegeneratingPostId(postId);
      const res = await api.post(`/automations/posts/${postId}/regenerate`);
      if (res.data.success) {
        setAutomationPosts(prev => prev.map(p => p.id === postId ? res.data.data : p));
      } else {
        alert("Erro ao regerar conteúdo: " + res.data.error);
      }
    } catch (err: any) {
      alert("Erro ao regerar: " + (err.response?.data?.error || err.message));
    } finally {
      setRegeneratingPostId(null);
    }
  };

  const openAutomationPosts = async (auto: any) => {
    setSelectedAutomation(auto);
    setActiveTab('posts');
    setLoadingPosts(true);
    try {
      const res = await api.get(`/automations/${auto.id}/posts`);
      if (res.data.success) {
        setAutomationPosts(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPosts(false);
    }
  };

  if (activeTab === 'posts' && selectedAutomation) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <button 
              onClick={() => setActiveTab('list')}
              className="text-gray-500 hover:text-indigo-600 mb-2 flex items-center gap-1 text-sm font-medium transition-colors"
            >
              ← Voltar para Campanhas
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bot className="w-8 h-8 text-indigo-600" />
              Preview: {selectedAutomation.name}
            </h1>
            <p className="text-gray-500 mt-1">Visualize e acompanhe o status das postagens geradas por IA.</p>
          </div>
        </div>

        {loadingPosts ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {automationPosts.length === 0 ? (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-gray-200 border-dashed">
                <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900">Nenhum post gerado ainda</h3>
                <p className="text-gray-500 mt-1">Aguarde alguns minutos para a IA processar os títulos.</p>
              </div>
            ) : (
              automationPosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                  {post.image_url ? (
                    <img src={post.image_url} alt="Preview" className="w-full h-48 object-cover bg-gray-100" />
                  ) : (
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center border-b border-gray-200">
                      {post.status === 'pending' || post.status === 'generating' ? (
                        <div className="flex flex-col items-center">
                          <div className="animate-pulse flex items-center gap-2 text-indigo-600 mb-2">
                            <Bot className="w-6 h-6" /> 
                            <span className="font-semibold text-sm">Gerando Conteúdo...</span>
                          </div>
                        </div>
                      ) : (
                        <ImageIcon className="w-10 h-10 text-gray-300" />
                      )}
                    </div>
                  )}
                  
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        post.status === 'published' ? 'bg-green-100 text-green-700' : 
                        post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                        post.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {post.status.toUpperCase()}
                      </span>
                      {post.scheduled_date && (
                        <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(post.scheduled_date).toLocaleString([], {hour: '2-digit', minute:'2-digit', day: '2-digit', month: '2-digit'})}
                        </span>
                      )}
                    </div>
                    
                    {post.published_page_id && post.published_platform && (
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded">
                        {post.published_platform === 'facebook' ? (
                          <Facebook className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <Instagram className="w-3.5 h-3.5 text-pink-600" />
                        )}
                        <span className="font-medium text-gray-800">
                          {post.published_platform === 'facebook' ? 'Facebook' : 'Instagram'}
                        </span>
                        <span className="text-gray-500">|</span>
                        <span className="font-mono text-gray-700">{post.published_page_id}</span>
                      </div>
                    )}

                    {post.status === 'scheduled' && !post.published_page_id && post.automation_page_ids && (
                      <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
                        {(() => {
                          let ids = [];
                          try {
                            ids = typeof post.automation_page_ids === 'string' ? JSON.parse(post.automation_page_ids) : (post.automation_page_ids || []);
                          } catch {}
                          return ids.map((id: string) => (
                            <span key={id} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
                              Agendar: {id}
                            </span>
                          ));
                        })()}
                      </div>
                    )}

                    <h4 className="font-bold text-gray-900 text-sm mb-2">{post.title}</h4>
                    
                    {post.description && (
                      <p className="text-gray-600 text-xs line-clamp-3 mb-2 flex-1">
                        {post.description}
                      </p>
                    )}
                    
                    {post.hashtags && (
                      <p className="text-indigo-600 text-xs font-medium line-clamp-1">
                        {post.hashtags}
                      </p>
                    )}
                    
                    {post.error_message && (
                      <div className="mt-3 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 flex items-start gap-1">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="line-clamp-2">{post.error_message}</span>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => handleRegeneratePost(post.id)}
                        disabled={regeneratingPostId === post.id}
                        className="flex-1 py-2 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold border border-gray-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                        title="Gerar nova imagem e legenda contextualizada com o título"
                      >
                        {regeneratingPostId === post.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                            Regerando...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                            Regerar Imagem
                          </>
                        )}
                      </button>

                      {post.status === 'generated' && (
                        <button 
                          onClick={async () => {
                            setApprovingPostId(post.id);
                            try {
                              const now = new Date().toISOString();
                              await api.put(`/automations/posts/${post.id}`, { status: 'scheduled', scheduled_date: now });
                              setAutomationPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'scheduled', scheduled_date: now } : p));
                              
                              setTimeout(() => {
                                if (selectedAutomation) {
                                  loadPosts(selectedAutomation.id);
                                }
                              }, 3500);
                            } catch (err: any) {
                              alert("Erro ao aprovar post: " + (err.response?.data?.error || err.message));
                            } finally {
                              setApprovingPostId(null);
                            }
                          }}
                          disabled={approvingPostId === post.id}
                          className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                        >
                          {approvingPostId === post.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Publicando...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aprovar e Postar Agora
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-8 h-8 text-indigo-600" />
            Automatizar Postagens
          </h1>
          <p className="text-gray-500 mt-1">Crie, agende e publique imagens automaticamente nas suas páginas.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button 
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm shadow-indigo-200"
          >
            <Plus className="w-5 h-5" />
            Nova Automação
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={e => { setShowCompleted(e.target.checked); loadAutomations(e.target.checked); }}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              Mostrar concluídas
            </label>
            <button
              onClick={handleCleanupImages}
              disabled={cleaningImages}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              title="Remove imagens de posts já publicados"
            >
              <Trash2 className={`w-3.5 h-3.5 ${cleaningImages ? 'animate-pulse' : ''}`} />
              {cleaningImages ? 'Limpando...' : 'Limpar imagens'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-2xl"></div>
          <div className="h-32 bg-gray-200 rounded-2xl"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {automations.map((auto: any) => (
            <div key={auto.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-gray-900 text-lg">{auto.name}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  auto.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {auto.status === 'active' ? 'Ativa' : 'Pausada'}
                </span>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2"><ImageIcon className="w-4 h-4"/> Formato</span>
                  <span className="font-medium">Imagem + Texto</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2"><Clock className="w-4 h-4"/> Criado em</span>
                  <span className="font-medium">{new Date(auto.created_at).toLocaleDateString()}</span>
                </div>

                {/* Redes de destino */}
                {auto.targets && auto.targets.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-500 font-medium">Será publicado em:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {auto.targets.map((t: any, i: number) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${
                            t.platform === 'facebook' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            t.platform === 'instagram' ? 'bg-pink-50 text-pink-700 border border-pink-200' :
                            'bg-gray-50 text-gray-600 border border-gray-200'
                          }`}
                          title={`ID: ${t.id}`}
                        >
                          {t.platform === 'facebook' ? <Facebook className="w-3 h-3" /> :
                           t.platform === 'instagram' ? <Instagram className="w-3 h-3" /> :
                           <Bot className="w-3 h-3" />}
                          {t.name || t.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{auto.stats?.total || 0}</div>
                    <div className="text-xs text-gray-500 uppercase">Títulos</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600">{(auto.stats?.pending || 0) + (auto.stats?.generated || 0) + (auto.stats?.scheduled || 0)}</div>
                    <div className="text-xs text-gray-500 uppercase">Fila</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-indigo-600">{auto.stats?.published || 0}</div>
                    <div className="text-xs text-gray-500 uppercase">Publicados</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                <button 
                  onClick={() => openAutomationPosts(auto)}
                  className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Search className="w-4 h-4"/>
                  Ver Posts
                </button>
                <button 
                  onClick={() => toggleStatus(auto.id, auto.status)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors"
                  title={auto.status === 'active' ? 'Pausar' : 'Retomar'}
                >
                  {auto.status === 'active' ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                </button>
                <button 
                  onClick={() => {
                    setEditingAutomationId(auto.id);
                    let pageIdsParsed = [];
                    try {
                      pageIdsParsed = typeof auto.page_ids === 'string' ? JSON.parse(auto.page_ids) : (auto.page_ids || []);
                    } catch(e) { pageIdsParsed = []; }

                    let schedTimes = auto.schedule_times;
                    if (typeof schedTimes === 'string') {
                      try { schedTimes = JSON.parse(schedTimes); } catch(e) { schedTimes = {}; }
                    }

                    let postMode = 'schedule';
                    let schedMode = 'single';
                    let tTime = '09:00';
                    let tTimes = ['09:00', '15:00'];

                    if (schedTimes?.mode === 'now') {
                      postMode = 'now';
                    } else if (schedTimes?.mode === 'multiple' && Array.isArray(schedTimes.times)) {
                      schedMode = 'multiple';
                      tTimes = schedTimes.times;
                    } else if (Array.isArray(schedTimes?.times) && schedTimes.times.length > 0) {
                      schedMode = 'single';
                      tTime = schedTimes.times[0];
                    }

                    setFormData({
                      name: auto.name || '',
                      page_ids: pageIdsParsed,
                      visual_identity: auto.visual_identity || { style: 'Fotografia realista, profissional e moderna', colors: '', emotion: 'auto', watermark: '' },
                      start_date: auto.start_date ? auto.start_date.substring(0, 10) : '',
                      end_date: auto.end_date ? auto.end_date.substring(0, 10) : '',
                      schedule_times: schedTimes || {},
                      post_mode: postMode,
                      schedule_mode: schedMode,
                      time: tTime,
                      times: tTimes,
                      auto_approve: !!auto.auto_approve,
                      titles: ''
                    });
                    loadAccounts();
                    setShowModal(true);
                  }}
                  className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                  title="Editar Automação"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(auto.id)} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {automations.length === 0 && (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-gray-200 border-dashed">
              <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900">Nenhuma automação cadastrada</h3>
              <p className="text-gray-500 mt-1">Clique em "Nova Automação" para começar.</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">{editingAutomationId ? 'Editar Automação' : 'Nova Automação'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            
            <form onSubmit={handleCreateAutomation} className="p-6 overflow-y-auto space-y-6 flex-1">
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da automação</label>
                <input 
                  type="text" 

                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                  placeholder="Ex: Posts Diários - Instagram"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Selecionar páginas de destino</label>
                  <span className="text-xs text-gray-500 font-semibold">{formData.page_ids.length} selecionada(s)</span>
                </div>

                {/* Campo de pesquisa de páginas */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Pesquisar página ou conta pelo nome..."
                    value={pageSearchTerm}
                    onChange={e => setPageSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 hover:bg-gray-100/70 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-gray-400 font-medium"
                  />
                  {pageSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPageSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      title="Limpar pesquisa"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableAccounts.length === 0 ? (
                    <div className="col-span-full p-4 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 text-center">Nenhuma conta conectada.</div>
                  ) : (() => {
                    const filteredAccounts = availableAccounts.filter(acc => {
                      const name = (acc.name || acc.username || '').toLowerCase();
                      const plat = (acc.platform || '').toLowerCase();
                      const term = pageSearchTerm.trim().toLowerCase();
                      return !term || name.includes(term) || plat.includes(term);
                    });

                    if (filteredAccounts.length === 0) {
                      return (
                        <div className="col-span-full p-6 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <Search size={18} className="mx-auto mb-1 opacity-40 text-gray-400" />
                          <p className="text-xs font-semibold text-gray-500">Nenhuma página encontrada</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Nenhum resultado para "{pageSearchTerm}"</p>
                        </div>
                      );
                    }

                    return filteredAccounts.map(acc => {
                      const isSelected = formData.page_ids.includes(acc.id as never);
                      
                      const platformConfig: Record<string, { icon: React.ReactNode, bgClass: string }> = {
                        facebook: { icon: <Facebook className="w-5 h-5" />, bgClass: 'bg-blue-100 text-blue-600' },
                        instagram: { icon: <Instagram className="w-5 h-5" />, bgClass: 'bg-pink-100 text-pink-600' },
                        telegram: { icon: <Send className="w-5 h-5" />, bgClass: 'bg-cyan-100 text-cyan-600' },
                        whatsapp: { icon: <MessageCircle className="w-5 h-5" />, bgClass: 'bg-green-100 text-green-600' },
                        twitter: { icon: <Twitter className="w-5 h-5" />, bgClass: 'bg-gray-800 text-white' },
                        threads: { icon: <AtSign className="w-5 h-5" />, bgClass: 'bg-gray-100 text-gray-900' }
                      };
                      
                      const config = platformConfig[acc.platform] || { icon: <Bot className="w-5 h-5" />, bgClass: 'bg-gray-100 text-gray-500' };

                      return (
                        <label 
                          key={`${acc.platform}_${acc.id}`} 
                          className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer border transition-all ${
                            isSelected 
                              ? 'border-indigo-500 bg-indigo-50/50' 
                              : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-lg ${config.bgClass}`}>
                            {config.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-gray-900 truncate">
                              {acc.name || acc.username}
                            </span>
                            <span className="block text-xs text-gray-500 capitalize truncate">{acc.platform}</span>
                          </div>
                          <div className={`flex flex-shrink-0 items-center justify-center w-5 h-5 rounded-full border transition-colors ${
                            isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          
                          <input 
                            type="checkbox" 
                            className="hidden"
                            checked={isSelected}
                            onChange={e => {
                              if (e.target.checked) {
                                setFormData({...formData, page_ids: [...formData.page_ids, acc.id as never]});
                              } else {
                                setFormData({...formData, page_ids: formData.page_ids.filter(id => id !== acc.id)});
                              }
                            }}
                          />
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Estilo Visual das Imagens</label>
                 <select
                   value={formData.visual_identity.style}
                   onChange={e => setFormData({
                     ...formData,
                     visual_identity: { ...formData.visual_identity, style: e.target.value }
                   })}
                   className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm font-medium py-2.5 px-3 bg-white"
                 >
                    {VISUAL_STYLES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {isCardSelected(formData.visual_identity.style) && (
                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-2">
                      <strong>Card de frase:</strong> cada linha abaixo vira uma imagem com a frase <strong>escrita dentro dela</strong>, junto com a legenda e o agendamento.
                    </p>
                  )}
               </div>

                {/* Campos extras: só aparecem nos estilos de card */}
                {isCardSelected(formData.visual_identity.style) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-rose-50/50 border border-rose-200 rounded-xl">
                    {emotionOptions(formData.visual_identity.style).length > 1 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Emoção do Personagem</label>
                        <select
                          value={formData.visual_identity.emotion}
                          onChange={e => setFormData({
                            ...formData,
                            visual_identity: { ...formData.visual_identity, emotion: e.target.value }
                          })}
                          className="w-full border-gray-300 rounded-xl shadow-sm focus:border-rose-500 focus:ring-rose-500 text-sm font-medium py-2.5 px-3 bg-white"
                        >
                          {emotionOptions(formData.visual_identity.style).map(em => (
                            <option key={em.id} value={em.id}>{em.emoji} {em.label}</option>
                          ))}
                        </select>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Define a expressão do personagem, a cor do card e os elementos que cercam a cena.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Marca d'água <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.visual_identity.watermark}
                        onChange={e => setFormData({
                          ...formData,
                          visual_identity: { ...formData.visual_identity, watermark: e.target.value }
                        })}
                        placeholder="@entree_afetos"
                        className="w-full border-gray-300 rounded-xl shadow-sm focus:border-rose-500 focus:ring-rose-500 text-sm font-medium py-2.5 px-3 bg-white"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Escreva apenas o @usuário. Deixe vazio para não gerar marca d'água.
                      </p>
                    </div>
                  </div>
                )}

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">
                   {isCardSelected(formData.visual_identity.style) ? 'Frases dos Cards (Uma por linha)' : 'Títulos dos conteúdos (Um por linha)'}
                 </label>
                <p className="text-xs text-gray-500 mb-2">
                  {isCardSelected(formData.visual_identity.style)
                    ? 'Cada linha vira um card: a frase é escrita dentro da imagem, junto com a legenda e o agendamento. Você pode colar 100 frases de uma vez.'
                    : 'Para cada título inserido, a IA criará uma imagem, uma legenda e agendará o post.'}
                </p>
                <textarea 

                  rows={isCardSelected(formData.visual_identity.style) ? 14 : 6}
                  value={formData.titles}
                  onChange={e => setFormData({...formData, titles: e.target.value})}
                  className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                  placeholder={isCardSelected(formData.visual_identity.style)
                    ? 'Cole uma frase por linha (pode colar 100 de uma vez):\n\nEu sou a pessoa mais sortuda desse mundo por ter alguém tão incrível como você pra chamar de meu amor.\nTe amo muito...'
                    : 'Ex:\n5 dicas para melhorar vendas\nComo atrair clientes\nErros comuns no marketing'}
                />
                <div className="mt-2 flex justify-between items-center text-sm">
                  <button
                    type="button"
                    onClick={handleGeneratePreview}
                    disabled={generatingPreview || !formData.titles.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingPreview ? (
                      <>
                        <div className="w-4 h-4 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin"></div>
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                         Gerar Preview da 1ª Frase
                      </>
                    )}
                  </button>
                  <span className="text-gray-500 font-medium">
                    {formData.titles.split('\n').filter(t => t.trim() !== '').length} {isCardSelected(formData.visual_identity.style) ? 'frases cadastradas' : 'títulos cadastrados'}
                  </span>
                </div>
                
                {previewData && (
                  <div className="mt-4 bg-white border border-indigo-100 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex items-center justify-between">
                      <span className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> Preview de Como Ficará
                      </span>
                    </div>
                    <div className="p-4 flex flex-col md:flex-row gap-4">
                      {previewData.image_url ? (
                        <img
                          src={previewData.image_url.startsWith('/') && (window.location.port === '5174' || window.location.port === '5173') ? `http://localhost:3001${previewData.image_url}` : previewData.image_url}
                          alt="Preview"
                          className="w-full md:w-48 h-48 object-cover rounded-lg bg-gray-100"
                          onError={(e: any) => {
                            if (!e.target.dataset.triedFallback && previewData.image_url.startsWith('/')) {
                              e.target.dataset.triedFallback = 'true';
                              e.target.src = `http://localhost:3001${previewData.image_url}`;
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full md:w-48 h-48 bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400">
                          <ImageIcon className="w-8 h-8 mb-2" />
                          <span className="text-xs">Sem Imagem</span>
                        </div>
                      )}
                      <div className="flex-1 text-sm text-gray-700">
                        <p className="font-semibold text-gray-900 mb-2">Legenda Gerada:</p>
                        <p className="whitespace-pre-wrap">{previewData.description}</p>
                        <p className="text-indigo-600 font-medium mt-3">{previewData.hashtags}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Publicação Imediata ou Agendamento */}
              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200/80 space-y-4">
                <label className="block text-sm font-bold text-gray-800">Momento da Publicação</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      console.log('[PostAutomation] Botão Postar Agora clicado, post_mode antes:', formData.post_mode);
                      setFormData({ ...formData, post_mode: 'now' });
                    }}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                      formData.post_mode === 'now'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <Play className="w-4 h-4" />
                    Postar Agora
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, post_mode: 'schedule' })}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                      formData.post_mode === 'schedule'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    Agendar
                  </button>
                </div>

                {formData.post_mode === 'schedule' && (
                  <div className="space-y-4 pt-3 border-t border-gray-200">
                    <div>
                      <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                        ⚙️ Configurar Agendamento: Posts por dia?
                      </label>
                      <div className="flex flex-wrap gap-2 items-center mb-3">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setPostsPerDay(n);
                              setCustomPostsInput('');
                              const defs = ['09:00', '12:00', '15:00', '18:00', '21:00'];
                              let next = [...formData.times].slice(0, n);
                              for (const d of defs) {
                                if (next.length >= n) break;
                                if (!next.includes(d)) next.push(d);
                              }
                              next = next.sort();
                              setFormData({
                                ...formData,
                                schedule_mode: n > 1 ? 'multiple' : 'single',
                                times: next,
                                time: next[0] || '09:00'
                              });
                            }}
                            className={`w-11 h-9 rounded-xl font-black text-xs transition-all ${
                              (formData.times.length === n || (n === 1 && formData.schedule_mode === 'single'))
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-white text-gray-700 hover:bg-indigo-50 border border-gray-200'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-gray-500 ml-1">Outro:</span>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            placeholder="Nº"
                            value={customPostsInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setCustomPostsInput(raw);
                              const n = parseInt(raw, 10);
                              if (isNaN(n) || n < 1 || n > 20) return;
                              setPostsPerDay(n);
                              const defs = [];
                              for (let i = 0; i < n; i++) {
                                let hour = 8 + Math.floor(i * (14 / Math.max(1, n - 1)));
                                if (hour > 23) hour = 23;
                                defs.push(`${hour.toString().padStart(2, '0')}:00`);
                              }
                              setFormData({
                                ...formData,
                                schedule_mode: 'multiple',
                                times: defs
                              });
                            }}
                            className="w-14 h-9 px-2 rounded-xl border border-gray-200 bg-white font-black text-xs text-center text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          Horários ({formData.times.length} posts/dia)
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, schedule_mode: 'multiple', times: [...formData.times, '12:00'] })}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Adicionar Horário
                        </button>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {formData.times.map((t, idx) => (
                          <div key={idx} className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1.5">
                            <input
                              type="time"
                              value={t}
                              onChange={e => {
                                const updated = [...formData.times];
                                updated[idx] = e.target.value;
                                setFormData({ ...formData, times: updated });
                              }}
                              className="w-full text-xs font-semibold text-gray-800 bg-transparent border-0 focus:ring-0 p-1"
                            />
                            {formData.times.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, times: formData.times.filter((_, i) => i !== idx) });
                                }}
                                className="text-gray-400 hover:text-red-500 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={formData.auto_approve}
                    onChange={e => setFormData({...formData, auto_approve: e.target.checked})}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5" 
                  />
                  <div>
                    <div className="font-medium text-gray-900">Aprovação Automática</div>
                    <div className="text-sm text-gray-500">Se marcado, o sistema criará e postará sem exigir sua aprovação manual.</div>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Cancelar</button>
                
                {/* BOTÃO ÚNICO: Cria automação + posta AGORA (ou processa posts existentes se editando) */}
                <button 
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    console.log('[PostAutomation] 🚀 Enviar Agora clicado', { editingAutomationId });
                    if (!formData.page_ids || formData.page_ids.length === 0) {
                      alert("⚠️ Selecione pelo menos uma página/conta em 'Onde Postar'.");
                      return;
                    }
                    
                    setSubmitting(true);
                    try {
                      const payload = {
                        ...formData,
                        auto_approve: true,
                        schedule_times: { mode: 'now' }
                      };
                      
                      let autoId;
                      
                      if (editingAutomationId) {
                        // EDITANDO: atualiza automação e dispara processamento dos posts existentes
                        const autoRes = await api.put(`/automations/${editingAutomationId}`, payload);
                        if (!autoRes.data.success) throw new Error(autoRes.data.error || 'Erro ao atualizar automação');
                        autoId = editingAutomationId;
                        
                        // Dispara processamento dos posts que já existem (pending/generated)
                        await api.post(`/automations/${autoId}/trigger-processing`, {});
                        
                        setShowModal(false);
                        setEditingAutomationId(null);
                        loadAutomations();
                        alert("🚀 Enviando agora! Posts existentes serão publicados no Facebook.");
                      } else {
                        // NOVA AUTOMAÇÃO: cria + insere títulos + dispara
                        const titlesArray = formData.titles.split('\n').filter(t => t.trim() !== '');
                        if (titlesArray.length === 0) {
                          alert("⚠️ Insira pelo menos uma frase no campo de texto.");
                          return;
                        }
                        
                        const autoRes = await api.post('/automations', payload);
                        if (!autoRes.data.success) throw new Error(autoRes.data.error || 'Erro ao criar automação');
                        autoId = autoRes.data.data.id;
                        
                        await api.post(`/automations/${autoId}/posts`, { titles: titlesArray });
                        
                        setShowModal(false);
                        loadAutomations();
                        alert("🚀 Enviando agora! O sistema está gerando as imagens e publicando no Facebook.");
                      }
                    } catch (err: any) {
                      alert("❌ Erro: " + (err.response?.data?.error || err.message));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-lg"
                >
                  {submitting ? (
                    <> <RefreshCw className="w-5 h-5 animate-spin" /> Enviando... </> 
                  ) : (
                    <> <Send className="w-5 h-5" /> 🚀 Enviar Agora </> 
                  )}
                </button>

                <button 
                  type="submit" 
                  disabled={submitting} 
                  onClick={(e) => console.log('[PostAutomation] Botão Salvar clicado', { page_ids: formData.page_ids, titles: formData.titles, post_mode: formData.post_mode })}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium flex items-center gap-2"
                >
                  {submitting ? (
                    <> <RefreshCw className="w-5 h-5 animate-spin" /> Salvando... </>
                  ) : (
                    <> <CheckCircle2 className="w-5 h-5" /> Salvar Automação </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostAutomationPage;
