import React from 'react';
import { 
  X, Search, Sparkles, MessageSquare, Megaphone, Users, 
  ChevronRight, Bookmark, Zap, HelpCircle, Instagram 
} from 'lucide-react';

interface Template {
  id: string;
  title: string;
  description: string;
  category: 'growth' | 'engagement' | 'traffic' | 'leads';
  trigger: 'comment' | 'dm' | 'story';
  isPopular?: boolean;
  isPro?: boolean;
  type: 'Quick Automation' | 'Flow Builder';
  prefill: {
    keyword: string;
    replyText: string;
    dmText: string;
    buttonText: string;
    triggerType: 'all_posts' | 'any_post';
  };
}

const TEMPLATES: Template[] = [
  {
    id: 'link_dm',
    title: 'Enviar links automaticamente por DM',
    description: 'Envie um link sempre que alguém comentar uma palavra-chave específica em seu post.',
    category: 'traffic',
    trigger: 'comment',
    isPopular: true,
    type: 'Quick Automation',
    prefill: {
      keyword: 'LINK',
      replyText: 'Acabei de te enviar o link no seu direct! 🚀🚀',
      dmText: 'Aqui está o link que você pediu: ',
      buttonText: 'Acessar Agora',
      triggerType: 'all_posts'
    }
  },
  {
    id: 'follower_growth',
    title: 'Aumente seus seguidores com Comentários',
    description: 'Use comentários do Instagram para fazer sua conta crescer rapidamente.',
    category: 'growth',
    trigger: 'comment',
    isPro: true,
    type: 'Quick Automation',
    prefill: {
      keyword: 'QUERO',
      replyText: 'Te mandei um presente na DM! Confira lá. 😎',
      dmText: 'Para receber seu presente, primeiro me siga e depois clique no botão abaixo!',
      buttonText: 'Ver Presente',
      triggerType: 'all_posts'
    }
  },
  {
    id: 'lead_gen_stories',
    title: 'Gere leads com Stories',
    description: 'Aproveite ofertas exclusivas nos Stories para transformar leads em clientes.',
    category: 'leads',
    trigger: 'story',
    type: 'Quick Automation',
    prefill: {
      keyword: 'PROMO',
      replyText: '', // Stories don't have public replies
      dmText: 'Olá! Que bom que gostou da nossa oferta. Preencha seus dados para receber o cupom:',
      buttonText: 'Pegar Cupom',
      triggerType: 'any_post'
    }
  },
  {
    id: 'ai_conversation',
    title: 'Automatize conversas com IA',
    description: 'Deixe a IA responder dúvidas frequentes e recomendar produtos para você.',
    category: 'engagement',
    trigger: 'comment',
    isPro: true,
    type: 'Flow Builder',
    prefill: {
      keyword: 'IA',
      replyText: 'Nossa IA inteligente já te respondeu no Direct! 👇',
      dmText: 'Olá! Sou o assistente inteligente da conta. Como posso te ajudar hoje?',
      buttonText: 'Falar com Atendimento',
      triggerType: 'all_posts'
    }
  }
];

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: Template) => void;
  onStartFromScratch: () => void;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({ 
  isOpen, onClose, onSelect, onStartFromScratch 
}) => {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState<string>('all');

  if (!isOpen) return null;

  const filteredTemplates = TEMPLATES.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
                         t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || t.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-up border border-white/20">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-zinc-50/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Modelos</h2>
            <div className="h-6 w-px bg-zinc-200"></div>
            <div className="flex items-center gap-2 text-zinc-500 font-medium text-sm">
              <Sparkles size={16} className="text-blue-600" />
              Escolha um ponto de partida
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onStartFromScratch}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              <Zap size={18} />
              Começar Do Zero
            </button>
            <button onClick={onClose} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors">
              <X size={24} className="text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 border-r border-gray-100 bg-zinc-50/30 p-6 space-y-8 overflow-y-auto">
            <div>
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Por Objetivo</h3>
              <nav className="space-y-1">
                {[
                  { id: 'all', name: 'Todos os modelos', icon: Bookmark },
                  { id: 'growth', name: 'Aumente seus seguidores', icon: Users },
                  { id: 'engagement', name: 'Engaje seu público', icon: MessageSquare },
                  { id: 'traffic', name: 'Direcionar tráfego', icon: Megaphone }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                      category === cat.id 
                        ? 'bg-blue-600 text-white shadow-blue-200 shadow-lg' 
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <cat.icon size={18} />
                    {cat.name}
                  </button>
                ))}
              </nav>
            </div>

            <div>
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Suporte</h3>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-zinc-600 hover:text-blue-600 font-bold transition-all text-sm">
                <HelpCircle size={18} />
                Como usar modelos?
              </button>
            </div>
          </aside>

          {/* Main List */}
          <main className="flex-1 p-8 overflow-y-auto bg-white space-y-8">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within:text-blue-600" size={20} />
              <input 
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar modelos do Instagram..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-14 pr-6 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none font-medium placeholder:text-zinc-400"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className="group relative flex flex-col text-left bg-white border border-zinc-200 rounded-[28px] p-6 transition-all hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 overflow-hidden"
                >
                  {/* Category Badge */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {template.trigger === 'comment' && <MessageSquare size={24} />}
                      {template.trigger === 'story' && <Instagram size={24} />}
                    </div>
                    <div className="flex gap-2">
                       {template.isPopular && (
                        <span className="px-2.5 py-1 bg-orange-100 text-orange-600 text-[10px] font-black uppercase tracking-wider rounded-lg">Popular</span>
                      )}
                      {template.isPro && (
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-600 text-[10px] font-black uppercase tracking-wider rounded-lg">PRO</span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-zinc-900 leading-tight mb-2 group-hover:text-blue-600 transition-colors">
                    {template.title}
                  </h3>
                  <p className="text-zinc-500 text-sm font-medium leading-relaxed mb-8 flex-1">
                    {template.description}
                  </p>

                  <div className="pt-6 border-t border-zinc-100 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2 text-zinc-400 text-[11px] font-bold uppercase tracking-widest">
                      <Zap size={14} className="text-zinc-300" />
                      {template.type}
                    </div>
                    <ChevronRight size={20} className="text-zinc-300 group-hover:text-blue-600 transition-all group-hover:translate-x-1" />
                  </div>
                </button>
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="text-center py-20 bg-zinc-50 rounded-[32px] border-2 border-dashed border-zinc-200">
                <Search size={48} className="mx-auto text-zinc-300 mb-4" />
                <h3 className="text-xl font-bold text-zinc-900">Nenhum modelo encontrado</h3>
                <p className="text-zinc-500">Tente buscar por termos diferentes ou navegue por categorias.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
