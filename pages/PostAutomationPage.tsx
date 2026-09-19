import React, { useState, useEffect } from 'react';
import { Bot, Plus, Pause, Play, Trash2, Edit, Calendar, Image as ImageIcon, Settings, CheckCircle2, Clock, AlertTriangle, Search, Facebook, Instagram, Send, MessageCircle, Twitter, AtSign, Wand2, RefreshCw, Sparkles, Sliders } from 'lucide-react';
import api from '../services/api';

const PostAutomationPage: React.FC = () => {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'posts'
  const [selectedAutomation, setSelectedAutomation] = useState<any>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [automationPosts, setAutomationPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [regeneratingPostId, setRegeneratingPostId] = useState<number | null>(null);

  // Modal State
  const [formData, setFormData] = useState({
    name: '',
    page_ids: [],
    visual_identity: { style: 'Fotografia realista, profissional e moderna', colors: '' },
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

  const loadAutomations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/automations');
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
      loadAccounts();
    }
  }, [showModal]);

  const handleGeneratePreview = async () => {
    if (!formData.titles.trim()) {
      alert("Insira pelo menos um título para gerar o preview.");
      return;
    }
    const firstTitle = formData.titles.split('\n').filter(t => t.trim() !== '')[0];
    if (!firstTitle) return;

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
    e.preventDefault();
    try {
      const titlesArray = formData.titles.split('\n').filter(t => t.trim() !== '');
      
      const payload = {
        ...formData,
        schedule_times: formData.post_mode === 'now' 
          ? { mode: 'now' }
          : {
              mode: formData.schedule_mode,
              times: formData.schedule_mode === 'single' ? [formData.time] : formData.times
            }
      };

      const autoRes = await api.post('/automations', payload);
      if (autoRes.data.success) {
        const autoId = autoRes.data.data.id;
        
        // Cadastrar títulos
        if (titlesArray.length > 0) {
          await api.post(`/automations/${autoId}/posts`, { titles: titlesArray });
        }
        
        setShowModal(false);
        loadAutomations();
      }
    } catch (err) {
      console.error('Erro ao criar:', err);
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
                            try {
                              const now = new Date().toISOString();
                              await api.put(`/automations/posts/${post.id}`, { status: 'scheduled', scheduled_date: now });
                              setAutomationPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'scheduled', scheduled_date: now } : p));
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aprovar Post
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
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm shadow-indigo-200"
        >
          <Plus className="w-5 h-5" />
          Nova Automação
        </button>
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
                
                <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{auto.stats?.total || 0}</div>
                    <div className="text-xs text-gray-500 uppercase">Títulos</div>
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
                <button className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Nova Automação</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            
            <form onSubmit={handleCreateAutomation} className="p-6 overflow-y-auto space-y-6">
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da automação</label>
                <input 
                  type="text" 
                  required 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                  placeholder="Ex: Posts Diários - Instagram"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Selecionar páginas de destino</label>
                <div className="max-h-64 overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableAccounts.length === 0 ? (
                    <div className="col-span-full p-4 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 text-center">Nenhuma conta conectada.</div>
                  ) : (
                    availableAccounts.map(acc => {
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
                    })
                  )}
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
                   <option value="Fotografia realista, profissional e moderna">📸 Fotorealista & Cinematográfico (Padrão)</option>
                   <option value="Minimalista e elegante com iluminação suave">🎨 Minimalista & Elegante</option>
                   <option value="3D Render moderno e futurista">🚀 3D Render & Futurista</option>
                   <option value="Culinário gourmet realista com iluminação estúdio">🍔 Culinário Gourmet</option>
                   <option value="Corporativo e negócios de alto nível">💼 Corporativo & Negócios</option>
                   <option value="Editorial de alta moda e estética luxo">✨ Editorial & Alta Moda</option>
                   <option value="Vibrante, colorido e criativo">⚡ Vibrante & Criativo</option>
                   <option value="Paisagem natural com iluminação de luz dourada">🌿 Paisagem & Natureza</option>
                 </select>
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Títulos dos conteúdos (Um por linha)</label>
                <p className="text-xs text-gray-500 mb-2">Para cada título inserido, a IA criará uma imagem, uma legenda e agendará o post.</p>
                <textarea 
                  required 
                  rows={6}
                  value={formData.titles}
                  onChange={e => setFormData({...formData, titles: e.target.value})}
                  className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
                  placeholder="Ex:\n5 dicas para melhorar vendas\nComo atrair clientes\nErros comuns no marketing"
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
                        Gerar Preview do 1º Título
                      </>
                    )}
                  </button>
                  <span className="text-gray-500 font-medium">
                    {formData.titles.split('\n').filter(t => t.trim() !== '').length} títulos cadastrados
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
                        <img src={previewData.image_url} alt="Preview" className="w-full md:w-48 h-48 object-cover rounded-lg bg-gray-100" />
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
                    onClick={() => setFormData({ ...formData, post_mode: 'now' })}
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
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                        Frequência de Horários
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, schedule_mode: 'single' })}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            formData.schedule_mode === 'single'
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Horário Único
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, schedule_mode: 'multiple' })}
                          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            formData.schedule_mode === 'multiple'
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Múltiplos Horários
                        </button>
                      </div>
                    </div>

                    {formData.schedule_mode === 'single' ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          Horário de Postagem
                        </label>
                        <input
                          type="time"
                          value={formData.time}
                          onChange={e => setFormData({ ...formData, time: e.target.value })}
                          className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-gray-700 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-500" />
                            Horários do Dia
                          </span>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, times: [...formData.times, '12:00'] })}
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
                    )}
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
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Salvar Automação
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
