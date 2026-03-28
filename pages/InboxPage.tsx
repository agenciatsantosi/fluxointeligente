import React, { useState, useEffect } from 'react';
import {
    Search,
    MessageCircle,
    Instagram,
    Facebook,
    Send,
    MoreVertical,
    Filter,
    User,
    CheckCheck,
    Clock,
    RefreshCw
} from 'lucide-react';
import api from '../services/api';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'contact';
    timestamp: string;
}

interface Conversation {
    id: string;
    name: string;
    platform: 'facebook' | 'instagram';
    lastMessage: string;
    timestamp: string;
    rawTimestamp?: string;
    unread: boolean;
    unreadCount?: number;
    avatar?: string;
    accountId: string;
    accountName?: string;
}

const InboxPage: React.FC = () => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState<'all' | 'facebook' | 'instagram'>('all');

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            const playNote = (frequency: number, startTime: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(frequency, startTime);

                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playNote(523.25, now, 0.4); // C5
            playNote(659.25, now + 0.15, 0.6); // E5
        } catch (e) {
            console.error('Audio play failed:', e);
        }
    };

    useEffect(() => {
        loadConversations();

        // Poll conversations every 15 seconds (SILENTLY to avoid flickering)
        const convInterval = setInterval(() => loadConversations(false), 15000);
        return () => clearInterval(convInterval);
    }, []);

    useEffect(() => {
        if (selectedChat) {
            loadMessages(selectedChat.id, selectedChat.platform, selectedChat.accountId);

            if (selectedChat.unread || (selectedChat.unreadCount && selectedChat.unreadCount > 0)) {
                markAsRead(selectedChat);
            }

            // Poll messages for active chat every 10 seconds
            const msgInterval = setInterval(() => {
                loadMessages(selectedChat.id, selectedChat.platform, selectedChat.accountId, false); // pass false to avoid loading spinner
            }, 10000);
            return () => clearInterval(msgInterval);
        }
    }, [selectedChat]);

    const markAsRead = async (chat: Conversation) => {
        // Optimistic UI Update - Update state immediately
        setConversations(prev => prev.map(c =>
            c.id === chat.id ? { ...c, unread: false, unreadCount: 0 } : c
        ));

        // Also update selected chat if it's the currently selected one
        setSelectedChat(prev => prev?.id === chat.id ? { ...prev, unread: false, unreadCount: 0 } : prev);

        // Save to localStorage to avoid Facebook Graph API delay
        const readTimestamps = JSON.parse(localStorage.getItem('inbox_read_timestamps') || '{}');
        readTimestamps[chat.id] = Date.now();
        localStorage.setItem('inbox_read_timestamps', JSON.stringify(readTimestamps));

        try {
            await api.post('/inbox/read', {
                threadId: chat.id,
                platform: chat.platform,
                accountId: chat.accountId
            });
        } catch (error) {
            console.error('Error marking conversation as read:', error);
        }
    };

    const loadConversations = async (showLoading = true) => {
        if (showLoading) setLoadingConversations(true);
        try {
            const res = await api.get('/inbox/conversations');
            if (res.data.success) {
                setConversations(prev => {
                    let newConvs = res.data.conversations;

                    // Apply local read timestamps to override Meta's generic unread_count delay
                    const readTimestamps = JSON.parse(localStorage.getItem('inbox_read_timestamps') || '{}');
                    newConvs = newConvs.map((newC: Conversation) => {
                        const clearedAt = readTimestamps[newC.id];
                        if (clearedAt) {
                            // If we read this in the last 60 seconds, ALWAYS force it to be read
                            // OR if the message timestamp is BEFORE our reading time
                            const now = Date.now();
                            const messageTime = newC.rawTimestamp ? new Date(newC.rawTimestamp).getTime() : 0;
                            
                            if (now - clearedAt < 60000 || (messageTime && messageTime <= clearedAt + 5000)) {
                                return { ...newC, unread: false, unreadCount: 0 };
                            }
                        }
                        return newC;
                    });

                    // Play sound if a conversation's unread count increases
                    if (!showLoading) {
                        const hasNewUnread = newConvs.some((newC: Conversation) => {
                            const oldC = prev.find(p => p.id === newC.id);
                            const newCount = newC.unreadCount || (newC.unread ? 1 : 0);
                            const oldCount = oldC ? (oldC.unreadCount || (oldC.unread ? 1 : 0)) : 0;
                            return newCount > oldCount;
                        });
                        if (hasNewUnread) {
                            playNotificationSound();
                        }
                    }
                    return newConvs;
                });
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            // Fallback for demo if backend isn't ready
            const demoConvs: Conversation[] = [
                { id: '1', name: 'João Silva', platform: 'facebook', lastMessage: 'Olá, qual o preço?', timestamp: '10:30', unread: true, accountId: 'fb1', accountName: 'Resenha Digital' },
                { id: '2', name: 'Maria Souza', platform: 'instagram', lastMessage: 'Gostei do produto!', timestamp: 'Ontem', unread: false, accountId: 'ig1', accountName: 'loja.resenha' },
                { id: '3', name: 'Carlos Tech', platform: 'instagram', lastMessage: 'Vocês entregam em SP?', timestamp: 'Segunda', unread: false, accountId: 'ig2', accountName: 'tech.store' },
            ];
            setConversations(demoConvs);
        } finally {
            setLoadingConversations(false);
        }
    };

    const loadMessages = async (threadId: string, platform: string, accountId: string, showLoading = true) => {
        if (showLoading) setLoadingMessages(true);
        try {
            const res = await api.get('/inbox/messages', {
                params: { threadId, platform, accountId }
            });
            if (res.data.success) {
                setMessages(prev => {
                    const newMsgs = res.data.messages;
                    if (!showLoading && newMsgs.length > 0) {
                        const lastNewMsg = newMsgs[newMsgs.length - 1];
                        const lastOldMsg = prev.length > 0 ? prev[prev.length - 1] : null;

                        // If there is a new message we didn't have before, and it's from contact
                        if (lastNewMsg && (!lastOldMsg || lastNewMsg.id !== lastOldMsg.id)) {
                            if (lastNewMsg.sender === 'contact') {
                                playNotificationSound();
                            }
                        }
                    }
                    return newMsgs;
                });
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            // Fallback for demo
            setMessages([
                { id: 'm1', text: 'Olá, tudo bem?', sender: 'contact', timestamp: '10:25' },
                { id: 'm2', text: 'Tudo ótimo, em que posso ajudar?', sender: 'user', timestamp: '10:27' },
                { id: 'm3', text: 'Olá, qual o preço?', sender: 'contact', timestamp: '10:30' },
            ]);
        } finally {
            setLoadingMessages(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedChat) return;

        const tempMessage: Message = {
            id: Date.now().toString(),
            text: newMessage,
            sender: 'user',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages([...messages, tempMessage]);
        setNewMessage('');

        try {
            const response = await api.post('/inbox/send', {
                threadId: selectedChat.id,
                platform: selectedChat.platform,
                accountId: selectedChat.accountId,
                text: newMessage
            });
            // if success is false but didn't throw an HTTP error
            if (response.data && !response.data.success) {
                alert(`Erro: ${response.data.error || 'Falha ao enviar'}`);
            }
        } catch (error: any) {
            console.error('Error sending message:', error);
            const errorMsg = error.response?.data?.error || 'Erro ao enviar mensagem. A janela de 24h da Meta para resposta pode ter expirado.';
            alert(`Facebook API Error: ${errorMsg}`);
        }
    };

    const filteredConversations = conversations.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter;
        return matchesSearch && matchesPlatform;
    });

    return (
        <div className="h-[calc(100vh-160px)] flex bg-white/40 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
            {/* Conversations Sidebar */}
            <div className="w-1/3 border-r border-gray-100 flex flex-col bg-white/60">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            Mensagens
                            {conversations.some(c => c.unread) && (
                                <span className="bg-pink-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-pink-500/50 animate-bounce">
                                    {conversations.filter(c => c.unread).length}
                                </span>
                            )}
                        </h2>
                        <button onClick={() => loadConversations()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <RefreshCw size={18} className={loadingConversations ? 'animate-spin text-purple-600' : 'text-gray-500'} />
                        </button>
                    </div>

                    {/* Platform Filters */}
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setPlatformFilter('all')}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${platformFilter === 'all' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-gray-50 text-gray-500 hover:bg-purple-50 hover:text-purple-600'}`}
                        >
                            Todas
                        </button>
                        <button
                            onClick={() => setPlatformFilter('facebook')}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${platformFilter === 'facebook' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                        >
                            Facebook
                        </button>
                        <button
                            onClick={() => setPlatformFilter('instagram')}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${platformFilter === 'instagram' ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/20' : 'bg-gray-50 text-gray-500 hover:bg-pink-50 hover:text-pink-600'}`}
                        >
                            Instagram
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar conversas..."
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-purple-500/20 text-sm transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingConversations ? (
                        <div className="p-8 text-center text-gray-400">Carregando...</div>
                    ) : filteredConversations.length > 0 ? (
                        filteredConversations.map(conv => (
                            <div
                                key={conv.id}
                                onClick={() => setSelectedChat(conv)}
                                className={`p-4 flex items-center gap-3 cursor-pointer transition-all border-b border-gray-50 ${selectedChat?.id === conv.id ? 'bg-purple-50 border-r-4 border-r-purple-600' : 'hover:bg-gray-50'}`}
                            >
                                <div className="relative">
                                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 font-bold">
                                        {conv.name[0]}
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full shadow-sm">
                                        {conv.platform === 'instagram' ? <Instagram size={12} className="text-pink-600" /> : <Facebook size={12} className="text-blue-600" />}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2 max-w-[70%]">
                                            <h3 className={`font-bold truncate text-sm ${conv.unread ? 'text-gray-900' : 'text-gray-700'}`}>{conv.name}</h3>
                                        </div>
                                        <span className="text-[10px] text-gray-400">{conv.timestamp}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className={`text-xs truncate flex-1 ${conv.unread ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>
                                            {conv.lastMessage}
                                        </p>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter ${conv.platform === 'instagram' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {conv.platform}
                                            </span>
                                            {conv.accountName && (
                                                <span className="text-[8px] text-gray-400 font-bold truncate max-w-[80px]">
                                                    {conv.accountName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {conv.unread && (
                                    <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm shrink-0">
                                        {conv.unreadCount || 1}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="p-8 text-center text-gray-400">Nenhuma conversa encontrada</div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-white/40">
                {selectedChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/60">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 font-bold">
                                    {selectedChat.name[0]}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{selectedChat.name}</h3>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                            <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Online</span>
                                        </div>
                                        <span className="text-gray-300">|</span>
                                        <div className="flex items-center gap-1">
                                            {selectedChat.platform === 'instagram' ? <Instagram size={12} className="text-pink-600" /> : <Facebook size={12} className="text-blue-600" />}
                                            <span className={`text-[10px] font-bold uppercase ${selectedChat.platform === 'instagram' ? 'text-pink-600' : 'text-blue-600'}`}>
                                                {selectedChat.platform} {selectedChat.accountName ? `- ${selectedChat.accountName}` : ''}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                <MoreVertical size={20} />
                            </button>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-50/50">
                            {loadingMessages ? (
                                <div className="text-center py-20 text-gray-400">Carregando histórico...</div>
                            ) : (
                                messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-4 rounded-2xl shadow-sm relative group ${msg.sender === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'}`}>
                                            <p className="text-sm leading-relaxed">{msg.text}</p>
                                            <div className={`flex items-center gap-1 mt-1 justify-end ${msg.sender === 'user' ? 'text-white/60' : 'text-gray-400'}`}>
                                                <span className="text-[10px]">{msg.timestamp}</span>
                                                {msg.sender === 'user' && <CheckCheck size={12} />}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Chat Input Premium */}
                        <div className="p-6 bg-white border-t border-gray-100/50">
                            <div className="max-w-4xl mx-auto">
                                <div className="border-2 border-gray-100 rounded-[2rem] bg-gray-50/30 focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all overflow-hidden shadow-sm">
                                    <textarea
                                        rows={2}
                                        placeholder="Digite sua mensagem aqui..."
                                        className="w-full p-5 border-none bg-transparent focus:ring-0 text-base text-gray-800 placeholder:text-gray-300 resize-none min-h-[60px]"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                    />
                                    <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {['🚀', '😍', '🔥', '✅', '✨', '💎', '💡', '💬', '👋', '⚡'].map(emoji => (
                                                <button 
                                                    key={emoji}
                                                    onClick={() => setNewMessage(prev => prev + emoji)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-md transition-all text-xl grayscale hover:grayscale-0 active:scale-90"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                            <div className="w-px h-4 bg-gray-200 mx-2"></div>
                                            <button 
                                                onClick={() => setNewMessage(prev => prev + 'https://')}
                                                className="text-[10px] font-black uppercase tracking-wider text-purple-700 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 transition-all border border-purple-100"
                                            >
                                                + Colar Link
                                            </button>
                                        </div>
                                        
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!newMessage.trim()}
                                            className="p-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 disabled:opacity-50 transition-all shadow-xl shadow-purple-500/30 active:scale-95 flex items-center gap-2 group"
                                        >
                                            <span className="text-sm font-black uppercase tracking-widest pl-2">Enviar</span>
                                            <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 text-center mt-3 uppercase font-bold tracking-widest opacity-50">
                                    Pressione Enter para enviar • Shift + Enter para nova linha
                                </p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 overflow-y-auto custom-scrollbar">
                        <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mb-6 shrink-0">
                            <MessageCircle size={40} />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-2">Selecione uma conversa</h3>
                        <p className="text-gray-500 max-w-sm text-center mb-8">
                            Escolha um contato ao lado para iniciar o atendimento unificado.
                        </p>

                        <div className="max-w-xl w-full bg-orange-50/50 border border-orange-100 rounded-2xl p-6 text-left">
                            <h4 className="font-bold text-orange-800 flex items-center gap-2 mb-3">
                                <span className="text-xl">🛠️</span> Suas conversas do Instagram não aparecem?
                            </h4>
                            <p className="text-sm text-orange-700 mb-4">
                                Se a sua conta já está conectada mas as mensagens não carregam, verifique esses 2 passos obrigatórios da Meta:
                            </p>

                            <div className="space-y-4">
                                <div className="bg-white/60 p-4 rounded-xl border border-orange-200/50">
                                    <h5 className="font-bold text-gray-800 text-sm mb-1">1. Liberar acesso no App do Instagram (O mais comum!)</h5>
                                    <ol className="text-xs text-gray-600 list-decimal pl-4 space-y-1">
                                        <li>Abra o Instagram no celular e vá no seu Perfil.</li>
                                        <li>Toque nos 3 tracinhos (canto superior direito) e vá em <span className="font-semibold">Configurações</span>.</li>
                                        <li>Vá em <span className="font-semibold text-purple-600">Mensagens e respostas do story</span>.</li>
                                        <li>Depois vá em <span className="font-semibold">Pedidos de contato</span>.</li>
                                        <li>Ative a chavinha <span className="font-bold text-green-600">"Permitir acesso às mensagens"</span>.</li>
                                    </ol>
                                </div>

                                <div className="bg-white/60 p-4 rounded-xl border border-orange-200/50">
                                    <h5 className="font-bold text-gray-800 text-sm mb-1">2. Permissões no seu App (Meta for Developers)</h5>
                                    <ul className="text-xs text-gray-600 list-disc pl-4 space-y-1">
                                        <li>O seu Token precisa ter as permissões: <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">instagram_manage_messages</code> e <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">pages_messaging</code>.</li>
                                        <li>Você também deve ter adicionado o produto <span className="font-semibold">"Messenger"</span> no painel do seu aplicativo.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InboxPage;
