
import React, { useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { validateToken } from '../services/mlService';
import { Save, ShieldCheck, AlertCircle, CheckCircle2, XCircle, Loader2, Server } from 'lucide-react';

const MLConfig: React.FC = () => {
  const { settings, saveSettings } = useProducts();
  const [formData, setFormData] = useState(settings);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Reset status on change
    if (testStatus !== 'idle') setTestStatus('idle');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(formData);
    alert('Configurações salvas com sucesso!');
  };

  const handleTestConnection = async () => {
    if (!formData.accessToken) {
        setTestStatus('error');
        setTestMessage('Insira um Access Token para testar.');
        return;
    }

    setTestStatus('loading');
    setTestMessage('Conectando à API oficial...');

    try {
        const userData = await validateToken(formData.accessToken);
        setTestStatus('success');
        setTestMessage(`Conectado com sucesso! Usuário: ${userData.nickname} (ID: ${userData.id})`);
    } catch (error: any) {
        setTestStatus('error');
        setTestMessage(`Falha na conexão: ${error.message}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 pb-4">
            <div className="p-2 bg-yellow-100 rounded-lg text-yellow-700">
                <ShieldCheck size={24} />
            </div>
            <div>
                <h2 className="text-xl font-bold text-gray-800">Integração Mercado Livre (API Oficial)</h2>
                <p className="text-sm text-gray-500">Configure suas credenciais reais para produção.</p>
            </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 flex items-start space-x-3">
            <Server className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-blue-800">
                <p className="font-bold mb-1">Ambiente de Produção</p>
                <p className="mb-2">Este sistema está configurado para usar a <strong>API Oficial</strong>. Ações realizadas aqui refletirão na sua conta real do Mercado Livre.</p>
                <p>Para obter o Token:</p>
                <ol className="list-decimal ml-4 mt-1 space-y-1 text-xs">
                    <li>Acesse <a href="https://developers.mercadolibre.com.br/devcenter" target="_blank" className="underline font-medium">DevCenter</a>.</li>
                    <li>Crie uma aplicação.</li>
                    <li>Realize o fluxo de OAuth para obter o <code>access_token</code>.</li>
                </ol>
            </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App ID (Client ID)</label>
                <input 
                    type="text" name="appId" value={formData.appId} onChange={handleChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
                    placeholder="Ex: 123456789"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                <input 
                    type="password" name="clientSecret" value={formData.clientSecret} onChange={handleChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
                    placeholder="••••••••••••••••"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token (Produção)</label>
                <div className="relative">
                    <input 
                        type="text" name="accessToken" value={formData.accessToken} onChange={handleChange}
                        className="w-full p-2.5 pr-24 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 font-mono text-sm"
                        placeholder="APP_USR-..."
                    />
                </div>
                <p className="text-xs text-gray-500 mt-1">O token deve ter escopos de <code>write</code> e <code>offline_access</code>.</p>
            </div>

            {/* Feedback Area for Connection Test */}
            <div className={`rounded-lg p-3 text-sm flex items-center ${
                testStatus === 'idle' ? 'bg-gray-50 text-gray-500' :
                testStatus === 'loading' ? 'bg-blue-50 text-blue-700' :
                testStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                'bg-red-50 text-red-700 border border-red-200'
            }`}>
                {testStatus === 'idle' && <AlertCircle size={16} className="mr-2" />}
                {testStatus === 'loading' && <Loader2 size={16} className="mr-2 animate-spin" />}
                {testStatus === 'success' && <CheckCircle2 size={16} className="mr-2" />}
                {testStatus === 'error' && <XCircle size={16} className="mr-2" />}
                
                <span className="flex-1 font-medium">
                    {testMessage || 'O status da conexão aparecerá aqui.'}
                </span>
            </div>

            <div className="pt-4 flex gap-3">
                <button 
                    type="button" 
                    onClick={handleTestConnection}
                    className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center justify-center"
                >
                    <Server size={18} className="mr-2" /> Testar Conexão
                </button>
                <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center"
                >
                    <Save size={18} className="mr-2" /> Salvar
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default MLConfig;
