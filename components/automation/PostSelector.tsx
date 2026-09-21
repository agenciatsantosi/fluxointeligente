import React from 'react';
import axios from 'axios';
import { 
  Instagram, Search, Loader2, ChevronRight, 
  Image as ImageIcon, Film, MessageCircle, AlertCircle 
} from 'lucide-react';

interface Media {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp: string;
}

interface PostSelectorProps {
  accountId: string;
  selectedPostId?: string;
  onSelect: (media: Media) => void;
}

export const PostSelector: React.FC<PostSelectorProps> = ({ 
  accountId, selectedPostId, onSelect 
}) => {
  const [loading, setLoading] = React.useState(true);
  const [media, setMedia] = React.useState<Media[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchMedia = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/instagram/media/${accountId}`);
        if (res.data.success) {
          setMedia(res.data.media);
        } else {
          setError(res.data.error || 'Erro ao carregar posts');
        }
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.error || 'Falha na conexão com a API');
      } finally {
        setLoading(false);
      }
    };

    if (accountId) fetchMedia();
  }, [accountId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-zinc-50 rounded-[32px] border-2 border-dashed border-zinc-200">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-zinc-600 font-bold">Buscando seus posts recentes...</p>
        <p className="text-zinc-400 text-sm mt-1">Isso pode levar alguns segundos.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-red-50 rounded-[32px] border-2 border-dashed border-red-200 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-red-900 mb-2">Ops! Algo deu errado</h3>
        <p className="text-red-700 max-w-sm mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 transition-all"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Instagram size={20} />
          </div>
          <h3 className="text-xl font-black text-zinc-900">Selecione o Post</h3>
        </div>
        <p className="text-zinc-500 text-sm font-bold bg-zinc-100 px-3 py-1 rounded-lg">
          {media.length} Posts encontrados
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {media.map((post) => (
          <button
            key={post.id}
            onClick={() => onSelect(post)}
            className={`group relative aspect-square rounded-2xl overflow-hidden border-4 transition-all ${
              selectedPostId === post.id 
                ? 'border-blue-600 shadow-xl shadow-blue-500/20' 
                : 'border-transparent hover:border-zinc-200'
            }`}
          >
            <img 
              src={post.thumbnail_url || post.media_url} 
              alt={post.caption || 'Instagram Post'} 
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
                selectedPostId === post.id ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
              }`}
            />
            
            {/* Overlay icons */}
            <div className="absolute top-3 right-3 flex gap-1">
              {post.media_type === 'VIDEO' ? (
                <div className="bg-black/60 backdrop-blur-md p-1.5 rounded-lg text-white">
                  <Film size={14} />
                </div>
              ) : (
                <div className="bg-black/60 backdrop-blur-md p-1.5 rounded-lg text-white">
                  <ImageIcon size={14} />
                </div>
              )}
            </div>

            {/* Selected Indicator Checkmark */}
            {selectedPostId === post.id && (
              <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl animate-scale-up">
                  <ChevronRight size={24} />
                </div>
              </div>
            )}

            {/* Hover Caption Hint */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform">
              <p className="text-white text-[10px] font-bold line-clamp-2 leading-tight">
                {post.caption || '(Sem legenda)'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {media.length === 0 && (
        <div className="text-center py-20 bg-zinc-50 rounded-[32px] border-2 border-dashed border-zinc-200">
           <AlertCircle size={40} className="mx-auto text-zinc-300 mb-4" />
           <p className="text-zinc-900 font-bold">Nenhum post encontrado</p>
           <p className="text-zinc-500">Esta conta parece não ter postagens recentes.</p>
        </div>
      )}
    </div>
  );
};
