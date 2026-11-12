import { detectUmbandaEntity, detectUmbandaLine, listUmbandaEntities, UMBANDA_LINES } from './umbandaEntityCatalog.js';

/**
 * Builds a constrained instruction for an existing text-generation provider.
 * This module does not call a provider and never claims generated quotes are historical.
 */
export function buildUmbandaPhrasePrompt({ line, entity = null, theme = 'Sabedoria', count = 5 } = {}) {
  const resolvedLine = detectUmbandaLine(entity || line);
  if (!resolvedLine) throw new Error('Linha espiritual desconhecida. Selecione uma linha cadastrada.');
  if (line && detectUmbandaLine(line) && detectUmbandaLine(line) !== resolvedLine) {
    throw new Error('Entidade e linha espiritual incompatíveis.');
  }
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Quantidade deve estar entre 1 e 100.');
  const subject = entity ? String(entity).trim() : null;
  const exact = subject ? detectUmbandaEntity(subject) : null;
  if (subject && (!exact?.exact || !exact.name)) {
    throw new Error('Entidade não cadastrada. Cadastre a ficha antes de atribuir frases.');
  }
  const known = listUmbandaEntities(resolvedLine).map(item => item.name);
  const distribution = subject ? [exact.name] : known;
  return [
    'Escreva em português brasileiro, exclusivamente frases ORIGINAIS inspiradas em temas e ensinamentos associados à Umbanda.',
    'Nunca invente citações históricas, falas documentadas, mensagens mediúnicas reais ou alegações de autoria literal.',
    'Não use estereótipos ofensivos nem afirme que uma tradição é universal; respeite variações entre terreiros.',
    'LINHA: ' + resolvedLine + '.',
    'TEMA: ' + String(theme || 'Sabedoria').slice(0,120) + '.',
    'QUANTIDADE EXATA: ' + n + '.',
    subject ? 'ENTIDADE EXATA: ' + exact.name + '.' : 'DISTRIBUA ENTRE AS ENTIDADES CADASTRADAS: ' + (distribution.join(', ') || 'sem nomes individuais; atribuir somente à linha') + '.',
    'Cada item deve conter uma frase inédita e uma assinatura explícita no formato: — Frase inspirada na sabedoria de [ENTIDADE OU LINHA].',
    'Não assine como se a entidade tivesse pronunciado a frase. Não repita ideias. Retorne apenas a lista numerada.'
  ].join('\\n');
}

export function listUmbandaPhraseOptions() {
  return UMBANDA_LINES.map(line => ({ line, entities: listUmbandaEntities(line) }));
}
