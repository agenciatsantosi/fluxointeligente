import React, { useState, useEffect, useRef } from 'react';
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

const BASE_VISUAL_STYLES = [
  ...JOURNALISM_STYLES.map(s => { const [value, label] = s.split('|'); return { value, label }; }),
  ...CARD_STYLES.map(s => ({ value: s.value, label: s.label }))
];

/** O estilo selecionado é um dos cards com a frase escrita na imagem? */
const isCardSelected = (style: string): boolean => {
  if (getCardStyle(style)) return true;
  // Estilos personalizados também são cards
  return String(style || '').includes('Card personalizado');
};

/** Emoções disponíveis para o estilo (só os cards com personagem têm várias) */
const emotionOptions = (style: string) => emotionsForStyle(style);

const PostAutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState([]);
  /** Estilos carregados do servidor (inclui personalizados criados pelo admin). */
  const [visualStyles, setVisualStyles] = useState(BASE_VISUAL_STYLES);
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
  // Edição de um post agendado (frase, hashtags e horário)
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [editPostForm, setEditPostForm] = useState<{ description: string; hashtags: string; scheduled_date: string }>({ description: '', hashtags: '', scheduled_date: '' });
  const [savingPost, setSavingPost] = useState(false);
  // Posts gerados exibidos dentro do modal "Editar Automação"
  const [modalPosts, setModalPosts] = useState<any[]>([]);
  const [loadingModalPosts, setLoadingModalPosts] = useState(false);

  // Estado para o Gerador de Dilemas por Nicho e Tema
  const [dilemaNiche, setDilemaNiche] = useState('Relacionamentos');
  const [dilemaTheme, setDilemaTheme] = useState('');
  const [dilemaCount, setDilemaCount] = useState<number>(5);
  const [dilemaStyle, setDilemaStyle] = useState('misto');
  const [generatingDilemmas, setGeneratingDilemmas] = useState(false);

  // Modal State (form vazio padrão — reutilizado ao abrir "Nova Automação" e após salvar)
  const EMPTY_FORM = {
    name: '',
    page_ids: [],
    visual_identity: { style: 'Fotografia realista, profissional e moderna', colors: '', emotion: 'auto', watermark: '', selected_styles: [] as string[] },
    start_date: '',
    end_date: '',
    schedule_times: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
    post_mode: 'now', // 'now' | 'schedule'
    schedule_mode: 'single', // 'single' | 'interval' | 'multiple'
    time: '09:00',
    times: ['09:00', '15:00'],
    auto_approve: true,
    titles: ''
  };
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  /** Card Educativo Universal usa dois inputs ({{tema}} e {{produto}}) em vez da caixa única.
   *  Os dois campos são combinados em formData.titles no formato "TEMA | PRODUTO"
   *  que o backend entende — todo o resto (preview, contadores, criação) segue igual. */
  const [eduTemas, setEduTemas] = useState('');
  const [eduProduto, setEduProduto] = useState('');
  const isEduStyle = getCardStyle(formData.visual_identity.style)?.id === 'educativo_universal';
  const combineEdu = (temas: string, produto: string) =>
    temas.split('\n').map(t => t.trim()).filter(Boolean)
      .map(t => produto.trim() ? `${t} | ${produto.trim()}` : t).join('\n');

  // Ao entrar/sair do estilo educativo, interpreta ou limpa o formato "TEMA | PRODUTO".
  const prevIsEdu = useRef(false);
  useEffect(() => {
    if (isEduStyle && !prevIsEdu.current) {
      const temas: string[] = [];
      let prod = '';
      for (const ln of formData.titles.split('\n').map(l => l.trim()).filter(Boolean)) {
        const i = ln.indexOf('|');
        if (i >= 0) {
          temas.push(ln.slice(0, i).trim());
          if (!prod) prod = ln.slice(i + 1).trim();
        } else temas.push(ln);
      }
      setEduTemas(temas.join('\n'));
      setEduProduto(prod);
    } else if (!isEduStyle && prevIsEdu.current) {
      const suf = eduProduto.trim();
      if (suf) {
        setFormData(prev => ({
          ...prev,
          titles: prev.titles.split('\n').map(ln => {
            const i = ln.lastIndexOf('|');
            if (i >= 0 && ln.slice(i + 1).trim() === suf) return ln.slice(0, i).trim();
            return ln;
          }).join('\n')
        }));
      }
    }
    prevIsEdu.current = isEduStyle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEduStyle]);

  // Prefill vindo do Radar de Tendências: títulos gerados pela IA chegam aqui.
  useEffect(() => {
    try {
      const prefill = localStorage.getItem('trend_prefill_titles');
      if (prefill && prefill.trim()) {
        localStorage.removeItem('trend_prefill_titles');
        setFormData(prev => ({ ...prev, titles: prefill.trim() }));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Abre o modal para CRIAR do zero — sempre limpa resíduos da automação anterior. */
  const openNewAutomationModal = () => {
    setEditingAutomationId(null);
    setFormData({ ...EMPTY_FORM, visual_identity: { ...EMPTY_FORM.visual_identity, selected_styles: [] } });
    setEduTemas('');
    setEduProduto('');
    setPreviewData(null);
    setModalPosts([]);
    setShowModal(true);
  };

  /** Limpa o formulário após salvar (criar ou editar). */
  const resetForm = () => {
    setEditingAutomationId(null);
    setFormData({ ...EMPTY_FORM, visual_identity: { ...EMPTY_FORM.visual_identity, selected_styles: [] } });
    setEduTemas('');
    setEduProduto('');
    setPreviewData(null);
    setModalPosts([]);
  };

  useEffect(() => {
    loadAutomations();
  }, []);

  // Carrega estilos de card do servidor (inclui personalizados do admin)
  useEffect(() => {
    api.get('/card-styles/options')
      .then(res => {
        if (res.data?.success && Array.isArray(res.data.styles) && res.data.styles.length > 0) {
          const journalism = BASE_VISUAL_STYLES.filter(s => !getCardStyle(s.value));
          const cards = res.data.styles.map((s: any) => ({ id: s.id, value: s.value, label: s.label }));
          setVisualStyles([...journalism, ...cards]);
        }
      })
      .catch(err => console.warn('Falha ao carregar estilos de card:', err));
  }, []);

  const [showCompleted, setShowCompleted] = useState(false);
  const [cleaningImages, setCleaningImages] = useState(false);

  // Auto-atualiza a lista (contadores Títulos/Fila/Publicados) sem precisar de F5.
  // Poll silencioso a cada 15s: não mostra skeleton para não piscar a tela.
  useEffect(() => {
    if (activeTab !== 'list' || showModal) return;
    const timer = setInterval(() => {
      loadAutomations(showCompleted, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [activeTab, showModal, showCompleted]);

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

  const loadAutomations = async (includeCompleted = false, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get(`/automations${includeCompleted ? '?includeCompleted=true' : ''}`);
      if (res.data.success) {
        setAutomations(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
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
      // Determina a plataforma baseada nas páginas selecionadas
      const targetPlatform = formData.page_ids.length === 1
        ? availableAccounts.find(a => a.id === formData.page_ids[0])?.platform || null
        : null;

      const res = await api.post('/automations/preview', {
        title: firstTitle,
        visual_identity: formData.visual_identity,
        platform: targetPlatform
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

    // Trava de capacidade (só em criação): verifica se as APIs suportam a demanda
    if (!editingAutomationId && titlesArray.length > 0) {
      try {
        const newRate = formData.post_mode === 'now'
          ? 0
          : (formData.schedule_mode === 'single' ? 1 : (formData.times?.length || 1));
        const capRes = await api.get(`/automations/capacity-check?postsPerDay=${newRate}&totalPosts=${titlesArray.length}&checkKeys=1`);
        if (capRes.data?.success && capRes.data.ok === false) {
          alert(capRes.data.message || 'Capacidade de imagens esgotada.');
          return;
        }
        if (capRes.data?.success && (capRes.data.deadKeys?.length || 0) > 0) {
          const dead = capRes.data.deadKeys.map((k: any) => `• Conta ${k.account}: ${k.status === 'auth' ? 'token inválido' : k.status === 'quota' ? 'sem cota hoje' : 'erro'}`).join('\n');
          if (!window.confirm(`⚠️ Atenção: ${capRes.data.deadKeys.length} chave(s) Cloudflare com problema e fora da capacidade:\n${dead}\n\nContinuar mesmo assim?`)) {
            return;
          }
        }
      } catch {
        // Se a consulta falhar, segue — o backend reforça a trava
      }
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
          resetForm();
          loadAutomations(showCompleted);
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
          resetForm();
          loadAutomations(showCompleted);
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
      loadAutomations(showCompleted, true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm('Tem certeza que deseja excluir esta automação?')) return;
    try {
      await api.delete(`/automations/${id}`);
      loadAutomations(showCompleted);
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

  /** Converte uma data (ISO/banco) para o formato aceito por <input type="datetime-local">. */
  const toDateTimeLocal = (value: any): string => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEditPost = (post: any) => {
    setEditingPost(post);
    setEditPostForm({
      description: post.description || '',
      hashtags: post.hashtags || '',
      scheduled_date: toDateTimeLocal(post.scheduled_date),
    });
  };

  const handleSavePostEdit = async () => {
    if (!editingPost) return;
    setSavingPost(true);
    try {
      const payload: any = {
        description: editPostForm.description,
        hashtags: editPostForm.hashtags,
      };
      if (editPostForm.scheduled_date) {
        payload.scheduled_date = new Date(editPostForm.scheduled_date).toISOString();
        // Reativa o post no novo horário (ex.: posts presos em 'error' voltam para 'scheduled')
        if (editingPost.status && editingPost.status !== 'published' && editingPost.status !== 'publishing') {
          payload.status = 'scheduled';
        }
      }
      const res = await api.put(`/automations/posts/${editingPost.id}`, payload);
      if (res.data.success) {
        setAutomationPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, ...res.data.data } : p));
        setModalPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, ...res.data.data } : p));
        setEditingPost(null);
      } else {
        alert('Erro ao salvar: ' + (res.data.error || 'Falha desconhecida'));
      }
    } catch (err: any) {
      alert('Erro ao salvar post: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingPost(false);
    }
  };

  const loadPosts = async (automationId: number) => {
    setLoadingPosts(true);
    try {
      const res = await api.get(`/automations/${automationId}/posts`);
      if (res.data.success) {
        setAutomationPosts(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPosts(false);
    }
  };

  const loadModalPosts = async (automationId: number) => {
    setLoadingModalPosts(true);
    try {
      const res = await api.get(`/automations/${automationId}/posts`);
      if (res.data.success) {
        setModalPosts(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingModalPosts(false);
    }
  };

  const openAutomationPosts = async (auto: any) => {
    setSelectedAutomation(auto);
    setActiveTab('posts');
    await loadPosts(auto.id);
  };

  const renderPostEditModal = () => {
    if (!editingPost) return null;
    return (
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
          <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                Editar post agendado
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{editingPost.title}</p>
            </div>
            <button
              onClick={() => setEditingPost(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-500" />
                Horário de publicação
              </label>
              <input
                type="datetime-local"
                value={editPostForm.scheduled_date}
                onChange={e => setEditPostForm({ ...editPostForm, scheduled_date: e.target.value })}
                className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">Define quando este post será publicado.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Frase / legenda</label>
              <textarea
                rows={6}
                value={editPostForm.description}
                onChange={e => setEditPostForm({ ...editPostForm, description: e.target.value })}
                className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                placeholder="Escreva a legenda que acompanhará a imagem..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hashtags</label>
              <input
                type="text"
                value={editPostForm.hashtags}
                onChange={e => setEditPostForm({ ...editPostForm, hashtags: e.target.value })}
                className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                placeholder="#exemplo #hashtag"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
            <button
              onClick={() => setEditingPost(null)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSavePostEdit}
              disabled={savingPost}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {savingPost ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Salvar alterações
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (activeTab === 'posts' && selectedAutomation) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <button 
              onClick={() => { setActiveTab('list'); loadAutomations(showCompleted, true); }}
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

        {/* Faixa do próximo post a ser publicado */}
        {(() => {
          const queue = (automationPosts || []).filter((p: any) => ['pending', 'generating', 'generated', 'scheduled', 'publishing'].includes(p.status));
          if (queue.length === 0 || loadingPosts) return null;
          const sorted = [...queue].sort((a: any, b: any) => {
            const da = a.scheduled_date ? new Date(a.scheduled_date).getTime() : Infinity;
            const db = b.scheduled_date ? new Date(b.scheduled_date).getTime() : Infinity;
            if (da !== db) return da - db;
            return (a.id || 0) - (b.id || 0);
          });
          const next = sorted[0];
          return (
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-200">⏭ Próximo post a ser publicado</p>
                <p className="font-bold leading-snug truncate">{next.title}</p>
                <p className="text-xs text-indigo-200">
                  {next.scheduled_date
                    ? `📅 ${new Date(next.scheduled_date).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Na fila para processamento'}
                  {' • '}
                  {queue.length} na fila
                </p>
              </div>
            </div>
          );
        })()}

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
              automationPosts.map(post => {
                const statusMeta = ({
                  published:  { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700' },
                  scheduled:  { label: 'Agendado', cls: 'bg-blue-100 text-blue-700' },
                  generated:  { label: 'Pronto', cls: 'bg-amber-100 text-amber-800' },
                  generating: { label: 'Gerando...', cls: 'bg-indigo-100 text-indigo-700' },
                  pending:    { label: 'Pendente', cls: 'bg-gray-100 text-gray-600' },
                  error:      { label: 'Erro', cls: 'bg-red-100 text-red-700' },
                } as Record<string, { label: string; cls: string }>)[post.status] || { label: String(post.status || '').toUpperCase(), cls: 'bg-gray-100 text-gray-600' };

                return (
                  <div key={post.id} className="group bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all duration-200 flex flex-col overflow-hidden">
                    {/* Imagem + status overlay */}
                    <div className="relative">
                      {post.image_url ? (
                        <img src={post.image_url} alt="Preview" className="w-full h-52 object-cover bg-gray-100" />
                      ) : (
                        <div className="w-full h-52 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                          {post.status === 'pending' || post.status === 'generating' ? (
                            <div className="flex flex-col items-center gap-2 text-indigo-600">
                              <Bot className="w-7 h-7 animate-pulse" />
                              <span className="text-xs font-semibold">Gerando conteúdo...</span>
                            </div>
                          ) : (
                            <ImageIcon className="w-10 h-10 text-gray-300" />
                          )}
                        </div>
                      )}

                      <span className={`absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm ${statusMeta.cls}`}>
                        {statusMeta.label}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditPost(post)}
                        className="absolute top-3 right-3 p-2 rounded-full bg-white/90 backdrop-blur text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white hover:text-indigo-600 transition-all"
                        title="Editar frase, hashtags ou horário"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-4 flex-1 flex flex-col">
                      {post.scheduled_date && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                          <Clock className="w-3.5 h-3.5 text-indigo-500" />
                          {new Date(post.scheduled_date).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}

                      {post.published_page_id && post.published_platform && (
                        <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-gray-600 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg self-start">
                          {post.published_platform === 'facebook' ? (
                            <Facebook className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <Instagram className="w-3.5 h-3.5 text-pink-600" />
                          )}
                          <span className="font-semibold text-gray-800">
                            {post.published_platform === 'facebook' ? 'Facebook' : 'Instagram'}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="font-mono text-gray-700">{post.published_page_id}</span>
                        </div>
                      )}

                      {post.status === 'scheduled' && !post.published_page_id && post.automation_page_ids && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {(() => {
                            let ids = [];
                            try {
                              ids = typeof post.automation_page_ids === 'string' ? JSON.parse(post.automation_page_ids) : (post.automation_page_ids || []);
                            } catch {}
                            return ids.map((id: string) => (
                              <span key={id} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium">
                                Agendar: {id}
                              </span>
                            ));
                          })()}
                        </div>
                      )}

                      <h4 className="font-bold text-gray-900 text-sm leading-snug mb-1.5">{post.title}</h4>

                      {post.description && (
                        <p className="text-gray-600 text-xs leading-relaxed line-clamp-3 mb-2 flex-1 whitespace-pre-wrap">
                          {post.description}
                        </p>
                      )}

                      {post.hashtags && (
                        <p className="text-indigo-600 text-xs font-medium line-clamp-2">
                          {post.hashtags}
                        </p>
                      )}

                      {post.error_message && (
                        <div className="mt-3 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 flex items-start gap-1">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span className="line-clamp-2">{post.error_message}</span>
                        </div>
                      )}

                      {/* Ações */}
                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditPost(post)}
                          className="flex-1 py-2 px-3 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-bold border border-gray-200 transition-colors flex items-center justify-center gap-1.5"
                          title="Editar a frase, as hashtags ou o horário deste post"
                        >
                          <Edit className="w-3.5 h-3.5 text-gray-500" />
                          Editar
                        </button>

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
                              Regerar
                            </>
                          )}
                        </button>
                      </div>

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
                          className="mt-2 w-full py-2 px-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
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
                );
              })
            )}
          </div>
        )}

        {renderPostEditModal()}
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
            onClick={openNewAutomationModal}
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

                {/* Próximo post a ser publicado */}
                {auto.next_post ? (
                  <div className="flex items-start gap-2 text-xs bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-2">
                    <Send className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-bold text-indigo-900 uppercase tracking-wide text-[10px]">Próximo post</span>
                      <p className="text-gray-800 font-medium leading-snug line-clamp-2">{auto.next_post.title}</p>
                      {auto.next_post.scheduled_date && (
                        <p className="text-gray-500 mt-0.5">
                          📅 {new Date(auto.next_post.scheduled_date).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                    ✅ Nenhum post pendente — tudo publicado.
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
                    loadModalPosts(auto.id);
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

              {editingAutomationId && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-bold text-gray-800">Posts gerados</span>
                      <span className="text-xs font-semibold text-gray-500 bg-gray-200/70 px-2 py-0.5 rounded-full">{modalPosts.length}</span>
                    </div>
                    <span className="text-[11px] text-gray-500">Edite a hora e a frase de cada post aqui.</span>
                  </div>

                  {loadingModalPosts ? (
                    <div className="flex justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  ) : modalPosts.length === 0 ? (
                    <p className="text-xs text-gray-500 py-3 text-center">Nenhum post gerado ainda. Aguarde a IA processar os títulos.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {modalPosts.map((post: any) => (
                        <div key={post.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                            {post.image_url ? (
                              <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                post.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                                post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                post.status === 'generated' ? 'bg-amber-100 text-amber-800' :
                                post.status === 'error' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{post.status}</span>
                              {post.scheduled_date && (
                                <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(post.scheduled_date).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-gray-800 truncate">{post.title}</p>
                            {post.description && <p className="text-[11px] text-gray-500 truncate">{post.description}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => openEditPost(post)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            Editar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Estilo Visual das Imagens</label>
                    <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">
                      {isCardSelected(formData.visual_identity.style) ? '🎨 Card com Frase Embutida' : '📸 Foto Jornalística'}
                    </span>
                  </div>
                  {/* Vitrine visual com preview/amostra de cada estilo */}
                  {(() => {
                    const selectedCs = getCardStyle(formData.visual_identity.style);
                    const styleInfo = selectedCs ? {
                      id: selectedCs.id,
                      badge: 'CARD COM TEXTO NA IMAGEM',
                      badgeColor: selectedCs.id === 'educativo_universal' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : (selectedCs.id === 'dilemas' ? 'bg-amber-100 text-amber-800 border-amber-200' : (selectedCs.id === 'sabedoria_eres' ? 'bg-orange-100 text-orange-800 border-orange-200' : (selectedCs.id === 'cristao_cinematografico' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : (selectedCs.id === 'biblia_aberta_cinematografica' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-pink-100 text-pink-800 border-pink-200')))),
                      desc: selectedCs.id === 'educativo_universal'
                        ? 'Card 1:1 que ENSINA algo útil (receita, passo a passo, dica) com a cena do nicho à direita, chamada de interação e produto com LINK NA BIO no rodapé. Preencha os campos TEMA e PRODUTO abaixo.'
                        : (selectedCs.id === 'dilemas'
                        ? 'Cena hiper-realista dramática no lado direito (nicho de ex/relacionamento, futebol ou cotidiano) com a pergunta em destaque e selo "O QUE VOCÊ FARIA?".'
                        : (selectedCs.id === 'sabedoria_eres'
                          ? 'Arte espiritual hiper-realista da Umbanda (Preto-Velho, Zé Pelintra, Caboclo, Exu) no lado direito e tipografia refinada à esquerda.'
                          : (selectedCs.id === 'cristao_cinematografico'
                            ? 'Card cristão cinematográfico 4:5 ultra-realista. Personagem bíblico identificado pela frase (Jesus, Moisés, Davi, Paulo...) em cena grandiosa com iluminação dramática. Frase no topo esquerdo em serifada azul/dourado. Marca "FOCO EM CRISTO" no rodapé com emblema cruz/livro.'
                            : (selectedCs.id === 'biblia_aberta_cinematografica'
                              ? 'Card cristão cinematográfico 4:5 com Bíblia aberta gigante central. Céu dramático com raios dourados celestiais, vale rochoso com caminho estreito e pegadas douradas simbolizando a caminhada da fé. Frase nas páginas iluminadas da Bíblia em serifada preta/dourada. Adapta luz/atmosfera ao significado da frase (sofrimento→acolhimento, vitória→força, fé→paz).'
                              : (selectedCs.id === 'kawaii'
                            ? 'Fundo pastel limpo com frase em caixa alta e personagem fofo chibi ilustrado.'
                            : (selectedCs.id === 'carta_3d'
                              ? 'Cena 3D estilo animação Pixar, mesa rústica, envelope com coração e pôr do sol dourado.'
                              : (selectedCs.id === 'caderno'
                                ? 'Página real de caderno espiral com a frase manuscrita autêntica.'
                                : (selectedCs.id === 'minimalista'
                                  ? 'Design tipográfico de luxo, serifa itálica, fundo claro e aspas elegantes.'
                                  : 'Folha de papel com bordas rasgadas sobre fundo escuro com contraste e coração rabiscado.')))))))),
                    } : {
                      id: 'jornalistico',
                      badge: 'FOTOGRAFIA JORNALÍSTICA (SEM TEXTO)',
                      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
                      desc: 'Imagem fotográfica cinematográfica profissional que ilustra a notícia ou matéria. O texto vai na legenda do post.'
                    };

                    return (
                      <div className="mt-3 p-3.5 bg-gradient-to-br from-gray-50 to-indigo-50/30 border border-gray-200/90 rounded-2xl shadow-sm">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
                          {/* Miniatura visual de representação fiel do Card */}
                          <div className="relative w-full sm:w-40 h-28 sm:h-28 rounded-xl overflow-hidden shrink-0 shadow-md border border-gray-300/80 bg-gray-900 flex items-center justify-center">
                            {selectedCs?.id === 'dilemas' && (
                              <div className="w-full h-full relative bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-2 flex flex-col justify-between">
                                <div className="absolute right-1 top-2 bottom-2 w-14 rounded-lg bg-gradient-to-t from-amber-500/30 to-indigo-500/20 border border-indigo-400/20 flex items-center justify-center">
                                  <span className="text-xl">🤔</span>
                                </div>
                                <div>
                                  <span className="text-[7px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-1 py-0.5 rounded font-mono">O QUE VOCÊ FARIA?</span>
                                  <p className="text-[9px] font-bold text-white mt-1 leading-tight line-clamp-3">Seu ex manda mensagem de madrugada...</p>
                                </div>
                                <span className="text-[7px] text-slate-300 font-medium">💬 Deixe sua resposta</span>
                              </div>
                            )}

                            {selectedCs?.id === 'sabedoria_eres' && (
                              <div className="w-full h-full relative bg-gradient-to-r from-stone-950 via-neutral-900 to-amber-950 p-2 flex flex-col justify-between">
                                <div className="absolute right-1 top-2 bottom-2 w-14 rounded-lg bg-gradient-to-t from-amber-600/30 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
                                  <span className="text-xl">🕊️</span>
                                </div>
                                <div>
                                  <p className="text-[8px] font-serif font-bold text-amber-300 tracking-wider">PAI JOÃO</p>
                                  <p className="text-[8px] font-serif text-amber-50 mt-0.5 leading-tight line-clamp-3">"A verdadeira evolução começa quando..."</p>
                                </div>
                                <span className="text-[6px] text-amber-400/80 font-serif">✦ Sabedoria da Umbanda</span>
                              </div>
                            )}

                            {selectedCs?.id === 'kawaii' && (
                              <div className="w-full h-full relative bg-[#ffeef2] p-2 flex flex-col justify-between items-center text-center">
                                <p className="text-[9px] font-black text-slate-800 leading-tight">EU SOU A PESSOA MAIS SORTUDA <span className="text-rose-500">DESSE MUNDO</span></p>
                                <span className="text-2xl animate-bounce">💖🧸</span>
                              </div>
                            )}

                            {selectedCs?.id === 'carta_3d' && (
                              <div className="w-full h-full relative bg-gradient-to-br from-amber-200 via-rose-200 to-orange-300 p-2 flex flex-col justify-between items-center text-center">
                                <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm">
                                  <p className="text-[8px] font-medium text-slate-800">"Te amo com todo o meu coração..."</p>
                                </div>
                                <span className="text-2xl">💌✨</span>
                              </div>
                            )}

                            {selectedCs?.id === 'caderno' && (
                              <div className="w-full h-full relative bg-[#f7f5ef] p-2 flex flex-col justify-center border-l-4 border-slate-700">
                                <div className="border-b border-blue-200 py-1">
                                  <p className="text-[8px] font-serif italic text-slate-700">"nota mental: respira fundo e segue..."</p>
                                </div>
                                <div className="border-b border-blue-200 py-1"></div>
                              </div>
                            )}

                            {selectedCs?.id === 'minimalista' && (
                              <div className="w-full h-full relative bg-white p-2 flex flex-col justify-center items-center text-center">
                                <span className="text-xl font-serif text-slate-900 leading-none">“</span>
                                <p className="text-[8px] font-serif italic text-slate-900 leading-snug px-1">Tudo no seu tempo certo.</p>
                              </div>
                            )}

                            {selectedCs?.id === 'papel_rasgado' && (
                              <div className="w-full h-full relative bg-slate-950 p-2 flex items-center justify-center">
                                <div className="bg-stone-100 px-2 py-1.5 rounded shadow-lg transform -rotate-1 border border-stone-300">
                                  <p className="text-[8px] font-mono text-slate-900 leading-tight">"saudade do que a gente nunca viveu ♡"</p>
                                </div>
                              </div>
                            )}

                            {selectedCs?.id === 'romantico_ilustrado' && (
                              <div className="w-full h-full relative bg-gradient-to-b from-[#fff4ea] via-[#f6dcc8] to-[#c98a7d] p-2 flex flex-col items-center text-center">
                                <p className="text-[8px] font-serif font-bold text-[#3a2a1e] leading-snug px-1">Te amo com todo o meu <span className="text-[#8e1e2e]">coração</span></p>
                                <div className="mt-auto mb-1 flex items-end gap-3">
                                  <span className="text-lg">🤍</span>
                                  <span className="text-2xl">💑</span>
                                  <span className="text-lg">🤍</span>
                                </div>
                              </div>
                            )}

                            {selectedCs?.id === 'cristao_cinematografico' && (
                              <div className="w-full h-full relative bg-gradient-to-br from-[#1a2a4a] via-[#2d1b0e] to-[#0d0d0d] p-2 flex flex-col justify-between">
                                <div className="text-left">
                                  <p className="text-[8px] font-serif font-bold text-white leading-snug px-1">"O Senhor é a minha <span className="text-[#c9a227]">rocha</span> e a minha <span className="text-[#c9a227]">fortaleza</span>"</p>
                                  <p className="text-[6px] text-[#c9a227] font-semibold mt-1 px-1">Salmo 18:2</p>
                                </div>
                                <div className="flex items-center gap-2 text-left ml-1">
                                  <div className="w-5 h-5 rounded-full border-2 border-[#c9a227] bg-black flex items-center justify-center">
                                    <span className="text-[8px] text-white">†</span>
                                  </div>
                                  <div>
                                    <p className="text-[6px] font-bold text-white leading-none">FOCO EM <span className="text-[#c9a227]">CRISTO</span></p>
                                    <p className="text-[5px] text-[#c9a227] leading-none">LEVANDO A MENSAGEM DE JESUS</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {selectedCs?.id === 'biblia_aberta_cinematografica' && (
                              <div className="w-full h-full relative bg-gradient-to-b from-[#0a0a0a] via-[#1a1520] to-[#0d1a0d] p-2 flex flex-col justify-between">
                                {/* Topo: céu dramático com raios dourados */}
                                <div className="h-1/3 relative bg-gradient-to-b from-[#0a0a0a] via-[#1a1020] to-transparent rounded-t-xl">
                                  <div className="absolute inset-0 bg-gradient-to-t from-transparent via-[#c9a227]/20 to-[#c9a227]/5" />
                                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-t from-[#c9a227]/60 via-[#c9a227]/20 to-transparent rounded-full blur-2xl" />
                                </div>
                                {/* Centro: Bíblia aberta com frase */}
                                <div className="flex-1 flex items-center justify-center px-2">
                                  <div className="relative w-full max-w-[80%] h-24 bg-gradient-to-r from-[#f5e6c8] via-[#e8d5b0] to-[#f5e6c8] rounded-lg shadow-2xl border border-[#c9a227]/30 flex items-center justify-center">
                                    <p className="text-[7px] font-serif font-bold text-[#1a1a12] leading-snug px-2 text-center">"A Tua palavra é <span className="text-[#c9a227]">lâmpada</span> para os meus pés"</p>
                                  </div>
                                </div>
                                {/* Base: vale com caminho e pegadas douradas */}
                                <div className="h-1/4 relative bg-gradient-to-t from-[#2d1f0a] via-[#3d2e1a] to-transparent rounded-b-xl">
                                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#c9a227]/80 rounded-full blur-sm" />
                                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 -translate-y-2 w-2 h-2 bg-[#c9a227]/60 rounded-full blur-sm" />
                                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2 -translate-y-4 w-2 h-2 bg-[#c9a227]/40 rounded-full blur-sm" />
                                  <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-[#1a1005] to-transparent" />
                                </div>
                              </div>
                            )}

                            {selectedCs?.id === 'educativo_universal' && (
                              <div className="w-full h-full relative bg-gradient-to-r from-[#0f2a16] via-[#123a1e] to-[#3f6212] p-2 flex flex-col justify-between">
                                <div>
                                  <p className="text-[8px] font-black text-white leading-tight">RECEITA NATURAL PARA <span className="text-[#ffd21f]">EMAGRECER</span></p>
                                  <p className="text-[6px] text-white/85 mt-1 leading-tight">Bebida de limão, gengibre e hortelã 🍋</p>
                                </div>
                                <div className="flex items-end justify-between gap-1">
                                  <p className="text-[6px] font-bold text-[#ffd21f] leading-tight">Gostou? Comente ❤️</p>
                                  <span className="text-[6px] font-black text-[#14210f] bg-[#ffd21f] px-1.5 py-0.5 rounded-full">LINK NA BIO</span>
                                </div>
                              </div>
                            )}

                            {!selectedCs && (
                              <div className="w-full h-full relative bg-gradient-to-br from-slate-800 to-indigo-900 p-2 flex flex-col items-center justify-center text-center">
                                <ImageIcon className="w-6 h-6 text-indigo-300 mb-1" />
                                <span className="text-[8px] font-bold text-white tracking-wide uppercase">FOTO DE ALTA QUALIDADE</span>
                              </div>
                            )}
                          </div>

                          {/* Detalhes e instruções do estilo */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${styleInfo.badgeColor}`}>
                                {styleInfo.badge}
                              </span>
                              {selectedCs && (
                                <span className="text-[11px] font-mono font-semibold text-gray-500">
                                  ID: {selectedCs.id}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-700 leading-relaxed font-medium">
                              {styleInfo.desc}
                            </p>
                          </div>
                        </div>

                        {/* Botões rápidos com miniaturas de cada estilo de card com suporte a Múltipla Seleção / Randomização */}
                        <div className="mt-3.5 pt-3 border-t border-gray-200/70">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                              <span>🎲</span>
                              <span>Estilo visual (marque 1 ou mais para randomizar):</span>
                            </span>
                            <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60">
                              {((formData.visual_identity as any).selected_styles?.length || 1)} selecionado(s)
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1 pb-0.5">
                            {visualStyles.map((cs: any) => {
                              const selectedList: string[] = (formData.visual_identity as any).selected_styles || [formData.visual_identity.style];
                              const isChecked = selectedList.includes(cs.value);

                              const cleanLabels: Record<string, { icon: string; name: string }> = {
                                kawaii: { icon: '💖', name: 'Kawaii' },
                                carta_3d: { icon: '💌', name: 'Carta 3D' },
                                caderno: { icon: '📓', name: 'Caderno' },
                                minimalista: { icon: '✨', name: 'Minimalista' },
                                papel_rasgado: { icon: '🖤', name: 'Papel Rasgado' },
                                sabedoria_eres: { icon: '🕊️', name: 'Sabedoria Eres' },
                                dilemas: { icon: '🤔', name: 'Dilemas Morais' },
                                twitter_x: { icon: '🐦', name: 'Twitter/X Umbanda' },
                                casal_romantico: { icon: '💑', name: 'Casal Romântico' },
                                romantico_ilustrado: { icon: '💕', name: 'Romântico Ilustrado' },
                                cristao_cinematografico: { icon: '✝️', name: 'Cristão Cinematográfico' },
                                biblia_aberta_cinematografica: { icon: '📖', name: 'Bíblia Aberta Cinematográfica' },
                                educativo_universal: { icon: '📚', name: 'Educativo Universal' },
                              };
                              const labelMatch = String(cs.label || '').match(/^(\S+)\s+([\s\S]+)$/);
                              const item = (cs.id && cleanLabels[cs.id]) || { icon: labelMatch ? labelMatch[1] : '🎨', name: labelMatch ? labelMatch[2] : (cs.label || cs.value) };

                              return (
                                <button
                                  key={cs.value}
                                  type="button"
                                  title={item.name}
                                  onClick={() => {
                                    let nextList: string[];
                                    if (isChecked) {
                                      // Se já está checado, remove apenas se houver mais de 1
                                      nextList = selectedList.filter(s => s !== cs.value);
                                      if (nextList.length === 0) nextList = [cs.value];
                                    } else {
                                      // Adiciona à lista de selecionados
                                      nextList = [...selectedList, cs.value];
                                    }
                                    setFormData({
                                      ...formData,
                                      visual_identity: {
                                        ...formData.visual_identity,
                                        style: nextList[0],
                                        selected_styles: nextList
                                      } as any
                                    });
                                  }}
                                  className={`relative flex items-center gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                                    isChecked
                                      ? 'bg-indigo-50/70 border-indigo-500 shadow-sm'
                                      : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300'
                                  }`}
                                >
                                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 transition-colors ${
                                    isChecked ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100'
                                  }`}>{item.icon}</span>
                                  <span className={`text-xs font-bold leading-tight line-clamp-2 ${isChecked ? 'text-indigo-950' : 'text-gray-700'}`}>{item.name}</span>
                                  {isChecked && (
                                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow ring-2 ring-white">
                                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5 4.8 9 10 3.5" /></svg>
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {((formData.visual_identity as any).selected_styles?.length > 1) && (
                            <p className="text-[11px] font-bold text-indigo-700 bg-indigo-50/70 p-2 rounded-lg border border-indigo-200/60 mt-2 flex items-center gap-1.5">
                              <span>🎲</span>
                              <span><strong>Modo Randomizar Ativo:</strong> Ao enviar muitas frases, o sistema alternará automaticamente entre os {((formData.visual_identity as any).selected_styles?.length)} estilos selecionados a cada post!</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {isCardSelected(formData.visual_identity.style) && (
                    <div className="mt-2.5 flex items-start gap-2.5 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 text-xs text-indigo-950">
                      <div className="w-5 h-5 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                        ℹ️
                      </div>
                      <div className="flex-1 leading-relaxed">
                        {getCardStyle(formData.visual_identity.style)?.id === 'dilemas' ? (
                          <>
                            <strong className="font-semibold text-indigo-900">Modo Dilema (Engajamento Viral):</strong> Adaptável para qualquer nicho (relacionamentos, futebol, cotidiano, trabalho). Cada linha gera uma cena cinematográfica com a pergunta e chamada para comentários.
                          </>
                        ) : (
                          <>
                            <strong className="font-semibold text-indigo-900">Modo Card com Texto:</strong> Cada linha inserida abaixo gera uma imagem com a frase estilizada dentro dela, pronta para publicação.
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sem painel poluído de opções ou geradores extras — apenas a caixa de frase e o Prompt Mestre no servidor */}

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
                   {isEduStyle ? 'Temas dos Cards (um por linha)' : (isCardSelected(formData.visual_identity.style) ? 'Frases dos Cards (Uma por linha)' : 'Títulos dos conteúdos (Um por linha)')}
                 </label>
                <p className="text-xs text-gray-500 mb-2">
                  {isEduStyle
                    ? 'Cada tema vira um card que ensina algo útil (receita, passo a passo, dica) e divulga o produto abaixo com LINK NA BIO. A IA cria título, conteúdo, cena do nicho e interação sozinha.'
                    : (isCardSelected(formData.visual_identity.style)
                    ? 'Cada linha vira um card: a frase é escrita dentro da imagem, junto com a legenda e o agendamento. Você pode colar 100 frases de uma vez.'
                    : 'Para cada título inserido, a IA criará uma imagem, uma legenda e agendará o post.')}
                </p>
                {isEduStyle ? (
                  <>
                    <textarea
                      rows={10}
                      value={eduTemas}
                      onChange={e => {
                        setEduTemas(e.target.value);
                        setFormData({ ...formData, titles: combineEdu(e.target.value, eduProduto) });
                      }}
                      className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm"
                      placeholder={'Um tema por linha (pode colar vários):\n\nReceita natural para emagrecer\nSimpatia do amor próprio\nComo organizar as finanças do mês'}
                    />
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">
                      Produto <span className="text-gray-400 font-normal">(vale para todos os cards acima)</span>
                    </label>
                    <input
                      type="text"
                      value={eduProduto}
                      onChange={e => {
                        setEduProduto(e.target.value);
                        setFormData({ ...formData, titles: combineEdu(eduTemas, e.target.value) });
                      }}
                      className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm font-medium py-2.5 px-3 bg-white"
                      placeholder="Ex: E-book Receitas Naturais para Emagrecer"
                    />
                  </>
                ) : (
                <textarea 

                  rows={isCardSelected(formData.visual_identity.style) ? 14 : 6}
                  value={formData.titles}
                  onChange={e => setFormData({...formData, titles: e.target.value})}
                  className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm" 
                  placeholder={
                    getCardStyle(formData.visual_identity.style)?.id === 'dilemas'
                      ? 'Cole um dilema / pergunta provocativa por linha (para qualquer nicho: ex, futebol, cotidiano):\n\nSeu ex manda mensagem de madrugada dizendo que sente sua falta. Você responde, visualiza ou bloqueia?\nSeu time precisa do empate do rival para ser campeão. Você torce a favor?\nVocê vê alguém sendo tratado injustamente no trabalho. Defende mesmo podendo se prejudicar?\nAlguém que te magoou profundamente pede desculpas sinceras. Você perdoa?'
                      : (isCardSelected(formData.visual_identity.style)
                        ? 'Cole uma frase por linha (pode colar 100 de uma vez):\n\nEu sou a pessoa mais sortuda desse mundo por ter alguém tão incrível como você pra chamar de meu amor.\nTe amo muito...'
                        : 'Ex:\n5 dicas para melhorar vendas\nComo atrair clientes\nErros comuns no marketing')
                  }
                />
                )}
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
                    const titlesCount = formData.titles.split('\n').filter(t => t.trim() !== '').length;
                    if (!editingAutomationId) {
                      if (!window.confirm(`🚀 ENVIAR AGORA vai publicar ${titlesCount || 'os'} post(s) IMEDIATAMENTE, ignorando qualquer agendamento.\n\nPara agendar nos horários, use o botão "Salvar Automação".\n\nContinuar e postar agora?`)) {
                        return;
                      }
                    } else {
                      if (!window.confirm(`🚀 ENVIAR AGORA vai publicar IMEDIATAMENTE os posts pendentes/gerados desta automação.\n\nContinuar?`)) {
                        return;
                      }
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
                        resetForm();
                        loadAutomations(showCompleted);
                        alert("🚀 Enviando agora! Posts existentes serão publicados no Facebook.");
                      } else {
                        // NOVA AUTOMAÇÃO: cria + insere títulos + dispara
                        const titlesArray = formData.titles.split('\n').filter(t => t.trim() !== '');
                        if (titlesArray.length === 0) {
                          alert("⚠️ Insira pelo menos uma frase no campo de texto.");
                          return;
                        }

                        // Trava de capacidade: Enviar Agora gera tudo de uma vez (burst)
                        try {
                          const capRes = await api.get(`/automations/capacity-check?postsPerDay=0&totalPosts=${titlesArray.length}&checkKeys=1`);
                          if (capRes.data?.success && capRes.data.ok === false) {
                            alert(capRes.data.message || 'Capacidade de imagens esgotada.');
                            return;
                          }
                          if (capRes.data?.success && (capRes.data.deadKeys?.length || 0) > 0) {
                            const dead = capRes.data.deadKeys.map((k: any) => `• Conta ${k.account}: ${k.status === 'auth' ? 'token inválido' : k.status === 'quota' ? 'sem cota hoje' : 'erro'}`).join('\n');
                            if (!window.confirm(`⚠️ Atenção: ${capRes.data.deadKeys.length} chave(s) Cloudflare com problema e fora da capacidade:\n${dead}\n\nContinuar mesmo assim?`)) {
                              return;
                            }
                          }
                        } catch {
                          // Se a consulta falhar, segue — o backend reforça a trava
                        }
                        
                        const autoRes = await api.post('/automations', payload);
                        if (!autoRes.data.success) throw new Error(autoRes.data.error || 'Erro ao criar automação');
                        autoId = autoRes.data.data.id;
                        
                        await api.post(`/automations/${autoId}/posts`, { titles: titlesArray });
                        
                        setShowModal(false);
                        resetForm();
                        loadAutomations(showCompleted);
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

      {/* Modal de edição do post (também disponível dentro do "Editar Automação") */}
      {renderPostEditModal()}
    </div>
  );
};

export default PostAutomationPage;

