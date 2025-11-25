import React, { useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { Product, ProductStatus } from '../types';
import { Save } from 'lucide-react';

interface ProductFormProps {
  onSuccess: () => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ onSuccess }) => {
  const { addProduct } = useProducts();

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    price: 0,
    stock: 0,
    description: '',
    category: '',
    images: [],
    weight: 0,
    height: 0,
    width: 0,
    length: 0,
  });

  const [tempImage, setTempImage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }));
  };

  const handleAddImage = () => {
    if (tempImage) {
      setFormData(prev => ({ ...prev, images: [...(prev.images || []), tempImage] }));
      setTempImage('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addProduct(formData as unknown as Omit<Product, 'id'>);
    onSuccess();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Cadastrar Novo Produto</h2>
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
            <input
              required name="name" type="text" value={formData.name} onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <input
              required name="sku" type="text" value={formData.sku} onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$)</label>
            <input
              required name="price" type="number" step="0.01" value={formData.price} onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estoque</label>
            <input
              required name="stock" type="number" value={formData.stock} onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Interna</label>
            <input
              name="category" type="text" value={formData.category} onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <textarea
            name="description" rows={5} value={formData.description} onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Imagens (URL)</label>
          <div className="flex gap-2 mb-2">
            <input
              type="url"
              placeholder="https://..."
              value={tempImage}
              onChange={(e) => setTempImage(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddImage}
              className="bg-gray-100 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-200"
            >
              Adicionar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.images?.map((img, idx) => (
              <img key={idx} src={img} alt="preview" className="w-20 h-20 object-cover rounded-md border border-gray-200" />
            ))}
          </div>
        </div>

        {/* Shipping */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Dimensões e Peso (Pacote)</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-gray-500">Peso (kg)</label>
              <input name="weight" type="number" step="0.1" value={formData.weight} onChange={handleChange} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Altura (cm)</label>
              <input name="height" type="number" value={formData.height} onChange={handleChange} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Largura (cm)</label>
              <input name="width" type="number" value={formData.width} onChange={handleChange} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Comp. (cm)</label>
              <input name="length" type="number" value={formData.length} onChange={handleChange} className="w-full p-2 border rounded-md" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="flex items-center bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Save size={18} className="mr-2" />
            Salvar Produto
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;