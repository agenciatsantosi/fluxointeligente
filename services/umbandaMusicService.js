/**
 * Pesquisa musical orientada pela entidade, sem assumir que resultados encontrados
 * na web concedem direitos de sincronização ou publicação.
 */
const entities = [
  { name: 'Vovó Maria Conga', aliases: ['vovo maria conga', 'vo maria conga', 'maria conga'], line: 'Preto Velho' },
  { name: 'Pai João', aliases: ['pai joao', 'pai joao de aruanda'], line: 'Preto Velho' },
  { name: 'Zé Pretinho', aliases: ['ze pretinho', 'seu ze pretinho'], line: 'Malandro' },
  { name: 'Zé Pelintra', aliases: ['ze pelintra', 'ze pilintra', 'seu ze pelintra', 'seu ze pilintra'], line: 'Malandro' },
  { name: 'Caboclo Sete Flechas', aliases: ['caboclo sete flechas', 'sete flechas'], line: 'Caboclo' },
  { name: 'Erê Trovãozinho', aliases: ['ere trovaozinho', 'trovaozinho'], line: 'Erê' },
  { name: 'Erê Rutinha', aliases: ['ere rutinha', 'rutinha'], line: 'Erê' },
  { name: 'Preto Velho', aliases: ['preto velho', 'preta velha', 'pretos velhos'], line: 'Preto Velho' },
];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const containsAlias = (text, alias) => new RegExp('(^|[^a-z0-9])' + normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z0-9])', 'i').test(text);
export function detectUmbandaEntity(text) {
  const normalized = normalize(text);
  const entity = entities.find(item => item.aliases.some(alias => containsAlias(normalized, alias)));
  if (entity) return { name: entity.name, line: entity.line };
  const generic = [
    ['preto velho', 'Preto Velho'], ['caboclo', 'Caboclo'], ['malandro', 'Malandro'],
    ['ere', 'Erê'], ['pombagira', 'Pombagira'], ['exu', 'Exu']
  ].find(([term]) => containsAlias(normalized, term));
  return generic ? { name: generic[1], line: generic[1] } : null;
}
export function buildUmbandaMusicPlan(text) {
  const entity = detectUmbandaEntity(text);
  const queries = entity ? [
    `${entity.name} ponto cantado`,
    `${entity.name} Umbanda`,
    `pontos de ${entity.line} Umbanda`,
    'toque instrumental Umbanda'
  ] : ['pontos cantados Umbanda', 'toque instrumental Umbanda'];
  return {
    entity, queries: [...new Set(queries)],
    selectionRule: 'Pesquisar na ordem; não trocar entidades; validar identidade e licença antes de usar.',
    status: 'search_plan_only',
    musicUrl: null,
    licensed: false,
    reason: 'A seleção e incorporação de áudio exigem catálogo/licença de sincronização e integração de publicação.'
  };
}
