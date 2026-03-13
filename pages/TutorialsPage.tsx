import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, Instagram, Facebook, Twitter, MessageCircle, Send, Pin, ShoppingBag, Settings } from 'lucide-react';

interface TutorialSection {
    id: string;
    title: string;
    icon: React.ElementType;
    color: string;
    steps: {
        title: string;
        description: string;
        link?: {
            url: string;
            text: string;
        };
    }[];
}

const TutorialsPage: React.FC = () => {
    const [expandedSection, setExpandedSection] = useState<string | null>('instagram');

    const tutorials: TutorialSection[] = [
        {
            id: 'instagram',
            title: 'Instagram',
            icon: Instagram,
            color: 'from-pink-500 to-purple-500',
            steps: [
                {
                    title: '1. Criar uma Conta de Desenvolvedor no Facebook',
                    description: 'Acesse o Facebook Developers e crie uma conta de desenvolvedor se ainda não tiver uma.',
                    link: {
                        url: 'https://developers.facebook.com/',
                        text: 'Facebook Developers'
                    }
                },
                {
                    title: '2. Criar um App no Facebook',
                    description: 'No painel do Facebook Developers, crie um novo aplicativo. Escolha o tipo "Business" e preencha as informações necessárias.'
                },
                {
                    title: '3. Adicionar o Produto Instagram Graph API',
                    description: 'No seu app, vá em "Produtos" e adicione "Instagram Graph API". Configure as permissões necessárias: instagram_basic, instagram_content_publish.'
                },
                {
                    title: '4. Conectar sua Conta do Instagram',
                    description: 'Certifique-se de que sua conta do Instagram está convertida para uma Conta Comercial ou de Criador e está vinculada a uma Página do Facebook.'
                },
                {
                    title: '5. Obter Access Token',
                    description: 'Use o Graph API Explorer para gerar um Access Token com as permissões necessárias. Recomenda-se gerar um token de longa duração.',
                    link: {
                        url: 'https://developers.facebook.com/tools/explorer/',
                        text: 'Graph API Explorer'
                    }
                },
                {
                    title: '6. Obter Instagram Account ID',
                    description: 'No Graph API Explorer, faça uma requisição GET para "me/accounts" para obter o ID da sua página do Facebook. Depois, use "{page-id}?fields=instagram_business_account" para obter o Instagram Account ID.'
                },
                {
                    title: '7. Configurar no FluxoInteligente',
                    description: 'Cole o Access Token e o Instagram Account ID na página de configuração do Instagram no FluxoInteligente e clique em "Conectar Conta".'
                }
            ]
        },
        {
            id: 'facebook',
            title: 'Facebook',
            icon: Facebook,
            color: 'from-blue-500 to-blue-600',
            steps: [
                {
                    title: '1. Criar um App no Facebook Developers',
                    description: 'Acesse o Facebook Developers e crie um novo aplicativo do tipo "Business".',
                    link: {
                        url: 'https://developers.facebook.com/',
                        text: 'Facebook Developers'
                    }
                },
                {
                    title: '2. Adicionar Permissões',
                    description: 'Configure as permissões necessárias: pages_manage_posts, pages_read_engagement, publish_to_groups.'
                },
                {
                    title: '3. Gerar Access Token',
                    description: 'Use o Graph API Explorer para gerar um Access Token de usuário com as permissões configuradas.',
                    link: {
                        url: 'https://developers.facebook.com/tools/explorer/',
                        text: 'Graph API Explorer'
                    }
                },
                {
                    title: '4. Obter Page ID',
                    description: 'Faça uma requisição GET para "me/accounts" no Graph API Explorer para obter o ID da sua página do Facebook.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole o Access Token e o Page ID na página de configuração do Facebook no FluxoInteligente.'
                }
            ]
        },
        {
            id: 'twitter',
            title: 'Twitter/X',
            icon: Twitter,
            color: 'from-sky-400 to-blue-500',
            steps: [
                {
                    title: '1. Criar uma Conta de Desenvolvedor',
                    description: 'Acesse o Twitter Developer Portal e inscreva-se para uma conta de desenvolvedor.',
                    link: {
                        url: 'https://developer.twitter.com/',
                        text: 'Twitter Developer Portal'
                    }
                },
                {
                    title: '2. Criar um Projeto e App',
                    description: 'No Developer Portal, crie um novo projeto e um aplicativo dentro desse projeto.'
                },
                {
                    title: '3. Gerar API Keys e Tokens',
                    description: 'Na seção "Keys and tokens", gere: API Key, API Secret Key, Access Token e Access Token Secret.'
                },
                {
                    title: '4. Configurar Permissões',
                    description: 'Certifique-se de que seu app tem permissões de "Read and Write" para poder publicar tweets.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole as credenciais (API Key, API Secret, Access Token, Access Token Secret) na página de configuração do Twitter no FluxoInteligente.'
                }
            ]
        },
        {
            id: 'pinterest',
            title: 'Pinterest',
            icon: Pin,
            color: 'from-red-500 to-red-600',
            steps: [
                {
                    title: '1. Criar uma Conta Business',
                    description: 'Converta sua conta do Pinterest para uma Conta Business ou crie uma nova.',
                    link: {
                        url: 'https://business.pinterest.com/',
                        text: 'Pinterest Business'
                    }
                },
                {
                    title: '2. Acessar o Developer Portal',
                    description: 'Acesse o Pinterest Developers e crie um novo aplicativo.',
                    link: {
                        url: 'https://developers.pinterest.com/',
                        text: 'Pinterest Developers'
                    }
                },
                {
                    title: '3. Configurar o App',
                    description: 'Preencha as informações do aplicativo e configure as permissões necessárias: read_public, write_public.'
                },
                {
                    title: '4. Gerar Access Token',
                    description: 'No painel do seu app, gere um Access Token com as permissões configuradas.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole o Access Token na página de configuração do Pinterest no FluxoInteligente.'
                }
            ]
        },
        {
            id: 'whatsapp',
            title: 'WhatsApp',
            icon: MessageCircle,
            color: 'from-green-500 to-green-600',
            steps: [
                {
                    title: '1. Criar uma Conta Business no Facebook',
                    description: 'Acesse o Facebook Business Manager e crie uma conta business.',
                    link: {
                        url: 'https://business.facebook.com/',
                        text: 'Facebook Business Manager'
                    }
                },
                {
                    title: '2. Configurar WhatsApp Business API',
                    description: 'No Facebook Developers, crie um app e adicione o produto "WhatsApp". Configure o número de telefone que será usado.'
                },
                {
                    title: '3. Obter Credenciais',
                    description: 'Gere um Access Token permanente e obtenha o Phone Number ID e WhatsApp Business Account ID.'
                },
                {
                    title: '4. Verificar o Número',
                    description: 'Siga o processo de verificação do número de telefone no painel do WhatsApp Business API.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole o Access Token, Phone Number ID e Business Account ID na página de configuração do WhatsApp no FluxoInteligente.'
                }
            ]
        },
        {
            id: 'telegram',
            title: 'Telegram',
            icon: Send,
            color: 'from-blue-400 to-blue-500',
            steps: [
                {
                    title: '1. Criar um Bot',
                    description: 'Abra o Telegram e procure por @BotFather. Envie o comando /newbot e siga as instruções.',
                    link: {
                        url: 'https://t.me/botfather',
                        text: 'Abrir BotFather'
                    }
                },
                {
                    title: '2. Obter o Token do Bot',
                    description: 'Após criar o bot, o BotFather fornecerá um token de API. Guarde esse token com segurança.'
                },
                {
                    title: '3. Configurar Permissões do Bot',
                    description: 'Use os comandos do BotFather para configurar as permissões do bot, como /setprivacy (desabilitar para grupos).'
                },
                {
                    title: '4. Obter Chat ID (Opcional)',
                    description: 'Para enviar mensagens para um canal ou grupo específico, você precisará do Chat ID. Adicione o bot ao canal/grupo e use a API do Telegram para obter o ID.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole o Bot Token na página de configuração do Telegram no FluxoInteligente. Se necessário, adicione também o Chat ID do canal/grupo.'
                }
            ]
        },
        {
            id: 'shopee',
            title: 'Shopee Afiliado',
            icon: ShoppingBag,
            color: 'from-orange-500 to-red-500',
            steps: [
                {
                    title: '1. Criar uma Conta de Afiliado',
                    description: 'Acesse o Shopee Affiliate Program e inscreva-se como afiliado.',
                    link: {
                        url: 'https://affiliate.shopee.com.br/',
                        text: 'Shopee Affiliate'
                    }
                },
                {
                    title: '2. Acessar o Painel de Afiliados',
                    description: 'Após aprovação, acesse o painel de afiliados da Shopee para obter suas credenciais.'
                },
                {
                    title: '3. Gerar API Credentials',
                    description: 'No painel de afiliados, procure pela seção de API ou Developer Tools para gerar suas credenciais de API.'
                },
                {
                    title: '4. Obter Partner ID e Partner Key',
                    description: 'Copie o Partner ID e Partner Key fornecidos no painel.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole o Partner ID e Partner Key na página de "Conexão Shopee" no FluxoInteligente.'
                }
            ]
        },
        {
            id: 'mercadolivre',
            title: 'Mercado Livre',
            icon: Settings,
            color: 'from-yellow-400 to-yellow-500',
            steps: [
                {
                    title: '1. Criar uma Conta de Desenvolvedor',
                    description: 'Acesse o Mercado Livre Developers e crie uma conta de desenvolvedor.',
                    link: {
                        url: 'https://developers.mercadolivre.com.br/',
                        text: 'ML Developers'
                    }
                },
                {
                    title: '2. Criar um Aplicativo',
                    description: 'No painel de desenvolvedor, crie um novo aplicativo e configure as URLs de redirecionamento.'
                },
                {
                    title: '3. Obter Client ID e Client Secret',
                    description: 'Após criar o aplicativo, copie o Client ID e Client Secret fornecidos.'
                },
                {
                    title: '4. Autorizar o Aplicativo',
                    description: 'Use o fluxo OAuth 2.0 do Mercado Livre para autorizar seu aplicativo e obter um Access Token e Refresh Token.'
                },
                {
                    title: '5. Configurar no FluxoInteligente',
                    description: 'Cole o Client ID, Client Secret e os tokens na página de configuração do Mercado Livre no FluxoInteligente.'
                }
            ]
        }
    ];

    const toggleSection = (id: string) => {
        setExpandedSection(expandedSection === id ? null : id);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 rounded-2xl p-8 text-white">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                        <BookOpen size={32} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold">Tutoriais de Conexão</h1>
                        <p className="text-white/90 mt-2 text-lg">Aprenda como conectar cada plataforma de automação</p>
                    </div>
                </div>
                <p className="text-white/80 mt-4">
                    Siga os guias passo a passo abaixo para obter as credenciais necessárias e conectar suas contas de redes sociais e marketplaces ao FluxoInteligente.
                </p>
            </div>

            {/* Tutorial Sections */}
            <div className="space-y-4">
                {tutorials.map((tutorial) => {
                    const Icon = tutorial.icon;
                    const isExpanded = expandedSection === tutorial.id;

                    return (
                        <div
                            key={tutorial.id}
                            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                            {/* Section Header */}
                            <button
                                onClick={() => toggleSection(tutorial.id)}
                                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 bg-gradient-to-r ${tutorial.color} rounded-xl flex items-center justify-center shadow-lg`}>
                                        <Icon size={24} className="text-white" />
                                    </div>
                                    <div className="text-left">
                                        <h2 className="text-xl font-bold text-gray-900">{tutorial.title}</h2>
                                        <p className="text-sm text-gray-500">{tutorial.steps.length} passos</p>
                                    </div>
                                </div>
                                <div className="text-gray-400">
                                    {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                                </div>
                            </button>

                            {/* Section Content */}
                            {isExpanded && (
                                <div className="border-t border-gray-100 p-6 bg-gray-50">
                                    <div className="space-y-6">
                                        {tutorial.steps.map((step, index) => (
                                            <div key={index} className="bg-white rounded-lg p-5 border border-gray-200">
                                                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                                                    <span className={`w-7 h-7 bg-gradient-to-r ${tutorial.color} text-white rounded-full flex items-center justify-center text-sm font-bold`}>
                                                        {index + 1}
                                                    </span>
                                                    {step.title}
                                                </h3>
                                                <p className="text-gray-600 ml-9">{step.description}</p>
                                                {step.link && (
                                                    <a
                                                        href={step.link.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`ml-9 mt-3 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${tutorial.color} text-white rounded-lg hover:shadow-lg transition-shadow text-sm font-medium`}
                                                    >
                                                        {step.link.text}
                                                        <ExternalLink size={16} />
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Help Footer */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                    💡 Precisa de Ajuda?
                </h3>
                <p className="text-blue-800">
                    Se você encontrar dificuldades ao conectar alguma plataforma, entre em contato com o suporte ou consulte a documentação oficial de cada plataforma.
                </p>
            </div>
        </div>
    );
};

export default TutorialsPage;
