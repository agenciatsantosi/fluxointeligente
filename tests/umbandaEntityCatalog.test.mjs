import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUmbandaEntity, enforceUmbandaVisualIdentity } from '../services/umbandaEntityCatalog.js';

const cases = [
  ['Seu Zé Pilintra', 'Zé Pelintra', 'MAN', 'white linen suit'],
  ['Seu Zé Pelintra', 'Zé Pelintra', 'MAN', 'white linen suit'],
  ['Caboclo Sete Flechas', 'Caboclo Sete Flechas', 'MAN', 'seven arrows'],
  ['Vovó Maria Conga', 'Vovó Maria Conga', 'WOMAN', 'headscarf'],
  ['Maria Caveira', 'Maria Caveira', 'WOMAN', 'BLACK'],
  ['João Caveira', 'João Caveira', 'MALE', 'BLACK'],
  ['Tatá Caveira', 'Tatá Caveira', 'MALE', 'BLACK'],
  ['Erê Trovãozinho', 'Erê Trovãozinho', 'CHILD', 'storm']
];

for (const [input, name, identity, visual] of cases) {
  test('detects and locks ' + input, () => {
    const title = '“A fé ilumina o caminho.”\n— ' + input;
    const entity = detectUmbandaEntity(title);
    assert.equal(entity?.name, name);
    assert.equal(entity?.exact, true);
    const prompt = enforceUmbandaVisualIdentity('An unrelated woman in a black suit', title);
    assert.ok(prompt.includes('SPECIFIC ENTITY: ' + name));
    assert.ok(prompt.includes(identity));
    assert.ok(prompt.includes(visual));
    assert.ok(!prompt.includes('An unrelated woman in a black suit'));
    assert.equal(enforceUmbandaVisualIdentity(prompt, title), prompt);
  });
}

test('does not rewrite unrelated prompts', () => {
  const prompt = 'A landscape without people';
  assert.equal(enforceUmbandaVisualIdentity(prompt, 'Bom dia'), prompt);
});

test('named entity remains locked even if generic prompt override exists', () => {
  const title = 'A malandragem é humildade\n— Seu Zé Pilintra';
  const prompt = enforceUmbandaVisualIdentity('generic female portrait', title, { prompt_override: 'generic female portrait' });
  assert.match(prompt, /white linen suit/);
  assert.doesNotMatch(prompt, /generic female portrait/);
});
