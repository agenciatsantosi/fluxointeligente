
import React, { useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { fetchProductFromLink } from '../services/mlService';
import { Product, ProductStatus } from '../types';
import { DownloadCloud, ArrowRight, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

interface ImportProductProps {
  onSuccess: () => void;
}

const ImportProduct: React.FC<ImportProductProps> = ({ onSuccess }) => {
  const { addProduct, settings } = useProducts();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Partial<Product> | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Verificação de Segurança Rigorosa: Token Obrigatório
    // Usa trim() para garantir que espaços em branco não passem
    const token = settings.accessToken ? settings.accessToken.trim() : '';
    
    if (!token) {
        const msg = "Configuração incompleta: Access Token não encontrado. Vá em Configurações.";
        alert(msg);
        setError(msg); // Mostra visualmente também caso o alert seja bloqueado
        return;
    }

    if (!url) return;

    setLoading(true);
    setError('');
    setPreview(null);

    try {
      // Passamos o token para a service para usar a quota autenticada da API
      const data = await fetchProductFromLink(url, token);
      setPreview(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar produto.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (preview) {
      // Adiciona produto ao sistema local
      addProduct({
        name: preview.name!,
        description: preview.description || '',
        price: preview.price || 0,
        stock: preview.stock || 0,
        category: preview.category || 'Importado',
        images: preview.images || [],
        sku: preview.sku || `IMP-${Date.now()}`,
        weight: preview.weight || 0,
        height: preview.height || 0,
        width: preview.width || 0,
        length: preview.length || 0,
        status: ProductStatus.NOT_PUBLISHED // Entra como rascunho
      });
      
      onSuccess(); // Redireciona para lista
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full text-blue-600 mb-4">
                <DownloadCloud size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Importar do Mercado Livre</h2>
            <p className="text-gray-500 mt-2">Cole o link de qualquer produto ou catálogo para cadastrá-lo automaticamente no sistema.</p>
        </div>

        <form onSubmit={handleImport} className="mb-8">
            <div className="flex gap-2">
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Ex: https://www.mercadolivre.com.br/p/MLB123456..."
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button 
                    type="submit" 
                    disabled={loading || !url}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center"
                >
                    {loading ? <Loader2 className="animate-spin" /> : 'Buscar Dados'}
                </button>
            </div>
            {error && (
                <div className="mt-3 text-red-600 text-sm flex items-center bg-red-50 p-3 rounded-lg border border-red-100">
                    <AlertTriangle size={16} className="mr-2 flex-shrink-0" /> {error}
                </div>
            )}
        </form>

        {preview && (
            <div className="border border-gray-200 rounded-xl overflow-hidden animate-fade-in">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                    <span className="font-semibold text-gray-700">Pré-visualização dos Dados</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center">
                        <CheckCircle size={12} className="mr-1" /> Dados obtidos via API
                    </span>
                </div>
                <div className="p-6 flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-1/3">
                        {preview.images && preview.images.length > 0 ? (
                            <img src={preview.images[0]} alt="Preview" className="w-full h-48 object-contain border border-gray-100 rounded-lg bg-white" />
                        ) : (
                            <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">Sem Imagem</div>
                        )}
                         <div className="flex gap-1 mt-2 overflow-x-auto">
                            {preview.images?.slice(1, 4).map((img, i) => (
                                <img key={i} src={img} className="w-12 h-12 border rounded object-cover" />
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 space-y-3">
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold">Título</label>
                            <p className="text-lg font-medium text-gray-900">{preview.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs text-gray-500 uppercase font-bold">Preço Sugerido</label>
                                <p className="text-gray-900">R$ {preview.price?.toFixed(2)}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase font-bold">SKU Gerado</label>
                                <p className="text-gray-900 font-mono text-sm">{preview.sku}</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold">Categoria ID</label>
                            <p className="text-sm text-gray-600">{preview.category}</p>
                        </div>
                        
                        <div className="pt-4">
                            <button 
                                onClick={handleConfirm}
                                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-bold flex items-center justify-center"
                            >
                                Confirmar e Cadastrar <ArrowRight size={18} className="ml-2" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ImportProduct;
