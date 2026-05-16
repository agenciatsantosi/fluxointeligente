import React, { useState, useEffect, useRef } from 'react';
import {
    Search,
    MessageCircle,
    Instagram,
    Facebook,
    Send,
    MoreVertical,
    CheckCheck,
    RefreshCw,
    Filter,
    ChevronDown,
    Link as LinkIcon,
    AtSign
} from 'lucide-react';
import api from '../services/api';
import Logo from '../components/Logo';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'contact';
    timestamp: string;
}

interface Conversation {
    id: string;
    name: string;
    platform: 'facebook' | 'instagram' | 'threads';
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
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Custom Dropdown State
    const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const pollConversationsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pollMessagesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isComponentMounted = useRef(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const playNotificationSound = () => {
        try {
            if (!audioCtxRef.current) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) return;
                audioCtxRef.current = new AudioContextClass();
            }

            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const playNote = (frequency: number, startTime: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(frequency, startTime);

                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playNote(523.25, now, 0.4); 
            playNote(659.25, now + 0.15, 0.6); 
        } catch (e) {
            console.error('Audio play failed:', e);
        }
    };

    useEffect(() => {
        isComponentMounted.current = true;
        loadConversationsRecursive();

        return () => {
            isComponentMounted.current = false;
            if (pollConversationsTimeoutRef.current) clearTimeout(pollConversationsTimeoutRef.current);
            if (pollMessagesTimeoutRef.current) clearTimeout(pollMessagesTimeoutRef.current);
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedChat) {
            if (pollMessagesTimeoutRef.current) clearTimeout(pollMessagesTimeoutRef.current);
            
            loadMessages(selectedChat.id, selectedChat.platform, selectedChat.accountId, true);

            if (selectedChat.unread || (selectedChat.unreadCount && selectedChat.unreadCount > 0)) {
                markAsRead(selectedChat);
            }

            loadMessagesRecursive(selectedChat);
        } else {
            if (pollMessagesTimeoutRef.current) clearTimeout(pollMessagesTimeoutRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChat]);

    const loadConversationsRecursive = async () => {
        if (!isComponentMounted.current) return;
        await loadConversations(false);
        if (isComponentMounted.current) {
            pollConversationsTimeoutRef.current = setTimeout(loadConversationsRecursive, 15000);
        }
    };

    const loadMessagesRecursive = async (chat: Conversation) => {
        if (!isComponentMounted.current || selectedChat?.id !== chat.id) return;
        
        await loadMessages(chat.id, chat.platform, chat.accountId, false);
        
        if (isComponentMounted.current && selectedChat?.id === chat.id) {
            pollMessagesTimeoutRef.current = setTimeout(() => loadMessagesRecursive(chat), 10000);
        }
    };

    const markAsRead = async (chat: Conversation) => {
        setConversations(prev => prev.map(c =>
            c.id === chat.id ? { ...c, unread: false, unreadCount: 0 } : c
        ));

        setSelectedChat(prev => prev?.id === chat.id ? { ...prev, unread: false, unreadCount: 0 } : prev);

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
            console.error('Error marking as read:', error);
        }
    };

    const loadConversations = async (showLoading = true) => {
        if (showLoading) setLoadingConversations(true);
        try {
            const res = await api.get('/inbox/conversations');
            if (res.data.success) {
                if (res.data.accounts) {
                    setAccounts(res.data.accounts);
                }
                setConversations(prev => {
                    let newConvs = res.data.conversations;

                    const readTimestamps = JSON.parse(localStorage.getItem('inbox_read_timestamps') || '{}');
                    const now = Date.now();
                    Object.keys(readTimestamps).forEach(key => {
                        if (now - readTimestamps[key] > 86400000) {
                            delete readTimestamps[key];
                        }
                    });
                    localStorage.setItem('inbox_read_timestamps', JSON.stringify(readTimestamps));

                    newConvs = newConvs.map((newC: Conversation) => {
                        const clearedAt = readTimestamps[newC.id];
                        if (clearedAt) {
                            const messageTime = newC.rawTimestamp ? new Date(newC.rawTimestamp).getTime() : 0;
                            if (now - clearedAt < 60000 || (messageTime && messageTime <= clearedAt + 5000)) {
                                return { ...newC, unread: false, unreadCount: 0 };
                            }
                        }
                        return newC;
                    });

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
        } finally {
            if (isComponentMounted.current) setLoadingConversations(false);
        }
    };

    const loadMessages = async (threadId: string, platform: string, accountId: string, showLoading = true) => {
        if (showLoading) setLoadingMessages(true);
        try {
            const res = await api.get('/inbox/messages', {
                params: { threadId, platform, accountId }
            });
            if (res.data.success && isComponentMounted.current) {
                setMessages(prev => {
                    const newMsgs = res.data.messages;
                    if (!showLoading && newMsgs.length > 0) {
                        const lastNewMsg = newMsgs[newMsgs.length - 1];
                        const lastOldMsg = prev.length > 0 ? prev[prev.length - 1] : null;

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
        } finally {
            if (isComponentMounted.current) setLoadingMessages(false);
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
            if (response.data && !response.data.success) {
                alert(`Erro: ${response.data.error || 'Falha ao enviar'}`);
            }
        } catch (error: any) {
            console.error('Error sending message:', error);
            const errorMsg = error.response?.data?.error || 'A janela de 24h da Meta para resposta expirou.';
            alert(`Erro na API: ${errorMsg}`);
        }
    };

    const uniqueAccounts = React.useMemo(() => {
        const accountsMap = new Map();
        
        // Populate with all registered accounts from backend
        accounts.forEach(acc => {
            accountsMap.set(acc.id, {
                id: acc.id,
                name: acc.name,
                platform: acc.platform,
                unreadCount: 0
            });
        });

        // Merge with conversations to add any missing ones and compute unread counts
        conversations.forEach(c => {
            if (!accountsMap.has(c.accountId)) {
                accountsMap.set(c.accountId, {
                    id: c.accountId,
                    name: c.accountName || c.accountId,
                    platform: c.platform,
                    unreadCount: 0
                });
            }
            if (c.unread) {
                accountsMap.get(c.accountId).unreadCount += 1;
            }
        });
        return Array.from(accountsMap.values());
    }, [conversations, accounts]);

    const filteredConversations = conversations.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesAccount = selectedAccountId === 'all' || c.accountId === selectedAccountId;
        return matchesSearch && matchesAccount;
    });

    const activeAccountInfo = selectedAccountId === 'all' 
        ? { name: 'Todas as Contas', count: conversations.length } 
        : { name: uniqueAccounts.find(a => a.id === selectedAccountId)?.name, count: filteredConversations.length };

    return (
        <div className="h-[calc(100vh-140px)] flex bg-[#f8f9fa]/80 backdrop-blur-3xl rounded-[2.5rem] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden font-sans">
            
            {/* Conversations Sidebar */}
            <div className="w-[380px] border-r border-slate-200/60 flex flex-col bg-white/50 relative z-10">
                <div className="p-7 pb-5 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                            Inbox
                            {conversations.some(c => c.unread) && (
                                <span className="bg-indigo-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                                    {conversations.filter(c => c.unread).length}
                                </span>
                            )}
                        </h2>
                        <button 
                            onClick={() => loadConversations()} 
                            className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-full text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-sm transition-all duration-300"
                            title="Atualizar conversas"
                        >
                            <RefreshCw size={14} className={loadingConversations ? 'animate-spin text-indigo-500' : ''} />
                        </button>
                    </div>

                    {/* Custom Premium Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <div 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className={`w-full px-4 py-3 bg-white border rounded-2xl flex items-center justify-between cursor-pointer transition-all duration-300 ${isDropdownOpen ? 'border-indigo-300 shadow-[0_0_0_4px_rgba(99,102,241,0.1)]' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                                    <Filter size={14} className="text-slate-500" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 leading-none mb-1">Filtrando</span>
                                    <span className="text-sm font-semibold text-slate-700 leading-none truncate max-w-[180px]">
                                        {activeAccountInfo.name}
                                    </span>
                                </div>
                            </div>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>

                        {/* Dropdown Menu */}
                        <div className={`absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-300 transform origin-top z-50 ${isDropdownOpen ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-95 pointer-events-none'}`}>
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                                <button
                                    onClick={() => { setSelectedAccountId('all'); setIsDropdownOpen(false); }}
                                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-between ${selectedAccountId === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <span className="truncate">Todas as Contas (Atualizado)</span>
                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{conversations.length}</span>
                                </button>
                                {uniqueAccounts.map(acc => (
                                    <button
                                        key={acc.id}
                                        onClick={() => { setSelectedAccountId(acc.id); setIsDropdownOpen(false); }}
                                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-between mt-1 ${selectedAccountId === acc.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            {acc.platform === 'instagram' 
                                                ? <Instagram size={14} className={selectedAccountId === acc.id ? 'text-indigo-500' : 'text-pink-500'} /> 
                                                : (acc.platform === 'threads' 
                                                    ? <AtSign size={14} className={selectedAccountId === acc.id ? 'text-indigo-500' : 'text-slate-800'} />
                                                    : <Facebook size={14} className={selectedAccountId === acc.id ? 'text-indigo-500' : 'text-blue-500'} />
                                                )
                                            }
                                            <span className="truncate">{acc.name}</span>
                                        </div>
                                        {acc.unreadCount > 0 && (
                                            <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold shadow-sm">
                                                {acc.unreadCount} novas
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar contatos..."
                            className="w-full pl-11 pr-4 py-3.5 bg-slate-100/50 hover:bg-slate-100 border-transparent rounded-2xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition-all shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4">
                    {loadingConversations ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-6 animate-in fade-in duration-500">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-full animate-pulse-slow"></div>
                                <Logo size={50} className="animate-bounce-subtle relative z-10" />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <RefreshCw className="animate-spin text-indigo-500" size={12} />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sincronizando Inbox</span>
                                </div>
                                <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="w-full h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-loading-bar"></div>
                                </div>
                            </div>
                        </div>
                    ) : filteredConversations.length > 0 ? (
                        <div className="space-y-1.5">
                            {filteredConversations.map(conv => {
                                const isActive = selectedChat?.id === conv.id;
                                return (
                                    <div
                                        key={conv.id}
                                        onClick={() => setSelectedChat(conv)}
                                        className={`p-4 flex items-center gap-4 cursor-pointer transition-all duration-300 rounded-2xl group ${
                                            isActive 
                                            ? 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-slate-100 scale-[1.02] transform z-10' 
                                            : 'hover:bg-slate-50/80 border border-transparent'
                                        }`}
                                    >
                                        <div className="relative shrink-0">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                                                isActive ? 'bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500 group-hover:bg-white'
                                            }`}>
                                                {conv.name[0].toUpperCase()}
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 p-1.5 rounded-full shadow-sm border-2 border-white ${
                                                isActive ? 'bg-indigo-50' : 'bg-slate-50'
                                            }`}>
                                                {conv.platform === 'instagram' 
                                                    ? <Instagram size={10} className="text-pink-500" /> 
                                                    : (conv.platform === 'threads' ? <AtSign size={10} className="text-slate-800" /> : <Facebook size={10} className="text-blue-500" />)
                                                }
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1">
                                                <h3 className={`font-bold truncate text-sm transition-colors ${
                                                    isActive ? 'text-indigo-900' : (conv.unread ? 'text-slate-900' : 'text-slate-700')
                                                }`}>
                                                    {conv.name}
                                                </h3>
                                                <span className={`text-[10px] font-medium ${isActive ? 'text-indigo-400' : 'text-slate-400'}`}>
                                                    {conv.timestamp}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-xs truncate flex-1 transition-colors ${
                                                    conv.unread ? 'text-slate-800 font-semibold' : (isActive ? 'text-indigo-500/80' : 'text-slate-500')
                                                }`}>
                                                    {conv.lastMessage || 'Iniciou uma conversa...'}
                                                </p>
                                            </div>
                                        </div>

                                        {conv.unread && !isActive && (
                                            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)] shrink-0"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-60 text-center px-6">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <MessageCircle size={24} className="text-slate-300" />
                            </div>
                            <h4 className="text-slate-700 font-bold mb-1">Caixa Vazia</h4>
                            <p className="text-sm text-slate-400">Nenhuma conversa encontrada com os filtros atuais.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-white/40 relative z-0">
                {selectedChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-lg shadow-sm">
                                    {selectedChat.name[0].toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-slate-800 text-lg leading-tight">{selectedChat.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_5px_rgba(16,185,129,0.5)]"></span>
                                            <span className="text-[9px] text-emerald-600 uppercase font-bold tracking-widest">Online</span>
                                        </div>
                                        <span className="text-slate-200">•</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                Via <strong className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1">
                                                    {selectedChat.platform === 'instagram' ? <Instagram size={10} /> : (selectedChat.platform === 'threads' ? <AtSign size={10} /> : <Facebook size={10} />)}
                                                    {selectedChat.accountName || selectedChat.platform}
                                                </strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-full transition-all text-slate-400 hover:text-slate-600 shadow-sm">
                                    <MoreVertical size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50/30">
                            {loadingMessages && messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                                    <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                    <span className="text-sm font-semibold text-slate-400">Puxando histórico...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="text-center pb-4">
                                        <span className="bg-slate-100/80 backdrop-blur-sm text-slate-400 text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
                                            Início da Conversa Recente
                                        </span>
                                    </div>
                                    {messages.map(msg => {
                                        const isUser = msg.sender === 'user';
                                        return (
                                            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                                                <div className={`max-w-[65%] p-4 shadow-sm relative transition-all ${
                                                    isUser 
                                                    ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm shadow-[0_4px_15px_rgba(99,102,241,0.2)]' 
                                                    : 'bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'
                                                }`}>
                                                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                                    <div className={`flex items-center gap-1.5 mt-2 justify-end ${isUser ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                        <span className="text-[10px] font-semibold tracking-wide">{msg.timestamp}</span>
                                                        {isUser && <CheckCheck size={14} className="opacity-80" />}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </div>

                        {/* Chat Input Premium */}
                        <div className="p-6 bg-white/80 backdrop-blur-md border-t border-slate-100">
                            <div className="max-w-4xl mx-auto flex gap-3 items-end">
                                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-[1.5rem] focus-within:bg-white focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all shadow-inner overflow-hidden">
                                    <textarea
                                        rows={1}
                                        placeholder={`Escreva para ${selectedChat.name}...`}
                                        className="w-full px-6 py-4 border-none bg-transparent focus:ring-0 text-[15px] text-slate-800 placeholder:text-slate-400 resize-none max-h-[120px] custom-scrollbar"
                                        style={{ minHeight: '56px' }}
                                        value={newMessage}
                                        onChange={(e) => {
                                            setNewMessage(e.target.value);
                                            e.target.style.height = 'auto';
                                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                        }}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                    />
                                    <div className="px-4 py-2.5 bg-transparent flex items-center justify-between border-t border-slate-100/50">
                                        <div className="flex items-center gap-1">
                                            {['👍', '❤️', '🔥', '😂', '👏'].map(emoji => (
                                                <button 
                                                    key={emoji}
                                                    onClick={() => setNewMessage(prev => prev + emoji)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-lg opacity-70 hover:opacity-100"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                        <button 
                                            onClick={() => setNewMessage(prev => prev + 'https://')}
                                            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all"
                                        >
                                            <LinkIcon size={12} />
                                            Link
                                        </button>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim()}
                                    className="h-[56px] w-[56px] shrink-0 bg-indigo-600 text-white rounded-[1.2rem] hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-[0_4px_15px_rgba(99,102,241,0.3)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] disabled:shadow-none active:scale-[0.95] flex items-center justify-center group"
                                >
                                    <Send size={22} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                            </div>
                            <p className="text-center mt-3 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                Enter para enviar • Shift + Enter para nova linha
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 overflow-y-auto custom-scrollbar bg-slate-50/30">
                        <div className="relative mb-8">
                            <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full"></div>
                            <div className="w-28 h-28 bg-gradient-to-br from-white to-slate-50 border border-slate-100 shadow-xl shadow-slate-200/50 rounded-[2rem] flex items-center justify-center text-indigo-500 relative z-10 transform rotate-[-5deg]">
                                <MessageCircle size={48} strokeWidth={1.5} />
                            </div>
                        </div>
                        <h3 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Inbox Unificado</h3>
                        <p className="text-slate-500 text-center max-w-md text-base leading-relaxed mb-10">
                            A interface definitiva para gerenciar todas as suas interações. Selecione uma conta à esquerda ou clique em uma conversa para começar.
                        </p>

                        <div className="max-w-lg w-full bg-white border border-slate-200/60 shadow-lg shadow-slate-200/20 rounded-[2rem] p-8 text-left relative overflow-hidden group hover:border-indigo-200 transition-colors">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                            <h4 className="font-extrabold text-slate-800 flex items-center gap-3 mb-4 text-lg">
                                <span className="bg-indigo-50 text-indigo-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">💡</span> 
                                Instagram Inbox Setup
                            </h4>
                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                                Para liberar as mensagens do seu Instagram neste painel, você precisa conceder permissão dentro do aplicativo do seu celular.
                            </p>

                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                <ol className="text-[13px] text-slate-600 space-y-2.5 font-medium">
                                    <li className="flex items-start gap-2">
                                        <span className="text-indigo-400 font-bold mt-0.5">1.</span>
                                        Vá nas Configurações do seu Instagram (Celular).
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-indigo-400 font-bold mt-0.5">2.</span>
                                        Acesse <strong className="text-slate-800">Mensagens e respostas do story</strong>.
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-indigo-400 font-bold mt-0.5">3.</span>
                                        Entre em <strong className="text-slate-800">Pedidos de contato</strong>.
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-indigo-400 font-bold mt-0.5">4.</span>
                                        Ative a opção <strong className="text-emerald-600">"Permitir acesso às mensagens"</strong>.
                                    </li>
                                </ol>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InboxPage;
