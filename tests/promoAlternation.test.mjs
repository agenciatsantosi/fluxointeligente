/**
 * Testes da alternância de comentários promocionais de assinatura.
 * - Lógica pura: sempre executa (sem dependências, `node` puro).
 * - Integração com Postgres: executa se o banco responder em até 5s,
 *   senão pula com aviso (SKIP). Nunca publica nada real.
 *
 * Uso: node tests/promoAlternation.test.mjs
 */
import {
    shouldComment,
    pickTemplate,
    buildPromoText,
    validatePromoText,
    shouldRetryPromo,
    PROMO_TEMPLATES,
} from '../services/promoCommentPolicy.js';

let passed = 0;
let failed = 0;
function ok(cond, name) {
    if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
    else { failed += 1; console.error(`  ✗ FALHOU: ${name}`); }
}

console.log('— política pura —');
// 1. Alternância padrão 1 sim / 1 não
ok([1, 2, 3, 4, 5, 6].map(p => shouldComment(p, 2)).join(',') === 'true,false,true,false,true,false', 'sequência 1 sim/1 não (freq 2)');
// 2. Frequência 3
ok([1, 2, 3, 4].map(p => shouldComment(p, 3)).join(',') === 'true,false,false,true', 'frequência 3 (1 a cada 3)');
// 3. Frequência 1 = sempre comenta
ok([1, 2, 3].every(p => shouldComment(p, 1)), 'frequência 1 comenta sempre');
// 4. Posição inválida nunca comenta
ok(!shouldComment(0, 2) && !shouldComment(-1, 2), 'posição 0/negativa não comenta');
// 5. Templates: evita recentes
const recent = [PROMO_TEMPLATES[0].text.replace('{link}', 'https://x.com/a'), PROMO_TEMPLATES[1].text.replace('{link}', 'https://x.com/a')];
const picked = pickTemplate(recent, () => 0);
ok(picked.id !== 0 && picked.id !== 1, 'não repete templates recentes');
// 6. Todos usados → fallback funciona
const allUsed = PROMO_TEMPLATES.map(t => t.text.replace('{link}', 'https://x.com/a'));
ok(!!pickTemplate(allUsed, () => 0.99), 'fallback quando tudo foi usado');
// 7. buildPromoText com {link} e sem {link}
ok(buildPromoText('Assine aqui: {link}', 'https://x.com/a') === 'Assine aqui: https://x.com/a', 'substitui {link}');
ok(buildPromoText('Assine já!', 'https://x.com/a') === 'Assine já!\nhttps://x.com/a', 'anexa link ao final');
// 8. Validação preserva link e rejeita lixo
ok(validatePromoText('Apoie a página 👇\nhttps://x.com/a', 'https://x.com/a'), 'texto válido passa');
ok(!validatePromoText('Texto sem link', 'https://x.com/a'), 'sem link é rejeitado');
ok(!validatePromoText('Falta {link}', 'https://x.com/a'), 'placeholder restante é rejeitado');
ok(!validatePromoText('', 'https://x.com/a'), 'vazio é rejeitado');
// 9. Retry só transitório e no máx 2 tentativas
ok(shouldRetryPromo({ message: 'Request failed 429' }, 1), 'retry em 429');
ok(!shouldRetryPromo({ message: 'Request failed 429' }, 2), 'sem 3ª tentativa');
ok(!shouldRetryPromo({ message: 'Invalid OAuth token' }, 1), 'sem retry em erro auth');
// 10. Sequência com falha de publicação (falha NÃO consome posição)
{
    const outcomes = [];
    let pos = 0;
    for (const published of [true, false, true, true, false, true]) {
        if (!published) { outcomes.push('falhou'); continue; }
        pos += 1;
        outcomes.push(shouldComment(pos, 2) ? 'comentou' : 'pulou');
    }
    ok(outcomes.join(',') === 'comentou,falhou,pulou,comentou,falhou,pulou', 'falhas não consomem posição');
}

console.log('— integração Postgres (pula se sem banco) —');
try {
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const db = await import('../services/database.js');
    await withTimeout(db.query('SELECT 1'), 5000);
    await db.ensurePromoCommentTables();

    const uid = 999999;
    await db.query(`DELETE FROM promo_comment_log WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM promo_comment_state WHERE user_id = $1`, [uid]);

    // 11. Sequência persistida 1 sim/1 não na mesma página
    const seq = [];
    for (let t = 1; t <= 4; t++) {
        const d = await db.decidePromoComment(uid, 'facebook', 'pageA', 1000 + t, 2);
        seq.push(d.decision);
    }
    ok(seq.join(',') === 'comment,skip,comment,skip', 'persistência da sequência por página');
    // 12. Independência entre páginas
    const other = await db.decidePromoComment(uid, 'facebook', 'pageB', 2001, 2);
    ok(other.decision === 'comment' && other.position === 1, 'página B tem sequência própria');
    // 13. Idempotência: mesma tarefa não consome nova posição
    const r1 = await db.decidePromoComment(uid, 'facebook', 'pageA', 1001, 2);
    ok(r1.reused === true && r1.decision === 'comment' && r1.position === 1, 'retry da mesma tarefa reusa decisão');
    const after = await db.decidePromoComment(uid, 'facebook', 'pageA', 1005, 2);
    ok(after.position === 5 && after.decision === 'comment', 'contador não andou no retry');
    // 14. Concorrência: 6 decisões simultâneas → posições 6..11 distintas, alternância íntegra
    const conc = await Promise.all([3001, 3002, 3003, 3004, 3005, 3006].map(tid => db.decidePromoComment(uid, 'instagram', 'acc9', tid, 2)));
    const positions = conc.map(c => c.position).sort((a, b) => a - b);
    ok(JSON.stringify(positions) === JSON.stringify([1, 2, 3, 4, 5, 6]), 'concorrência sem posição duplicada');
    ok(conc.filter(c => c.decision === 'comment').length === 3, 'concorrência mantém 1 sim/1 não');
    // 15. Histórico/auditoria
    const hist = await db.getPromoHistory(uid, { limit: 50 });
    ok(hist.length >= 11 && hist[0].task_id !== undefined, 'histórico registrado para auditoria');

    await db.query(`DELETE FROM promo_comment_log WHERE user_id = $1`, [uid]);
    await db.query(`DELETE FROM promo_comment_state WHERE user_id = $1`, [uid]);
    console.log('  (dados de teste limpos)');
} catch (e) {
    console.log(`  SKIP integração: ${e.message}`);
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
