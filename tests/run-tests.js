#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const ROOT = path.resolve(__dirname, '..');
const Exp = require(path.join(ROOT, 'static', 'exercises.js'));

let passedCount = 0;
let failedCount = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passedCount += 1;
    console.log('  [OK] ' + name);
  } catch (err) {
    failedCount += 1;
    failures.push({ name, err });
    console.error('  [ECHEC] ' + name);
    console.error('          ' + (err && err.message ? err.message : String(err)));
  }
}

async function runWorkerTest(pattern, cases, timeoutMs) {
  const workerFile = path.join(ROOT, 'static', 'regex-worker.js');
  const workerSource = fs.readFileSync(workerFile, 'utf8');
  const wrapper = `
    const { parentPort } = require('worker_threads');
    global.self = {
      postMessage: (msg) => parentPort.postMessage(msg),
      onmessage: null
    };
    ${workerSource}
    parentPort.on('message', (data) => {
      if (typeof global.self.onmessage === 'function') {
        global.self.onmessage({ data });
      }
    });
  `;

  return new Promise((resolve) => {
    const worker = new Worker(wrapper, { eval: true });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve({ timedOut: true, result: null });
    }, timeoutMs);

    worker.on('message', (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve({ timedOut: false, result: msg.result });
    });

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve({ timedOut: false, error: err });
    });

    worker.postMessage({ id: 1, pattern, cases });
  });
}

async function main() {
  console.log('=== Suite de tests — Expérience expressions régulières (Hugo) ===\n');

  // 1. Références internes
  await test('Toutes les expressions de référence (A1, A2, A3, E1, E3, E4) passent 100% des tests', () => {
    const ids = ['A1', 'A2', 'A3', 'E1', 'E3', 'E4'];
    ids.forEach((id) => {
      const ex = Exp.getExerciseById(id);
      const res = Exp.evaluateExerciseSync(id, ex.reference);
      assert.strictEqual(res.valid, true, id + ' devrait être valide');
      assert.strictEqual(res.passed, true, id + ' référence devrait passer (' + res.passedCount + '/' + res.totalCount + ')');
    });
  });

  // 2. Expressions équivalentes acceptées sans comparaison textuelle
  await test('Les expressions équivalentes sont acceptées sans comparaison textuelle', () => {
    const equivalents = [
      ['A1', '[A-Z][A-Z]\\d\\d\\d'],
      ['A1', '^[A-Z]{2}[0-9]{3}$'],
      ['A2', '(?:WARN|INFO)-\\d{2,4}'],
      ['A3', '[a-z]{3,5}(?:-[0-9][0-9])?'],
      ['E1', '[a-z]{2,4}-\\d{3}'],
      ['E3', '(?:POST|GET)-[A-Z][A-Z]'],
      ['E4', '(UDP|TCP)-\\d{2,4}(?:-[A-Z]{2})?']
    ];
    equivalents.forEach(([id, pat]) => {
      const res = Exp.evaluateExerciseSync(id, pat);
      assert.strictEqual(res.passed, true, 'Équivalent attendu valide pour ' + id + ' : ' + pat);
    });
  });

  // 3. Rejet des erreurs typiques de groupement, quantification, ancrage et casse
  await test('Les erreurs de groupement, quantification, ancrage et sur-généralisation sont rejetées', () => {
    const badPatterns = [
      ['A1', '[A-Z]+[0-9]+'],
      ['A1', '[A-Za-z]{2}[0-9]{3}'],
      ['A1', '\\w{2}[0-9]{3}'],
      ['A1', '.*'],
      ['A1', '/[A-Z]{2}[0-9]{3}/'],
      ['A2', 'INFO|WARN-[0-9]{2,4}'],
      ['A2', '(INFO|WARN)-[0-9]+'],
      ['A2', '(INFO|WARN)-[0-9]{1,4}'],
      ['A3', '[a-z]{3,5}-[0-9]{2}?'],
      ['A3', '[a-z]{3,5}(-[0-9]{2})*'],
      ['A3', '[a-z]{3,5}(-[0-9]{2})+'],
      ['E1', '[a-z]{2,4}-[0-9]{2,3}'],
      ['E1', '[a-z]+-[0-9]{3}'],
      ['E1', '[a-z]{2,4}-[0-9]{3}.*'],
      ['E3', 'GET|POST-[A-Z]{2}'],
      ['E3', '(GET|POST)-[A-Z]+'],
      ['E3', '(GET|POST)-[A-Za-z]{2}'],
      ['E4', 'TCP|UDP-[0-9]{2,4}(-[A-Z]{2})?'],
      ['E4', '(TCP|UDP)-[0-9]{2,4}-[A-Z]{2}?'],
      ['E4', '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})*'],
      ['E4', '(TCP|UDP)-[0-9]{2,4}']
    ];
    badPatterns.forEach(([id, pat]) => {
      const res = Exp.evaluateExerciseSync(id, pat);
      assert.strictEqual(res.passed, false, 'Motif erroné devrait être rejeté pour ' + id + ' : ' + pat);
    });
  });

  // 4. Correspondance complète avec sauts de ligne et Unicode
  await test('Correspondance complète stricte : rejet des sauts de ligne finaux et chiffres/lettres hors ASCII', () => {
    const compiled = Exp.buildFullMatchRegExp('[A-Z]{2}[0-9]{3}');
    assert.strictEqual(compiled.ok, true);
    assert.strictEqual(compiled.regex.test('AB123'), true);
    assert.strictEqual(compiled.regex.test('AB123\n'), false);
    assert.strictEqual(compiled.regex.test('\nAB123'), false);
    assert.strictEqual(compiled.regex.test('AB\u0661\u0662\u0663'), false);
    assert.strictEqual(compiled.regex.test('ÉB123'), false);

    // Même si l'étudiant met ^ et $ manuellement
    const withAnchors = Exp.buildFullMatchRegExp('^[A-Z]{2}[0-9]{3}$');
    assert.strictEqual(withAnchors.ok, true);
    assert.strictEqual(withAnchors.regex.test('AB123'), true);
    assert.strictEqual(withAnchors.regex.test('AB123\n'), false);
  });

  // 5. Regex invalides, vides, trop longues et indice de délimiteurs
  await test('Gestion propre des regex invalides, vides, trop longues et délimiteurs /.../', () => {
    const emptyRes = Exp.evaluateExerciseSync('A1', '');
    assert.strictEqual(emptyRes.valid, false);
    assert.strictEqual(emptyRes.errorCode, 'EMPTY');

    const longRes = Exp.evaluateExerciseSync('A1', 'a'.repeat(Exp.MAX_PATTERN_LENGTH + 1));
    assert.strictEqual(longRes.valid, false);
    assert.strictEqual(longRes.errorCode, 'TOO_LONG');

    const syntaxCases = ['[A-Z', '(INFO|WARN', '*abc', '[z-a]', 'a{5,2}', 'abc\\'];
    syntaxCases.forEach((bad) => {
      const res = Exp.evaluateExerciseSync('A1', bad);
      assert.strictEqual(res.valid, false, 'Devrait être invalide : ' + bad);
      assert.strictEqual(res.errorCode, 'SYNTAX');
      assert.ok(res.error && res.error.length > 5, 'Message d’erreur lisible attendu');
    });

    const delimRes = Exp.evaluateExerciseSync('A1', '/[A-Z]{2}[0-9]{3}/g');
    assert.strictEqual(delimRes.delimiterHint, true);
    assert.strictEqual(delimRes.passed, false);
  });

  // 6. Web Worker réel (fichier static/regex-worker.js) : cas normal + délai dépassé (ReDoS)
  await test('Web Worker : évaluation normale et interruption par délai sur motif pathologique (ReDoS)', async () => {
    const a1Cases = Exp.getTestCases(Exp.getExerciseById('A1')).all;
    const normalRun = await runWorkerTest('[A-Z]{2}[0-9]{3}', a1Cases, 1000);
    assert.strictEqual(normalRun.timedOut, false);
    assert.strictEqual(normalRun.result.passed, true);

    const evilCases = [{ input: 'a'.repeat(30) + '!', expected: true, visible: true }];
    const evilRun = await runWorkerTest('(a+)+b', evilCases, 200);
    assert.strictEqual(evilRun.timedOut, true, 'Le Worker doit être interrompu au-delà du délai maximal');
  });

  // 7. Barème E2 & cohérence avec le motif officiel
  await test('E2 : réponses attendues cohérentes avec [A-Z]{2}(-[0-9]+)? et calcul proportionnel /6', () => {
    const compiled = Exp.buildFullMatchRegExp(Exp.EVAL_EXERCISES.E2.pattern);
    assert.strictEqual(compiled.ok, true);
    Exp.EVAL_EXERCISES.E2.items.forEach((item) => {
      assert.strictEqual(
        compiled.regex.test(item.input),
        item.expected,
        'Incohérence E2 pour ' + item.input
      );
    });

    const full = Exp.scoreE2({ AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true });
    assert.strictEqual(full.correctCount, 6);
    assert.strictEqual(full.score, 1);

    const partial = Exp.scoreE2({ AB: true, 'AB-123': true, 'AB-': true });
    assert.strictEqual(partial.correctCount, 2);
    assert.strictEqual(partial.score, Number((2 / 6).toFixed(4)));

    const empty = Exp.scoreE2({});
    assert.strictEqual(empty.correctCount, 0);
    assert.strictEqual(empty.score, 0);
  });

  // 8. Calcul des scores, écart d'autoévaluation et isolation de la note manuelle E3
  await test('Calcul des scores /3, /4, pourcentages, écart autonomie et isolation note manuelle E3', () => {
    const learning = {
      A1: { passed: true },
      A2: { passed: true },
      A3: { passed: false }
    };
    const selfEval = { comprehension: 8, autonomy: 7, explain: 6 };
    const evaluation = {
      E1: { passed: true, score: 1 },
      E2: { score: 0.5, correctCount: 3, totalItems: 6 },
      E3: { passed: true, score: 1, explanation: 'Priorité du |', manualExplanationScore: 1 },
      E4: { passed: false, score: 0 }
    };
    const scores = Exp.computeAttemptScores(learning, selfEval, evaluation);
    assert.strictEqual(scores.learningTotal, 2);
    assert.strictEqual(scores.learningPercent, 66.7);
    assert.strictEqual(scores.evalTotal, 2.5);
    assert.strictEqual(scores.evalPercent, 62.5);
    assert.strictEqual(scores.evalOn10, 6.25);
    assert.strictEqual(scores.autonomyGap, 0.75);

    // Modifier manualExplanationScore ne doit pas changer evalTotal
    evaluation.E3.manualExplanationScore = 0;
    const scoresAfter = Exp.computeAttemptScores(learning, selfEval, evaluation);
    assert.strictEqual(scoresAfter.evalTotal, 2.5);
  });

  // 9. Validation schéma, import multi-étudiants, dédoublonnage et isolation démo
  await test('Import JSON : validation du schéma, dédoublonnage par attemptId et blocage des données démo', () => {
    const sampleAttempt = {
      schemaVersion: '1.0',
      kind: 'regex-exp-attempt',
      attemptId: 'ETU-TEST-0001',
      group: 'B',
      assignmentMode: 'manual',
      familiarity: 'notions',
      learning: {
        A1: { pattern: '[A-Z]{2}[0-9]{3}', passed: true, attempts: 1, timeSpentSec: 60 },
        A2: { pattern: '', passed: false, attempts: 0, timeSpentSec: 30 },
        A3: { pattern: '', passed: false, attempts: 0, timeSpentSec: 20 }
      },
      selfEval: { comprehension: 5, autonomy: 5, explain: 4 },
      evaluation: {
        E1: { pattern: '[a-z]{2,4}-[0-9]{3}', passed: true, score: 1 },
        E2: { answers: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true } },
        E3: { pattern: '(GET|POST)-[A-Z]{2}', passed: true, score: 1, explanation: 'Parenthèses', manualExplanationScore: null },
        E4: { pattern: '', passed: false, score: 0 }
      }
    };

    const parsed1 = Exp.parseImportPayload(JSON.stringify(sampleAttempt), 'etu1.json');
    assert.strictEqual(parsed1.accepted.length, 1);
    assert.strictEqual(parsed1.rejected.length, 0);

    // Dédoublonnage
    const merged1 = Exp.mergeAttempts([], parsed1.accepted);
    const merged2 = Exp.mergeAttempts(merged1.merged, parsed1.accepted);
    assert.strictEqual(merged2.merged.length, 1);
    assert.strictEqual(merged2.duplicates.length, 1);

    // Rejet schéma invalide
    const invalid = Exp.parseImportPayload(JSON.stringify({ attemptId: 'X', group: 'Z' }), 'bad.json');
    assert.strictEqual(invalid.accepted.length, 0);
    assert.strictEqual(invalid.rejected.length, 1);

    // Blocage du jeu démo dans un import réel
    const demoData = Exp.createDemoDataset();
    const demoImport = Exp.parseImportPayload(JSON.stringify(demoData), 'demo.json');
    assert.strictEqual(demoImport.accepted.length, 0);
    assert.strictEqual(demoImport.rejected.length, demoData.length);
  });

  // 10. Agrégation : groupes vides, valeurs absentes vs zéros
  await test('Agrégation par groupe : gestion des groupes vides et distinction données absentes (null) vs zéros (0)', () => {
    const emptyAgg = Exp.aggregateByGroup([]);
    ['A', 'B', 'C', 'ALL'].forEach((k) => {
      assert.strictEqual(emptyAgg[k].count, 0);
      assert.strictEqual(emptyAgg[k].learningMean, null);
      assert.strictEqual(emptyAgg[k].evalMean, null);
      assert.strictEqual(emptyAgg[k].autonomyGapMean, null);
    });

    const aZero = Exp.validateAttemptSchema({
      attemptId: 'ETU-ZERO-0001',
      group: 'A',
      familiarity: 'jamais',
      learning: { A1: { passed: false }, A2: { passed: false }, A3: { passed: false } },
      selfEval: { comprehension: 0, autonomy: 0, explain: 0 },
      evaluation: {
        E1: { passed: false },
        E2: { answers: {} },
        E3: { passed: false, explanation: 'x', manualExplanationScore: 0 },
        E4: { passed: false }
      }
    }).attempt;

    const cMissing = Exp.validateAttemptSchema({
      attemptId: 'ETU-MISS-0002',
      group: 'C',
      familiarity: null,
      learning: { A1: { passed: true }, A2: { passed: false }, A3: { passed: false } },
      selfEval: { comprehension: null, autonomy: null, explain: null },
      evaluation: {
        E1: { passed: true },
        E2: { answers: {} },
        E3: { passed: false, explanation: '', manualExplanationScore: null },
        E4: { passed: false }
      }
    }).attempt;

    const agg = Exp.aggregateByGroup([aZero, cMissing]);
    // Groupe A : zéros explicites
    assert.strictEqual(agg.A.count, 1);
    assert.strictEqual(agg.A.learningMean, 0);
    assert.strictEqual(agg.A.evalMean, 0);
    assert.strictEqual(agg.A.selfEval.autonomy, 0);
    assert.strictEqual(agg.A.exercises.E3Manual, 0);
    assert.strictEqual(agg.A.exercises.E3ManualCount, 1);

    // Groupe B : vide -> null
    assert.strictEqual(agg.B.count, 0);
    assert.strictEqual(agg.B.learningMean, null);
    assert.strictEqual(agg.B.exercises.E1, null);

    // Groupe C : autoévaluation et E3 manuelle absentes -> null (pas 0 !)
    assert.strictEqual(agg.C.count, 1);
    assert.strictEqual(agg.C.familiarityCounts.missing, 1);
    assert.strictEqual(agg.C.selfEval.autonomy, null);
    assert.strictEqual(agg.C.autonomyGapMean, null);
    assert.strictEqual(agg.C.exercises.E3Manual, null);
    assert.strictEqual(agg.C.exercises.E3ManualCount, 0);
  });

  // 11. Exports CSV
  await test('Exports CSV individuel et agrégé valides avec échappement correct', () => {
    const demo = Exp.createDemoDataset();
    const indivCsv = Exp.attemptsToIndividualCsv(demo);
    assert.ok(indivCsv.startsWith('\uFEFFidentifiant;groupe;'));
    const lines = indivCsv.trim().split('\r\n');
    assert.strictEqual(lines.length, demo.length + 1);

    const aggCsv = Exp.aggregationToGroupCsv(Exp.aggregateByGroup(demo));
    assert.ok(aggCsv.startsWith('\uFEFFgroupe;effectif;'));
    assert.strictEqual(aggCsv.trim().split('\r\n').length, 5); // header + A, B, C, Ensemble
  });

  // 12. Vérifications structurelles Hugo, sécurité (aucun CDN, aucun eval), correspondance des IDs DOM
  await test('Intégrité Hugo : aucun appel réseau externe, aucun eval, IDs DOM cohérents et feuille papier sans solutions', () => {
    const filesToScan = [
      'layouts/_default/baseof.html',
      'layouts/index.html',
      'layouts/page/teacher.html',
      'layouts/page/papier.html',
      'static/styles.css',
      'static/exercises.js',
      'static/regex-worker.js',
      'static/app.js',
      'static/teacher.js'
    ];

    filesToScan.forEach((rel) => {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.ok(!/<script[^>]+src=["']https?:/i.test(content), 'Script externe interdit dans ' + rel);
      assert.ok(!/<link[^>]+href=["']https?:/i.test(content), 'CSS externe interdit dans ' + rel);
      assert.ok(!/\beval\s*\(/.test(content), 'eval() interdit dans ' + rel);
      assert.ok(!/\bnew\s+Function\s*\(/.test(content), 'new Function() interdit dans ' + rel);
      assert.ok(!/\bfetch\s*\(/.test(content), 'fetch() réseau non souhaité dans ' + rel);
    });

    // Vérifier que tous les IDs utilisés dans app.js existent dans layouts/index.html
    const indexHtml = fs.readFileSync(path.join(ROOT, 'layouts/index.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT, 'static/app.js'), 'utf8');
    const appIds = new Set();
    let m;
    const idRegex = /\$\('([a-z0-9-]+)'\)/g;
    while ((m = idRegex.exec(appJs)) !== null) {
      appIds.add(m[1]);
    }
    appIds.forEach((id) => {
      assert.ok(
        indexHtml.includes('id="' + id + '"'),
        'ID référencé par app.js introuvable dans layouts/index.html : #' + id
      );
    });

    // Vérifier que tous les IDs utilisés dans teacher.js existent dans layouts/page/teacher.html
    const teacherHtml = fs.readFileSync(path.join(ROOT, 'layouts/page/teacher.html'), 'utf8');
    const teacherJs = fs.readFileSync(path.join(ROOT, 'static/teacher.js'), 'utf8');
    const teacherIds = new Set();
    while ((m = idRegex.exec(teacherJs)) !== null) {
      teacherIds.add(m[1]);
    }
    teacherIds.forEach((id) => {
      assert.ok(
        teacherHtml.includes('id="' + id + '"'),
        'ID référencé par teacher.js introuvable dans layouts/page/teacher.html : #' + id
      );
    });

    // Vérifier que la feuille papier et index.html ne contiennent aucune solution de référence
    const papierHtml = fs.readFileSync(path.join(ROOT, 'layouts/page/papier.html'), 'utf8');
    const allSolutions = [
      '[A-Z]{2}[0-9]{3}',
      '(INFO|WARN)-[0-9]{2,4}',
      '[a-z]{3,5}(-[0-9]{2})?',
      '[a-z]{2,4}-[0-9]{3}',
      '(GET|POST)-[A-Z]{2}',
      '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?'
    ];
    allSolutions.forEach((sol) => {
      assert.ok(!papierHtml.includes(sol), 'La feuille papier ne doit contenir aucune solution : ' + sol);
      assert.ok(!indexHtml.includes(sol), 'layouts/index.html ne doit contenir aucune solution : ' + sol);
    });
  });

  console.log('\nRésumé : ' + passedCount + ' test(s) réussi(s), ' + failedCount + ' échec(s).');
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
