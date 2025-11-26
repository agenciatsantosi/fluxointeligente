import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Pin, Image, Link, Calendar, CheckCircle, AlertCircle, HelpCircle, Upload, Trash2, Settings, ExternalLink, Layout } from 'lucide-react';
import axios from 'axios';

const PinterestAutomationPage: React.FC = () => {
    const [accessToken, setAccessToken] = useState('');
    const [boards, setBoards] = useState<any[]>([]);
    const [selectedBoard, setSelectedBoard] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [user, setUser] = useState<any>(null);

    // Post State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [link, setLink] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);

    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
    const [scheduleTime, setScheduleTime] = useState('');

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [loading, setLoading] = useState(false);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    useEffect(() => {
        // Check if already connected (mock check for now, or load from DB)
        // In a real app, we would fetch the config from the backend
    }, []);

    const handleConnect = async () => {
        if (!accessToken) {
            showNotification('❌ Insira o Access Token', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post('http://localhost:3001/api/pinterest/auth', { accessToken });
            if (response.data.success) {
                setIsConnected(true);
                setUser(response.data.user);
                showNotification('✅ Conectado ao Pinterest!', 'success');
                fetchBoards();
            }
        } catch (error: any) {
            showNotification('❌ Erro ao conectar: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchBoards = async () => {
        try {
            const response = await axios.get('http://localhost:3001/api/pinterest/boards');
            if (response.data.success) {
                setBoards(response.data.boards);
            }
        } catch (error) {
            console.error('Error fetching boards:', error);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            // Create preview URL
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePost = async () => {
        if (!selectedBoard) {
            showNotification('❌ Selecione um Board (Pasta)', 'error');
            return;
        }
        if (!imageUrl) {
            showNotification('❌ Adicione uma imagem', 'error');
            return;
        }

        setLoading(true);
        try {
            // If we have a file, we might need to upload it first or send as base64
            // For this implementation, we'll assume the backend handles the base64 or URL

            const payload = {
                boardId: selectedBoard,
                title,
                description,
                link,
                imageUrl // sending base64 for simplicity in this demo
            };

            if (scheduleMode === 'schedule') {
                await axios.post('http://localhost:3001/api/pinterest/schedule', {
                    boardId: selectedBoard,
                    schedule: { time: scheduleTime, ...payload }
                });
                showNotification('✅ Agendamento salvo!', 'success');
            } else {
                await axios.post('http://localhost:3001/api/pinterest/post', payload);
                showNotification('✅ Pin publicado com sucesso!', 'success');
            }

            // Reset form
            setTitle('');
            setDescription('');
            setLink('');
            setImageUrl('');
            setImageFile(null);

        } catch (error: any) {
            showNotification('❌ Erro ao publicar: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in ${notification.type === 'success' ? 'bg-green-500 text-white' :
                        notification.type === 'error' ? 'bg-red-500 text-white' :
                            'bg-blue-500 text-white'
                    }`}>
                    {notification.type === 'success' ? <CheckCircle size={24} /> :
                        notification.type === 'error' ? <AlertCircle size={24} /> :
                            <HelpCircle size={24} />}
                    <span className="font-bold">{notification.message}</span>
                </div>
            )}

            {/* Header Section */}
            <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-3xl p-8 text-white shadow-xl shadow-red-900/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <span className="text-3xl">📌</span> {/* Using emoji as icon replacement if Lucide Pin is not ideal */}
                            </div>
                            <h1 className="text-3xl font-bold">Automação Pinterest</h1>
                        </div>
                        <p className="text-red-100 text-lg max-w-xl">Crie e agende Pins para crescer sua audiência visualmente.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Configuration & Boards */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Connection Card */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                <Settings size={20} />
                            </div>
                            Conexão
                        </h2>

                        {!isConnected ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Access Token</label>
                                    <input
                                        type="password"
                                        value={accessToken}
                                        onChange={(e) => setAccessToken(e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 transition-all"
                                        placeholder="pina_..."
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        Obtenha em <a href="https://developers.pinterest.com/apps/" target="_blank" className="text-red-600 underline font-bold">Pinterest Developers</a>
                                    </p>
                                </div>
                                <button
                                    onClick={handleConnect}
                                    disabled={loading}
                                    className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
                                >
                                    {loading ? 'Conectando...' : 'Conectar Conta'}
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-6">
                                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-4xl">
                                    {user?.profile_image ? <img src={user.profile_image} className="w-full h-full rounded-full" /> : '👤'}
                                </div>
                                <h3 className="font-bold text-lg text-gray-800">{user?.username || 'Usuário Pinterest'}</h3>
                                <p className="text-green-600 font-medium text-sm flex items-center justify-center gap-1">
                                    <CheckCircle size={14} /> Conectado
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Boards List */}
                    {isConnected && (
                        <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg h-[400px] flex flex-col">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                    <Layout size={20} />
                                </div>
                                Seus Boards
                            </h2>
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                {boards.map(board => (
                                    <div
                                        key={board.id}
                                        onClick={() => setSelectedBoard(board.id)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedBoard === board.id
                                                ? 'bg-red-50 border-red-200 shadow-sm'
                                                : 'bg-white border-gray-100 hover:border-red-200'
                                            }`}
                                    >
                                        <p className={`font-bold ${selectedBoard === board.id ? 'text-red-800' : 'text-gray-700'}`}>
                                            {board.name}
                                        </p>
                                        <p className="text-xs text-gray-400">{board.pin_count || 0} Pins</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Create Pin */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-lg">
                        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                <Upload size={24} />
                            </div>
                            Criar Novo Pin
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Image Upload Area */}
                            <div>
                                <label className={`
                                    border-2 border-dashed rounded-2xl h-80 flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group
                                    ${imageUrl ? 'border-red-200 bg-red-50' : 'border-gray-300 hover:border-red-400 hover:bg-gray-50'}
                                `}>
                                    {imageUrl ? (
                                        <>
                                            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <p className="text-white font-bold flex items-center gap-2"><Upload size={20} /> Trocar Imagem</p>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center p-6">
                                            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Image size={32} />
                                            </div>
                                            <p className="font-bold text-gray-600">Arraste uma imagem ou clique</p>
                                            <p className="text-xs text-gray-400 mt-2">Recomendado: 1000x1500px (2:3)</p>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </label>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Título</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 transition-all font-medium"
                                        placeholder="Ex: Ideias de Decoração"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Descrição</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 transition-all font-medium h-24 resize-none"
                                        placeholder="Descreva seu Pin..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Link de Destino</label>
                                    <div className="relative">
                                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            value={link}
                                            onChange={(e) => setLink(e.target.value)}
                                            className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 transition-all font-medium"
                                            placeholder="https://seu-site.com/produto"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Scheduling & Actions */}
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className="flex bg-gray-100 p-1 rounded-xl">
                                        <button
                                            onClick={() => setScheduleMode('now')}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${scheduleMode === 'now' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                                        >
                                            Postar Agora
                                        </button>
                                        <button
                                            onClick={() => setScheduleMode('schedule')}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${scheduleMode === 'schedule' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
                                        >
                                            Agendar
                                        </button>
                                    </div>
                                    {scheduleMode === 'schedule' && (
                                        <input
                                            type="datetime-local"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="p-2 border border-gray-200 rounded-lg text-sm"
                                        />
                                    )}
                                </div>

                                <button
                                    onClick={handlePost}
                                    disabled={loading || !isConnected}
                                    className="w-full md:w-auto px-8 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Processando...' : (scheduleMode === 'now' ? '🚀 Publicar Pin' : '📅 Agendar Pin')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PinterestAutomationPage;
