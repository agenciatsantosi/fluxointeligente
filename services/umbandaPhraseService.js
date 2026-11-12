import { detectUmbandaEntity, detectUmbandaLine, listUmbandaEntities, UMBANDA_LINES } from './umbandaEntityCatalog.js';

/** The AI chooses the entity when the user does not specify one. */
export function buildUmbandaPhrasePrompt({ line = '', entity = null, theme = 'Sabedoria', count = 5 } = {}) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Quantidade deve estar entre 1 e 100.');
  const subject = String(entity || '').trim();
  const resolvedLine = line && line !== 'Automático' ? detectUmbandaLine(line) : null;
  if (line && line !== 'Automático' && !resolvedLine) throw new Error('Linha espiritual inválida.');
  const suggestions = resolvedLine ? listUmbandaEntities(resolvedLine).map(item => item.name) : [];
  return [
    'Você conhece tradições brasileiras de Umbanda. Escreva em português brasileiro frases ORIGINAIS inspiradas na espiritualidade.',
    'Nunca alegue que as entidades pronunciaram as frases ou que sejam mensagens mediúnicas autênticas.',
    'Respeite diferenças entre terreiros e não invente fundamentos religiosos como fatos.',
    'QUANTIDADE EXATA: ' + n + '.',
    'TEMA: ' + String(theme || 'Sabedoria').slice(0,120) + '.',
    subject ? 'ENTIDADE OBRIGATÓRIA: ' + subject + '.' : 'ESCOLHA AUTOMATICAMENTE uma entidade espiritual real e reconhecível para cada frase. Não use rótulos genéricos como Malandro, Boiadeiro, Orixá ou Linha como assinatura.',
    resolvedLine ? 'LINHA OBRIGATÓRIA: ' + resolvedLine + '.' : 'ESCOLHA AUTOMATICAMENTE a linha espiritual apropriada à entidade de cada frase.',
    suggestions.length ? 'REFERÊNCIAS OPCIONAIS, NÃO LISTA EXCLUSIVA: ' + suggestions.join(', ') + '.' : '',
    'Cada frase deve ser coerente com a entidade escolhida, sem repetir frases ou identidades indevidamente.',
    'Retorne JSON com phrases: array de objetos {text: frase original, inspiration: nome individual exato da entidade, line: linha espiritual}.',
    'A assinatura será adicionada pelo sistema; não coloque assinatura no texto da frase.'
  ].filter(Boolean).join('\n');
}

export function listUmbandaPhraseOptions() {
  return UMBANDA_LINES.map(line => ({ line, entities: listUmbandaEntities(line) }));
}
