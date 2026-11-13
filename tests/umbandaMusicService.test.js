import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUmbandaEntity, buildUmbandaMusicPlan } from '../services/umbandaMusicService.js';

test('distingue Zé Pretinho de Zé Pelintra', () => {
  assert.equal(detectUmbandaEntity('Frase de Zé Pretinho')?.name, 'Zé Pretinho');
  assert.equal(detectUmbandaEntity('Seu Zé Pilintra ensina')?.name, 'Zé Pelintra');
});
test('reconhece Preto Velho e nomes específicos', () => {
  assert.equal(detectUmbandaEntity('Pai João ensina')?.name, 'Pai João');
  assert.equal(detectUmbandaEntity('Vovó Maria Conga aconselha')?.name, 'Vovó Maria Conga');
  assert.equal(detectUmbandaEntity('Preta Velha aconselha')?.line, 'Preto Velho');
});
test('prioriza nome exato e preserva fallback Umbanda', () => {
  const plan = buildUmbandaMusicPlan('Uma frase de Zé Pretinho');
  assert.match(plan.queries[0], /Zé Pretinho/);
  assert.equal(plan.queries.at(-1), 'toque instrumental Umbanda');
  assert.equal(plan.licensed, false);
  assert.equal(plan.musicUrl, null);
  assert.ok(plan.searchOptions[0].youtubeSearchUrl.startsWith('https://www.youtube.com/results?'));
});
test('não atribui entidade inexistente', () => {
  const plan = buildUmbandaMusicPlan('Confie na caminhada');
  assert.equal(plan.entity, null);
  assert.equal(plan.queries[0], 'pontos cantados Umbanda');
});
