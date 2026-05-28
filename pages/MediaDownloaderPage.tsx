import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
    Download, Link as LinkIcon, Instagram, Facebook, Video, Image as ImageIcon,
    Loader2, AlertCircle, CheckCircle2, Send, X, MessageSquare,
    Calendar, Clock, Trash2, RefreshCw, Play, List, ChevronDown, ChevronLeft, ChevronRight, Plus, Users, Copy, Check, Sparkles, Tag, Globe,
    Layout, Camera, Music, Youtube
} from 'lucide-react';
import api from '../services/api';
import { useProducts } from '../context/ProductContext';
import { useAlert } from '../context/AlertContext';
import { generateAffiliateLink, searchShopeeAffiliateProducts } from '../services/shopeeService';

interface MediaInfo { title: string; thumbnail: string; mediaUrl: string; mediaUrls?: string[]; type: 'video' | 'image' | 'carousel'; platform: string; sourceUrl: string; }
interface SocialAccount { 
    id: string; 
    name: string; 
    username?: string; 
    platform: 'instagram' | 'facebook' | 'whatsapp' | 'telegram' | 'twitter' | 'threads' | 'tiktok'; 
    account_id?: string;
    groupId?: string;
    groupName?: string;
}
interface ScheduledPost { id: number; source_url: string; media_type: string; platform: string; account_id: string; account_name?: string; caption: string; scheduled_at: string; status: string; error_message?: string; is_trial?: boolean; comment_link_in_post?: boolean; shopee_link?: string; }

// Selected account = platform + id combo
interface SelectedAccount { platform: 'instagram' | 'facebook' | 'whatsapp' | 'telegram' | 'twitter' | 'threads' | 'tiktok'; accountId: string; name: string; }

const statusColor: Record<string, string> = {
    pending: 'text-yellow-600 bg-yellow-50',
    processing: 'text-blue-600 bg-blue-50',
    completed: 'text-green-600 bg-green-50',
    failed: 'text-red-600 bg-red-50',
};

const MediaDownloaderPage: React.FC = () => {
    // URL input
    const [urlsText, setUrlsText] = useState('');
    const [batchMode, setBatchMode] = useState(false);
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mediaItems, setMediaItems] = useState<MediaInfo[]>([]);
    const [carouselIndexes, setCarouselIndexes] = useState<Record<number, number>>({});

    // Accounts — multi-select
    const [accounts, setAccounts] = useState<{ 
        facebook: SocialAccount[]; 
        instagram: SocialAccount[];
        whatsapp: any[];
        telegram: any[];
        twitter: SocialAccount[];
        threads: SocialAccount[];
        tiktok: SocialAccount[];
    }>({ 
        facebook: [], 
        instagram: [],
        whatsapp: [],
        telegram: [],
        twitter: [],
        threads: [],
        tiktok: []
    });
    const { shopeeAffiliateSettings } = useProducts();
    const { showAlert, showConfirm } = useAlert();
    const [selectedAccounts, setSelectedAccounts] = useState<SelectedAccount[]>([]);
    const [postCaption, setPostCaption] = useState('');
    const [shopeeLink, setShopeeLink] = useState('');
    const [linkType, setLinkType] = useState<'shopee' | 'custom'>('shopee');
    const [customLink, setCustomLink] = useState('');
    const [customSlug, setCustomSlug] = useState('');
    const [systemPublicUrl, setSystemPublicUrl] = useState('https://fluxointeligente.digital');
    const [shopeeCategories, setShopeeCategories] = useState<any[]>([]);
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);
    const [copied, setCopied] = useState(false);
    const [shopeeMode, setShopeeMode] = useState<'select' | 'new'>('new');
    const [savedLinks, setSavedLinks] = useState<any[]>([]);
    const [savedLinksSearch, setSavedLinksSearch] = useState('');

    // Estados para o Link 2 (Secundário)
    const [shopeeLink2, setShopeeLink2] = useState('');
    const [linkType2, setLinkType2] = useState<'shopee' | 'custom'>('shopee');
    const [customLink2, setCustomLink2] = useState('');
    const [customSlug2, setCustomSlug2] = useState('');
    const [isGeneratingLink2, setIsGeneratingLink2] = useState(false);
    const [shopeeMode2, setShopeeMode2] = useState<'select' | 'new'>('new');
    const [savedLinksSearch2, setSavedLinksSearch2] = useState('');

    // Post modal
    const [selectedItem, setSelectedItem] = useState<MediaInfo | null>(null);
    const [copyingId, setCopyingId] = useState<number | null>(null);
    const [isPostModalOpen, setIsPostModalOpen] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [postSuccess, setPostSuccess] = useState<string | null>(null);
    const [postError, setPostError] = useState<string | null>(null);
    const [postLogs, setPostLogs] = useState<string[]>([]);
    const [postResults, setPostResults] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
    const [isTrialMode, setIsTrialMode] = useState(false); // Trial Reels Support
    const [commentLinkInPost, setCommentLinkInPost] = useState(false); // Automated First Comment support
    const [customCommentPhrases, setCustomCommentPhrases] = useState(''); // Custom Comment Phrases support
    const [enableRoyalties, setEnableRoyalties] = useState(false);
    const [royaltyMusicUrls, setRoyaltyMusicUrls] = useState('');
    const [royaltyVolume, setRoyaltyVolume] = useState(0.25);

    // Schedule wizard
    const [scheduleMode, setScheduleMode] = useState(false);
    const [wizardStep, setWizardStep] = useState<1 | 2>(1);
    const [postsPerDay, setPostsPerDay] = useState(2);
    const [timeSlots, setTimeSlots] = useState<string[]>(['09:00', '18:00']);
    const [newTimeInput, setNewTimeInput] = useState('12:00');
    const [queuePosition, setQueuePosition] = useState<'start' | 'end'>('end');
    const [existingQueueCount, setExistingQueueCount] = useState(0);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressAction, setProgressAction] = useState('');
    const [associations, setAssociations] = useState<any[]>([]);
    const [assocConfirmData, setAssocConfirmData] = useState<{
        platform: any;
        acc: any;
        unselected: any[];
    } | null>(null);

    // Schedule list panel
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [showSchedulePanel, setShowSchedulePanel] = useState(false);

    const cleanCaption = (text: string) => {
        if (!text) return '';
        return text
            .replace(/https?:\/\/(?:[a-z0-9]+\.)*(?:shopee\.[a-z.]+|shope\.ee)\/\S*/gi, '')
            .replace(/@[a-zA-Z0-9._]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const cleanCaptionLink = (text: string) => {
        if (!text) return '';
        // 1. Clean standard COMPRE AQUI / ACESSE AQUI links
        let cleaned = text.replace(/(?:🛍️|🛒|🔗)\s*(?:COMPRE AQUI|Compre aqui|Acesse aqui|ACESSE AQUI):?\s*https?:\/\/\S*/gi, '');
        
        // 2. Clean the randomized CTAs and system/Shopee links
        cleaned = cleaned.replace(/(?:😳|😭|👀|⚠️|🤯).*?👇\s*(?:o link tá aqui:\s*)?https?:\/\/\S*/gi, '');
        cleaned = cleaned.replace(/o final me convenceu.*?👇\s*https?:\/\/\S*/gi, '');
        
        // 3. Clean any orphan system links (like https://fluxointeligente.digital/?video=...)
        const cleanHost = systemPublicUrl.replace(/https?:\/\//i, '').replace(/\//g, '');
        const systemUrlPattern = new RegExp(`https?:\\/\\/(?:[a-z0-9]+\\.)*${cleanHost.replace(/\./g, '\\.')}\\/\\S*`, 'gi');
        cleaned = cleaned.replace(systemUrlPattern, '');
        
        return cleaned.trim();
    };

    const getRandomCta = (link: string) => {
        const ctas = [
            `😳👇\no link tá aqui:\n${link}`,
            `😭 vocês pediram MUITO 👇\n${link}`,
            `👀 achei isso sem querer 👇\n${link}`,
            `o final me convenceu 😭👇\n${link}`,
            `⚠️ não era pra funcionar tão bem 👇\n${link}`,
            `🤯 agora eu entendi o hype 👇\n${link}`,
            `😭 sério… olha isso 👇\n${link}`,
            `👀 antes que suma 👇\n${link}`
        ];
        return ctas[Math.floor(Math.random() * ctas.length)];
    };

    const [accountsLoaded, setAccountsLoaded] = useState(false);

    const fetchAccounts = useCallback(async () => {
        try {
            const resp = await api.get('/media/accounts');
            if (resp.data.success) {
                setAccounts(resp.data.accounts);
            }
        } catch {} finally {
            setAccountsLoaded(true);
        }
    }, []);

    const fetchAssociations = useCallback(async () => {
        try {
            const resp = await api.get('/accounts/associations');
            if (resp.data.success) {
                setAssociations(resp.data.associations);
            }
        } catch {}
    }, []);

    const fetchSchedule = useCallback(async () => {
        try {
            const resp = await api.get('/media/schedule');
            if (resp.data.success) setScheduledPosts(resp.data.schedule);
        } catch {}
    }, []);

    useEffect(() => {
        const init = async () => {
            await fetchAccounts();
            fetchSchedule();
            fetchAssociations();
            
            // Carregar categorias da Shopee
            api.get('/shopee/categories?onlyActive=true').then(res => {
                if (res.data.success) setShopeeCategories(res.data.categories);
            }).catch(err => console.error('Erro ao carregar categorias:', err));

            // Carregar systemPublicUrl e links salvos
            api.get('/short-links').then(res => {
                if (res.data.success) {
                    setSystemPublicUrl(res.data.systemPublicUrl || window.location.origin);
                    setSavedLinks(res.data.links || []);
                }
            }).catch(err => console.warn('Erro ao carregar short-links:', err));
        };
        init();
    }, [fetchAccounts, fetchSchedule, fetchAssociations]);


    const handleCategoryClick = (category: any) => {
        setPostCaption(prev => `${prev}\n\n🏷️ ${category.name}`);
        handleMagicShopeeLink(category.name);
    };

    // Helper to extract the correct ID for each platform
    const getAccId = (a: any, p: string) => {
        if (!a) return '';
        if (p === 'instagram') return String(a.account_id || a.id);
        if (p === 'whatsapp') return String(a.groupId || a.id);
        if (p === 'facebook') return String(a.page_id || a.id);
        // CRITICAL: Always prioritize account_id (Meta ID) over internal serial id
        return String(a.account_id || a.id || '');
    };

    const isAccountSelected = (platform: 'instagram' | 'facebook' | 'whatsapp' | 'telegram' | 'twitter' | 'threads' | 'tiktok', acc: any) => {
        const id = getAccId(acc, platform);
        return selectedAccounts.some(a => a.platform === platform && String(a.accountId) === id);
    };

    const toggleAccount = (platform: 'instagram' | 'facebook' | 'whatsapp' | 'telegram' | 'twitter' | 'threads' | 'tiktok', acc: any) => {
        const id = getAccId(acc, platform);
        const key = `${platform}:${id}`;
        const exists = selectedAccounts.find(a => `${a.platform}:${a.accountId}` === key);
        
        if (exists) {
            setSelectedAccounts(prev => prev.filter(a => `${a.platform}:${a.accountId}` !== key));
        } else {
            let name = acc.name;
            if (platform === 'instagram' && acc.username) name = `@${acc.username}`;
            if (platform === 'whatsapp') name = acc.groupName;
            if (platform === 'threads' && acc.username) name = `@${acc.username}`;
            if (platform === 'tiktok' && acc.username) name = `@${acc.username}`;
            
            const newAcc = { platform, accountId: id, name: name || 'Conta' };

            // RECURSIVE GROUP SEARCH
            const findFullGroup = (startPlat: string, startId: string) => {
                const group = new Set<string>();
                group.add(`${startPlat}:${startId}`);
                
                let added = true;
                while (added) {
                    added = false;
                    associations.forEach(assoc => {
                        const keyA = `${assoc.account_a_platform}:${assoc.account_a_id}`;
                        const keyB = `${assoc.account_b_platform}:${assoc.account_b_id}`;
                        
                        if (group.has(keyA) && !group.has(keyB)) {
                            group.add(keyB);
                            added = true;
                        } else if (group.has(keyB) && !group.has(keyA)) {
                            group.add(keyA);
                            added = true;
                        }
                    });
                }
                return Array.from(group);
            };

            const fullGroupKeys = findFullGroup(platform, id);
            const unselectedKeys = fullGroupKeys.filter(k => !selectedAccounts.some(sa => `${sa.platform}:${sa.accountId}` === k));

            if (unselectedKeys.length > 1) { // More than just the current one
                setAssocConfirmData({ platform, acc, unselected: unselectedKeys });
                return;
            }

            setSelectedAccounts(prev => [...prev, newAcc]);
        }
    };

    const confirmAssocSelection = (all: boolean) => {
        if (!assocConfirmData) return;
        const { platform, acc, unselected } = assocConfirmData;
        
        if (all) {
            const toAdd: SelectedAccount[] = [];
            unselected.forEach(key => {
                const [p, id] = key.split(':');
                const platformKey = p as keyof typeof accounts;
                const accInfo = accounts[platformKey]?.find((a: any) => getAccId(a, p) === id);

                if (accInfo) {
                    let name = accInfo.name || accInfo.username || accInfo.groupName || 'Conta';
                    if (p === 'instagram' && accInfo.username) name = `@${accInfo.username}`;
                    if (p === 'threads' && accInfo.username) name = `@${accInfo.username}`;
                    if (p === 'whatsapp') name = accInfo.groupName;

                    toAdd.push({ platform: p as any, accountId: id, name });
                }
            });
            setSelectedAccounts(prev => {
                const newOnes = toAdd.filter(a => !prev.some(p => p.platform === a.platform && p.accountId === a.accountId));
                return [...prev, ...newOnes];
            });
        } else {
            const id = getAccId(acc, platform);
            let name = acc.name;
            if (platform === 'instagram' && acc.username) name = `@${acc.username}`;
            if (platform === 'threads' && acc.username) name = `@${acc.username}`;
            if (platform === 'whatsapp') name = acc.groupName;
            setSelectedAccounts(prev => [...prev, { platform, accountId: id, name: name || 'Conta' }]);
        }
        setAssocConfirmData(null);
    };

    const addTimeSlot = () => {
        if (newTimeInput && !timeSlots.includes(newTimeInput) && timeSlots.length < postsPerDay) {
            setTimeSlots(prev => [...prev, newTimeInput].sort());
        }
    };
    const removeTimeSlot = (t: string) => setTimeSlots(prev => prev.filter(s => s !== t));
    
    const getFirstPostPreview = () => {
        if (!scheduleMode || timeSlots.length === 0) return null;
        const now = new Date();
        const postsPerDay = timeSlots.length;
        
        if (existingQueueCount === 0) {
            const sorted = [...timeSlots].sort();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const firstAvailable = sorted.find(t => {
                const [h, m] = t.split(':').map(Number);
                return (h * 60 + m) > (currentTime + 1); // Apenas 1 min de margem
            });
            if (firstAvailable) return `Hoje às ${firstAvailable}`;
            return `Amanhã às ${sorted[0]}`;
        } else {
            const daysAfter = Math.floor(existingQueueCount / postsPerDay);
            const slotIndex = existingQueueCount % postsPerDay;
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + daysAfter);
            return `${targetDate.toLocaleDateString('pt-BR')} às ${timeSlots[slotIndex]}`;
        }
    };

    const analyzeUrls = async () => {
        const urls = batchMode
            ? urlsText.split('\n').map(u => u.trim()).filter(Boolean)
            : url.trim() ? [url.trim()] : [];
        if (!urls.length) return;
        setLoading(true); setError(null); setMediaItems([]);
        const results: MediaInfo[] = [];
        for (const u of urls) {
            try {
                const res = await api.post('/media/fetch-info', { url: u });
                if (res.data.success) {
                    results.push({ ...res.data.info, sourceUrl: u, thumbnail: res.data.info.thumbnailUrl || res.data.info.thumbnail });
                } else {
                    setError(res.data.error || 'Erro ao analisar link.');
                }
            } catch (err: any) {
                const msg = err.response?.data?.error || err.message || 'Erro de conexão.';
                setError(`Erro no link ${u.substring(0, 30)}...: ${msg}`);
            }
        }
        if (results.length === 0 && !error) setError('Nenhuma mídia encontrada. Verifique os links.');
        setMediaItems(results);
        setLoading(false);
    };

    const fastBatchSchedule = () => {
        const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
        if (!urls.length) return;

        const getPlatform = (url: string) => {
            if (url.includes('instagram.com')) return 'instagram';
            if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.gg')) return 'facebook';
            if (url.includes('tiktok.com')) return 'tiktok';
            if (url.includes('kwai.com')) return 'kwai';
            if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
            return 'video';
        };

        const virtualItems = urls.map((u, index) => ({
            id: `virtual-${Date.now()}-${index}`,
            sourceUrl: u,
            mediaUrl: 'DEFERRED',
            type: 'video',
            platform: getPlatform(u),
            title: '',
            thumbnail: ''
        }));

        setMediaItems(virtualItems);
        setSelectedItem(virtualItems[0]); 
        setPostCaption(''); // Tags globais
        setIsPostModalOpen(true);
        setPostSuccess(null); setPostError(null);
        setScheduleMode(true); setWizardStep(1);
    };

    const openPostModal = (item: MediaInfo) => {
        setSelectedItem(item);
        if (item.type === 'image' || item.type === 'carousel') {
            setSelectedAccounts(prev => prev.filter(a => a.platform !== 'youtube'));
        }
        setPostCaption(cleanCaption(item.title));
        setShopeeLink('');
        setShopeeMode('new');
        setSavedLinksSearch('');
        setIsPostModalOpen(true);
        setPostSuccess(null); setPostError(null);
        setPostLogs([]); setPostResults([]);
        setScheduleMode(false); setWizardStep(1);
        setIsTrialMode(false);
        // Refresh saved links on open
        api.get('/short-links').then(res => { if (res.data.success) { setSystemPublicUrl(res.data.systemPublicUrl || window.location.origin); setSavedLinks(res.data.links || []); } }).catch(() => {});
    };

    const openBatchModal = () => {
        if (mediaItems.length === 0) return;
        setSelectedItem(mediaItems[0]); // fallback legacy (not really needed for batch but keeping structure)
        if (mediaItems.some(item => item.type === 'image' || item.type === 'carousel')) {
            setSelectedAccounts(prev => prev.filter(a => a.platform !== 'youtube'));
        }
        setPostCaption(''); // Não preencher com o primeiro vídeo, deixar vazio para tags globais
        setShopeeLink('');
        setIsPostModalOpen(true);
        setPostSuccess(null); setPostError(null);
        setPostLogs([]); setPostResults([]);
        setScheduleMode(true); setWizardStep(1);
        setIsTrialMode(false);
    };

    const addLog = (msg: string) => setPostLogs(prev => [...prev, msg].slice(-8));

    const handleCopyMediaLink = async (index: number, url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopyingId(index);
            setTimeout(() => setCopyingId(null), 2000);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const cloakUrl = async (targetUrl: string, slug?: string) => {
        if (!targetUrl) return '';
        if (targetUrl.includes('?video=') || targetUrl.includes(systemPublicUrl)) {
            return targetUrl;
        }
        try {
            const res = await api.post('/short-links', { targetUrl, customSlug: slug || customSlug });
            if (res.data.success) {
                return `${systemPublicUrl.replace(/\/$/, '')}/?video=${res.data.shortLink.slug}`;
            }
        } catch (err) {
            console.error('Erro ao encurtar link:', err);
        }
        return targetUrl;
    };

    const handleShopeeLinkChange = async (val: string) => {
        setShopeeLink(val);
        
        let targetUrl = val;
        // Se for um link da shopee mas não for um link curto de afiliado
        if (val.includes('shopee.com.br') && !val.includes('shope.ee') && !val.includes('s.shopee.com.br')) {
            try {
                const affLink = await generateAffiliateLink(val, shopeeAffiliateSettings);
                if (affLink) targetUrl = affLink;
            } catch (err) {
                console.error('Erro ao converter link:', err);
            }
        }

        // Se for um link da shopee (ou já encurtado de afiliado ou gerado agora), encurta automaticamente pelo sistema
        if (targetUrl && (targetUrl.includes('shopee.com.br') || targetUrl.includes('shope.ee'))) {
            setIsGeneratingLink(true);
            try {
                const cloaked = await cloakUrl(targetUrl);
                if (cloaked) {
                    setShopeeLink(cloaked);
                    // Adicionar link na descrição automaticamente (evitando duplicatas)
                    setPostCaption(prev => {
                        const clean = cleanCaptionLink(prev);
                        const cta = getRandomCta(cloaked);
                        return `${clean}\n\n${cta}`;
                    });
                }
            } finally {
                setIsGeneratingLink(false);
            }
        }
    };

    const handleShopeeLinkChange2 = async (val: string) => {
        setShopeeLink2(val);
        
        let targetUrl = val;
        // Se for um link da shopee mas não for um link curto de afiliado
        if (val.includes('shopee.com.br') && !val.includes('shope.ee') && !val.includes('s.shopee.com.br')) {
            try {
                const affLink = await generateAffiliateLink(val, shopeeAffiliateSettings);
                if (affLink) targetUrl = affLink;
            } catch (err) {
                console.error('Erro ao converter link 2:', err);
            }
        }

        // Se for um link da shopee, encurta automaticamente pelo sistema
        if (targetUrl && (targetUrl.includes('shopee.com.br') || targetUrl.includes('shope.ee'))) {
            setIsGeneratingLink2(true);
            try {
                const cloaked = await cloakUrl(targetUrl, customSlug2);
                if (cloaked) {
                    setShopeeLink2(cloaked);
                }
            } finally {
                setIsGeneratingLink2(false);
            }
        }
    };

    const handleMagicShopeeLink = async (customKeyword?: string) => {
        let keyword = customKeyword || (shopeeLink && !shopeeLink.includes('http') ? shopeeLink : '');
        
        if (!keyword) {
            const rawText = postCaption || (selectedItem?.title || '');
            keyword = rawText
                .replace(/#[a-zA-Z0-9_]+/g, '')
                .replace(/https?:\/\/\S+/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        if (!keyword) {
            showAlert('Digite o nome de um produto no campo ou na legenda para buscar', 'info');
            return;
        }

        setIsGeneratingLink(true);
        try {
            // Tenta busca específica (até 6 palavras)
            const searchTerms = keyword.split(' ').slice(0, 6).join(' ');
            console.log('[SHOPEE MAGIC] Tentativa 1 (Específica):', searchTerms);
            let result = await searchShopeeAffiliateProducts(searchTerms, shopeeAffiliateSettings, 'sales', 1, 1);
            let products = result.products;

            // Fallback 1: Tenta as 3 primeiras palavras (médio)
            if (products.length === 0 && searchTerms.split(' ').length > 3) {
                const midTerms = searchTerms.split(' ').slice(0, 3).join(' ');
                console.log('[SHOPEE MAGIC] Tentativa 2 (Média):', midTerms);
                const retryResult = await searchShopeeAffiliateProducts(midTerms, shopeeAffiliateSettings, 'sales', 1, 1);
                products = retryResult.products;
            }

            // Fallback 2: Tenta apenas a primeira palavra (amplo)
            if (products.length === 0 && searchTerms.split(' ').length > 1) {
                const broadTerms = searchTerms.split(' ')[0];
                console.log('[SHOPEE MAGIC] Tentativa 3 (Ampla):', broadTerms);
                const retryResult = await searchShopeeAffiliateProducts(broadTerms, shopeeAffiliateSettings, 'sales', 1, 1);
                products = retryResult.products;
            }

            if (products && products.length > 0) {
                const product = products[0];
                const link = await generateAffiliateLink(product.offerLink, shopeeAffiliateSettings);
                if (link) {
                    const cloaked = await cloakUrl(link);
                    setShopeeLink(cloaked);
                    
                    // Adicionar link na descrição automaticamente (evitando duplicatas)
                    setPostCaption(prev => {
                        const clean = cleanCaptionLink(prev);
                        const cta = getRandomCta(cloaked);
                        return `${clean}\n\n${cta}`;
                    });

                    showAlert('Link gerado, encurtado e adicionado na legenda!', 'success');
                }
            } else {
                showAlert('Nenhum produto encontrado para: ' + keyword, 'warning');
            }
        } catch (err: any) {
            console.error('Erro na busca mágica:', err);
            showAlert('Erro ao gerar link: ' + (err.message || 'Verifique suas configurações'), 'error');
        } finally {
            setIsGeneratingLink(false);
        }
    };

    const handleShortenCustomLink = async () => {
        if (!customLink.trim()) {
            showAlert('Digite o link do site para encurtar!', 'info');
            return;
        }
        let urlToShorten = customLink.trim();
        if (!/^https?:\/\//i.test(urlToShorten)) {
            urlToShorten = `https://${urlToShorten}`;
            setCustomLink(urlToShorten);
        }
        setIsGeneratingLink(true);
        try {
            const res = await api.post('/short-links', { targetUrl: urlToShorten, customSlug });
            if (res.data.success) {
                const shortUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${res.data.shortLink.slug}`;
                setShopeeLink(shortUrl);
                
                // Adicionar link na descrição automaticamente (evitando duplicatas)
                setPostCaption(prev => {
                    const clean = cleanCaptionLink(prev);
                    const cta = getRandomCta(shortUrl);
                    return `${clean}\n\n${cta}`;
                });
                
                // Re-fetch saved links to update lists
                api.get('/short-links').then(res => {
                    if (res.data.success) {
                        setSavedLinks(res.data.links || []);
                    }
                }).catch(() => {});

                if (res.data.reused) {
                    showAlert('Link existente encontrado e reutilizado!', 'success');
                } else {
                    showAlert('Link do site encurtado com sucesso!', 'success');
                }
            }
        } catch (err: any) {
            console.error('Erro ao encurtar link do site:', err);
            showAlert(err.response?.data?.error || 'Erro ao conectar ao servidor.', 'warning');
        } finally {
            setIsGeneratingLink(false);
        }
    };

    const handleMagicShopeeLink2 = async (customKeyword?: string) => {
        let keyword = customKeyword || (shopeeLink2 && !shopeeLink2.includes('http') ? shopeeLink2 : '');
        
        if (!keyword) {
            const rawText = postCaption || (selectedItem?.title || '');
            keyword = rawText
                .replace(/#[a-zA-Z0-9_]+/g, '')
                .replace(/https?:\/\/\S+/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        if (!keyword) {
            showAlert('Digite o nome de um produto no campo ou na legenda para buscar o Link 2', 'info');
            return;
        }

        setIsGeneratingLink2(true);
        try {
            const searchTerms = keyword.split(' ').slice(0, 6).join(' ');
            console.log('[SHOPEE MAGIC 2] Tentativa 1 (Específica):', searchTerms);
            let result = await searchShopeeAffiliateProducts(searchTerms, shopeeAffiliateSettings, 'sales', 1, 1);
            let products = result.products;

            if (products.length === 0 && searchTerms.split(' ').length > 3) {
                const midTerms = searchTerms.split(' ').slice(0, 3).join(' ');
                console.log('[SHOPEE MAGIC 2] Tentativa 2 (Média):', midTerms);
                const retryResult = await searchShopeeAffiliateProducts(midTerms, shopeeAffiliateSettings, 'sales', 1, 1);
                products = retryResult.products;
            }

            if (products.length === 0 && searchTerms.split(' ').length > 1) {
                const broadTerms = searchTerms.split(' ')[0];
                console.log('[SHOPEE MAGIC 2] Tentativa 3 (Ampla):', broadTerms);
                const retryResult = await searchShopeeAffiliateProducts(broadTerms, shopeeAffiliateSettings, 'sales', 1, 1);
                products = retryResult.products;
            }

            if (products && products.length > 0) {
                const product = products[0];
                const link = await generateAffiliateLink(product.offerLink, shopeeAffiliateSettings);
                if (link) {
                    const cloaked = await cloakUrl(link, customSlug2);
                    setShopeeLink2(cloaked);
                    showAlert('Link 2 gerado e encurtado com sucesso!', 'success');
                }
            } else {
                showAlert('Nenhum produto encontrado para o Link 2: ' + keyword, 'warning');
            }
        } catch (err: any) {
            console.error('Erro na busca mágica 2:', err);
            showAlert('Erro ao gerar link 2: ' + (err.message || 'Verifique suas configurações'), 'error');
        } finally {
            setIsGeneratingLink2(false);
        }
    };

    const handleShortenCustomLink2 = async () => {
        if (!customLink2.trim()) {
            showAlert('Digite o link do site secundário para encurtar!', 'info');
            return;
        }
        let urlToShorten = customLink2.trim();
        if (!/^https?:\/\//i.test(urlToShorten)) {
            urlToShorten = `https://${urlToShorten}`;
            setCustomLink2(urlToShorten);
        }
        setIsGeneratingLink2(true);
        try {
            const res = await api.post('/short-links', { targetUrl: urlToShorten, customSlug: customSlug2 });
            if (res.data.success) {
                const shortUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${res.data.shortLink.slug}`;
                setShopeeLink2(shortUrl);
                
                api.get('/short-links').then(res => {
                    if (res.data.success) {
                        setSavedLinks(res.data.links || []);
                    }
                }).catch(() => {});

                if (res.data.reused) {
                    showAlert('Link 2 existente reutilizado!', 'success');
                } else {
                    showAlert('Link 2 encurtado com sucesso!', 'success');
                }
            }
        } catch (err: any) {
            console.error('Erro ao encurtar link 2:', err);
            showAlert(err.response?.data?.error || 'Erro ao conectar ao servidor.', 'warning');
        } finally {
            setIsGeneratingLink2(false);
        }
    };

    const handleQuickPost = async () => {
        if (!selectedItem || selectedAccounts.length === 0) {
            setPostError('Selecione pelo menos uma conta para postar.'); return;
        }
        setIsPosting(true); setPostError(null); setPostSuccess(null);
        setPostResults([]); setPostLogs([]); setProgress(0);
        addLog(`🚀 Publicando em ${selectedAccounts.length} conta(s)...`);

        const results: { name: string; ok: boolean; msg: string }[] = [];
        let completed = 0;

        // Define os links que serão postados
        const linksToPost: { url: string; label: string }[] = [];
        const link1 = linkType === 'shopee' ? shopeeLink : customLink;
        const link2 = linkType2 === 'shopee' ? shopeeLink2 : customLink2;
        
        if (link1) linksToPost.push({ url: link1, label: 'Link 1' });
        if (link2) linksToPost.push({ url: link2, label: 'Link 2' });
        
        if (linksToPost.length === 0) {
            linksToPost.push({ url: '', label: 'Sem Link' });
        }

        const totalOperations = selectedAccounts.length * linksToPost.length;

        setProgress(5);
        for (const acc of selectedAccounts) {
            for (let lIdx = 0; lIdx < linksToPost.length; lIdx++) {
                const currentLinkObj = linksToPost[lIdx];
                const activeLink = currentLinkObj.url;
                
                // Se for o segundo post, aguardar 3 segundos para evitar bloqueios nas redes sociais
                if (lIdx > 0) {
                    setProgressAction(`Aguardando intervalo de segurança para o Link 2...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

                setProgressAction(`Publicando (${currentLinkObj.label}) em ${acc.name}...`);
                addLog(`📤 (${currentLinkObj.label}) → ${acc.name} (${acc.platform})...`);
                
                // Inicia simulador de progresso para esta conta e link
                let virtualProgress = 0;
                const progressInterval = setInterval(() => {
                    virtualProgress += Math.random() * 5;
                    if (virtualProgress > 90) virtualProgress = 90;
                    
                    // Calcula o progresso total baseado nas contas concluídas + progresso virtual da atual
                    const totalProgress = Math.round(((completed + (virtualProgress / 100)) / totalOperations) * 100);
                    setProgress(totalProgress);
                    
                    // Atualiza o texto de ação baseado no progresso virtual
                    if (virtualProgress < 30) setProgressAction(`Baixando mídia no servidor...`);
                    else if (virtualProgress < 60) setProgressAction(`Preparando ponte de mídia...`);
                    else setProgressAction(`Enviando para ${acc.platform}...`);
                }, 1000);

                try {
                    // A legenda final é construída dinamicamente
                    let finalCaption = postCaption;
                    
                    if (acc.platform === 'instagram' || acc.platform === 'tiktok') {
                        finalCaption = cleanCaptionLink(postCaption);
                        if (activeLink) {
                            finalCaption = `${finalCaption}\n\n🔗 Link na Bio!`;
                        }
                    } else {
                        if (!commentLinkInPost && activeLink && !postCaption.includes(activeLink)) {
                            const clean = cleanCaptionLink(postCaption);
                            const cta = getRandomCta(activeLink);
                            finalCaption = `${clean}\n\n${cta}`;
                        } else if (commentLinkInPost) {
                            finalCaption = cleanCaptionLink(postCaption);
                        }
                    }

                    console.log(`[QUICK POST] Enviando legenda (${currentLinkObj.label}) para ${acc.name}:`, finalCaption);

                    const resp = await api.post('/media/quick-post', {
                        platform: acc.platform,
                        accountId: acc.accountId,
                        mediaUrl: selectedItem.mediaUrl,
                        mediaUrls: selectedItem.mediaUrls, // Para carrossel
                        mediaType: selectedItem.type,
                        sourcePlatform: selectedItem.platform,
                        sourceUrl: selectedItem.sourceUrl,
                        caption: finalCaption,
                        isTrial: isTrialMode,
                        commentLinkInPost: commentLinkInPost,
                        commentLinkUrl: activeLink,
                        enableRoyalties: enableRoyalties,
                        royaltyMusicUrls: royaltyMusicUrls,
                        royaltyVolume: royaltyVolume,
                        customCommentPhrases: customCommentPhrases
                    });
                    
                    clearInterval(progressInterval);

                    if (resp.data.success) {
                        results.push({ name: `${acc.name} (${currentLinkObj.label})`, ok: true, msg: 'Publicado!' });
                        addLog(`✅ ${acc.name} (${currentLinkObj.label}) OK`);
                    } else {
                        const errMsg = resp.data.error || 'Erro desconhecido';
                        results.push({ name: `${acc.name} (${currentLinkObj.label})`, ok: false, msg: errMsg });
                        addLog(`❌ ${acc.name} (${currentLinkObj.label}): ${errMsg}`);
                    }
                } catch (e: any) {
                    clearInterval(progressInterval);
                    const errMsg = e.response?.data?.error || e.message;
                    results.push({ name: `${acc.name} (${currentLinkObj.label})`, ok: false, msg: errMsg });
                    addLog(`❌ ${acc.name} (${currentLinkObj.label}): ${errMsg}`);
                }
                completed++;
                setProgress(Math.round((completed / totalOperations) * 100));
            }
        }

        setPostResults(results);
        const allOk = results.every(r => r.ok);
        const someOk = results.some(r => r.ok);
        
        setIsPosting(false); // Libera o estado de carregamento primeiro

        if (allOk) {
            const mediaTypeName = selectedItem?.type === 'carousel' ? 'Carrossel' : (selectedItem?.type === 'image' ? 'Imagem' : 'Vídeo');
            setPostSuccess(`✅ ${mediaTypeName} postado com sucesso em todas as contas selecionadas!`);
            // Limpar campos após sucesso total
            setUrl('');
            setUrlsText('');
            setMediaItems([]);
            setPostCaption('');
            setShopeeLink('');
            setShopeeLink2('');
            setCustomLink('');
            setCustomLink2('');
            setCustomSlug('');
            setCustomSlug2('');
            setCommentLinkInPost(false);
            setCustomCommentPhrases('');
            setSelectedAccounts([]);
            
            // Opcional: fechar automaticamente após 5 segundos para dar tempo de ler
            setTimeout(() => {
                if (allOk) setIsPostModalOpen(false);
            }, 5000);
        } else if (someOk) {
            setPostSuccess(`⚠️ ${results.filter(r => r.ok).length}/${results.length} publicadas. Veja detalhes abaixo.`);
        } else {
            setPostError('Falha em todas as contas. Veja detalhes abaixo.');
        }
    };

    const handleScheduleNext = async () => {
        if (selectedAccounts.length === 0) { setPostError('Selecione pelo menos uma conta.'); return; }
        if (timeSlots.length < postsPerDay) { setPostError('Adicione todos os horários necessários.'); return; }
        setPostError(null); setSavingSchedule(true); setProgress(0);
        
        let maxQueue = 0;
        let checked = 0;
        for (const acc of selectedAccounts) {
            try {
                setProgressAction(`Verificando fila de ${acc.name}...`);
                const resp = await api.get(`/media/schedule/queue-info?accountId=${acc.accountId}`);
                const count = parseInt(resp.data.info?.total || 0);
                if (count > maxQueue) maxQueue = count;
            } catch {}
            checked++;
            setProgress(Math.round((checked / selectedAccounts.length) * 100));
        }
        setExistingQueueCount(maxQueue);
        if (maxQueue > 0) {
            setWizardStep(2);
            setSavingSchedule(false);
        } else {
            await submitSchedule('end');
        }
    };

    const submitSchedule = async (position: 'start' | 'end') => {
        setSavingSchedule(true); setPostError(null); setProgress(0);
        try {
            let scheduled = 0;
            for (const acc of selectedAccounts) {
                setProgressAction(`Agendando para ${acc.name}...`);
                
                const link1 = linkType === 'shopee' ? shopeeLink : customLink;
                const link2 = linkType2 === 'shopee' ? shopeeLink2 : customLink2;
                
                const linksToSchedule: { url: string; label: string }[] = [];
                if (link1) linksToSchedule.push({ url: link1, label: 'Link 1' });
                if (link2) linksToSchedule.push({ url: link2, label: 'Link 2' });
                if (linksToSchedule.length === 0) linksToSchedule.push({ url: '', label: 'Sem Link' });

                const platformItems: any[] = [];
                
                const buildItem = (sourceUrl: string, mediaUrl: string, mediaType: string, sourcePlatform: string, titleText: string, activeLink: string) => {
                    let itemCaption = titleText;
                    if (acc.platform === 'instagram' || acc.platform === 'tiktok') {
                        itemCaption = cleanCaptionLink(titleText);
                        if (activeLink) {
                            itemCaption = `${itemCaption}\n\n🔗 Link na Bio!`;
                        }
                    } else {
                        if (!commentLinkInPost && activeLink && !itemCaption.includes(activeLink)) {
                            const clean = cleanCaptionLink(titleText);
                            const cta = getRandomCta(activeLink);
                            itemCaption = `${clean}\n\n${cta}`;
                        } else if (commentLinkInPost) {
                            itemCaption = cleanCaptionLink(titleText);
                        }
                    }
                    return {
                        sourceUrl,
                        mediaUrl,
                        mediaType,
                        sourcePlatform: sourcePlatform || 'video',
                        caption: itemCaption,
                        shopeeLink: activeLink || null
                    };
                };

                if (mediaItems.length > 1) {
                    for (const m of mediaItems) {
                        for (const lObj of linksToSchedule) {
                            platformItems.push(buildItem(m.sourceUrl, m.mediaUrl, m.type, m.platform, m.title || postCaption, lObj.url));
                        }
                    }
                } else if (selectedItem) {
                    for (const lObj of linksToSchedule) {
                        platformItems.push(buildItem(selectedItem.sourceUrl, selectedItem.mediaUrl, selectedItem.type, selectedItem.platform, postCaption, lObj.url));
                    }
                }

                const payload = {
                    items: platformItems, 
                    postsPerDay: postsPerDay, 
                    timeSlots: timeSlots, 
                    queuePosition: position,
                    platform: acc.platform, 
                    accountId: acc.id || acc.accountId, 
                    caption: '', 
                    isTrial: isTrialMode,
                    commentLinkInPost: commentLinkInPost,
                    shopeeLink: null, // O link agora vai especificado individualmente em cada item de platformItems
                    enableRoyalties: enableRoyalties,
                    royaltyMusicUrls: royaltyMusicUrls,
                    royaltyVolume: royaltyVolume,
                    customCommentPhrases: customCommentPhrases
                };

                const resp = await api.post('/media/schedule/batch', payload);
                
                if (!resp.data.success) {
                    throw new Error(resp.data.error || `Erro ao agendar em ${acc.name}`);
                }
                scheduled++;
                setProgress(Math.round((scheduled / selectedAccounts.length) * 100));
            }

            // Loop finished, all accounts processed successfully
            setProgressAction('Agendamento concluído!');
            setIsPostModalOpen(false);
            setSavingSchedule(false);

            // Limpar campos após agendamento bem-sucedido
            setUrl('');
            setUrlsText('');
            setMediaItems([]);
            setPostCaption('');
            setShopeeLink('');
            setShopeeLink2('');
            setCustomLink('');
            setCustomLink2('');
            setCustomSlug('');
            setCustomSlug2('');
            setCommentLinkInPost(false);
            setCustomCommentPhrases('');
            setSelectedAccounts([]);

            fetchSchedule().catch(err => console.warn('Background refresh failed:', err));
        } catch (err: any) {
            console.error('[SUBMIT_SCHEDULE_ERROR]', err);
            setPostError(err.response?.data?.error || err.message || 'Erro ao agendar.');
            setSavingSchedule(false);
        }
    };

    const handleDeleteSchedule = async (id: number) => {
        try {
            await api.delete(`/media/schedule/${id}`);
            setScheduledPosts(prev => prev.filter(p => p.id !== id));
        } catch {}
    };

    const handleEditPending = useCallback(async (e?: Event | any) => {
        let targetName: string | null = null;
        let eventPendingPosts: any[] | null = null;

        // Tentar obter via evento
        if (e && e.detail) {
            targetName = e.detail.targetName || null;
            eventPendingPosts = e.detail.pendingPosts || null;
        }

        // Tentar obter via sessionStorage (caso o componente acabou de montar)
        const storedDataStr = sessionStorage.getItem('editPendingData');
        if (storedDataStr) {
            try {
                const storedData = JSON.parse(storedDataStr);
                if (storedData.targetName) targetName = storedData.targetName;
                if (storedData.pendingPosts) eventPendingPosts = storedData.pendingPosts;
                sessionStorage.removeItem('editPendingData');
            } catch (err) {}
        }

        let pendingPosts = eventPendingPosts || scheduledPosts.filter(p => p.status === 'pending');
        
        if (!eventPendingPosts && targetName && targetName !== 'all') {
            pendingPosts = pendingPosts.filter(p => {
                let displayTitle = p.account_name || p.platform;
                if (p.platform === 'instagram' && p.account_name && !p.account_name.startsWith('@')) {
                    displayTitle = `@${p.account_name}`;
                }
                return displayTitle === targetName;
            });
        }

        const pendingUrls = Array.from(new Set(pendingPosts.map(p => p.source_url)));
        
        if (pendingUrls.length === 0) {
            if (!eventPendingPosts && (!scheduledPosts || scheduledPosts.length === 0)) {
                return;
            }
            showAlert(targetName && targetName !== 'all' ? `Não há posts pendentes para ${targetName}.` : 'Não há posts pendentes para editar.', 'info');
            return;
        }
        
        try {
            // Clear pending for the specific account or all
            if (targetName && targetName !== 'all') {
                const idsToDelete = pendingPosts.map(p => p.id);
                await Promise.all(idsToDelete.map(id => api.delete(`/media/schedule/${id}`)));
            } else {
                // Clear all pending first
                await api.post('/media/schedule/clear-all');
            }
            
            // Set the UI to batch mode with the links
            setBatchMode(true);
            setUrlsText(pendingUrls.join('\n'));
            
            // Immediately open the configuration modal
            const getPlatform = (u: string) => {
                if (u.includes('instagram.com')) return 'instagram';
                if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.gg')) return 'facebook';
                if (u.includes('tiktok.com')) return 'tiktok';
                if (u.includes('kwai.com')) return 'kwai';
                if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
                return 'video';
            };
            
            const virtualItems = pendingUrls.map((u, index) => {
                const originalPost = pendingPosts.find(p => p.source_url === u);
                return {
                    id: `virtual-${Date.now()}-${index}`,
                    sourceUrl: u,
                    mediaUrl: 'DEFERRED',
                    type: 'video' as const,
                    platform: getPlatform(u),
                    title: originalPost ? originalPost.caption || '' : '',
                    thumbnail: ''
                };
            });
            
            setMediaItems(virtualItems);
            setSelectedItem(virtualItems[0]);
            
            // Extract caption
            if (pendingPosts.length > 0) {
                const captions = pendingPosts.map(p => p.caption).filter(Boolean);
                if (captions.length > 0) {
                    setPostCaption(captions[0]);
                } else {
                    setPostCaption('');
                }
            } else {
                setPostCaption('');
            }
            
            // Extract postsPerDay and timeSlots
            // Count UNIQUE urls per day (not total rows, since multi-account creates multiple rows per url)
            try {
                if (pendingPosts.length > 0) {
                    // Group by date -> set of unique source_urls
                    const dateUrlSets: Record<string, Set<string>> = {};
                    const uniqueTimes = new Set<string>();
                    
                    pendingPosts.forEach(p => {
                        if (p.scheduled_at && p.source_url) {
                            const d = new Date(p.scheduled_at);
                            const dStr = d.toISOString().split('T')[0];
                            if (!dateUrlSets[dStr]) dateUrlSets[dStr] = new Set();
                            dateUrlSets[dStr].add(p.source_url);
                            
                            const t = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                            uniqueTimes.add(t);
                        }
                    });
                    
                    const counts = Object.values(dateUrlSets).map(s => s.size);
                    if (counts.length > 0) {
                        const maxPerDay = Math.max(...counts);
                        if (maxPerDay > 0 && maxPerDay <= 10) {
                            setPostsPerDay(maxPerDay);
                        }
                    }
                    
                    const extractedTimes = Array.from(uniqueTimes).sort();
                    if (extractedTimes.length > 0) {
                        setTimeSlots(extractedTimes);
                    }
                }
            } catch(e) {}
            
            // Restore settings: Trial mode, comment link, shopee/custom link
            if (pendingPosts.length > 0) {
                const firstPost = pendingPosts[0];
                
                // Restore Trial mode
                if (firstPost.is_trial !== undefined) {
                    setIsTrialMode(!!firstPost.is_trial);
                }
                
                // Restore comment link in post
                if (firstPost.comment_link_in_post !== undefined) {
                    setCommentLinkInPost(!!firstPost.comment_link_in_post);
                }
                if (firstPost.custom_comment_phrases !== undefined) {
                    setCustomCommentPhrases(firstPost.custom_comment_phrases || '');
                }
                
                // Restore shopee/custom link
                if (firstPost.shopee_link) {
                    const link = firstPost.shopee_link;
                    if (link.includes('shopee.com') || link.includes('s.shopee') || link.includes('shp.ee')) {
                        setLinkType('shopee');
                        setShopeeLink(link);
                    } else {
                        setLinkType('custom');
                        setCustomLink(link);
                    }
                }
            }
            
            // Automatically select ALL UNIQUE accounts associated with these pending posts
            if (pendingPosts.length > 0) {
                const uniqueAccounts = new Map<string, any>();
                pendingPosts.forEach(p => {
                    if (!p.account_id) return;
                    const key = `${p.platform}:${p.account_id}`;
                    if (!uniqueAccounts.has(key)) {
                        let displayTitle = p.account_name || p.platform;
                        if ((p.platform === 'instagram' || p.platform === 'threads' || p.platform === 'tiktok') && p.account_name && !p.account_name.startsWith('@')) {
                            displayTitle = `@${p.account_name}`;
                        }
                        uniqueAccounts.set(key, {
                            platform: p.platform as any,
                            accountId: String(p.account_id),
                            name: displayTitle
                        });
                    }
                });
                
                const accountsToSelect = Array.from(uniqueAccounts.values());
                if (accountsToSelect.length > 0) {
                    setSelectedAccounts(accountsToSelect);
                } else {
                    setSelectedAccounts([]);
                }
            } else {
                setSelectedAccounts([]);
            }
            
            setIsPostModalOpen(true);
            setPostSuccess(null);
            setPostError(null);
            setScheduleMode(true);
            setWizardStep(1);
            
            fetchSchedule(); // Refresh the list
        } catch (err: any) {
            showAlert('Erro ao preparar edição: ' + (err.response?.data?.error || err.message), 'error');
        }
    }, [scheduledPosts, showAlert, fetchSchedule, setSelectedAccounts]);

    useEffect(() => {
        const handleTrigger = (e: Event) => handleEditPending(e);
        window.addEventListener('trigger-edit-pending', handleTrigger);
        return () => window.removeEventListener('trigger-edit-pending', handleTrigger);
    }, [handleEditPending]);

    // Só checar sessionStorage APÓS as contas carregarem
    useEffect(() => {
        if (accountsLoaded && sessionStorage.getItem('editPendingData')) {
            setTimeout(() => handleEditPending(), 150);
        }
    }, [accountsLoaded, handleEditPending]);



    const allAccounts = [
        ...accounts.instagram.map(a => ({ ...a, platform: 'instagram' as const })),
        ...accounts.facebook.map(a => ({ ...a, platform: 'facebook' as const })),
        ...accounts.whatsapp.map(a => ({ ...a, platform: 'whatsapp' as const })),
        ...accounts.telegram.map(a => ({ ...a, platform: 'telegram' as const })),
        ...accounts.twitter.map(a => ({ ...a, platform: 'twitter' as const })),
        ...accounts.threads.map(a => ({ ...a, platform: 'threads' as const })),
        ...(accounts.tiktok || []).map(a => ({ ...a, platform: 'tiktok' as const })),
    ];

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 px-4 sm:px-0 animate-fade-in">
            {/* Hero */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-[28px] p-8 sm:p-12 text-white shadow-2xl">
                <div className="relative z-10">
                    <h2 className="text-3xl sm:text-4xl font-black mb-2 flex items-center gap-3">
                        <Download className="w-9 h-9" /> Downloader Elite
                    </h2>
                    <p className="text-purple-100 text-sm max-w-xl">
                        Extraia e publique vídeos do Instagram, Facebook e TikTok em múltiplas contas simultaneamente.
                    </p>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20" />
            </div>

            {/* URL Input */}
            <div className="bg-white border border-gray-100 rounded-[24px] p-6 sm:p-8 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">
                        {batchMode ? 'Links em lote (um por linha)' : 'Cole o link da publicação'}
                    </label>
                    <button onClick={() => { setBatchMode(!batchMode); setError(null); setMediaItems([]); }}
                        className={`flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl transition-all ${batchMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        <List size={14} /> {batchMode ? 'MODO LOTE ATIVO' : 'MODO LOTE'}
                    </button>
                </div>
                <div className="space-y-3">
                    {batchMode ? (
                        <textarea value={urlsText} onChange={e => setUrlsText(e.target.value)} rows={5}
                            placeholder="https://www.instagram.com/reel/...\nhttps://www.tiktok.com/@user/video/..."
                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-purple-500 outline-none text-gray-800 text-sm font-mono resize-none transition-all" />
                    ) : (
                        <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400"><LinkIcon size={20} /></div>
                            <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && analyzeUrls()}
                                placeholder="instagram.com/reel/... ou tiktok.com/... ou youtube.com/shorts/... ou kwai.com/..."
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-purple-500 outline-none text-gray-800 font-bold transition-all" />
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                        <button onClick={analyzeUrls} disabled={loading || (!batchMode && !url) || (batchMode && !urlsText)}
                            className={`flex-1 py-4 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 ${batchMode ? 'bg-gray-800' : 'bg-gray-900'}`}>
                            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> ANALISANDO...</> : <><Play size={18} /> ANALISAR AGORA</>}
                        </button>
                        {batchMode && urlsText.split('\n').filter(u => u.trim()).length > 1 && (
                            <button onClick={fastBatchSchedule} disabled={loading}
                                className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50">
                                🚀 AGENDAMENTO RÁPIDO
                            </button>
                        )}
                    </div>
                    
                    <div className="mt-8 pt-6 flex flex-col gap-4">
                        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-[0.15em] text-left">Plataformas Disponíveis</div>
                        <div className="flex flex-col sm:flex-row items-stretch justify-between gap-4">
                            
                            {/* Facebook */}
                            <div className="flex-1 bg-white rounded-xl p-4 flex flex-col gap-4 border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#1877F2]/10 rounded-lg flex items-center justify-center">
                                        <div className="w-5 h-5 bg-[#1877F2] rounded-full text-white flex items-center justify-center font-bold text-xs">f</div>
                                    </div>
                                    <span className="font-bold text-sm text-gray-900">Facebook</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><ImageIcon size={14} className="text-gray-500 stroke-[1.5]"/> Imagem</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><Layout size={14} className="text-gray-500 stroke-[1.5]"/> Carrossel</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><Video size={14} className="text-gray-500 stroke-[1.5]"/> Vídeo</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                </div>
                            </div>

                            {/* Instagram */}
                            <div className="flex-1 bg-white rounded-xl p-4 flex flex-col gap-4 border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#bc1888]/10 rounded-lg flex items-center justify-center">
                                        <div className="w-5 h-5 rounded-[6px] bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white flex items-center justify-center">
                                            <Camera size={12} strokeWidth={2.5} />
                                        </div>
                                    </div>
                                    <span className="font-bold text-sm text-gray-900">Instagram</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><ImageIcon size={14} className="text-gray-500 stroke-[1.5]"/> Imagem</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><Layout size={14} className="text-gray-500 stroke-[1.5]"/> Carrossel</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><Video size={14} className="text-gray-500 stroke-[1.5]"/> Vídeo</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                </div>
                            </div>

                            {/* TikTok */}
                            <div className="flex-1 bg-white rounded-xl p-4 flex flex-col gap-4 border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-black/5 rounded-lg flex items-center justify-center">
                                        <div className="w-5 h-5 bg-black rounded-[6px] text-white flex items-center justify-center">
                                            <Music size={12} strokeWidth={2.5} />
                                        </div>
                                    </div>
                                    <span className="font-bold text-sm text-gray-900">TikTok</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><Video size={14} className="text-gray-500 stroke-[1.5]"/> Vídeo</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                </div>
                            </div>

                            {/* YouTube Shorts */}
                            <div className="flex-1 bg-white rounded-xl p-4 flex flex-col gap-4 border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                                        <Youtube className="text-red-600" size={16} strokeWidth={2.5} />
                                    </div>
                                    <span className="font-bold text-sm text-gray-900">YouTube Shorts</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between text-xs text-gray-600 font-medium">
                                        <div className="flex items-center gap-2"><Video size={14} className="text-gray-500 stroke-[1.5]"/> Vídeo</div>
                                        <Check size={14} className="text-green-500 stroke-[2.5]" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs font-bold">
                        <AlertCircle size={18} />{error}
                    </motion.div>
                )}
            </div>

            {/* Results Grid */}
            <AnimatePresence>
                {mediaItems.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                {(() => {
                                    let totalMedia = 0;
                                    mediaItems.forEach(item => {
                                        if (item.type === 'carousel') {
                                            if (Array.isArray(item.mediaUrls)) {
                                                totalMedia += item.mediaUrls.length;
                                            } else if (item.mediaUrl && item.mediaUrl !== 'DEFERRED') {
                                                try {
                                                    const urls = JSON.parse(item.mediaUrl);
                                                    totalMedia += Array.isArray(urls) ? urls.length : 1;
                                                } catch (e) {
                                                    totalMedia += 1;
                                                }
                                            } else {
                                                totalMedia += 1;
                                            }
                                        } else {
                                            totalMedia += 1;
                                        }
                                    });
                                    return `${totalMedia} mídia(s) encontrada(s) em ${mediaItems.length} link(s)`;
                                })()}
                            </p>
                            {mediaItems.length > 1 && (
                                <button onClick={openBatchModal}
                                    className="flex items-center gap-2 text-xs font-black px-4 py-2 bg-purple-600 text-white rounded-xl hover:brightness-110 transition-all active:scale-95">
                                    <Calendar size={14} /> AGENDAR TODOS
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {mediaItems.map((item, i) => (
                                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                                    className="bg-white border border-gray-100 rounded-[20px] overflow-hidden shadow-md hover:shadow-xl transition-shadow">
                                    <div className="relative aspect-video">
                                        {item.mediaUrl === 'DEFERRED' ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900/10 gap-2">
                                                <RefreshCw size={24} className="text-purple-400 animate-spin-slow" />
                                                <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Pendente de Análise</span>
                                            </div>
                                        ) : (
                                            <>
                                                {(() => {
                                                    const currentUrl = item.type === 'carousel' && Array.isArray(item.mediaUrls) 
                                                        ? (item.mediaUrls[carouselIndexes[i] || 0] || item.thumbnail) 
                                                        : item.thumbnail;
                                                    
                                                    const isVideo = currentUrl?.toLowerCase().includes('.mp4') || currentUrl?.includes('mime=video') || currentUrl?.includes('video/mp4');

                                                    if (isVideo) {
                                                        return (
                                                            <video 
                                                                src={currentUrl} 
                                                                className="w-full h-full object-cover"
                                                                autoPlay
                                                                loop
                                                                muted
                                                                playsInline
                                                            />
                                                        );
                                                    }

                                                    return (
                                                        <img 
                                                            src={currentUrl} 
                                                            referrerPolicy="no-referrer" 
                                                            alt="" 
                                                            className="w-full h-full object-cover" 
                                                            onError={(e) => {
                                                                if (e.currentTarget.src !== item.thumbnail) {
                                                                    e.currentTarget.src = item.thumbnail || '';
                                                                }
                                                            }}
                                                        />
                                                    );
                                                })()}
                                                {item.type === 'carousel' && Array.isArray(item.mediaUrls) && item.mediaUrls.length > 1 && (
                                                    <>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCarouselIndexes(prev => ({
                                                                    ...prev, 
                                                                    [i]: ((prev[i] || 0) - 1 + item.mediaUrls!.length) % item.mediaUrls!.length
                                                                }));
                                                            }}
                                                            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 backdrop-blur-sm transition-all"
                                                        >
                                                            <ChevronLeft size={16} />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCarouselIndexes(prev => ({
                                                                    ...prev, 
                                                                    [i]: ((prev[i] || 0) + 1) % item.mediaUrls!.length
                                                                }));
                                                            }}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/80 text-white rounded-full p-1.5 backdrop-blur-sm transition-all"
                                                        >
                                                            <ChevronRight size={16} />
                                                        </button>
                                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm pointer-events-none">
                                                            {item.mediaUrls.map((_, idx) => (
                                                                <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-all ${idx === (carouselIndexes[i] || 0) ? 'bg-white scale-125' : 'bg-white/50'}`} />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                                        <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg px-2 py-1 flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-1">
                                                {item.type === 'video' ? <Video size={12} className="text-white" /> : <ImageIcon size={12} className="text-white" />}
                                                <span className="text-[10px] font-bold text-white uppercase">{item.mediaUrl === 'DEFERRED' ? 'PROCESSANDO' : item.type}</span>
                                            </div>
                                            {item.type === 'carousel' && (
                                                <span className="text-[9px] font-bold text-white bg-black/50 px-1 rounded">
                                                    DEBUG: urls={Array.isArray(item.mediaUrls) ? item.mediaUrls.length : (item.mediaUrls ? 'not-array' : 'undefined')}
                                                </span>
                                            )}
                                        </div>
                                        <button onClick={() => handleCopyMediaLink(i, item.mediaUrl)}
                                            className="absolute top-3 left-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg p-1.5 text-white hover:bg-white/40 transition-all active:scale-90"
                                            title="Copiar link direto do vídeo">
                                            {copyingId === i ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                        </button>
                                        <span className={`absolute bottom-3 left-3 text-[10px] font-black px-2 py-1 rounded-lg uppercase ${item.platform === 'instagram' ? 'bg-pink-600 text-white' : item.platform === 'tiktok' ? 'bg-black text-white' : item.platform === 'kwai' ? 'bg-orange-500 text-white' : item.platform === 'youtube' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                                            {item.platform}
                                        </span>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs font-bold text-gray-800 line-clamp-2 mb-3">{item.title}</p>
                                        <button onClick={() => openPostModal(item)}
                                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95">
                                            <Send size={14} /> POSTAR / AGENDAR
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Scheduled Posts Panel */}
            <div className="bg-white border border-gray-100 rounded-[24px] shadow-lg overflow-hidden">
                <div role="button" tabIndex={0}
                    onClick={() => { setShowSchedulePanel(!showSchedulePanel); fetchSchedule(); }}
                    onKeyDown={e => e.key === 'Enter' && setShowSchedulePanel(s => !s)}
                    className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Calendar size={18} className="text-purple-600" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-black text-gray-900">Posts Agendados</p>
                            <p className="text-xs text-gray-400">{scheduledPosts.filter(p => p.status === 'pending').length} pendente(s)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* The 'Editar Pendentes' button was removed here since editing all accounts is disabled */}
                        <button onClick={e => { e.stopPropagation(); fetchSchedule(); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Atualizar">
                            <RefreshCw size={14} className="text-gray-400" />
                        </button>
                        <ChevronDown size={18} className={`text-gray-400 transition-transform ${showSchedulePanel ? 'rotate-180' : ''}`} />
                    </div>
                </div>
                <AnimatePresence>
                    {showSchedulePanel && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                {scheduledPosts.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        <Clock size={32} className="mx-auto mb-2 opacity-30" /> Nenhum post agendado
                                    </div>
                                ) : scheduledPosts.map(post => (
                                    <div key={post.id} className="p-4 flex items-center gap-4">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${statusColor[post.status] || 'text-gray-500 bg-gray-50'}`}>
                                            {post.status}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-gray-700 truncate">{post.source_url}</p>
                                            <p className="text-[10px] text-gray-400">{post.platform} • {new Date(post.scheduled_at).toLocaleString('pt-BR')}</p>
                                            {post.error_message && <p className="text-[10px] text-red-500 truncate">{post.error_message}</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => { navigator.clipboard.writeText(post.source_url); addLog(`📋 Link copiado: ${post.source_url.slice(0, 20)}...`); }}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-purple-600 transition-colors" title="Copiar Link Original">
                                                <Copy size={13} />
                                            </button>
                                            {post.status === 'pending' && (
                                                <button onClick={() => handleDeleteSchedule(post.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Post / Schedule Modal via Portal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isPostModalOpen && selectedItem && (
                        <div className="fixed inset-0 z-[9000] bg-gray-900/80 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                            animate={{ opacity: 1, scale: 1, y: 0 }} 
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[32px] w-full max-w-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] overflow-hidden max-h-[90vh] flex flex-col border border-white/20 pointer-events-auto"
                        >

                            {/* Header */}
                            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="text-base font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                                    <Send size={18} className="text-purple-600" /> Publicar Mídia
                                    {mediaItems.length > 1 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{mediaItems.length} itens</span>}
                                    {mediaItems.some(m => m.mediaUrl === 'DEFERRED') && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-black">⚡ MODO RÁPIDO</span>}
                                </h3>
                                <button onClick={() => !isPosting && !savingSchedule && setIsPostModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full">
                                    <X size={18} className="text-gray-500" />
                                </button>
                            </div>

                            <div className="p-5 space-y-4 overflow-y-auto flex-1">
                                {/* Mode Toggle */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setScheduleMode(false)} className={`py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${!scheduleMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                        <Play size={14} /> POSTAR AGORA
                                    </button>
                                    <button onClick={() => { setScheduleMode(true); setWizardStep(1); }} className={`py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${scheduleMode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                        <Calendar size={14} /> AGENDAR
                                    </button>
                                </div>

                                {/* ===== MULTI-ACCOUNT SELECTOR ===== */}
                                <div>
                                    <div className="flex flex-col gap-2 mb-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                                <Users size={12} /> Contas ({selectedAccounts.length} selecionada(s))
                                            </label>
                                            {selectedAccounts.length > 0 && (
                                                <button onClick={() => setSelectedAccounts([])} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors font-bold">
                                                    Limpar
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Redes Sociais Quick Access Icons */}
                                        <div className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-100 overflow-x-auto">
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider mr-1">Filtrar/Ir:</span>
                                            {[
                                                { key: 'instagram', icon: <Instagram size={10} />, color: 'text-pink-500 border-pink-200 hover:bg-pink-50' },
                                                { key: 'facebook', icon: <Facebook size={10} />, color: 'text-blue-600 border-blue-200 hover:bg-blue-50' },
                                                { key: 'whatsapp', icon: <span className="text-[9px] leading-none">📱</span>, color: 'text-green-500 border-green-200 hover:bg-green-50' },
                                                { key: 'telegram', icon: <span className="text-[9px] leading-none">✈️</span>, color: 'text-sky-500 border-sky-200 hover:bg-sky-50' },
                                                { key: 'twitter', icon: <span className="font-bold text-[8px]">𝕏</span>, color: 'text-gray-800 border-gray-200 hover:bg-gray-100' },
                                                { key: 'threads', icon: <span className="text-[9px] leading-none">🧵</span>, color: 'text-black border-gray-200 hover:bg-gray-100' },
                                                { key: 'tiktok', icon: <Video size={10} />, color: 'text-black border-gray-200 hover:bg-gray-50' },
                                                { key: 'youtube', icon: <Youtube size={10} />, color: 'text-[#FF0000] border-red-200 hover:bg-red-50' },
                                                { key: 'kwai', icon: <span className="text-[9px] leading-none">🧡</span>, color: 'text-orange-500 border-orange-200 hover:bg-orange-50' },
                                                { key: 'pinterest', icon: <span className="text-[9px] leading-none">📌</span>, color: 'text-red-700 border-red-200 hover:bg-red-50' }
                                            ].map(net => {
                                                const hasAccounts = (accounts as any)[net.key] && (accounts as any)[net.key].length > 0;
                                                if (!hasAccounts) return null;
                                                return (
                                                    <button
                                                        key={net.key}
                                                        type="button"
                                                        onClick={() => {
                                                            const el = document.getElementById(`scroll-${net.key}`);
                                                            if (el) {
                                                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                            }
                                                        }}
                                                        className={`w-6 h-6 rounded-lg flex items-center justify-center border bg-white shadow-xs hover:scale-105 transition-all shrink-0 cursor-pointer ${net.color}`}
                                                        title={`Ir para ${net.key.toUpperCase()}`}
                                                    >
                                                        {net.icon}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                        {accounts.instagram.length > 0 && (
                                            <div>
                                                <p id="scroll-instagram" className="text-[9px] font-black text-pink-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Instagram size={10} /> Instagram</p>
                                                <div className="space-y-1">
                                                    {accounts.instagram.map(acc => {
                                                        const selected = isAccountSelected('instagram', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('instagram', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-pink-300 bg-pink-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-pink-500 border-pink-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.username ? `@${acc.username}` : acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Instagram</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.facebook.length > 0 && (
                                            <div>
                                                <p id="scroll-facebook" className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Facebook size={10} /> Facebook</p>
                                                <div className="space-y-1">
                                                    {accounts.facebook.map(acc => {
                                                        const selected = isAccountSelected('facebook', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('facebook', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Facebook Page</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.whatsapp.length > 0 && (
                                            <div>
                                                <p id="scroll-whatsapp" className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-1 flex items-center gap-1">📱 WhatsApp Groups</p>
                                                <div className="space-y-1">
                                                    {accounts.whatsapp.map(acc => {
                                                        const selected = isAccountSelected('whatsapp', acc);
                                                        return (
                                                            <button key={acc.groupId} onClick={() => toggleAccount('whatsapp', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.groupName}</p>
                                                                    <p className="text-[10px] text-gray-400">WhatsApp Group</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.telegram.length > 0 && (
                                            <div>
                                                <p id="scroll-telegram" className="text-[9px] font-black text-sky-500 uppercase tracking-widest mb-1 flex items-center gap-1">✈️ Telegram Channels</p>
                                                <div className="space-y-1">
                                                    {accounts.telegram.map(acc => {
                                                        const selected = isAccountSelected('telegram', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('telegram', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-sky-300 bg-sky-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-sky-500 border-sky-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Telegram Channel/Group</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.twitter.length > 0 && (
                                            <div>
                                                <p id="scroll-twitter" className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1 flex items-center gap-1">𝕏 Twitter Accounts</p>
                                                <div className="space-y-1">
                                                    {accounts.twitter.map(acc => {
                                                        const selected = isAccountSelected('twitter', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('twitter', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-gray-400 bg-gray-100' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-gray-900 border-gray-900' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">@{acc.username}</p>
                                                                    <p className="text-[10px] text-gray-400">Twitter Account</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.threads.length > 0 && (
                                            <div>
                                                <p id="scroll-threads" className="text-[9px] font-black text-black uppercase tracking-widest mb-1 flex items-center gap-1">🧵 Threads Accounts</p>
                                                <div className="space-y-1">
                                                    {accounts.threads.map(acc => {
                                                        const selected = isAccountSelected('threads', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('threads', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-gray-400 bg-gray-100' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-black border-black' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">@{acc.username}</p>
                                                                    <p className="text-[10px] text-gray-400">Threads Account</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.tiktok && accounts.tiktok.length > 0 && (
                                            <div>
                                                <p id="scroll-tiktok" className="text-[9px] font-black text-black uppercase tracking-widest mb-1 flex items-center gap-1"><Video size={10} className="text-[#fe2c55]" /> TikTok Accounts</p>
                                                <div className="space-y-1">
                                                    {accounts.tiktok.map(acc => {
                                                        const selected = isAccountSelected('tiktok', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('tiktok', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-red-500 border-red-500' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.username ? `@${acc.username}` : acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">TikTok Account</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.youtube && accounts.youtube.length > 0 && (
                                            <div>
                                                <p id="scroll-youtube" className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1 flex items-center gap-1"><Youtube size={10} className="text-[#FF0000]" /> YouTube Channels</p>
                                                <div className="space-y-1">
                                                    {accounts.youtube.map(acc => {
                                                        const selected = isAccountSelected('youtube', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('youtube', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-[#FF0000] border-[#FF0000]' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.channel_name || acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">YouTube Channel</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.kwai && accounts.kwai.length > 0 && (
                                            <div>
                                                <p id="scroll-kwai" className="text-[9px] font-black text-orange-600 uppercase tracking-widest mb-1 flex items-center gap-1">Kwai Accounts</p>
                                                <div className="space-y-1">
                                                    {accounts.kwai.map(acc => {
                                                        const selected = isAccountSelected('kwai', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('kwai', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-orange-300 bg-orange-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-[#FF6A00] border-[#FF6A00]' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.username || acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Kwai Account</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {accounts.pinterest && accounts.pinterest.length > 0 && (
                                            <div>
                                                <p id="scroll-pinterest" className="text-[9px] font-black text-red-700 uppercase tracking-widest mb-1 flex items-center gap-1">Pinterest Accounts</p>
                                                <div className="space-y-1">
                                                    {accounts.pinterest.map(acc => {
                                                        const selected = isAccountSelected('pinterest', acc);
                                                        return (
                                                            <button key={acc.id} onClick={() => toggleAccount('pinterest', acc)}
                                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-[#E60023] border-[#E60023]' : 'border-gray-300 bg-white'}`}>
                                                                    {selected && <CheckCircle2 size={12} className="text-white" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-gray-800 truncate">{acc.username || acc.name}</p>
                                                                    <p className="text-[10px] text-gray-400">Pinterest Account</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* === SEÇÃO DE LINK 1 (PRINCIPAL) === */}
                                <div className="p-4 bg-orange-50/30 border-l-4 border-orange-500 border border-orange-100 rounded-2xl space-y-3 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-orange-700 flex items-center gap-1.5">
                                            🔗 LINK 1 (PRINCIPAL)
                                        </span>
                                        {shopeeLink && (
                                            <span className="text-[9px] font-black text-orange-500 uppercase px-2 py-0.5 bg-orange-100 rounded-lg">Configurado</span>
                                        )}
                                    </div>
                                    
                                    {/* Alternador de Tipo de Link 1 */}
                                    <div className="flex gap-2 p-1 bg-white border border-orange-100 rounded-xl">
                                        <button 
                                            type="button"
                                            onClick={() => { setLinkType('shopee'); setShopeeLink(''); }} 
                                            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 ${linkType === 'shopee' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            🛍️ Shopee
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => { setLinkType('custom'); setCustomLink(''); setShopeeLink(''); }} 
                                            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 ${linkType === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            🌐 Site Customizado
                                        </button>
                                    </div>

                                    {linkType === 'shopee' ? (
                                        <div className="space-y-2">
                                            <div className="flex gap-1 p-1 bg-orange-50/50 border border-orange-100/50 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setShopeeMode('select')}
                                                    className={`flex-1 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${shopeeMode === 'select' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-400 hover:text-orange-500'}`}
                                                >
                                                    📋 Selecionar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShopeeMode('new')}
                                                    className={`flex-1 py-1 text-[9px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-0.5 ${shopeeMode === 'new' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-400 hover:text-orange-500'}`}
                                                >
                                                    <Plus size={10} /> Novo
                                                </button>
                                            </div>

                                            {shopeeMode === 'select' ? (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={savedLinksSearch}
                                                        onChange={e => setSavedLinksSearch(e.target.value)}
                                                        placeholder="Buscar link salvo..."
                                                        className="w-full px-3 py-1.5 bg-white border border-orange-100 rounded-lg outline-none text-xs font-bold text-gray-700 transition-all"
                                                    />
                                                    <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                                                        {savedLinks
                                                            .filter(l => !savedLinksSearch || l.slug?.toLowerCase().includes(savedLinksSearch.toLowerCase()) || l.target_url?.toLowerCase().includes(savedLinksSearch.toLowerCase()))
                                                            .map(link => {
                                                                const fullUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${link.slug}`;
                                                                const isSelected = shopeeLink === fullUrl;
                                                                return (
                                                                    <button
                                                                        key={link.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setShopeeLink(fullUrl);
                                                                            setPostCaption(prev => {
                                                                                const clean = cleanCaptionLink(prev);
                                                                                const cta = getRandomCta(fullUrl);
                                                                                return `${clean}\n\n${cta}`;
                                                                            });
                                                                        }}
                                                                        className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left text-[10px] ${isSelected ? 'border-orange-400 bg-orange-50 text-orange-900 font-bold' : 'border-gray-100 bg-white text-gray-700 hover:bg-orange-50/30'}`}
                                                                    >
                                                                        <span className="truncate pr-2 font-mono">/{link.slug}</span>
                                                                        <span className="text-[8px] text-orange-500 font-black shrink-0">{link.clicks || 0} clics</span>
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="relative group">
                                                        <div className="absolute top-2.5 left-3 text-orange-500"><LinkIcon size={14} /></div>
                                                        <input 
                                                            type="text" 
                                                            value={shopeeLink} 
                                                            onChange={e => handleShopeeLinkChange(e.target.value)}
                                                            placeholder="Link ou Nome do Produto..."
                                                            className="w-full pl-8 pr-20 py-2 bg-orange-50/50 border border-orange-100 rounded-xl focus:border-orange-500 outline-none text-gray-800 text-xs font-bold transition-all" 
                                                        />
                                                        <div className="absolute right-1.5 top-1 flex gap-0.5">
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleMagicShopeeLink()}
                                                                disabled={isGeneratingLink}
                                                                className="p-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all disabled:opacity-50"
                                                            >
                                                                {isGeneratingLink ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                            </button>
                                                            {shopeeLink && (
                                                                <button type="button" onClick={() => setShopeeLink('')} className="p-1 bg-white text-gray-400 rounded-lg hover:text-red-500 border border-orange-100"><X size={12} /></button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={customSlug} 
                                                        onChange={e => setCustomSlug(e.target.value)}
                                                        placeholder="Nome do link (opcional, ex: dorama)"
                                                        className="w-full px-3 py-1.5 bg-white border border-orange-100 rounded-xl focus:border-orange-500 outline-none text-gray-800 text-xs transition-all" 
                                                    />
                                                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto py-0.5">
                                                        {shopeeCategories.map(cat => (
                                                            <button key={cat.id} type="button" onClick={() => handleMagicShopeeLink(cat.keywords || cat.name)} className="px-2 py-1 bg-white border border-orange-100 text-orange-600 rounded-md text-[8px] font-black uppercase hover:bg-orange-500 hover:text-white transition-all">{cat.name}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative group">
                                                <div className="absolute top-2.5 left-3 text-indigo-500"><Globe size={14} /></div>
                                                <input 
                                                    type="text" 
                                                    value={customLink} 
                                                    onChange={e => setCustomLink(e.target.value)}
                                                    placeholder="https://seu-site.com/pagina"
                                                    className="w-full pl-8 pr-20 py-2 bg-indigo-50/30 border border-indigo-100 rounded-xl focus:border-indigo-600 outline-none text-gray-800 text-xs font-bold transition-all" 
                                                />
                                                <div className="absolute right-1.5 top-1 flex gap-0.5">
                                                    <button 
                                                        type="button"
                                                        onClick={handleShortenCustomLink}
                                                        disabled={isGeneratingLink}
                                                        className="p-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                                                    >
                                                        {isGeneratingLink ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                    </button>
                                                    {customLink && (
                                                        <button type="button" onClick={() => { setCustomLink(''); setShopeeLink(''); setCustomSlug(''); }} className="p-1 bg-white text-gray-400 rounded-lg hover:text-red-500 border border-indigo-100"><X size={12} /></button>
                                                    )}
                                                </div>
                                            </div>
                                            <input 
                                                type="text" 
                                                value={customSlug} 
                                                onChange={e => setCustomSlug(e.target.value)}
                                                placeholder="Nome do link (opcional, ex: dorama)"
                                                className="w-full px-3 py-1.5 bg-white border border-indigo-100 rounded-xl focus:border-indigo-600 outline-none text-gray-800 text-xs transition-all" 
                                            />
                                            {savedLinks.length > 0 && (
                                                <div className="space-y-1 bg-indigo-50/20 border border-indigo-100/50 rounded-xl p-2 text-[9px]">
                                                    <span className="text-[8px] text-indigo-500 font-bold block mb-1">📋 LINKS RÁPIDOS:</span>
                                                    <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                                                        {savedLinks.slice(0, 5).map(link => {
                                                            const shortUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${link.slug}`;
                                                            const isSelected = shopeeLink === shortUrl;
                                                            return (
                                                                <button
                                                                    key={link.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setCustomLink(link.target_url);
                                                                        setCustomSlug(link.slug);
                                                                        setShopeeLink(shortUrl);
                                                                        setPostCaption(prev => {
                                                                            const clean = cleanCaptionLink(prev);
                                                                            const cta = getRandomCta(shortUrl);
                                                                            return `${clean}\n\n${cta}`;
                                                                        });
                                                                        showAlert('Link rápido selecionado!', 'success');
                                                                    }}
                                                                    className={`w-full flex items-center justify-between p-1 rounded-md border text-[9px] ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-indigo-50 text-gray-700 hover:bg-indigo-50'}`}
                                                                >
                                                                    <span className="truncate pr-2 font-mono">/{link.slug}</span>
                                                                    <span className="shrink-0">{link.clicks || 0} clics</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {shopeeLink && (
                                        <div className="p-2 bg-green-50 border border-green-100 rounded-xl flex items-center justify-between text-[10px] text-green-700 font-black font-mono">
                                            <span className="truncate">✅ {shopeeLink}</span>
                                            <button 
                                                type="button"
                                                onClick={() => { navigator.clipboard.writeText(shopeeLink); addLog('📋 Link 1 copiado!'); }} 
                                                className="px-2 py-0.5 bg-white border border-green-200 text-green-700 rounded hover:bg-green-100 transition-all text-[8px] uppercase font-bold shrink-0"
                                            >
                                                Copiar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* === SEÇÃO DE LINK 2 (SECUNDÁRIO - OPCIONAL) === */}
                                <div className="p-4 bg-indigo-50/20 border-l-4 border-indigo-500 border border-indigo-100 rounded-2xl space-y-3 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-indigo-700 flex items-center gap-1.5">
                                            🔗 LINK 2 (SECUNDÁRIO - OPCIONAL)
                                        </span>
                                        {shopeeLink2 && (
                                            <span className="text-[9px] font-black text-indigo-500 uppercase px-2 py-0.5 bg-indigo-100 rounded-lg">Configurado</span>
                                        )}
                                    </div>
                                    
                                    {/* Alternador de Tipo de Link 2 */}
                                    <div className="flex gap-2 p-1 bg-white border border-indigo-100 rounded-xl">
                                        <button 
                                            type="button"
                                            onClick={() => { setLinkType2('shopee'); setShopeeLink2(''); }} 
                                            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${linkType2 === 'shopee' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            🛍️ Shopee
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => { setLinkType2('custom'); setCustomLink2(''); setShopeeLink2(''); }} 
                                            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${linkType2 === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            🌐 Site Customizado
                                        </button>
                                    </div>

                                    {linkType2 === 'shopee' ? (
                                        <div className="space-y-2">
                                            <div className="flex gap-1 p-1 bg-orange-50/50 border border-orange-100/50 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setShopeeMode2('select')}
                                                    className={`flex-1 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${shopeeMode2 === 'select' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-400 hover:text-orange-500'}`}
                                                >
                                                    📋 Selecionar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShopeeMode2('new')}
                                                    className={`flex-1 py-1 text-[9px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-0.5 ${shopeeMode2 === 'new' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-400 hover:text-orange-500'}`}
                                                >
                                                    <Plus size={10} /> Novo
                                                </button>
                                            </div>

                                            {shopeeMode2 === 'select' ? (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={savedLinksSearch2}
                                                        onChange={e => setSavedLinksSearch2(e.target.value)}
                                                        placeholder="Buscar link salvo..."
                                                        className="w-full px-3 py-1.5 bg-white border border-orange-100 rounded-lg outline-none text-xs font-bold text-gray-700 transition-all"
                                                    />
                                                    <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                                                        {savedLinks
                                                            .filter(l => !savedLinksSearch2 || l.slug?.toLowerCase().includes(savedLinksSearch2.toLowerCase()) || l.target_url?.toLowerCase().includes(savedLinksSearch2.toLowerCase()))
                                                            .map(link => {
                                                                const fullUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${link.slug}`;
                                                                const isSelected = shopeeLink2 === fullUrl;
                                                                return (
                                                                    <button
                                                                        key={link.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setShopeeLink2(fullUrl);
                                                                            showAlert('Link 2 selecionado!', 'success');
                                                                        }}
                                                                        className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left text-[10px] ${isSelected ? 'border-orange-400 bg-orange-50 text-orange-900 font-bold' : 'border-gray-100 bg-white text-gray-700 hover:bg-orange-50/30'}`}
                                                                    >
                                                                        <span className="truncate pr-2 font-mono">/{link.slug}</span>
                                                                        <span className="text-[8px] text-orange-500 font-black shrink-0">{link.clicks || 0} clics</span>
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="relative group">
                                                        <div className="absolute top-2.5 left-3 text-orange-500"><LinkIcon size={14} /></div>
                                                        <input 
                                                            type="text" 
                                                            value={shopeeLink2} 
                                                            onChange={e => handleShopeeLinkChange2(e.target.value)}
                                                            placeholder="Link ou Nome do Produto..."
                                                            className="w-full pl-8 pr-20 py-2 bg-orange-50/50 border border-orange-100 rounded-xl focus:border-orange-500 outline-none text-gray-800 text-xs font-bold transition-all" 
                                                        />
                                                        <div className="absolute right-1.5 top-1 flex gap-0.5">
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleMagicShopeeLink2()}
                                                                disabled={isGeneratingLink2}
                                                                className="p-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all disabled:opacity-50"
                                                            >
                                                                {isGeneratingLink2 ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                            </button>
                                                            {shopeeLink2 && (
                                                                <button type="button" onClick={() => setShopeeLink2('')} className="p-1 bg-white text-gray-400 rounded-lg hover:text-red-500 border border-orange-100"><X size={12} /></button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={customSlug2} 
                                                        onChange={e => setCustomSlug2(e.target.value)}
                                                        placeholder="Nome do link (opcional, ex: dorama)"
                                                        className="w-full px-3 py-1.5 bg-white border border-orange-100 rounded-xl focus:border-orange-500 outline-none text-gray-800 text-xs transition-all" 
                                                    />
                                                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto py-0.5">
                                                        {shopeeCategories.map(cat => (
                                                            <button key={cat.id} type="button" onClick={() => handleMagicShopeeLink2(cat.keywords || cat.name)} className="px-2 py-1 bg-white border border-orange-100 text-orange-600 rounded-md text-[8px] font-black uppercase hover:bg-orange-500 hover:text-white transition-all">{cat.name}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative group">
                                                <div className="absolute top-2.5 left-3 text-indigo-500"><Globe size={14} /></div>
                                                <input 
                                                    type="text" 
                                                    value={customLink2} 
                                                    onChange={e => setCustomLink2(e.target.value)}
                                                    placeholder="https://seu-site.com/pagina"
                                                    className="w-full pl-8 pr-20 py-2 bg-indigo-50/30 border border-indigo-100 rounded-xl focus:border-indigo-600 outline-none text-gray-800 text-xs font-bold transition-all" 
                                                />
                                                <div className="absolute right-1.5 top-1 flex gap-0.5">
                                                    <button 
                                                        type="button"
                                                        onClick={handleShortenCustomLink2}
                                                        disabled={isGeneratingLink2}
                                                        className="p-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                                                    >
                                                        {isGeneratingLink2 ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                    </button>
                                                    {customLink2 && (
                                                        <button type="button" onClick={() => { setCustomLink2(''); setShopeeLink2(''); setCustomSlug2(''); }} className="p-1 bg-white text-gray-400 rounded-lg hover:text-red-500 border border-indigo-100"><X size={12} /></button>
                                                    )}
                                                </div>
                                            </div>
                                            <input 
                                                type="text" 
                                                value={customSlug2} 
                                                onChange={e => setCustomSlug2(e.target.value)}
                                                placeholder="Nome do link (opcional, ex: dorama)"
                                                className="w-full px-3 py-1.5 bg-white border border-indigo-100 rounded-xl focus:border-indigo-600 outline-none text-gray-800 text-xs transition-all" 
                                            />
                                            {savedLinks.length > 0 && (
                                                <div className="space-y-1 bg-indigo-50/20 border border-indigo-100/50 rounded-xl p-2 text-[9px]">
                                                    <span className="text-[8px] text-indigo-500 font-bold block mb-1">📋 LINKS RÁPIDOS:</span>
                                                    <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                                                        {savedLinks.slice(0, 5).map(link => {
                                                            const shortUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${link.slug}`;
                                                            const isSelected = shopeeLink2 === shortUrl;
                                                            return (
                                                                <button
                                                                    key={link.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setCustomLink2(link.target_url);
                                                                        setCustomSlug2(link.slug);
                                                                        setShopeeLink2(shortUrl);
                                                                        showAlert('Link rápido 2 selecionado!', 'success');
                                                                    }}
                                                                    className={`w-full flex items-center justify-between p-1 rounded-md border text-[9px] ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-indigo-50 text-gray-700 hover:bg-indigo-50'}`}
                                                                >
                                                                    <span className="truncate pr-2 font-mono">/{link.slug}</span>
                                                                    <span className="shrink-0">{link.clicks || 0} clics</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {shopeeLink2 && (
                                        <div className="p-2 bg-green-50 border border-green-100 rounded-xl flex items-center justify-between text-[10px] text-green-700 font-black font-mono">
                                            <span className="truncate">✅ {shopeeLink2}</span>
                                            <button 
                                                type="button"
                                                onClick={() => { navigator.clipboard.writeText(shopeeLink2); addLog('📋 Link 2 copiado!'); }} 
                                                className="px-2 py-0.5 bg-white border border-green-200 text-green-700 rounded hover:bg-green-100 transition-all text-[8px] uppercase font-bold shrink-0"
                                            >
                                                Copiar
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Trial Mode Toggle */}
                                <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-2xl">
                                        <div>
                                            <p className="text-xs font-black text-indigo-800">Modo Teste (Trial Reels)</p>
                                            <p className="text-[10px] text-indigo-600 mt-0.5">Postar sem distribuir no Feed principal</p>
                                        </div>
                                        <button 
                                            onClick={() => setIsTrialMode(!isTrialMode)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTrialMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTrialMode ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                </div>

                                {/* Comment Link Toggle */}
                                 <div className="flex flex-col p-3 bg-orange-50 border border-orange-100 rounded-2xl space-y-3">
                                     <div className="flex items-center justify-between">
                                         <div>
                                             <p className="text-xs font-black text-orange-800">Comentar Link no Post</p>
                                             <p className="text-[10px] text-orange-600 mt-0.5">Postar o link no primeiro comentário (no Instagram: avisa que o link está na Bio)</p>
                                         </div>
                                         <button 
                                             type="button"
                                             onClick={() => setCommentLinkInPost(!commentLinkInPost)}
                                             className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${commentLinkInPost ? 'bg-orange-500' : 'bg-gray-300'}`}
                                         >
                                             <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${commentLinkInPost ? 'translate-x-6' : 'translate-x-1'}`} />
                                         </button>
                                     </div>
                                     
                                     {commentLinkInPost && (
                                         <div className="space-y-2 pt-1 border-t border-orange-100/50">
                                             <div className="flex items-center justify-between">
                                                 <label className="text-[10px] font-black text-orange-800 uppercase tracking-wider">
                                                     Frases para Comentário (Randomização)
                                                 </label>
                                                 <span className="text-[8px] text-orange-600 bg-orange-100/50 px-1.5 py-0.5 rounded-full font-bold">
                                                     Uma por linha (Até 10)
                                                 </span>
                                             </div>
                                             <textarea
                                                 value={customCommentPhrases}
                                                 onChange={(e) => setCustomCommentPhrases(e.target.value)}
                                                 placeholder="Exemplo:&#10;Adquira nosso curso neste link {link}&#10;Mega promoção do nosso curso neste link {link}"
                                                 rows={3}
                                                 className="w-full p-2.5 bg-white border border-orange-200 rounded-xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none text-gray-800 text-[11px] placeholder:text-gray-400 transition-all resize-none shadow-sm"
                                             />
                                             <p className="text-[9px] text-orange-700 leading-normal">
                                                 💡 O sistema escolherá 1 frase aleatoriamente. Se usar <code className="font-mono bg-orange-100/80 px-1 rounded text-orange-800 font-bold">{'{link}'}</code>, o link será inserido naquele exato local; caso contrário, será anexado ao final.
                                             </p>
                                         </div>
                                     )}
                                 </div>

                                {/* Royalty Earnings Toggle */}
                                <div className="flex flex-col p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="text-emerald-600"><Music size={16} /></div>
                                            <div>
                                                <p className="text-xs font-black text-emerald-800">Ativar Ganhos de Royalties</p>
                                                <p className="text-[10px] text-emerald-600 mt-0.5">Adicionar áudio/música de fundo elegível a royalties</p>
                                            </div>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setEnableRoyalties(!enableRoyalties)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableRoyalties ? 'bg-emerald-600' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableRoyalties ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                    
                                    <AnimatePresence>
                                        {enableRoyalties && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="space-y-3 overflow-hidden pt-1"
                                            >
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block">Links do Áudio MP3 / TikTok / YouTube</label>
                                                    <textarea 
                                                        value={royaltyMusicUrls} 
                                                        onChange={e => setRoyaltyMusicUrls(e.target.value)} 
                                                        rows={3}
                                                        placeholder="https://...mp3&#10;https://www.youtube.com/watch?...&#10;https://sndo.ffm.to/...&#10;(Adicione um por linha para escolher aleatoriamente em agendamentos em lote)"
                                                        className="w-full px-3 py-2 bg-white border border-emerald-100 rounded-xl focus:border-emerald-500 outline-none text-gray-800 text-xs font-medium resize-none transition-all" 
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                                                        <span>Volume do Áudio de Fundo</span>
                                                        <span>{Math.round(royaltyVolume * 100)}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="1" 
                                                        step="0.05"
                                                        value={royaltyVolume} 
                                                        onChange={e => setRoyaltyVolume(parseFloat(e.target.value))}
                                                        className="w-full accent-emerald-600 cursor-pointer" 
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Caption */}
                                <div className="relative">
                                    <div className="absolute top-3 left-4 text-gray-400"><MessageSquare size={16} /></div>
                                    <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)} rows={3}
                                        placeholder={!selectedItem ? "Legenda Padrão / Tags (Será anexada a todos os vídeos, ou usada se o vídeo não tiver legenda)..." : "Legenda..."}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-purple-500 outline-none text-gray-800 text-xs font-medium resize-none" />
                                </div>

                                {/* Schedule Wizard */}
                                <AnimatePresence mode="wait">
                                    {scheduleMode && wizardStep === 1 && (
                                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                                            <div className="bg-purple-50 rounded-2xl p-4 space-y-4">
                                                <p className="text-xs font-black text-purple-700 uppercase tracking-widest">⚙️ Configurar Agendamento</p>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Posts por dia?</label>
                                                    <div className="flex gap-2">
                                                        {[1, 2, 3, 4, 5].map(n => (
                                                            <button key={n} onClick={() => { 
                                                                setPostsPerDay(n); 
                                                                setTimeSlots(prev => {
                                                                    const defs = ['09:00', '12:00', '15:00', '18:00', '21:00'];
                                                                    let next = [...prev].slice(0, n);
                                                                    for (const d of defs) {
                                                                        if (next.length >= n) break;
                                                                        if (!next.includes(d)) next.push(d);
                                                                    }
                                                                    return next.sort();
                                                                }); 
                                                            }}
                                                                className={`w-12 h-10 rounded-xl font-black text-sm transition-all ${postsPerDay === n ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-purple-100 border border-gray-200'}`}>{n}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Horários ({timeSlots.length}/{postsPerDay})</label>
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {timeSlots.map(t => (
                                                            <span key={t} className="flex items-center gap-1 bg-white border border-purple-200 text-purple-700 text-xs font-black px-3 py-1.5 rounded-lg">
                                                                <Clock size={11} /> {t}
                                                                <button onClick={() => removeTimeSlot(t)} className="ml-1 text-gray-400 hover:text-red-500 transition-colors"><X size={11} /></button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {timeSlots.length < postsPerDay && (
                                                        <div className="flex gap-2">
                                                            <input type="time" value={newTimeInput} onChange={e => setNewTimeInput(e.target.value)}
                                                                className="flex-1 px-3 py-2 bg-white border-2 border-purple-100 rounded-xl text-sm font-bold text-gray-800 focus:border-purple-400 outline-none" />
                                                            <button onClick={addTimeSlot} className="px-3 py-2 bg-purple-600 text-white rounded-xl hover:brightness-110 transition-all"><Plus size={16} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {scheduleMode && wizardStep === 2 && (
                                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                                                <p className="text-xs font-black text-yellow-800 mb-1">⚠️ Já existem {existingQueueCount} post(s) agendados</p>
                                                <p className="text-[10px] text-yellow-600">Onde inserir os novos posts?</p>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button onClick={() => setQueuePosition('start')} className={`p-3 rounded-2xl border-2 font-black text-sm transition-all flex flex-col items-center justify-center text-center ${queuePosition === 'start' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-purple-300'}`}>
                                                    ⬆️<br /><span className="text-[10px] leading-tight">INÍCIO<br/>DA FILA</span>
                                                </button>
                                                <button onClick={() => setQueuePosition('today')} className={`p-3 rounded-2xl border-2 font-black text-sm transition-all flex flex-col items-center justify-center text-center ${queuePosition === 'today' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-purple-300'}`}>
                                                    🔄<br /><span className="text-[10px] leading-tight">INICIA<br/>HOJE</span>
                                                </button>
                                                <button onClick={() => setQueuePosition('end')} className={`p-3 rounded-2xl border-2 font-black text-sm transition-all flex flex-col items-center justify-center text-center ${queuePosition === 'end' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-purple-300'}`}>
                                                    ⬇️<br /><span className="text-[10px] leading-tight">FINAL<br/>DA FILA</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Progress Bar & Status (New Tier 1 UX) */}
                                {(isPosting || savingSchedule) && (
                                    <div className="space-y-2 py-2 px-1">
                                        <div className="flex justify-between items-center text-[10px] font-black tracking-widest text-purple-600 uppercase">
                                            <span className="flex items-center gap-2">
                                                <RefreshCw size={10} className="animate-spin" />
                                                {progressAction || 'Processando...'}
                                            </span>
                                            <span className="bg-purple-100 px-1.5 py-0.5 rounded-md">{progress}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-100">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                                className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Schedule Preview Information */}
                                {scheduleMode && !isPosting && !savingSchedule && !postSuccess && (
                                    <div className="p-4 bg-indigo-50/50 border-2 border-dashed border-indigo-100 rounded-2xl flex flex-col gap-2">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                                                <Clock size={12} /> Primeiro Post Previsto
                                            </span>
                                            <span className="font-black text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
                                                {getFirstPostPreview() || '---'}
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-indigo-400 font-medium leading-relaxed italic">
                                            *Baseado em {postsPerDay} posts/dia e na fila atual de {existingQueueCount} posts.
                                         </p>
                                    </div>
                                )}

                                {/* Post Results per account */}
                                {postResults.length > 0 && (
                                    <div className="space-y-1">
                                        {postResults.map((r, i) => (
                                            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                {r.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                                <span className="truncate">{r.name}: {r.msg}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Logs */}
                                {(isPosting && postLogs.length > 0) && (
                                    <div className="bg-gray-900 rounded-xl p-3 font-mono text-[9px] text-gray-300 space-y-1 max-h-20 overflow-y-auto">
                                        {postLogs.map((log, i) => <div key={i}>{log}</div>)}
                                    </div>
                                )}

                                {postError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2"><AlertCircle size={14} />{postError}</div>}
                                {postSuccess && (
                                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                        className="p-5 bg-green-50 border-2 border-green-100 text-green-700 rounded-3xl text-center space-y-2">
                                        <div className="flex justify-center">
                                            <div className="bg-green-500 text-white p-3 rounded-full shadow-lg shadow-green-200">
                                                <CheckCircle2 size={32} />
                                            </div>
                                        </div>
                                        <p className="text-sm font-black uppercase tracking-tight">{selectedItem?.type === 'carousel' ? 'Carrossel Postado' : (selectedItem?.type === 'image' ? 'Imagem Postada' : 'Vídeo Postado')} com Sucesso!</p>
                                        <p className="text-[10px] opacity-80 font-bold">A mídia já está disponível em todas as contas selecionadas.</p>
                                    </motion.div>
                                )}

                                {/* Action Button */}
                                {!scheduleMode ? (
                                    <button onClick={handleQuickPost} disabled={isPosting || selectedAccounts.length === 0 || !!postSuccess}
                                        className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 text-sm">
                                        {isPosting ? <><Loader2 className="w-5 h-5 animate-spin" /> PUBLICANDO {selectedAccounts.length} CONTA(S)...</>
                                            : postSuccess ? <><CheckCircle2 size={18} /> CONCLUÍDO!</>
                                                : <><Send size={18} /> PUBLICAR EM {selectedAccounts.length || '?'} CONTA(S)</>}
                                    </button>
                                ) : wizardStep === 1 ? (
                                    <button onClick={handleScheduleNext} disabled={timeSlots.length < postsPerDay || selectedAccounts.length === 0 || savingSchedule}
                                        className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 text-sm">
                                        {savingSchedule ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar size={18} />}
                                        {savingSchedule ? 'VERIFICANDO...' 
                                            : timeSlots.length < postsPerDay ? `ADICIONE +${postsPerDay - timeSlots.length} HORÁRIO(S)`
                                            : selectedAccounts.length === 0 ? 'SELECIONE UMA CONTA'
                                            : `PRÓXIMO → (${selectedAccounts.length} conta(s))`}
                                    </button>
                                ) : (
                                    <button onClick={() => submitSchedule(queuePosition)} disabled={savingSchedule}
                                        className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 text-sm">
                                        {savingSchedule ? <><Loader2 className="w-5 h-5 animate-spin" /> AGENDANDO...</> : <><CheckCircle2 size={18} /> CONFIRMAR AGENDAMENTO</>}
                                    </button>
                                )}
                            </div>

                            {/* INTERNAL ASSOCIATION CONFIRM DIALOG */}
                            <AnimatePresence>
                                {assocConfirmData && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 z-[10000] flex items-center justify-center p-6 bg-white/95 backdrop-blur-sm"
                                    >
                                        <div className="text-center max-w-sm">
                                            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mx-auto mb-6">
                                                <Users size={32} />
                                            </div>
                                            <h3 className="text-xl font-black text-gray-900 mb-2 leading-tight">Contas Associadas!</h3>
                                            <p className="text-sm text-gray-500 font-medium leading-relaxed mb-8">
                                                Esta conta possui <span className="text-purple-600 font-black">{assocConfirmData.unselected.length}</span> conta(s) vinculada(s). 
                                                Deseja selecionar todas para postar simultaneamente?
                                            </p>
                                            
                                            <div className="flex flex-col gap-3">
                                                <button
                                                    onClick={() => confirmAssocSelection(true)}
                                                    className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                >
                                                    Sim, selecionar todas
                                                </button>
                                                <button
                                                    onClick={() => confirmAssocSelection(false)}
                                                    className="w-full py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                                                >
                                                    Não, apenas esta
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>
            )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default MediaDownloaderPage;