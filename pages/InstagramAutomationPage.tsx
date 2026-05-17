import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, Send, RefreshCw, RefreshCcw, Clock, Check, CheckCircle, XCircle, User, Hash, FileText, Power, Settings, Key, Sparkles, Zap, Layout, Calendar, Layers, Edit2, Play, PlayCircle, Eye, Trash2, ChevronDown, Ratio, Maximize, AlertCircle, HelpCircle, Upload, ImageIcon, Pause, Volume2, VolumeX, RotateCcw, ShieldCheck, MoreVertical, X, Info, Activity, Bot, Trash, Shield, Plus, Heart, Target, Users, Globe } from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import { useProducts } from '../context/ProductContext';
import api from '../services/api';
import StorySchedulerPage from './StorySchedulerPage';
import { CommandCard, TacticalButton, StatusPulse, containerVariants, itemVariants } from '../components/MotionComponents';
import PostUploadChoiceModal from '../components/PostUploadChoiceModal';

interface InstagramAutomationPageProps {
    setActiveTab?: (tab: string) => void;
}

const RatioIcon = ({ ratio, active, size = 'sm' }: { ratio: string, active: boolean, size?: 'sm' | 'md' | 'lg' }) => {
    const s = size === 'sm' ? 'w-4 h-6' : size === 'md' ? 'w-8 h-12' : 'w-12 h-16';
    const activeClass = active ? 'border-purple-600 bg-purple-50' : 'border-gray-300';
    if (ratio === '9:16') return <div className={`${s} border rounded-none transition-all ${activeClass} flex items-center justify-center`}><div className="w-[1px] h-full bg-current opacity-20"></div></div>;
    if (ratio === '1:1') return <div className={`aspect-square ${size === 'sm' ? 'w-4' : size === 'md' ? 'w-8' : 'w-12'} border rounded-none transition-all ${activeClass}`}></div>;
    if (ratio === '4:5') return <div className={`aspect-[4/5] ${size === 'sm' ? 'w-4' : size === 'md' ? 'w-8' : 'w-10'} border rounded-none transition-all ${activeClass}`}></div>;
    if (ratio === '16:9') return <div className={`aspect-video ${size === 'sm' ? 'w-5' : size === 'md' ? 'w-10' : 'w-16'} border rounded-none transition-all ${activeClass}`}></div>;
    return <ImageIcon size={size === 'sm' ? 16 : 24} />;
};

const VideoRow = ({ video, index, selected, onToggleSelection, onUpdateVideo, onDelete, onEdit }: any) => {
    const [title, setTitle] = useState(video.title || (video.video_path ? video.video_path.split('/').pop() : ''));
    const [editing, setEditing] = useState(false);
    const [caption, setCaption] = useState(video.caption || '');
    const [showMenu, setShowMenu] = useState(false);

    const handleTitleBlur = () => {
        if (title !== video.title) onUpdateVideo(video.id, { title });
    };

    const handleSaveCaption = () => {
        onUpdateVideo(video.id, { caption });
        setEditing(false);
    };

    useEffect(() => {
        setTitle(video.title || (video.video_path ? video.video_path.split('/').pop() : ''));
        setCaption(video.caption || '');
    }, [video]);

    const videoUrl = video.video_path 
        ? (video.video_path.startsWith('http') 
            ? video.video_path 
            : `/${video.video_path.replace(/\\/g, '/').replace(/^\//, '')}`) 
        : '';

    return (
        <motion.div 
            variants={itemVariants}
            className={`grid grid-cols-12 gap-6 px-10 py-8 items-center border-b border-gray-100 transition-all duration-300 ${selected ? 'bg-purple-50' : 'hover:bg-gray-50/50'}`}
        >
            <div className="col-span-1 flex items-center justify-center">
                <input
                    type="checkbox"
                    className="w-6 h-6 border-2 border-gray-200 text-purple-600 focus:ring-purple-500 rounded-lg cursor-pointer transition-all"
                    checked={selected}
                    onChange={onToggleSelection}
                />
            </div>
            
            <div className="col-span-1 border-x border-gray-100 h-full flex items-center justify-center">
                <div className="w-16 h-24 bg-gray-900 rounded-xl overflow-hidden relative group/thumb shadow-lg">
                    {video.thumbnail_url || videoUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                        <img src={video.thumbnail_url || videoUrl} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                        <video className="w-full h-full object-cover">
                            <source src={videoUrl} type="video/mp4" />
                        </video>
                    )}
                    <div className="absolute inset-0 bg-purple-600/0 group-hover/thumb:bg-purple-600/20 transition-all flex items-center justify-center">
                        <Play size={16} className="text-white opacity-0 group-hover/thumb:opacity-100 transform scale-50 group-hover/thumb:scale-100 transition-all" fill="currentColor" />
                    </div>
                </div>
            </div>

            <div className="col-span-1 px-4 text-center">
                <span className="text-[10px] font-black text-gray-400 block mb-1 uppercase tracking-widest">INDEX</span>
                <span className="text-lg font-black text-gray-900">#{index + 1}</span>
            </div>

            <div className="col-span-3 px-4">
                <div className="flex flex-col gap-3">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        className="w-full bg-gray-50/50 border border-gray-100 focus:border-purple-600 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 outline-none transition-all"
                    />
                    <div className="flex gap-2">
                        {['9:16', '1:1', '4:5'].map(ratio => (
                            <button
                                key={ratio}
                                onClick={() => onUpdateVideo(video.id, { aspectRatio: ratio })}
                                className={`p-1.5 rounded-lg border-2 transition-all ${
                                    video.aspect_ratio === ratio
                                    ? 'border-purple-600 bg-purple-50 text-purple-600'
                                    : 'border-gray-100 text-gray-400 hover:border-purple-200'
                                }`}
                                title={ratio}
                            >
                                <RatioIcon ratio={ratio} active={video.aspect_ratio === ratio} size="sm" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="col-span-4 px-4 border-l border-gray-100">
                {editing ? (
                    <div className="space-y-3">
                        <textarea 
                            value={caption} 
                            onChange={(e) => setCaption(e.target.value)} 
                            className="w-full bg-gray-50 p-4 border border-gray-200 rounded-xl text-xs h-24 focus:border-purple-600 outline-none font-medium leading-relaxed text-gray-700" 
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditing(false)} className="px-4 py-2 text-[10px] font-bold text-gray-400 hover:text-gray-900 uppercase tracking-widest">Cancelar</button>
                            <button onClick={handleSaveCaption} className="px-4 py-2 text-[10px] font-bold bg-purple-600 text-white rounded-lg uppercase tracking-widest shadow-lg shadow-purple-100">Atualizar</button>
                        </div>
                    </div>
                ) : (
                    <div className="group/caption relative p-4 bg-gray-50/50 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 cursor-text transition-all" onClick={() => setEditing(true)}>
                        <p className="text-xs text-gray-600 leading-relaxed font-medium line-clamp-3">
                            {caption || '// ADICIONAR_LEGENDA'}
                        </p>
                        <Edit2 size={12} className="absolute top-2 right-2 text-purple-500 opacity-0 group-hover/caption:opacity-100 transition-opacity" />
                    </div>
                )}
            </div>

            <div className="col-span-2 flex justify-end gap-3 pr-4 relative">
                <button 
                    onClick={() => onEdit(video)}
                    className="p-3 bg-white border border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200 rounded-xl transition-all shadow-sm"
                >
                    <Edit2 size={18} />
                </button>
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className={`p-3 border rounded-xl transition-all ${showMenu ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200 shadow-sm'}`}
                    >
                        <MoreVertical size={18} />
                    </button>
                    
                    <AnimatePresence>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setShowMenu(false)}></div>
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-3 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[110] overflow-hidden"
                                >
                                    <div className="p-2 space-y-1">
                                        <button 
                                            onClick={() => { onEdit(video); setShowMenu(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-purple-600 transition-all rounded-xl"
                                        >
                                            <Edit2 size={16} /> <span className="uppercase tracking-widest">EDITAR_CONTEÚDO</span>
                                        </button>
                                        <div className="h-px bg-gray-100 mx-2 my-1"></div>
                                        <button 
                                            onClick={() => { onDelete(video.id); setShowMenu(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-50 transition-all rounded-xl"
                                        >
                                            <Trash2 size={16} /> <span className="uppercase tracking-widest">EXCLUIR_DADOS</span>
                                        </button>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};

const ReelEditorModal = ({ video, isOpen, onClose, onSave }: any) => {
    const [step, setStep] = useState('criar');
    const [title, setTitle] = useState(video?.title || '');
    const [caption, setCaption] = useState(video?.caption || '');
    const [shareToFeed, setShareToFeed] = useState(video?.share_to_feed !== false);
    const [allowComments, setAllowComments] = useState(video?.allow_comments !== false);
    const [allowEmbedding, setAllowEmbedding] = useState(video?.allow_embedding !== false);
    const [thumbnailUrl, setThumbnailUrl] = useState(video?.thumbnail_url || '');
    const [thumbOffset, setThumbOffset] = useState(video?.thumb_offset || 0);
    const [suggestedFrames, setSuggestedFrames] = useState<string[]>([]);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const thumbInputRef = useRef<HTMLInputElement>(null);

    const videoUrl = video?.video_path 
        ? (video.video_path.startsWith('http') 
            ? video.video_path 
            : `/${video.video_path.replace(/\\/g, '/').replace(/^\//, '')}`) 
        : '';

    useEffect(() => {
        if (video) {
            setTitle(video.title || (video.video_path ? video.video_path.split('/').pop() : ''));
            setCaption(video.caption || '');
            setShareToFeed(video.share_to_feed !== false);
            setAllowComments(video.allow_comments !== false);
            setAllowEmbedding(video.allow_embedding !== false);
            setThumbnailUrl(video.thumbnail_url || '');
            setThumbOffset(video.thumb_offset || 0);
            
            if (isOpen && videoUrl) {
                const vid = document.createElement('video');
                vid.src = videoUrl;
                vid.crossOrigin = 'anonymous';
                vid.onloadedmetadata = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = vid.videoWidth;
                    canvas.height = vid.videoHeight;
                    
                    const capture = (time: number) => {
                        return new Promise<string>((resolve) => {
                            vid.currentTime = time;
                            vid.onseeked = () => {
                                ctx?.drawImage(vid, 0, 0);
                                resolve(canvas.toDataURL('image/jpeg', 0.8));
                            };
                        });
                    };
                    
                    (async () => {
                        const duration = vid.duration;
                        const frames: string[] = [];
                        for (let i = 0; i < 5; i++) {
                            const time = (duration / 6) * (i + 1);
                            frames.push(await capture(time));
                        }
                        setSuggestedFrames(frames);
                    })();
                };
            }
        }
    }, [video, isOpen, videoUrl]);

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const formData = new FormData();
        formData.append('files', e.target.files[0]);
        try {
            const response = await api.post('/story-queue/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success && response.data.files?.[0]) {
                setThumbnailUrl(response.data.files[0].url);
                setThumbOffset(0);
            }
        } catch (error) {
            console.error('Thumbnail upload error:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
                onClick={onClose}
            ></motion.div>
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-6xl h-[90vh] border border-gray-200 flex flex-col shadow-2xl rounded-3xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-10 py-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200">
                            <Edit2 size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                Editor<span className="text-purple-600">_Module</span>
                            </h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">IG_REEL_OPTIMIZATION_PROTOCOL</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-900">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-24 bg-gray-50 border-r border-gray-100 flex flex-col items-center py-10 gap-10">
                        {[
                            { id: 'criar', label: '01' },
                            { id: 'publicar', label: '02' }
                        ].map((s) => (
                            <div key={s.id} className="relative flex flex-col items-center gap-2 group cursor-pointer" onClick={() => setStep(s.id)}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                                    step === s.id ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white border border-gray-200 text-gray-400 group-hover:border-purple-300'
                                }`}>
                                    {s.label}
                                </div>
                                <div className={`absolute top-12 text-[9px] font-black uppercase transition-all tracking-widest ${step === s.id ? 'text-purple-600' : 'text-gray-400'}`}>
                                    {s.id}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-12 space-y-12 bg-white">
                            {step === 'criar' ? (
                                <>
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                            <span className="text-[10px] text-purple-600 font-black uppercase tracking-[0.2em]">DADOS_ENTRADA</span>
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div> Título do Reel
                                                </label>
                                                <input 
                                                    type="text" 
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-900 focus:border-purple-400 outline-none transition-all"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div> Legenda (Caption)
                                                </label>
                                                <textarea 
                                                    value={caption}
                                                    onChange={(e) => setCaption(e.target.value)}
                                                    placeholder="Digite a legenda aqui..."
                                                    className="w-full h-40 px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-700 focus:border-purple-400 outline-none transition-all resize-none leading-relaxed"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                            <span className="text-[10px] text-purple-600 font-black uppercase tracking-[0.2em]">SELEÇÃO_DE_CAPA</span>
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                        </div>

                                        <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-thin">
                                            {suggestedFrames.map((frame, i) => (
                                                <div 
                                                    key={i} 
                                                    onClick={() => {
                                                        setThumbnailUrl(frame);
                                                        setThumbOffset(i * 1000);
                                                    }}
                                                    className={`w-40 aspect-[9/16] flex-shrink-0 border-4 transition-all cursor-pointer rounded-2xl overflow-hidden bg-gray-900 ${
                                                        thumbnailUrl === frame ? 'border-purple-500 shadow-xl' : 'border-transparent opacity-60 hover:opacity-100'
                                                    }`}
                                                >
                                                    <img src={frame} className="w-full h-full object-cover" alt={`Frame ${i}`} />
                                                </div>
                                            ))}
                                            
                                            <div 
                                                onClick={() => thumbInputRef.current?.click()}
                                                className="w-40 aspect-[9/16] flex-shrink-0 border-2 border-dashed border-gray-200 hover:border-purple-300 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer bg-gray-50/50 group"
                                            >
                                                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-all text-gray-400 group-hover:text-purple-600">
                                                    <Upload size={24} />
                                                </div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Upload Capa</span>
                                                <input type="file" ref={thumbInputRef} className="hidden" accept="image/*" onChange={handleThumbnailUpload} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-12">
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                            <span className="text-[10px] text-purple-600 font-black uppercase tracking-[0.2em]">PARÂMETROS_DISTRIBUIÇÃO</span>
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            {[
                                                { label: 'MOSTRAR NO FEED', active: shareToFeed, toggle: () => setShareToFeed(!shareToFeed) },
                                                { label: 'PERMITIR COMENTÁRIOS', active: allowComments, toggle: () => setAllowComments(!allowComments) },
                                                { label: 'PERMITIR EMBEDDING', active: allowEmbedding, toggle: () => setAllowEmbedding(!allowEmbedding) }
                                            ].map((item, idx) => (
                                                <button key={idx} onClick={item.toggle} className="flex items-center justify-between p-6 bg-gray-50/50 border border-gray-100 hover:border-purple-100 rounded-2xl transition-all text-left group">
                                                    <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">{item.label}</span>
                                                    <div className={`w-12 h-6 rounded-full transition-all relative ${item.active ? 'bg-purple-600 shadow-lg shadow-purple-100' : 'bg-gray-200'}`}>
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${item.active ? 'left-7' : 'left-1'}`}></div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="p-8 bg-purple-50 border border-purple-100 rounded-2xl flex items-start gap-5">
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-purple-600">
                                            <ShieldCheck size={24} />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-black text-purple-600 uppercase tracking-widest">VERIFICAÇÃO DE COPYRIGHT: OK</p>
                                            <p className="text-xs text-gray-600 leading-relaxed font-medium">Nenhuma infração de áudio detectada. O conteúdo está pronto para distribuição no Instagram.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-[420px] bg-gray-50 border-l border-gray-100 p-10 flex flex-col gap-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] text-purple-600 font-black uppercase tracking-widest flex items-center gap-2">
                                    <StatusPulse active={isPlaying} /> PREVIEW DO REEL
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">9:16</span>
                            </div>
                            
                            <div className="bg-gray-900 border border-gray-200 shadow-2xl rounded-3xl overflow-hidden flex flex-col aspect-[9/16] relative group/preview">
                                <video 
                                    ref={videoRef}
                                    src={videoUrl} 
                                    className="w-full h-full object-cover" 
                                    muted={isMuted} 
                                    autoPlay 
                                    loop 
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                />
                                
                                <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-gray-900/80 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-4">
                                            <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-purple-400 transition-colors">
                                                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                                            </button>
                                            <button onClick={() => { if(videoRef.current) videoRef.current.currentTime = 0; }} className="text-white hover:text-purple-400">
                                                <RotateCcw size={22} />
                                            </button>
                                        </div>
                                        <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-purple-400">
                                            {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                                        </button>
                                    </div>
                                    <div className="h-1.5 bg-white/20 w-full rounded-full overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-purple-500" 
                                            initial={{ width: "0%" }}
                                            animate={{ width: isPlaying ? "100%" : "0%" }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                        ></motion.div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => { 
                                    onSave(video.id, { title, caption, shareToFeed, allowComments, allowEmbedding, thumbnailUrl, thumbOffset }); 
                                    onClose(); 
                                }}
                                className="w-full py-5 mt-auto bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-purple-100 hover:shadow-purple-200 transition-all active:scale-95 flex items-center justify-center gap-3"
                            >
                                <Send size={18} /> ATUALIZAR CONTEÚDO
                            </button>
                        </div>
                </div>
            </div>
        </motion.div>
    </div>
    );
};

const InstagramAutomationPage: React.FC<InstagramAutomationPageProps> = ({ setActiveTab }) => {
    const { showAlert, showConfirm } = useAlert();
    const { shopeeAffiliateSettings } = useProducts();
    
    // Core State
    const [sendMode, setSendMode] = useState<'reels' | 'manual' | 'stories' | 'auto'>('reels');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [videos, setVideos] = useState<any[]>([]);
    const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
    const [showAccountSelector, setShowAccountSelector] = useState(false);
    const [globalAspectRatio, setGlobalAspectRatio] = useState('9:16');
    
    // Upload State
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showUploadChoice, setShowUploadChoice] = useState(false);
    const [lastUploadedCount, setLastUploadedCount] = useState(0);
    const [lastUploadedIds, setLastUploadedIds] = useState<number[]>([]);

    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'draft' | 'automated' | 'one_per_week'>('draft');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '12:00', '15:00', '18:00']);
    const [randomVariation, setRandomVariation] = useState(10);
    const [plannedTasks, setPlannedTasks] = useState<any[]>([]);

    const loadPlannedTasks = async () => {
        try {
            const res = await api.get('/automation/planned-tasks?platform=instagram');
            if (res.data && res.data.success) {
                setPlannedTasks(res.data.tasks || []);
            }
        } catch (e) {
            console.error('Failed to load planned tasks', e);
        }
    };

    useEffect(() => {
        loadPlannedTasks();
    }, []);

    // Manual Post State
    const [postType, setPostType] = useState<'feed' | 'story'>('feed');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualMessage, setManualMessage] = useState('');
    const [manualLoading, setManualLoading] = useState(false);

    // Editor State
    const [editingVideo, setEditingVideo] = useState<any>(null);
    const [showEditorModal, setShowEditorModal] = useState(false);

    // Shopee State
    const [shopeeCategories, setShopeeCategories] = useState<any[]>([]);
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const [productCount, setProductCount] = useState(5);
    const [categoryType, setCategoryType] = useState('random');
    const [mediaType, setMediaType] = useState<'auto' | 'image' | 'video'>('auto');
    const [shopeePostType, setShopeePostType] = useState<'feed' | 'story' | 'reels'>('feed');
    const [messageTemplate, setMessageTemplate] = useState(`🚨 *PROMOÇÃO NO INSTAGRAM*

{nome_produto}

🔴 *DE:* R$ {preco_original}
🟢 *SOMENTE HOJE:* R$ {preco_com_desconto}

⭐ (Bem Avaliado)

🛒 *Compre aqui:* 👇
{link}`);

    // Feedback State
    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);
    const [accountInsights, setAccountInsights] = useState<any>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [processLogs, setProcessLogs] = useState<string[]>([]);
    const [isTrial, setIsTrial] = useState(false); // Trial Reels Support
    const logContainerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [processLogs]);

    const addLog = (msg: string) => {
        setProcessLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`].slice(-6));
    };

    const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        showAlert(message, type);
    };

    const loadAccounts = async () => {
        try {
            const response = await api.get('/instagram/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    const activeAccount = response.data.accounts.find((acc: any) => acc.enabled);
                    setSelectedAccountId(activeAccount ? activeAccount.id : response.data.accounts[0].id);
                }
            }
        } catch (error) { console.error(error); }
    };

    const loadQueue = async () => {
        try {
            const response = await api.get('/instagram/queue?status=pending');
            if (response.data.success) setVideos(response.data.queue || []);
        } catch (error) { console.error(error); }
    };

    const loadShopeeCategories = async () => {
        try {
            const response = await api.get('/shopee/categories?onlyActive=true');
            if (response.data.success) {
                setShopeeCategories(response.data.categories);
            }
        } catch (error) {
            console.error('Error loading shopee categories:', error);
        }
    };

    useEffect(() => {
        loadAccounts();
        loadQueue();
        loadShopeeCategories();
    }, []);

    useEffect(() => {
        if (selectedAccountId) {
            fetchAccountInsights();
        }
    }, [selectedAccountId]);

    const fetchAccountInsights = async () => {
        setLoadingInsights(true);
        try {
            const response = await api.get(`/api/instagram/account-insights/${selectedAccountId}`);
            if (response.data.success) {
                setAccountInsights(response.data.insights);
            }
        } catch (error) {
            console.error('Error fetching account insights:', error);
        } finally {
            setLoadingInsights(false);
        }
    };

    const toggleAccount = async (accountId: string) => {
        try {
            const acc = accounts.find(a => a.id === accountId);
            if (!acc) return;
            const isEnabling = !acc.enabled;
            const response = await api.post(`/instagram/accounts/${accountId}/toggle`, { enabled: isEnabling });
            if (response.data.success) {
                setAccounts(accounts.map(a => ({ ...a, enabled: a.id === accountId })));
                setSelectedAccountId(accountId);
                showNotification(`Conta "${acc.username}" selecionada`, 'success');
            }
        } catch (error) {
            showNotification('Erro ao alternar conta', 'error');
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setUploading(true);
        setUploadProgress(0);

        const files = Array.from(e.target.files);
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        try {
            const response = await api.post('/instagram/upload', formData, {
                onUploadProgress: (p) => setUploadProgress(Math.round((p.loaded * 100) / (p.total || 1))),
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.success) {
                const newIds = response.data.files?.map((f: any) => f.id) || [];
                setLastUploadedCount(files.length);
                setLastUploadedIds(newIds);
                setShowUploadChoice(true);
                loadQueue();
            }
        } catch (error) {
            showNotification('Erro no upload', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleUpdateVideo = async (id: number, data: any) => {
        try {
            const response = await api.put(`/instagram/queue/${id}`, data);
            if (response.data.success) {
                setVideos(videos.map(v => v.id === id ? { ...v, ...data } : v));
                showNotification('Atualizado com sucesso', 'success');
            }
        } catch (error) { showNotification('Erro ao atualizar', 'error'); }
    };

    const handleDelete = async (id: number) => {
        try {
            const response = await api.delete(`/instagram/queue/${id}`);
            if (response.data.success) {
                setVideos(videos.filter(v => v.id !== id));
                setSelectedVideos(selectedVideos.filter(rid => rid !== id));
            }
        } catch (error) { showNotification('Erro ao remover', 'error'); }
    };

    const handleBulkAction = async (action: 'clear' | 'schedule' | 'publish', accountIdOverride?: string, targetIdsOverride?: number[]) => {
        if (action === 'clear') {
            showConfirm({
                title: 'Limpar Fila',
                message: 'Deseja realmente limpar todos os itens?',
                onConfirm: async () => {
                    try {
                        await api.delete('/instagram/queue/all');
                        setVideos([]);
                        setSelectedVideos([]);
                        showNotification('Fila limpa', 'success');
                    } catch (error) { showNotification('Erro ao limpar', 'error'); }
                }
            });
            return;
        }

        const targetIds = targetIdsOverride || (selectedVideos.length > 0 ? selectedVideos : videos.map(v => v.id));
        if (targetIds.length === 0) return showNotification('Nenhum item para processar', 'info');

        if (action === 'publish') {
            const accId = accountIdOverride || selectedAccountId;
            if (!accId) return showNotification('Nenhuma conta selecionada', 'error');

            setSendingStatus({ active: true, current: 0, total: targetIds.length, success: 0, failed: 0 });
        setProcessLogs([]);
        addLog('Iniciando protocolo de postagem...');
            setProcessLogs([]);
            addLog('Iniciando protocolo de postagem...');
            addLog('Autenticando sessão do Instagram...');
            
            for (let i = 0; i < targetIds.length; i++) {
                try {
                    const response = await api.post(`/instagram/post-from-queue/${targetIds[i]}`, { accountId: accId, isTrial: isTrial });
                    if (response.data.success) {
                        setSendingStatus(prev => prev ? { ...prev, current: i + 1, success: prev.success + 1 } : null);
                        addLog(`✔ Postagem ${i + 1}/${targetIds.length} concluída`);
                    } else {
                        setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                        addLog(`✖ Falha na postagem ${i + 1}: ${response.data.error || 'Erro desconhecido'}`);
                    }
                } catch (error: any) {
                    setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                    addLog(`✖ Erro de rede na postagem ${i + 1}`);
                }
                // Delay between posts
                if (i < targetIds.length - 1) await new Promise(r => setTimeout(r, 10000));
            }
            loadQueue();
            showNotification('Finalizado', 'success');
        }
    };

    const handleScheduleShopee = async () => {
        if (!shopeeAffiliateSettings.appId) return showNotification('❌ Configure a Shopee na tela principal do afiliado primeiro', 'error');
        if (!selectedAccountId) return showNotification('❌ Selecione a conta do Instagram', 'error');
        if (!automationEnabled) return showNotification('❌ Ative a chave de agendamento automático primeiro', 'error');

        try {
            const response = await api.post('/instagram/schedule', {
                accountId: selectedAccountId,
                shopeeSettings: shopeeAffiliateSettings,
                messageTemplate: messageTemplate,
                schedule: {
                    frequency: 'daily',
                    time: customTimes[0] || '12:00',
                    times: customTimes,
                    scheduleMode: 'multiple',
                    productCount,
                    enabled: true,
                    randomVariation
                },
                categoryType,
                postType: shopeePostType,
                mediaType,
                isTrial: isTrial // Pass trial flag to scheduler
            });
            
            if (response.data.success) {
                showNotification('✅ Programação da Shopee salva com sucesso!', 'success');
            } else {
                showNotification(`❌ Erro: ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification(`❌ Erro ao salvar programação: ${error.message}`, 'error');
        }
    };

    const handleManualPost = async () => {
        if (!selectedAccountId || !manualImageUrl) return showNotification('Dados incompletos', 'error');
        setManualLoading(true);
        try {
            await api.post('/instagram/post-now', {
                sendMode: 'manual', postType, manualImageUrl, manualMessage, accountId: selectedAccountId, isTrial: isTrial
            });
            showNotification('Postagem manual enviada!', 'success');
            setManualImageUrl('');
            setManualMessage('');
        } catch (error) { showNotification('Erro ao postar', 'error'); }
        finally { setManualLoading(false); }
    };

    const handleRunShopeeNow = async () => {
        if (!shopeeAffiliateSettings.appId) return showNotification('❌ Configure a Shopee na tela principal do afiliado primeiro', 'error');
        if (!selectedAccountId) return showNotification('❌ Selecione a conta do Instagram', 'error');
        showConfirm({
            title: 'Confirmar Disparo',
            message: `Deseja enviar ${productCount} produtos da Shopee agora para a conta do Instagram selecionada?`,
            onConfirm: async () => {
                setManualLoading(true);
                const taskId = `ig_auto_${Date.now()}`;
                setSendingStatus({ active: true, current: 0, total: productCount, success: 0, failed: 0 });
                setProcessLogs([]);
                addLog('Iniciando disparador Shopee...');
                addLog('Buscando produtos em destaque...');

                const progressInterval = setInterval(async () => {
                    try {
                        const res = await api.get(`/progress/${taskId}`);
                        if (res.data.success && res.data.progress) {
                            setSendingStatus(prev => prev ? {
                                ...prev,
                                ...res.data.progress,
                                active: res.data.progress.active !== false
                            } : null);

                            if (res.data.progress.logs) {
                                setProcessLogs(res.data.progress.logs);
                            }
                        }
                    } catch (err) {}
                }, 1500);

                try {
                    const response = await api.post('/instagram/post-now', {
                        accountId: selectedAccountId,
                        shopeeSettings: shopeeAffiliateSettings,
                        productCount,
                        messageTemplate,
                        categoryType,
                        sendMode: 'auto',
                        postType: shopeePostType,
                        taskId,
                        mediaType,
                        isTrial: isTrial // Pass trial flag to immediate run
                    });
                    
                    if (response.data.success) {
                        showNotification('✅ Postagem da Shopee concluída com sucesso!', 'success');
                        addLog('✔ Disparo Shopee concluído com sucesso');
                    } else {
                        showNotification(`❌ Erro: ${response.data.error || 'Erro desconhecido'}`, 'error');
                        addLog(`✖ Erro no disparo: ${response.data.error}`);
                    }
                } catch (error: any) {
                    showNotification(`❌ Erro ao disparar produtos: ${error.message}`, 'error');
                    addLog(`✖ Erro crítico: ${error.message}`);
                } finally {
                    clearInterval(progressInterval);
                    setManualLoading(true);
                    addLog('🏁 Protocolo finalizado');
                    setSendingStatus(prev => prev ? { ...prev, active: false } : null);
                    setTimeout(() => {
                        setManualLoading(false);
                    }, 4000);
                }
            }
        });
    };

    const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setManualLoading(true);
        const formData = new FormData();
        formData.append('files', e.target.files[0]);
        try {
            const response = await api.post('/instagram/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success && response.data.files?.[0]) {
                setManualImageUrl(response.data.files[0].url);
                showNotification('Arquivo carregado!', 'success');
            }
        } catch (error) { showNotification('Erro no upload', 'error'); }
        finally { setManualLoading(false); }
    };

    return (
        <div className="min-h-screen bg-white pb-32">
            {/* Sending Status Overlay */}
            {sendingStatus && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-gray-900/80 backdrop-blur-xl" 
                    />
                    
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        className="relative bg-white/95 backdrop-blur-md w-full max-w-2xl p-8 lg:p-12 rounded-[32px] shadow-[0_32px_120px_-20px_rgba(124,58,237,0.3)] border border-white/20 overflow-hidden"
                    >
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-32 -mt-32" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-32 -mb-32" />

                        <div className="relative z-10 space-y-8">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-3xl font-black text-gray-900 tracking-tighter flex items-center gap-3">
                                        EXECUTANDO_PROTOCOLO
                                        {sendingStatus.active && (
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em] mt-1">Sincronização Ativa com Instagram</p>
                                </div>
                                <div className="text-right">
                                    <div className="inline-flex flex-col items-end px-5 py-2 bg-purple-600 rounded-2xl shadow-lg shadow-purple-200 border border-purple-500 animate-pulse">
                                        <span className="text-[10px] font-black text-purple-100 uppercase tracking-widest leading-none">NA FILA</span>
                                        <span className="text-sm font-black text-white mt-1">
                                            {sendingStatus.total - sendingStatus.current} RESTANTES
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Progress Section */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status do Processamento</span>
                                    <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                                        {Math.round((sendingStatus.current / (sendingStatus.total || 1)) * 100)}%
                                    </span>
                                </div>
                                <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden relative border border-gray-200 shadow-inner">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(sendingStatus.current / (sendingStatus.total || 1)) * 100}%` }}
                                        className="h-full rounded-full bg-gradient-to-r from-purple-600 via-blue-500 to-blue-400 relative z-10 transition-all duration-1000 ease-out"
                                    >
                                        <div className="absolute inset-0 bg-white/30 animate-[shimmer_1.5s_infinite] -skew-x-12" />
                                        <div className="absolute inset-0 shadow-[0_0_20px_rgba(124,58,237,0.5)]" />
                                    </motion.div>
                                    {/* Waves Animation Behind */}
                                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] animate-pulse" />
                                </div>
                            </div>

                            {/* Terminal Logs */}
                            <div className="bg-gray-900 rounded-2xl p-6 font-mono text-[11px] space-y-2 border border-gray-800 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                                <div className="flex items-center gap-2 mb-4 text-gray-500 border-b border-gray-800 pb-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500" />
                                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <span className="ml-2 uppercase tracking-widest text-[9px] font-bold">TERMINAL_OUTPUT</span>
                                </div>
                                <div ref={logContainerRef} className="h-28 overflow-y-auto custom-scrollbar space-y-1.5">
                                    {processLogs.length === 0 && <div className="text-gray-600 animate-pulse">AGUARDANDO INICIALIZAÇÃO DO PROTOCOLO...</div>}
                                    {processLogs.map((log, i) => (
                                        <motion.div 
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`${log.includes('✔') ? 'text-green-400' : log.includes('✖') ? 'text-red-400' : 'text-blue-300'}`}
                                        >
                                            <span className="text-gray-600">[{i}]</span> {log}
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100 hover:scale-105 transition-transform cursor-default group">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors"><Check size={12} className="text-green-600" /></div>
                                        <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Sucesso</span>
                                    </div>
                                    <span className="text-2xl font-black text-green-700">{sendingStatus.success}</span>
                                </div>
                                <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100 hover:scale-105 transition-transform cursor-default group">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors"><AlertCircle size={12} className="text-red-600" /></div>
                                        <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Falhas</span>
                                    </div>
                                    <span className="text-2xl font-black text-red-700">{sendingStatus.failed}</span>
                                </div>
                                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 hover:scale-105 transition-transform cursor-default group">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors"><RefreshCw size={12} className="text-blue-600 animate-spin" /></div>
                                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Ativos</span>
                                    </div>
                                    <span className="text-2xl font-black text-blue-700">{sendingStatus.active ? 1 : 0}</span>
                                </div>
                                <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 hover:scale-105 transition-transform cursor-default group">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors"><Clock size={12} className="text-purple-600" /></div>
                                        <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest">Restante</span>
                                    </div>
                                    <span className="text-2xl font-black text-purple-700">~{Math.max(0, (sendingStatus.total - sendingStatus.current) * 2)}s</span>
                                </div>
                            </div>

                            {/* Footer Action */}
                            <div className="pt-4 flex justify-center">
                                {sendingStatus.active ? (
                                    <button disabled className="w-full py-5 bg-gray-100 text-gray-400 font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl flex items-center justify-center gap-3 cursor-not-allowed">
                                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                                        EXECUTANDO_PROTOCOLO_AUTOMÁTICO...
                                    </button>
                                ) : (
                                    <motion.button 
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setSendingStatus(null)}
                                        className="w-full py-5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-black text-xs uppercase tracking-[0.3em] rounded-2xl shadow-[0_10px_40px_-10px_rgba(124,58,237,0.5)] flex items-center justify-center gap-3"
                                    >
                                        CONCLUIR_E_REVISAR_DADOS
                                    </motion.button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Tactical Header */}
            <div className="bg-white border-b border-gray-200 p-12 relative overflow-visible">
                <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-b-[40px]">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                </div>
                <div className="max-w-[1400px] mx-auto relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
                    <div className="text-center lg:text-left">
                        <div className="flex items-center justify-center lg:justify-start gap-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/20">
                                <Instagram size={40} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black tracking-tight text-gray-900">
                                    Centro<span className="text-purple-600">_de_Controle</span>
                                </h1>
                                <p className="text-gray-400 mt-1 text-sm font-bold uppercase tracking-widest">PROTOCOLO ALGORÍTMICO INSTAGRAM</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-center lg:items-end gap-6 w-full lg:w-auto">
                        <div className="bg-gray-50 p-2 border border-gray-100 rounded-2xl flex gap-2 w-full lg:w-auto overflow-x-auto shadow-inner">
                            {['9:16', '1:1', '4:5'].map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => setGlobalAspectRatio(ratio)}
                                    className={`flex-1 lg:flex-none flex flex-col items-center gap-2 px-6 py-4 transition-all duration-300 rounded-xl ${
                                        globalAspectRatio === ratio 
                                        ? 'bg-white text-purple-600 shadow-md' 
                                        : 'text-gray-400 hover:text-purple-600 hover:bg-white/50'
                                    }`}
                                >
                                    <RatioIcon ratio={ratio} active={globalAspectRatio === ratio} size="sm" />
                                    <span className="text-[10px] font-black">{ratio}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-4 w-full lg:w-96">
                            <div className="flex-1 relative">
                                <button
                                    onClick={() => setShowAccountSelector(!showAccountSelector)}
                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-200 text-gray-900 font-bold text-xs outline-none focus:border-purple-400 cursor-pointer flex items-center justify-between rounded-2xl uppercase tracking-widest transition-all hover:bg-white hover:shadow-lg hover:shadow-gray-200/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${accounts.find(a => a.enabled) ? 'bg-green-500 shadow-lg shadow-green-200 animate-pulse' : 'bg-gray-300'}`}></div>
                                        <span>{accounts.find(a => a.enabled)?.username || 'SELECIONAR CONTA'}</span>
                                    </div>
                                    <ChevronDown size={16} className={`transition-transform duration-300 ${showAccountSelector ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {showAccountSelector && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowAccountSelector(false)}></div>
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-[24px] shadow-2xl z-50 overflow-hidden"
                                            >
                                                <div className="p-4 bg-gray-50/50 border-b border-gray-50">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">CONTAS_IG_ATIVAS</span>
                                                </div>
                                                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                                    {accounts.map(acc => (
                                                        <button
                                                            key={acc.id}
                                                            onClick={() => { toggleAccount(acc.id); setShowAccountSelector(false); }}
                                                            className={`w-full flex items-center justify-between px-8 py-5 transition-all text-left group border-b border-gray-50 last:border-0 ${acc.enabled ? 'bg-purple-50 text-purple-600' : 'hover:bg-gray-50 text-gray-600'}`}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black uppercase tracking-widest">{acc.username}</span>
                                                                <span className="text-[8px] font-bold opacity-40">INSTAGRAM_ID: {acc.id}</span>
                                                            </div>
                                                            {acc.enabled && <CheckCircle size={16} className="text-purple-600" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Performance Dashboard */}
            <div className="max-w-[1400px] mx-auto px-6 mt-12">
                <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] p-10 shadow-2xl shadow-gray-100/50">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl">
                                <Instagram size={24} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tighter">Performance<span className="text-pink-600">_Dashboard</span></h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">LIVE_ACCOUNT_INSIGHTS_V1</p>
                            </div>
                        </div>
                        <button 
                            onClick={fetchAccountInsights}
                            className="p-3 hover:bg-gray-50 rounded-xl transition-all text-gray-400 hover:text-pink-600"
                            title="Atualizar Métricas"
                        >
                            <RefreshCw size={20} className={loadingInsights ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {loadingInsights ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-32 bg-gray-50 rounded-[2rem] animate-pulse"></div>
                            ))}
                        </div>
                    ) : accountInsights ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-pink-50/50 p-6 rounded-[2rem] border border-pink-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-pink-100 rounded-xl text-pink-600 group-hover:scale-110 transition-transform">
                                        <Eye size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-pink-600 uppercase tracking-widest">Impressões</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.impressions?.toLocaleString() || 0}</p>
                            </div>

                            <div className="bg-purple-50/50 p-6 rounded-[2rem] border border-purple-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-purple-100 rounded-xl text-purple-600 group-hover:scale-110 transition-transform">
                                        <Target size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Alcance</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.reach?.toLocaleString() || 0}</p>
                            </div>

                            <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-blue-100 rounded-xl text-blue-600 group-hover:scale-110 transition-transform">
                                        <Users size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Visitas Perfil</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.profile_views?.toLocaleString() || 0}</p>
                            </div>

                            <div className="bg-green-50/50 p-6 rounded-[2rem] border border-green-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-green-100 rounded-xl text-green-600 group-hover:scale-110 transition-transform">
                                        <Globe size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Cliques Site</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.website_clicks?.toLocaleString() || 0}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 rounded-3xl p-12 text-center border border-gray-100">
                            <Activity className="mx-auto text-gray-300 mb-4" size={48} />
                            <h4 className="text-lg font-bold text-gray-900">Aguardando dados...</h4>
                            <p className="text-sm text-gray-500 max-w-md mx-auto mt-2">
                                Selecione uma conta ou atualize para sincronizar as métricas de performance em tempo real do Instagram Graph API.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-[1400px] mx-auto px-6 py-8">
                {/* Secondary Navigation */}
                <div className="flex items-center justify-center border-b border-gray-100 mb-10 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {[
                        { id: 'reels', label: 'FEED EM MASSA', icon: Play, count: videos.length },
                        { id: 'manual', label: 'POSTAGEM MANUAL', icon: Send },
                        { id: 'stories', label: 'STORY EM MASSA', icon: Layers },
                        { id: 'auto', label: 'SHOPEE AUTOMAÇÃO', icon: Bot }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSendMode(tab.id as any)}
                            className={`flex items-center gap-3 px-8 py-5 text-[10px] font-black tracking-widest transition-all relative ${
                                sendMode === tab.id ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <tab.icon size={16} />
                            <span>{tab.label}</span>
                            {tab.count !== undefined && (
                                <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full text-[9px]">{tab.count}</span>
                            )}
                            {sendMode === tab.id && (
                                <motion.div layoutId="activeTabIG" className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="space-y-10">
                    {sendMode === 'reels' ? (
                        <div className="animate-in slide-in-from-left-8 duration-700 space-y-10">
                            <div className="bg-white border-2 border-dashed border-gray-100 p-24 text-center relative group hover:border-purple-400/50 hover:bg-purple-50/30 transition-all duration-700 cursor-pointer rounded-[40px] shadow-sm">
                                <input type="file" multiple accept="video/*,image/*" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                {uploading ? (
                                    <div className="space-y-6">
                                        <div className="w-24 h-24 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mx-auto"></div>
                                        <div className="mt-8 max-w-xs mx-auto px-4">
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                            </div>
                                            <p className="text-[10px] text-purple-600 font-black mt-3 uppercase tracking-widest">CARREGANDO... {uploadProgress}%</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-10">
                                        <div className="relative mx-auto w-24 h-24">
                                            <div className="absolute inset-0 bg-purple-50 rounded-3xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Upload size={48} className="text-purple-600 group-hover:-translate-y-2 transition-all duration-500" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">CARREGAR_FEED_EM_MASSA</h3>
                                            <p className="text-gray-600 font-black text-[10px] uppercase tracking-widest">ARRRASTE_ARQUIVOS_OU_CLIQUE_PARA_SELECIONAR</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {videos.length > 0 && (
                                <div className="bg-white border border-gray-100 shadow-2xl rounded-[40px]">
                                    <div className="bg-gray-50/50 px-10 py-6 border-b border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <Layers className="text-purple-600" size={20} />
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 mt-1">Fila_Processamento</h3>
                                        </div>
                                        <div className="flex gap-4 items-center">
                                            {/* Trial Mode Toggle (Bulk) */}
                                            <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-2xl">
                                                <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest">Modo Teste</span>
                                                <button 
                                                    onClick={() => setIsTrial(!isTrial)}
                                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all ${isTrial ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                                >
                                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isTrial ? 'translate-x-5' : 'translate-x-1'}`} />
                                                </button>
                                            </div>
                                            <button onClick={() => handleBulkAction('clear')} className="px-8 py-4 border-2 border-gray-100 text-[10px] font-black text-gray-600 hover:text-red-500 rounded-2xl uppercase tracking-widest transition-all">LIMPAR_BUFFER</button>
                                            <button onClick={() => handleBulkAction('publish')} className="px-10 py-4 bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-purple-100">EXECUTAR AGORA</button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-12 gap-6 px-10 py-6 bg-gray-50/50 border-b border-gray-100 font-black text-[10px] text-gray-400 uppercase tracking-widest">
                                        <div className="col-span-1 text-center">CHECK</div>
                                        <div className="col-span-1 text-center">MÍDIA</div>
                                        <div className="col-span-1 text-center">POS</div>
                                        <div className="col-span-3 px-4">IDENTIFICADOR</div>
                                        <div className="col-span-4 px-4">DESCRIÇÃO</div>
                                        <div className="col-span-2 text-right pr-12">AÇÕES</div>
                                    </div>

                                    <div className="divide-y divide-gray-100">
                                        {videos.map((v, i) => (
                                            <VideoRow 
                                                key={v.id} video={v} index={i} 
                                                selected={selectedVideos.includes(v.id)}
                                                onToggleSelection={() => setSelectedVideos(prev => prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id])}
                                                onUpdateVideo={handleUpdateVideo}
                                                onDelete={handleDelete}
                                                onEdit={(vid: any) => { setEditingVideo(vid); setShowEditorModal(true); }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : sendMode === 'manual' ? (
                        <div className="animate-in slide-in-from-right-8 duration-700 space-y-12">
                            <div className="max-w-4xl mx-auto flex p-2 bg-gray-50 rounded-3xl border border-gray-100 gap-2">
                                {['feed', 'story'].map(t => (
                                    <button key={t} onClick={() => setPostType(t as any)} className={`flex-1 py-6 rounded-[20px] text-[10px] font-black transition-all uppercase tracking-widest ${postType === t ? 'bg-white text-purple-600 shadow-xl' : 'text-gray-600'}`}>{t === 'feed' ? 'TIMELINE_POST' : 'STORY_POST'}</button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                                <div className="lg:col-span-7 bg-white border border-gray-100 shadow-2xl p-12 rounded-[40px] space-y-10">
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-1">MÍDIA_RECURSO</label>
                                            <div className="relative group">
                                                <input type="text" value={manualImageUrl} onChange={e => setManualImageUrl(e.target.value)} placeholder="HTTPS://IMAGEM-URL.JPG" className="w-full p-6 bg-gray-50 border border-gray-100 rounded-2xl focus:border-purple-400 outline-none text-xs" />
                                                <div className="absolute right-2 top-2 bottom-2">
                                                    <label className="h-full px-6 bg-white border border-gray-100 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black cursor-pointer shadow-sm hover:text-purple-600 transition-all">
                                                        <Upload size={14} /> CARREGAR
                                                        <input type="file" onChange={handleManualFileUpload} className="hidden" accept="image/*,video/*" />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-1">CAPTION_DE_DADOS</label>
                                            <textarea value={manualMessage} onChange={e => setManualMessage(e.target.value)} placeholder="// DIGITE A LEGENDA DO POST..." className="w-full h-64 p-8 bg-gray-50 border border-gray-100 rounded-3xl focus:border-purple-400 outline-none text-sm resize-none shadow-inner" />
                                        </div>
                                    </div>
                                        {/* Trial Mode Toggle (Manual) */}
                                        <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center justify-between mb-2">
                                            <div>
                                                <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Modo Teste (Trial Reels)</p>
                                                <p className="text-[8px] text-indigo-600 font-medium">Postar como teste (sem Feed)</p>
                                            </div>
                                            <button 
                                                onClick={() => setIsTrial(!isTrial)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${isTrial ? 'bg-indigo-600 shadow-lg shadow-indigo-100' : 'bg-gray-200'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTrial ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>

                                        <button onClick={handleManualPost} disabled={manualLoading} className="w-full py-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs uppercase tracking-widest rounded-3xl shadow-xl hover:shadow-purple-200 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">
                                        <Send size={18} /> EXECUTAR_PUBLICAÇÃO_IG
                                    </button>
                                </div>

                                <div className="lg:col-span-5 space-y-6">
                                    <div className="flex items-center justify-between px-2 text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-purple-600 flex items-center gap-2"><StatusPulse active={!!manualImageUrl} /> LIVE_PREVIEW</span>
                                        <span className="text-gray-400">{postType === 'feed' ? 'INSTAGRAM_TIMELINE' : 'INSTAGRAM_STORY'}</span>
                                    </div>
                                    <div className={`bg-white border border-gray-100 shadow-2xl rounded-[32px] overflow-hidden flex flex-col relative ${postType === 'story' ? 'aspect-[9/16]' : 'aspect-square'}`}>
                                        {manualImageUrl ? (
                                            manualImageUrl.match(/\.(mp4|webm|ogg)$/i) || manualImageUrl.includes('video') ? (
                                                <video src={manualImageUrl} className="w-full h-full object-cover" autoPlay loop muted />
                                            ) : (
                                                <img src={manualImageUrl} className="w-full h-full object-cover" alt="Preview" />
                                            )
                                        ) : (
                                            <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center gap-4 text-gray-300">
                                                <ImageIcon size={48} strokeWidth={1} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">AGUARDANDO_DADOS</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/30"></div>
                                                <div className="w-24 h-2 bg-white/40 rounded-full"></div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="w-full h-2 bg-white/30 rounded-full"></div>
                                                <div className="w-2/3 h-2 bg-white/20 rounded-full"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : sendMode === 'stories' ? (
                        <StorySchedulerPage platform="instagram" accounts={accounts} />
                    ) : (
                        <div className="animate-in fade-in duration-1000 space-y-12">
                            <CommandCard className="p-12">
                                <div className="flex items-center justify-between mb-12 border-b border-gray-50 pb-10">
                                    <div className="flex items-center gap-6">
                                        <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-purple-200">
                                            <Bot size={40} strokeWidth={1.5} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">Afiliado<span className="text-purple-600">_Shopee_IG</span></h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">AUTOMAÇÃO DE EXTRAÇÃO E POSTAGEM DE OFERTAS PARA INSTAGRAM</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className={`px-4 py-2 rounded-full border flex items-center gap-2 transition-all ${automationEnabled ? 'bg-green-50 border-green-100 text-green-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                            <StatusPulse active={automationEnabled} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{automationEnabled ? 'SISTEMA_ATIVO' : 'SISTEMA_OFFLINE'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                                    {/* Coluna de Configurações */}
                                    <div className="lg:col-span-7 space-y-10">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Produtos por Postagem (Lote)</label>
                                            <select
                                                value={productCount}
                                                onChange={(e) => setProductCount(parseInt(e.target.value))}
                                                className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-purple-400 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                                            >
                                                {[1, 2, 3, 4, 5, 10, 15, 20].map(n => (
                                                    <option key={n} value={n}>{n} produtos por vez</option>
                                                ))}
                                            </select>
                                            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black flex items-center gap-2">
                                                <Clock size={12} className="text-purple-500" /> CADA HORÁRIO DISPARARÁ O ENVIO DOS PRODUTOS.
                                            </p>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria de Produtos</label>
                                            <select
                                                value={categoryType}
                                                onChange={(e) => setCategoryType(e.target.value)}
                                                className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-purple-400 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                                            >
                                                <option value="random">ALEATÓRIO</option>
                                                <option value="best_sellers">MAIS VENDIDOS</option>
                                                {shopeeCategories.map((cat: any) => (
                                                    <option key={cat.slug} value={cat.slug}>{cat.name.toUpperCase()}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Posicionamento (Onde Postar)</label>
                                            <div className="flex bg-gray-50 p-1 border border-gray-100 rounded-2xl">
                                                {[
                                                    { id: 'feed', label: 'POSTAGEM FEED' },
                                                    { id: 'reels', label: 'INSTAGRAM REELS' },
                                                    { id: 'story', label: 'STORY DA CONTA' }
                                                ].map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => setShopeePostType(t.id as any)}
                                                        className={`flex-1 py-4 text-[10px] font-black transition-all uppercase tracking-widest rounded-xl ${shopeePostType === t.id ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'}`}
                                                    >
                                                        {t.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black flex items-center gap-2">
                                                <Info size={12} className="text-purple-500" /> REELS E STORIES ACEITAM VÍDEOS DOS PRODUTOS.
                                            </p>
                                        </div>

                                        {/* Trial Mode Toggle */}
                                        <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-[2rem] flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-white text-indigo-600 rounded-2xl shadow-sm">
                                                    <Play size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-indigo-900 uppercase tracking-widest">Modo Teste (Trial Reels)</p>
                                                    <p className="text-[10px] text-indigo-600 font-medium mt-0.5">Postar sem distribuir no Feed principal para evitar 0 views.</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setIsTrial(!isTrial)}
                                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 ${isTrial ? 'bg-indigo-600 shadow-lg shadow-indigo-200' : 'bg-gray-200'}`}
                                            >
                                                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${isTrial ? 'translate-x-7' : 'translate-x-1'} shadow-md`} />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tipo de Mídia (Preferência)</label>
                                            <select
                                                value={mediaType}
                                                onChange={(e) => setMediaType(e.target.value as any)}
                                                className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-purple-400 outline-none transition-all appearance-none cursor-pointer hover:bg-white"
                                            >
                                                <option value="auto">QUALQUER (Vídeo se houver)</option>
                                                <option value="image">APENAS IMAGEM</option>
                                                <option value="video">APENAS VÍDEO</option>
                                            </select>
                                            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black flex items-center gap-2">
                                                <Bot size={12} className="text-purple-500" /> CONTROLA O QUE SERÁ EXTRAÍDO DA SHOPEE.
                                            </p>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Template de Legenda</label>
                                            <textarea
                                                value={messageTemplate}
                                                onChange={(e) => setMessageTemplate(e.target.value)}
                                                className="w-full h-40 p-8 bg-gray-50 border border-gray-100 rounded-[32px] font-bold text-xs text-gray-900 focus:border-purple-400 outline-none transition-all resize-none shadow-inner"
                                                placeholder="🔥 MEGA OFERTA: {product_name} \n🛒 Compre aqui: {product_link}"
                                            />
                                        </div>
                                    </div>

                                    {/* Coluna de Ações */}
                                    <div className="lg:col-span-5 space-y-12">
                                        <div className="p-10 bg-gray-50 border border-gray-100 rounded-[40px] space-y-8 shadow-inner">
                                            <div>
                                                <h3 className="font-black text-gray-900 text-sm uppercase tracking-widest">Postagem Rápida</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Posta agora na conta do Instagram selecionada</p>
                                            </div>

                                            <TacticalButton 
                                                onClick={handleRunShopeeNow}
                                                className="w-full py-8 !rounded-3xl flex items-center justify-center gap-3 shadow-xl hover:shadow-purple-200 transition-all active:scale-95"
                                            >
                                                <PlayCircle size={22} fill="currentColor" /> EXECUTAR DISPARO AGORA
                                            </TacticalButton>
                                        </div>

                                        <div className="p-10 bg-white border border-gray-100 rounded-[40px] space-y-8 shadow-xl relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-purple-500/10 transition-all"></div>
                                            
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <h3 className="font-black text-gray-900 text-sm uppercase tracking-widest flex items-center gap-2">
                                                        <Calendar size={18} className="text-purple-600" /> Agendamento Automático
                                                    </h3>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Busca e posta produtos nos horários programados</p>
                                                </div>
                                                <button 
                                                    onClick={() => setAutomationEnabled(!automationEnabled)}
                                                    className={`w-16 h-9 rounded-full transition-all flex items-center px-1.5 shadow-inner ${automationEnabled ? 'bg-purple-600' : 'bg-gray-200'}`}
                                                >
                                                    <motion.div 
                                                        animate={{ x: automationEnabled ? 28 : 0 }}
                                                        className={`w-6 h-6 rounded-full bg-white shadow-lg transition-all`} 
                                                    />
                                                </button>
                                            </div>

                                            <AnimatePresence>
                                                {automationEnabled && (
                                                    <motion.div 
                                                        initial={{ height: 0, opacity: 0 }} 
                                                        animate={{ height: 'auto', opacity: 1 }} 
                                                        exit={{ height: 0, opacity: 0 }} 
                                                        className="space-y-8 pt-4 overflow-hidden"
                                                    >
                                                        <div className="space-y-6">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Configuração de Horários</label>
                                                                    <button 
                                                                        onClick={() => setCustomTimes(["11:00", "15:00", "18:00", "20:00", "22:00"].sort())}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95"
                                                                    >
                                                                        <Zap size={10} fill="currentColor" /> Sugerir Horários
                                                                    </button>
                                                                </div>
                                                                <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-4 py-2 rounded-xl border border-purple-100 uppercase tracking-wider">{customTimes.length} POSTAGENS POR DIA</span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-3">
                                                                {customTimes.map((time, idx) => (
                                                                    <div key={idx} className="bg-gray-50 px-4 py-3 rounded-2xl border border-gray-100 flex items-center gap-3 group/time">
                                                                        <span className="text-xs font-black text-gray-700">{time}</span>
                                                                        <button onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500 transition-colors">
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                <div className="relative">
                                                                    <input 
                                                                        type="time" 
                                                                        onChange={(e) => {
                                                                            if (e.target.value && !customTimes.includes(e.target.value)) {
                                                                                setCustomTimes([...customTimes, e.target.value].sort());
                                                                            }
                                                                        }}
                                                                        className="w-10 h-10 opacity-0 absolute inset-0 cursor-pointer z-10"
                                                                    />
                                                                    <div className="w-10 h-10 bg-white border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-600 transition-all">
                                                                        <Plus size={18} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-4 pt-4 border-t border-purple-50">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Variação Aleatória (Anti-Detecção)</label>
                                                                    <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">± {randomVariation} min</span>
                                                                </div>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max="30" 
                                                                    value={randomVariation}
                                                                    onChange={(e) => setRandomVariation(Number(e.target.value))}
                                                                    className="w-full h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                                                />
                                                                <p className="text-[9px] text-gray-400 uppercase font-bold">O sistema variará o horário base em até {randomVariation} minutos para simular comportamento humano.</p>
                                                            </div>

                                                            {plannedTasks.length > 0 && (
                                                                <div className="space-y-3 pt-4 border-t border-purple-50">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                                        <Activity size={12} className="text-purple-500" /> Próximas Postagens Planejadas
                                                                    </label>
                                                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                                        {plannedTasks.map((t, i) => (
                                                                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] font-black text-gray-700">{new Date(t.planned_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                                    <span className="text-[8px] font-bold text-gray-400 uppercase">{new Date(t.planned_time).toLocaleDateString()}</span>
                                                                                </div>
                                                                                <span className="text-[8px] font-black px-2 py-1 bg-purple-100 text-purple-600 rounded-md uppercase tracking-wider">{t.status}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <TacticalButton 
                                                            onClick={handleScheduleShopee}
                                                            className="w-full !py-6 !bg-purple-50 !text-purple-600 border border-purple-100 hover:!bg-purple-100 transition-all !shadow-none"
                                                        >
                                                            SALVAR PROGRAMAÇÃO_SINC
                                                        </TacticalButton>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>
                            </CommandCard>
                        </div>
                    )}
                </div>
            </div>

            <ReelEditorModal 
                isOpen={showEditorModal} 
                video={editingVideo} 
                onClose={() => setShowEditorModal(false)} 
                onSave={handleUpdateVideo}
            />

            <PostUploadChoiceModal
                isOpen={showUploadChoice}
                onClose={() => setShowUploadChoice(false)}
                onConfirm={({ accountId }) => {
                    setShowUploadChoice(false);
                    handleBulkAction('publish', accountId ? String(accountId) : undefined, lastUploadedIds);
                }}
                itemCount={lastUploadedCount}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                platform="instagram"
            />
        </div>
    );
};

export default InstagramAutomationPage; // Build: 2026-05-12T14:31:00

