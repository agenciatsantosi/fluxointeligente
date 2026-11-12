/**
 * Deterministic Umbanda visual identity guard.
 * Representations are artistic defaults, not universal religious rules.
 * Terreiros can supply a visual reference/override in future integrations.
 */
const PROFILES = [
  { name: 'Vovó Maria Conga', aliases: ['vovo maria conga','vovó maria conga','maria conga'], line: 'Preta-Velha', visual: 'Elderly Afro-Brazilian WOMAN, dark skin, deeply lined gentle face, white lace dress, layered colorful bead necklaces, traditional wrapped headscarf, walking stick, dignified maternal presence. NOT a man.' },
  { name: 'Vovó Maria Redonda', aliases: ['vovo maria redonda','vovó maria redonda','maria redonda'], line: 'Preta-Velha', visual: 'Elderly Afro-Brazilian WOMAN, serene rounded face, white headwrap, modest white cotton clothing, traditional prayer beads, kind maternal gaze. NOT a man.' },
  { name: 'Pai João', aliases: ['pai joao','pai joão'], line: 'Preto-Velho', visual: 'Elderly Afro-Brazilian MAN, white beard, simple white cotton shirt, wooden prayer beads, gentle wise expression, seated with a wooden walking stick. NOT a woman.' },
  { name: 'Pai Benedito', aliases: ['pai benedito'], line: 'Preto-Velho', visual: 'Elderly Afro-Brazilian MAN, white hair and beard, humble white clothing, prayer beads, calm thoughtful eyes and traditional wooden walking stick. NOT a woman.' },
  { name: 'Exu Caveira', aliases: ['exu caveira'], line: 'Exu', visual: 'Adult MALE Umbanda guardian, solemn black tailored suit and dark cloak, cemetery gate at night, discreet skull symbolism, dramatic red rim light, dignified and powerful; not a female figure, not Mexican Catrina makeup.' },
  { name: 'João Caveira', aliases: ['joao caveira','joão caveira','exu joao caveira','exu joão caveira'], line: 'Exu - Linha das Caveiras', visual: 'Adult MALE cemetery guardian in predominantly BLACK formal garments and long black cloak, dignified solemn expression, old Brazilian cemetery with stone graves, iron gates and discreet candles, dramatic cinematic shadow and moonlight; no bright white clothes, no Mexican Catrina makeup, no horns.' },
  { name: 'Tatá Caveira', aliases: ['tata caveira','tatá caveira','exu tata caveira','exu tatá caveira'], line: 'Exu - Linha das Caveiras', visual: 'Adult MALE ancestral cemetery guardian wearing predominantly BLACK formal clothes and a black cloak, imposing solemn posture, old cemetery paths, tombstones, wrought-iron gates and candles, cinematic dark atmosphere; no white suit, no Mexican Catrina makeup, no horns.' },
  { name: 'Exu Gira Mundo', aliases: ['exu gira mundo','exu giramundo'], line: 'Exu', visual: 'Adult MALE Umbanda guardian, dark formal clothing, red-black accents, imposing posture at a symbolic crossroads, swirling wind and subtle world-travel motifs, cinematic night lighting. NOT a woman.' },
  { name: 'Exu Tiriri', aliases: ['exu tiriri'], line: 'Exu', visual: 'Adult MALE Umbanda guardian in black formal attire with red details, strong vigilant gaze, dramatic low-key lighting and symbolic crossroads; no horns, no demon caricature.' },
  { name: 'Erê Trovãozinho', aliases: ['ere trovaozinho','erê trovãozinho','trovaozinho','trovãozinho'], line: 'Erê', visual: 'Joyful Brazilian CHILD spiritual guide, age-appropriate playful clothing, lively expression, gentle symbolic storm clouds and soft lightning in the distance, innocent and warm atmosphere; never an adult.' },
  { name: 'Maria Caveira', aliases: ['pombagira maria caveira','pombo gira maria caveira','maria caveira'], line: 'Pombagira', visual: 'Adult WOMAN cemetery guardian in predominantly BLACK elegant dress and black veil, solemn commanding presence, old Brazilian cemetery with tombstones, iron gates, candles and restrained skull symbolism, dramatic cinematic night lighting. NOT a man, no white clothes, no Mexican Catrina makeup.' },
  { name: 'Maria Padilha', aliases: ['maria padilha','pombagira padilha'], line: 'Pombagira', visual: 'Adult WOMAN with regal posture, sophisticated black and deep red dress, elegant hat or veil, red roses, warm candlelit night setting.' },
  { name: 'Maria Mulambo', aliases: ['maria mulambo','pombagira mulambo'], line: 'Pombagira', visual: 'Adult WOMAN, dignified and expressive, layered dark red and black garments, red rose, cinematic low-key lighting, never a male figure.' },
  { name: 'Caboclo Sete Flechas', aliases: ['caboclo sete flechas','sete flechas'], line: 'Caboclo', visual: 'Adult Brazilian Indigenous MAN, respectful regional indigenous-inspired clothing and natural beadwork, seven arrows as symbolic motif, Brazilian forest setting; no North American tipi or western costume.' },
  { name: 'Caboclo Pena Branca', aliases: ['caboclo pena branca','pena branca'], line: 'Caboclo', visual: 'Adult Brazilian Indigenous MAN, white feather symbolic adornment, natural beadwork, calm protective expression, Atlantic forest setting; no North American tipi.' },
  { name: 'Zé Pelintra', aliases: ['ze pelintra','zé pelintra','ze pilintra','zé pilintra','seu ze pelintra','seu zé pelintra','seu ze pilintra','seu zé pilintra'], line: 'Malandro', visual: 'Adult Afro-Brazilian MAN in classic white linen suit, white Panama hat with red band, red tie, elegant confident stance, vintage Brazilian urban nightlife.' },
  { name: 'Iemanjá', aliases: ['iemanja','iemanjá','yemanja','yemanjá'], line: 'Orixá', visual: 'Majestic adult Black WOMAN, flowing pale blue and white garments, sea and shells, graceful regal posture, sacred ocean symbolism.' },
  { name: 'Iansã', aliases: ['iansa','iansã','oya','oyá'], line: 'Orixá', visual: 'Majestic adult Black WOMAN warrior, red and copper flowing garments, symbolic sword and eruexim, wind and storm, no indigenous feather headdress.' }
];

const LINE_DEFAULTS = [
  { test: /\b(vovo|preta velha|mae velha)\b/, line: 'Preta-Velha', visual: 'Elderly Afro-Brazilian WOMAN in modest white traditional clothing and headwrap, prayer beads, gentle dignified expression. NOT a man.' },
  { test: /\b(pai|preto velho)\b/, line: 'Preto-Velho', visual: 'Elderly Afro-Brazilian MAN in modest white traditional clothing, white beard, prayer beads, gentle dignified expression. NOT a woman.' },
  { test: /\b(pombagira|pombo gira|pomba gira)\b/, line: 'Pombagira', visual: 'Adult WOMAN Umbanda guardian, elegant dark red and black clothing, dignified posture, red roses. NOT a man.' },
  { test: /\b(exu)\b/, line: 'Exu', visual: 'Adult MALE Umbanda guardian in dark formal clothing with red-black details, dignified and protective; not a horned demon or female figure.' },
  { test: /\b(ere|criança espiritual|crianca espiritual)\b/, line: 'Erê', visual: 'Brazilian CHILD spiritual guide, joyful, age-appropriate clothing and gentle playful atmosphere. NOT an adult.' },
  { test: /\b(cabocla)\b/, line: 'Cabocla', visual: 'Adult Brazilian Indigenous WOMAN in a respectful Brazilian forest setting, natural ornaments, no North American costume.' },
  { test: /\b(caboclo)\b/, line: 'Caboclo', visual: 'Adult Brazilian Indigenous MAN in a respectful Brazilian forest setting, natural ornaments, no North American costume.' }
];

export function normalizeEntityText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function detectUmbandaEntity(value) {
  const normalized = ' ' + normalizeEntityText(value) + ' ';
  if (!normalized.trim()) return null;
  for (const profile of PROFILES) {
    if (profile.aliases.some(alias => normalized.includes(' ' + normalizeEntityText(alias) + ' '))) {
      return { name: profile.name, line: profile.line, visual: profile.visual, exact: true };
    }
  }
  for (const item of LINE_DEFAULTS) {
    if (item.test.test(normalized)) return { name: null, line: item.line, visual: item.visual, exact: false };
  }
  return null;
}

export function enforceUmbandaVisualIdentity(prompt, title, visualIdentity = null) {
  // Explicit custom prompt overrides should remain under user control.
  // A named Umbanda guide must not be overridden by a generic visual prompt.
  const entity = detectUmbandaEntity(title);
  if (!entity) return prompt;
  if (String(prompt || '').includes('[UMBANDA_ENTITY_LOCK]')) return prompt;
  const name = entity.name ? 'SPECIFIC ENTITY: ' + entity.name + '. ' : '';
  const original = String(prompt || '');
  // For an explicitly identified guide, the LLM may have hallucinated a DIFFERENT
  // subject (e.g. Exu's black suit for Zé Pelintra). Never append that conflict.
  const safePrompt = entity.exact ? '' : original;
  return '[UMBANDA_ENTITY_LOCK] ' + name + 'TRADITION: Brazilian Umbanda. LINE: ' + entity.line +
    '. MANDATORY SUBJECT IDENTITY: ' + entity.visual +
    ' Preserve the specified age, gender, garments and symbols. Do not replace this entity with a generic spiritual figure. ' +
    'If the original prompt contradicts these identity constraints, these constraints take priority. ' +
    'For social media card composition: the guide occupies the LEFT 40% of the frame, with a clean uncluttered RIGHT 60% reserved for typography overlay. ' +
    'Premium Brazilian editorial illustration, cinematic lighting, authentic visual symbolism, coherent anatomy, full visible head and face. ' +
    'Generate artwork only: NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS. ' + safePrompt;
}

export const UMBANDA_ENTITY_PROFILES = PROFILES;
