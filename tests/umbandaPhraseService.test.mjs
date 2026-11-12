import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUmbandaEntity, detectUmbandaLine, listUmbandaEntities } from '../services/umbandaEntityCatalog.js';
import { buildUmbandaPhrasePrompt } from '../services/umbandaPhraseService.js';

test('recognizes distinct Pretas-Velhas', () => {
  for (const name of ['Vovó Maria Conga','Vovó Maria Redonda','Vovó Anastácia']) {
    assert.equal(detectUmbandaEntity(name).name, name);
  }
});
test('recognizes representative lines and aliases', () => {
  assert.equal(detectUmbandaEntity('Seu Zé Pelintra').line, 'Malandro');
  assert.equal(detectUmbandaEntity('Malandro Miguel').name, 'Malandro Miguel');
  assert.equal(detectUmbandaLine('Boiadeiros'), 'Boiadeiro');
  assert.equal(detectUmbandaLine('Ciganos'), 'Cigano');
  assert.equal(detectUmbandaLine('Bruxas'), 'Bruxo');
  assert.equal(detectUmbandaLine('Orixás'), 'Orixá');
  assert.ok(listUmbandaEntities('Orixá').some(x => x.name === 'Oxalá'));
});
test('builds attributed original phrase instructions', () => {
  const p = buildUmbandaPhrasePrompt({line:'Malandro',entity:'Zé Pelintra',theme:'Sabedoria',count:5});
  assert.match(p,/QUANTIDADE EXATA: 5/);
  assert.match(p,/ENTIDADE INFORMADA: Zé Pelintra/);
  assert.match(p,/Nunca invente citações históricas/);
});
test('rejects unknown identities, mismatch and excessive count', () => {
  assert.throws(()=>buildUmbandaPhrasePrompt({line:'Exu',entity:'Zé Pelintra'}));
  assert.match(buildUmbandaPhrasePrompt({line:'Malandro',entity:'Malandro de Nome Novo'}), /Malandro de Nome Novo/);
  assert.throws(()=>buildUmbandaPhrasePrompt({line:'Malandro',count:101}));
});
