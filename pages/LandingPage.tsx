import React from 'react';
import {
    Zap,
    MessageCircle,
    Send,
    Facebook,
    Instagram,
    ShoppingBag,
    Calendar,
    BarChart2,
    Bot,
    Video,
    Shield,
    Sparkles,
    ArrowRight,
    Check,
    Pin
} from 'lucide-react';

const LandingPage: React.FC = () => {
    const features = [
        { icon: MessageCircle, title: 'WhatsApp Automation', description: 'Envio automático para grupos e contatos', color: 'text-green-500' },
        { icon: Send, title: 'Telegram Bot', description: 'Automação completa para canais e grupos', color: 'text-blue-500' },
        { icon: Facebook, title: 'Facebook Pages', description: 'Publicação automática em páginas', color: 'text-blue-600' },
        { icon: Instagram, title: 'Instagram Reels', description: 'Upload em massa de até 50 vídeos', color: 'text-pink-500' },
        { icon: Pin, title: 'Pinterest Pins', description: 'Postagem automática de produtos', color: 'text-red-500' },
        { icon: ShoppingBag, title: 'Shopee Affiliate', description: 'Busca e importação de produtos', color: 'text-orange-500' },
        { icon: Video, title: 'Shopee Video', description: 'Download de vídeos para repost', color: 'text-orange-600' },
        { icon: Calendar, title: 'Agendamentos', description: 'Programação inteligente de envios', color: 'text-purple-500' },
        { icon: BarChart2, title: 'Analytics', description: 'Dashboard com estatísticas em tempo real', color: 'text-indigo-500' },
        { icon: Bot, title: 'IA Gemini', description: 'Geração automática de legendas', color: 'text-cyan-500' }
    ];

    const stats = [
        { value: '10+', label: 'Plataformas Integradas' },
        { value: '100%', label: 'Automação' },
        { value: '24/7', label: 'Disponibilidade' },
        { value: '∞', label: 'Envios Ilimitados' }
    ];

    const platforms = [
        { icon: MessageCircle, name: 'WhatsApp', color: 'bg-green-500' },
        { icon: Send, name: 'Telegram', color: 'bg-blue-500' },
        { icon: Facebook, name: 'Facebook', color: 'bg-blue-600' },
        { icon: Instagram, name: 'Instagram', color: 'bg-pink-500' },
        { icon: Pin, name: 'Pinterest', color: 'bg-red-500' },
        { icon: ShoppingBag, name: 'Shopee', color: 'bg-orange-500' }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-pink-900">
            {/* Hero Section */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-pink-600/20 to-orange-600/20 backdrop-blur-3xl"></div>

                <div className="relative max-w-7xl mx-auto px-6 py-24">
                    {/* Navigation Bar */}
                    <div className="flex items-center justify-between mb-12">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/50">
                                <Zap className="text-white w-10 h-10" />
                            </div>
                            <h1 className="text-5xl font-bold text-white">MeliFlow</h1>
                        </div>

                        {/* Auth Buttons */}
                        <div className="flex items-center gap-4">
                            <a
                                href="/login"
                                className="px-6 py-3 bg-white/10 backdrop-blur-lg border border-white/20 text-white rounded-xl font-bold hover:bg-white/20 transition-all"
                            >
                                Login
                            </a>
                            <a
                                href="/register"
                                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold hover:shadow-xl hover:shadow-purple-500/50 transition-all"
                            >
                                Cadastrar
                            </a>
                        </div>
                    </div>

                    {/* Hero Content */}
                    <div className="text-center mb-16">
                        <h2 className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight">
                            Automação Completa<br />
                            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
                                Multi-Plataforma
                            </span>
                        </h2>
                        <p className="text-xl md:text-2xl text-purple-100 mb-12 max-w-3xl mx-auto">
                            Publique produtos em WhatsApp, Telegram, Instagram, Facebook, Pinterest e Shopee automaticamente.
                            Economize tempo e multiplique seus resultados.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <a
                                href="/register"
                                className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:shadow-2xl hover:shadow-purple-500/50 transition-all flex items-center justify-center gap-2"
                            >
                                Começar Agora
                                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
                            </a>
                            <a
                                href="/login"
                                className="px-8 py-4 bg-white/10 backdrop-blur-lg border border-white/20 text-white rounded-xl font-bold text-lg hover:bg-white/20 transition-all"
                            >
                                Já tenho conta
                            </a>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
                        {stats.map((stat, index) => (
                            <div key={index} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 text-center hover:bg-white/20 transition-all">
                                <p className="text-4xl font-bold text-white mb-2">{stat.value}</p>
                                <p className="text-purple-200">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="max-w-7xl mx-auto px-6 py-24">
                <div className="text-center mb-16">
                    <h3 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Tudo que você precisa em um só lugar
                    </h3>
                    <p className="text-xl text-purple-200">
                        10 funcionalidades poderosas para automatizar suas vendas
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <div key={index} className="group bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 hover:bg-white/20 hover:scale-105 transition-all duration-300">
                            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${feature.color}`}>
                                <feature.icon size={28} />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-2">{feature.title}</h4>
                            <p className="text-purple-200">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Platforms Section */}
            <div className="max-w-7xl mx-auto px-6 py-24">
                <div className="text-center mb-16">
                    <h3 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Integrado com as principais plataformas
                    </h3>
                    <p className="text-xl text-purple-200">
                        Publique em todos os canais simultaneamente
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                    {platforms.map((platform, index) => (
                        <div key={index} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 hover:bg-white/20 transition-all text-center group">
                            <div className={`w-16 h-16 ${platform.color} rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                                <platform.icon className="text-white" size={32} />
                            </div>
                            <p className="text-white font-bold">{platform.name}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Benefits Section */}
            <div className="max-w-7xl mx-auto px-6 py-24">
                <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 backdrop-blur-lg border border-white/20 rounded-3xl p-12">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <div>
                            <h3 className="text-4xl font-bold text-white mb-6">
                                Por que escolher o MeliFlow?
                            </h3>
                            <div className="space-y-4">
                                {[
                                    'Economize horas de trabalho manual',
                                    'Aumente seu alcance em múltiplas plataformas',
                                    'Geração automática de legendas com IA',
                                    'Agendamento inteligente de postagens',
                                    'Analytics completo em tempo real',
                                    'Suporte para produtos Shopee'
                                ].map((benefit, index) => (
                                    <div key={index} className="flex items-center gap-3">
                                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Check size={16} className="text-white" />
                                        </div>
                                        <p className="text-lg text-purple-100">{benefit}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="relative">
                            <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl p-8 shadow-2xl">
                                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-4">
                                    <Sparkles className="text-yellow-300 mb-2" size={32} />
                                    <h4 className="text-2xl font-bold text-white mb-2">Automação Inteligente</h4>
                                    <p className="text-purple-100">IA integrada para otimizar suas publicações</p>
                                </div>
                                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                                    <Shield className="text-green-300 mb-2" size={32} />
                                    <h4 className="text-2xl font-bold text-white mb-2">100% Seguro</h4>
                                    <p className="text-purple-100">Seus dados e credenciais protegidos</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pricing Section */}
            <div className="max-w-7xl mx-auto px-6 py-24">
                <div className="text-center mb-16">
                    <h3 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Escolha o Plano Ideal Para Você
                    </h3>
                    <p className="text-xl text-purple-200">
                        Todos os planos com acesso completo às funcionalidades
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {/* Plano Básico */}
                    <div className="bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-3xl p-8 hover:scale-105 transition-all">
                        <div className="text-center mb-6">
                            <h4 className="text-2xl font-bold text-white mb-2">Básico</h4>
                            <p className="text-purple-300 text-sm mb-4">Para quem está começando</p>
                            <div className="mb-4">
                                <p className="text-sm text-purple-300 line-through opacity-50">R$ 197/mês</p>
                                <p className="text-5xl font-bold text-white mb-1">R$ 59</p>
                                <p className="text-purple-200 text-sm">/mês</p>
                            </div>
                        </div>

                        <div className="space-y-3 mb-8">
                            {[
                                'WhatsApp + Telegram automação',
                                'Até 100 envios/dia',
                                'Dashboard básico',
                                'Suporte por email',
                                'Templates básicos'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Check size={16} className="text-green-400 flex-shrink-0" />
                                    <p className="text-sm text-purple-100">{feature}</p>
                                </div>
                            ))}
                        </div>

                        <a
                            href="/register?plan=basic"
                            className="block w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl font-bold text-center transition-all"
                        >
                            Começar Agora
                        </a>
                    </div>

                    {/* Plano Profissional (DESTAQUE) */}
                    <div className="relative bg-gradient-to-br from-purple-600/30 to-pink-600/30 backdrop-blur-lg border-4 border-purple-500 rounded-3xl p-8 shadow-2xl transform scale-105">
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-2 rounded-full font-bold text-sm shadow-lg">
                            ⭐ MAIS POPULAR
                        </div>

                        <div className="text-center mb-6 mt-4">
                            <h4 className="text-2xl font-bold text-white mb-2">Profissional</h4>
                            <p className="text-purple-200 text-sm mb-4">Ideal para afiliados sérios</p>
                            <div className="mb-4">
                                <p className="text-sm text-purple-300 line-through opacity-50">R$ 497/mês</p>
                                <p className="text-6xl font-bold text-yellow-400 mb-1">R$ 147</p>
                                <p className="text-purple-200 text-sm">/mês</p>
                            </div>
                        </div>

                        <div className="space-y-3 mb-8">
                            {[
                                'Automação em 6 plataformas',
                                'Envios ilimitados',
                                'Dashboard analytics completo',
                                'IA Gemini para legendas',
                                'Upload em massa Instagram (50 vídeos)',
                                'Shopee Afiliados completo',
                                'Agendamento inteligente',
                                'Suporte prioritário 24/7'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Check size={16} className="text-green-400 flex-shrink-0" />
                                    <p className="text-sm text-white font-medium">{feature}</p>
                                </div>
                            ))}
                        </div>

                        <a
                            href="/register?plan=professional"
                            className="block w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-xl font-bold text-lg text-center hover:shadow-2xl hover:shadow-purple-500/50 transition-all"
                        >
                            🚀 Escolher Profissional
                        </a>
                    </div>

                    {/* Plano Premium */}
                    <div className="bg-gradient-to-br from-yellow-600/20 to-orange-600/20 backdrop-blur-lg border-2 border-yellow-500 rounded-3xl p-8 hover:scale-105 transition-all">
                        <div className="text-center mb-6">
                            <h4 className="text-2xl font-bold text-white mb-2">Premium</h4>
                            <p className="text-purple-200 text-sm mb-4">Acesso total ao sistema</p>
                            <div className="mb-4">
                                <p className="text-sm text-purple-300 line-through opacity-50">R$ 997/mês</p>
                                <p className="text-5xl font-bold text-yellow-400 mb-1">R$ 297</p>
                                <p className="text-purple-200 text-sm">/mês</p>
                            </div>
                        </div>

                        <div className="space-y-3 mb-8">
                            {[
                                '✨ TUDO do Profissional +',
                                'API completa para integração',
                                'White label (sua marca)',
                                'Automações personalizadas',
                                'Gerente de conta dedicado',
                                'Consultoria mensal 1-on-1',
                                'Acesso antecipado a features',
                                'Suporte VIP instantâneo'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Check size={16} className="text-yellow-400 flex-shrink-0" />
                                    <p className="text-sm text-white font-medium">{feature}</p>
                                </div>
                            ))}
                        </div>

                        <a
                            href="/register?plan=premium"
                            className="block w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-xl font-bold text-center hover:shadow-2xl hover:shadow-yellow-500/50 transition-all"
                        >
                            👑 Escolher Premium
                        </a>
                    </div>
                </div>

                {/* Garantia */}
                <div className="mt-12 max-w-2xl mx-auto bg-green-500/20 border-2 border-green-500 rounded-xl p-6 text-center">
                    <Shield className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="font-bold text-lg text-white mb-2">🛡️ Garantia Incondicional de 30 Dias</p>
                    <p className="text-sm text-purple-200">
                        Se não multiplicar vendas em 30 dias, devolvemos 100% sem perguntas
                    </p>
                </div>
            </div>

            {/* CTA Section */}
            <div className="max-w-7xl mx-auto px-6 py-24">
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl p-12 text-center shadow-2xl">
                    <h3 className="text-4xl md:text-5xl font-bold text-white mb-6">
                        Pronto para automatizar suas vendas?
                    </h3>
                    <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                        Junte-se a centenas de vendedores que já economizam tempo e multiplicam resultados com o MeliFlow
                    </p>
                    <a
                        href="/register"
                        className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-600 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all"
                    >
                        Começar Gratuitamente
                        <ArrowRight size={20} />
                    </a>
                </div>
            </div>

            {/* Social Media Section */}
            <div className="max-w-7xl mx-auto px-6 py-16">
                <div className="text-center mb-8">
                    <h3 className="text-3xl font-bold text-white mb-3">Siga-nos nas Redes Sociais</h3>
                    <p className="text-xl text-purple-200">Fique por dentro das novidades e atualizações do MeliFlow</p>
                </div>

                <div className="flex justify-center gap-6 flex-wrap">
                    <a
                        href="https://instagram.com/meliflow"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Siga-nos no Instagram"
                        className="group bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-2xl p-6 hover:bg-gradient-to-br hover:from-purple-600 hover:to-pink-600 hover:border-pink-500 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-pink-500/50"
                    >
                        <Instagram className="text-white" size={40} />
                    </a>

                    <a
                        href="https://facebook.com/meliflow"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Curta nossa página no Facebook"
                        className="group bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-2xl p-6 hover:bg-blue-600 hover:border-blue-500 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-blue-500/50"
                    >
                        <Facebook className="text-white" size={40} />
                    </a>

                    <a
                        href="https://twitter.com/meliflow"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Siga-nos no Twitter/X"
                        className="group bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-2xl p-6 hover:bg-sky-500 hover:border-sky-400 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-sky-500/50"
                    >
                        <Send className="text-white" size={40} />
                    </a>

                    <a
                        href="https://youtube.com/@meliflow"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Inscreva-se no nosso canal do YouTube"
                        className="group bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-2xl p-6 hover:bg-red-600 hover:border-red-500 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-red-500/50"
                    >
                        <Video className="text-white" size={40} />
                    </a>

                    <a
                        href="https://tiktok.com/@meliflow"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Siga-nos no TikTok"
                        className="group bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-2xl p-6 hover:bg-black hover:border-gray-700 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-gray-500/50"
                    >
                        <ShoppingBag className="text-white" size={40} />
                    </a>

                    <a
                        href="https://linkedin.com/company/meliflow"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Conecte-se conosco no LinkedIn"
                        className="group bg-white/10 backdrop-blur-lg border-2 border-white/20 rounded-2xl p-6 hover:bg-blue-700 hover:border-blue-600 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-blue-600/50"
                    >
                        <BarChart2 className="text-white" size={40} />
                    </a>
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-white/10 py-12">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-xl flex items-center justify-center">
                                <Zap className="text-white w-6 h-6" />
                            </div>
                            <span className="text-2xl font-bold text-white">MeliFlow</span>
                        </div>
                        <p className="text-purple-200">
                            © 2025 MeliFlow Auto Publisher. Todos os direitos reservados.
                        </p>
                        <div className="flex gap-6">
                            <a href="#" className="text-purple-200 hover:text-white transition-colors">Termos</a>
                            <a href="#" className="text-purple-200 hover:text-white transition-colors">Privacidade</a>
                            <a href="#" className="text-purple-200 hover:text-white transition-colors">Suporte</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
