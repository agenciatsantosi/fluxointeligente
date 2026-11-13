/**
 * Deterministic Umbanda visual identity guard.
 * Representations are artistic defaults, not universal religious rules.
 * Terreiros can supply a visual reference/override in future integrations.
 */
const PROFILES = [
  // Distinct artistic profiles. These are editable visual interpretations, not universal iconography.
  { name: 'Vovó Maria Conga', aliases: ['vovo maria conga','vovó maria conga','maria conga'], line: 'Preta-Velha', visual: 'SPECIFIC VOVÓ MARIA CONGA: elderly dark-skinned Afro-Brazilian WOMAN, expressive deeply lined face, tall richly layered white cloth headwrap with subtle red, green and gold fabric bands, white embroidered lace dress with puff sleeves, multiple layered colorful bead necklaces, gold hoop earrings, wooden walking stick. Side-back three-quarter view when required by card. DISTINCT FROM Maria Redonda and Vovó Anastácia. NEVER a male Preto-Velho.' },
  { name: 'Vovó Maria Redonda', aliases: ['vovo maria redonda','vovó maria redonda','maria redonda'], line: 'Preta-Velha', visual: 'SPECIFIC VOVÓ MARIA REDONDA: elderly dark-skinned Afro-Brazilian WOMAN, distinctly round soft face and fuller rounded silhouette, gentle maternal smile, simple smooth white cotton headwrap without colorful layered bands, modest loose white cotton dress, restrained white-and-blue prayer beads, hands resting together or holding a small rosary. Side-back three-quarter view when required by card. DISTINCT FROM Maria Conga: no multicolor layered turban, no many brightly colored necklaces. NEVER a man.' },
  { name: 'Vovó Anastácia', aliases: ['vovo anastacia','vovó anastácia','vovo anastácia','vovó anastacia','vovo anastasia','vovó anastasia','vovo ana stacia'], line: 'Preta-Velha', visual: 'SPECIFIC VOVÓ ANASTÁCIA: elderly dark-skinned Afro-Brazilian WOMAN, slender dignified silhouette, thoughtful serene expression, restrained ivory headscarf tied close to the head, plain ivory long-sleeved traditional dress, simple muted wooden prayer beads, delicate white shawl draped over shoulders. Side-back three-quarter view when required by card. DISTINCT FROM Maria Conga colorful layered accessories and Maria Redonda rounded silhouette. Do not invent a metal muzzle, chains or enslavement imagery. NEVER a man.' },
  { name: 'Pai João', aliases: ['pai joao','pai joão'], line: 'Preto-Velho', visual: 'Elderly Afro-Brazilian MAN, white beard, simple white cotton shirt, wooden prayer beads, gentle wise expression, seated with a wooden walking stick. NOT a woman.' },
  { name: 'Pai Benedito', aliases: ['pai benedito'], line: 'Preto-Velho', visual: 'Elderly Afro-Brazilian MAN, white hair and beard, humble white clothing, prayer beads, calm thoughtful eyes and traditional wooden walking stick. NOT a woman.' },
  { name: 'Exu Caveira', aliases: ['exu caveira'], line: 'Exu', visual: 'Adult MALE Umbanda guardian, solemn black tailored suit and dark cloak, cemetery gate at night, discreet skull symbolism, dramatic red rim light, dignified and powerful; not a female figure, not Mexican Catrina makeup.' },
  { name: 'João Caveira', aliases: ['joao caveira','joão caveira','exu joao caveira','exu joão caveira'], line: 'Exu - Linha das Caveiras', visual: 'Adult MALE cemetery guardian in predominantly BLACK formal garments and long black cloak, dignified solemn expression, old Brazilian cemetery with stone graves, iron gates and discreet candles, dramatic cinematic shadow and moonlight; no bright white clothes, no Mexican Catrina makeup, no horns.' },
  { name: 'Tatá Caveira', aliases: ['tata caveira','tatá caveira','exu tata caveira','exu tatá caveira'], line: 'Exu - Linha das Caveiras', visual: 'Adult MALE ancestral cemetery guardian wearing predominantly BLACK formal clothes and a black cloak, imposing solemn posture, old cemetery paths, tombstones, wrought-iron gates and candles, cinematic dark atmosphere; no white suit, no Mexican Catrina makeup, no horns.' },
  { name: 'Exu Gira Mundo', aliases: ['exu gira mundo','exu giramundo'], line: 'Exu', visual: 'Adult MALE Umbanda guardian, dark formal clothing, red-black accents, imposing posture at a symbolic crossroads, swirling wind and subtle world-travel motifs, cinematic night lighting. NOT a woman.' },
  { name: 'Exu Tiriri', aliases: ['exu tiriri'], line: 'Exu', visual: 'Adult MALE Umbanda guardian in black formal attire with red details, strong vigilant gaze, dramatic low-key lighting and symbolic crossroads; no horns, no demon caricature.' },
  { name: 'Erê Trovãozinho', aliases: ['ere trovaozinho','erê trovãozinho','trovaozinho','trovãozinho'], line: 'Erê', visual: 'Joyful Brazilian CHILD spiritual guide, age-appropriate playful clothing, lively expression, gentle symbolic storm clouds and soft lightning in the distance, innocent and warm atmosphere; never an adult.' },
  { name: 'Maria Caveira', aliases: ['pombagira maria caveira','pombo gira maria caveira','maria caveira'], line: 'Pombagira', visual: 'Adult WOMAN cemetery guardian in predominantly BLACK elegant dress and black veil, solemn commanding presence, old Brazilian cemetery with tombstones, iron gates, candles and restrained skull symbolism, dramatic cinematic night lighting. NOT a man, no white clothes, no Mexican Catrina makeup.' },
  { name: 'Maria Padilha', aliases: ['maria padilha','pombagira padilha','pomba gira maria padilha','pombagira maria padilha','maria padinha'], line: 'Pombagira', visual: 'Adult EUROPEAN-APPEARING BLONDE WOMAN with fair skin, long golden-blonde hair, dignified commanding expression, unmistakable historic SPANISH-inspired attire: richly embroidered flamenco-style or period Spanish dress with ruffled full skirt, black and deep red fabrics, gold detailing, lace mantilla, Spanish folding fan, ornate jewelry and red roses. Old Spanish architecture, candlelit dramatic setting. Preserve blonde hair and European appearance. NOT a brunette, NOT a generic modern black gown, NOT Maria Caveira, NOT male. Vintage etched illustration when the selected card requests vintage art.' },
  { name: 'Maria Mulambo', aliases: ['maria mulambo','pombagira mulambo'], line: 'Pombagira', visual: 'Adult WOMAN, dignified and expressive, layered dark red and black garments, red rose, cinematic low-key lighting, never a male figure.' },
  { name: 'Caboclo Sete Flechas', aliases: ['caboclo sete flechas','sete flechas'], line: 'Caboclo', visual: 'Adult Brazilian Indigenous MAN, respectful regional indigenous-inspired clothing and natural beadwork, seven arrows as symbolic motif, Brazilian forest setting; no North American tipi or western costume.' },
  { name: 'Caboclo Pena Branca', aliases: ['caboclo pena branca','pena branca'], line: 'Caboclo', visual: 'Adult Brazilian Indigenous MAN, white feather symbolic adornment, natural beadwork, calm protective expression, Atlantic forest setting; no North American tipi.' },
  { name: 'Zé Pelintra', aliases: ['ze pelintra','zé pelintra','ze pilintra','zé pilintra','seu ze pelintra','seu zé pelintra','seu ze pilintra','seu zé pilintra'], line: 'Malandro', visual: 'Adult Afro-Brazilian MAN in classic white linen suit, white Panama hat with red band, red tie, elegant confident stance, vintage Brazilian urban nightlife.' },
  { name: 'Iemanjá', aliases: ['iemanja','iemanjá','yemanja','yemanjá'], line: 'Orixá', visual: 'Majestic adult Black WOMAN, flowing pale blue and white garments, sea and shells, graceful regal posture, sacred ocean symbolism.' },
  { name: 'Iansã', aliases: ['iansa','iansã','oya','oyá'], line: 'Orixá', visual: 'Majestic adult Black WOMAN warrior, red and copper flowing garments, symbolic sword and eruexim, wind and storm, no indigenous feather headdress.' }
];

// Artistic defaults only: exact iconography can vary by terreiro.
const ADDITIONAL_PROFILES = [
  ['Zé Pretinho','Malandro',['ze pretinho','zé pretinho','seu ze pretinho'],'Adult Afro-Brazilian male malandro, period Brazilian street elegance, brimmed hat, discreet red-white details. Do not copy Zé Pelintra facial identity.'],
  ['Malandro Miguel','Malandro',['malandro miguel','seu miguel malandro'],'Adult Brazilian male malandro, classic period suit and hat, composed confident stance; visually distinct from Zé Pelintra.'],
  ['Exu Tranca-Ruas','Exu',['exu tranca ruas','tranca ruas','tranca-ruas'],'Adult male Umbanda guardian, dignified dark formal garments, crossroads symbolism, black and red accents; no horns.'],
  ['Exu Marabô','Exu',['exu marabo','exu marabô','marabo','marabô'],'Adult male Umbanda guardian, black formal clothes with restrained red details, commanding dignified posture; no demon caricature.'],
  ['Erê Mariazinha','Erê',['ere mariazinha','erê mariazinha','mariazinha ere','mariazinha erê'],'Brazilian girl child spiritual guide, age-appropriate traditional dress, delicate flowers and joyful innocent expression.'],
  ['Cabocla Jurema','Cabocla',['cabocla jurema','jurema cabocla'],'Adult Brazilian Indigenous woman, respectful forest setting, natural beadwork and botanical symbolism; no North American costume.'],
  ['Boiadeiro Sete Laços','Boiadeiro',['boiadeiro sete lacos','boiadeiro sete laços','sete lacos','sete laços'],'Adult Brazilian cattle herder spiritual guide, traditional countryside leather hat and rustic attire, coiled rope, dignified posture.'],
  ['Boiadeiro Zé do Laço','Boiadeiro',['boiadeiro ze do laco','boiadeiro zé do laço','ze do laco','zé do laço'],'Adult Brazilian cattle herder spiritual guide, traditional countryside leather garments and rope, distinct facial identity.'],
  ['Marinheiro João','Marinheiro',['marinheiro joao','marinheiro joão'],'Adult Brazilian male sailor spiritual guide, traditional sailor clothes, maritime setting and rope motifs.'],
  ['Marinheiro Martim','Marinheiro',['marinheiro martim'],'Adult Brazilian male sailor spiritual guide, traditional maritime clothing and calm sea setting, distinct from Marinheiro João.'],
  ['Baiano Zé do Coco','Baiano',['baiano ze do coco','baiano zé do coco','ze do coco','zé do coco'],'Adult Brazilian male baiano spiritual guide, traditional northeastern Brazilian rural clothing, straw hat and warm welcoming demeanor.'],
  ['Baiana Maria do Dendê','Baiana',['baiana maria do dende','baiana maria do dendê','maria do dende','maria do dendê'],'Adult Brazilian woman baiana spiritual guide, traditional white baiana garments and headwrap, dignified warm expression.'],
  ['Cigana Esmeralda','Cigana',['cigana esmeralda'],'Adult female Roma-inspired spiritual guide, elegant flowing traditional garments, jewelry and green accents; respectful depiction without caricature.'],
  ['Cigana Sara','Cigana',['cigana sara'],'Adult female Roma-inspired spiritual guide, elegant layered clothing and shawl, restrained jewelry; distinct from Cigana Esmeralda.'],
  ['Cigano Pablo','Cigano',['cigano pablo'],'Adult male Roma-inspired spiritual guide, period waistcoat, hat and elegant traditional garments; respectful depiction.'],
  ['Oxalá','Orixá',['oxala','oxalá'],'Symbolic respectful Umbanda depiction of Oxalá, white garments and peaceful sacred atmosphere; follow terreiro visual references.'],
  ['Ogum','Orixá',['ogum'],'Symbolic respectful Umbanda depiction of Ogum, iron and protective warrior symbolism; follow terreiro references.'],
  ['Oxóssi','Orixá',['oxossi','oxóssi'],'Symbolic respectful Umbanda depiction of Oxóssi, forest and bow symbolism; follow terreiro references.'],
  ['Xangô','Orixá',['xango','xangô'],'Symbolic respectful Umbanda depiction of Xangô, stone and double axe symbolism; follow terreiro references.'],
  ['Oxum','Orixá',['oxum'],'Symbolic respectful Umbanda depiction of Oxum, fresh water and gold accents; follow terreiro references.'],
  ['Obaluaiê','Orixá',['obaluaie','obaluaiê','omulu'],'Symbolic respectful Umbanda depiction of Obaluaiê, straw garment and healing symbolism; follow terreiro references.'],
  ['Nanã','Orixá',['nana','nanã'],'Symbolic respectful Umbanda depiction of Nanã, ancestral waters and purple accents; follow terreiro references.'],
  ['Oxumarê','Orixá',['oxumare','oxumarê'],'STRICT OXUMARÊ VISUAL REFERENCE: majestic adult Black masculine-presenting Orixá, full body, bare upper torso with traditional bead necklaces and arm adornments, colorful wrapped turban in green red yellow and blue, long flowing multicolored rainbow ceremonial skirt or draped cloth. A prominent living GREEN SERPENT coils naturally around both arms and curves across the upper body, without attacking or obscuring the face. Graceful extended arms, confident sacred stance. Luminous rainbow aura, sky with vibrant blue orange purple and gold hues, symbols of cycles, transformation and renewal. This is Oxumarê, NOT Oxóssi, a caboclo, a feathered indigenous warrior, a European king, or a generic person. When vintage card style is selected, translate these exact colors, garments and serpent attributes into antique ink-and-watercolor illustration on parchment; never switch to photographic realism. Interpret as user-selected artistic iconography, not a universal ritual depiction.'],
  ['Ossain','Orixá',['ossain','ossanha'],'Symbolic respectful Umbanda depiction of Ossain, sacred leaves and herbal knowledge; follow terreiro references.'],
  ['Ibeji','Orixá',['ibeji'],'Symbolic respectful Umbanda depiction of Ibeji, twin and childhood symbolism; follow terreiro references.']
].map(([name,line,aliases,visual]) => ({name,line,aliases,visual}));
PROFILES.push(...ADDITIONAL_PROFILES);

const LINE_DEFAULTS = [
  { test: /\\b(ciganos?|ciganas?)\\b/, line: 'Cigano', visual: 'Respectful Roma-inspired spiritual guide; do not assume a specific named identity.' },
  { test: /\\b(bruxos?|bruxas?)\\b/, line: 'Bruxo', visual: 'Spiritual practitioner with symbolic herbs and ritual objects; require specific references for a named entity.' },
  { test: /\\b(marinheiros?)\\b/, line: 'Marinheiro', visual: 'Traditional Brazilian sailor spiritual guide, nautical clothing and maritime symbolism.' },
  { test: /\\b(boiadeiros?)\\b/, line: 'Boiadeiro', visual: 'Brazilian countryside cattle herder spiritual guide, leather hat and rope.' },
  { test: /\\b(baianos?|baianas?)\\b/, line: 'Baiano', visual: 'Traditional northeastern Brazilian spiritual guide; request specific references for named identity.' },
  { test: /\\b(malandros?|malandras?)\\b/, line: 'Malandro', visual: 'Traditional Brazilian malandro spiritual guide, classic suit and hat; not necessarily Zé Pelintra.' },
  { test: /\\b(orixas?)\\b/, line: 'Orixá', visual: 'Sacred symbolic Umbanda representation; require named Orixá for specific visual identity.' },

  { test: /\b(vovo|preta velha|mae velha)\b/, line: 'Preta-Velha', visual: 'Elderly Afro-Brazilian WOMAN in modest white traditional clothing and headwrap, prayer beads, gentle dignified expression. NOT a man.' },
  { test: /\b(pai|preto velho)\b/, line: 'Preto-Velho', visual: 'Elderly Afro-Brazilian MAN in modest white traditional clothing, white beard, prayer beads, gentle dignified expression. NOT a woman.' },
  { test: /\b(pombagira|pombo gira|pomba gira)\b/, line: 'Pombagira', visual: 'Adult WOMAN Umbanda guardian, elegant dark red and black clothing, dignified posture, red roses. NOT a man.' },
  { test: /\b(exu)\b/, line: 'Exu', visual: 'Adult MALE Umbanda guardian in dark formal clothing with red-black details, dignified and protective; not a horned demon or female figure.' },
  { test: /\b(ere|criança espiritual|crianca espiritual)\b/, line: 'Erê', visual: 'Brazilian CHILD spiritual guide, joyful, age-appropriate clothing and gentle playful atmosphere. NOT an adult.' },
  { test: /\b(cabocla)\b/, line: 'Cabocla', visual: 'Adult Brazilian Indigenous WOMAN in a respectful Brazilian forest setting, natural ornaments, no North American costume.' },
  { test: /\b(caboclo)\b/, line: 'Caboclo', visual: 'Adult Brazilian Indigenous MAN in a respectful Brazilian forest setting, natural ornaments, no North American costume.' }
];

/** Read an explicit guide attribution, including Markdown bold signatures. */
export function extractUmbandaSignature(value) {
  const lines = String(value || '').replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  for (const raw of lines.slice(1).reverse()) {
    const cleaned = raw.replace(/\\$/, '').replace(/\*\*/g, '').replace(/__/g, '').replace(/[_*~`]/g, '').trim();
    const match = cleaned.match(/^[—–-]\s*(?:Frase inspirada na sabedoria de\s+)?(.{2,100})$/i);
    if (match) return match[1].replace(/[.!]+$/, '').trim();
  }
  const inline = String(value || '').match(/Frase inspirada na sabedoria de\s+([^\n.,]{2,100})/i);
  return inline ? inline[1].replace(/\*\*/g, '').trim() : null;
}

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
export const UMBANDA_LINES = Object.freeze([
  'Cigano','Bruxo','Marinheiro','Boiadeiro','Erê','Caboclo','Cabocla',
  'Baiano','Baiana','Exu','Pombagira','Malandro','Preta-Velha','Preto-Velho','Orixá'
]);
export function listUmbandaEntities(line) {
  const normalized = normalizeEntityText(line);
  return PROFILES.filter(p => !normalized || normalizeEntityText(p.line) === normalized)
    .map(({name,line}) => ({name,line}));
}
export function detectUmbandaLine(value) {
  const entity = detectUmbandaEntity(value);
  if (entity) return entity.line;
  const normalized = normalizeEntityText(value);
  return UMBANDA_LINES.find(line => normalizeEntityText(line) === normalized) || null;
}
