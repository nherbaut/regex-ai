(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RegexExp = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = '1.0';
  const MAX_PATTERN_LENGTH = 200;
  const WORKER_TIMEOUT_MS = 350;

  const PHASE_DURATIONS = {
    phase1: 7 * 60, // 7 minutes — Apprentissage
    phase2: 1 * 60, // 1 minute — Autoévaluation
    phase3: 7 * 60, // 7 minutes — Évaluation autonome
    teacher: 5 * 60 // 5 minutes — Restitution enseignant
  };

  const GROUP_C_PROMPT =
    "Aide-moi à résoudre cet exercice d'expressions régulières. Donne-moi des indices progressifs et explique les concepts nécessaires. Ne donne jamais l'expression complète.";

  const GROUPS = {
    A: {
      code: 'A',
      label: 'Groupe A — IA libre',
      shortLabel: 'Groupe A',
      phase1Rule:
        "Pendant la phase d'apprentissage (7 min), vous pouvez utiliser librement une IA externe (dans un autre onglet ou une autre application) pour obtenir des solutions et les tester ici.",
      phase1Reminder:
        'Modalité A : utilisation libre d’une IA externe autorisée durant cette phase uniquement.'
    },
    B: {
      code: 'B',
      label: 'Groupe B — Aide-mémoire seul',
      shortLabel: 'Groupe B',
      phase1Rule:
        "Pendant la phase d'apprentissage (7 min), vous utilisez uniquement l'aide-mémoire fourni sur cette page. N'utilisez ni IA externe ni autre documentation.",
      phase1Reminder:
        'Modalité B : utilisez uniquement l’aide-mémoire affiché sur cette page (aucune IA externe).'
    },
    C: {
      code: 'C',
      label: 'Groupe C — IA comme tuteur',
      shortLabel: 'Groupe C',
      phase1Rule:
        "Pendant la phase d'apprentissage (7 min), vous utilisez une IA externe uniquement comme tuteur, en commençant par le prompt proposé ci-dessous, sans lui demander l'expression complète.",
      phase1Reminder:
        'Modalité C : utilisez une IA externe uniquement comme tuteur (indices progressifs, jamais la solution complète).'
    }
  };

  const FAMILIARITY_OPTIONS = [
    { value: 'jamais', label: 'Jamais utilisé' },
    { value: 'notions', label: 'Quelques notions' },
    { value: 'reguliere', label: 'Utilisation régulière' }
  ];

  const SELF_EVAL_QUESTIONS = [
    {
      id: 'comprehension',
      label: 'À quel point estimez-vous avoir compris les expressions régulières ?'
    },
    {
      id: 'autonomy',
      label: 'Seriez-vous capable de résoudre un nouvel exercice sans assistance ?'
    },
    {
      id: 'explain',
      label: "Seriez-vous capable d'expliquer votre solution à un autre étudiant ?"
    }
  ];

  // Exemples élémentaires qui ne résolvent directement aucun exercice A1-A3 ou E1-E4
  const CHEATSHEET_ITEMS = [
    {
      syntax: 'a',
      meaning: 'Caractère littéral',
      example: 'chat reconnaît uniquement « chat »'
    },
    {
      syntax: '[A-Z]',
      meaning: 'Une lettre majuscule ASCII',
      example: '[A-Z] reconnaît « M », mais pas « m » ni « É »'
    },
    {
      syntax: '[a-z]',
      meaning: 'Une lettre minuscule ASCII',
      example: '[a-z] reconnaît « k », mais pas « K » ni « é »'
    },
    {
      syntax: '[0-9]',
      meaning: 'Un chiffre ASCII (0 à 9)',
      example: '[0-9] reconnaît « 7 », mais pas « a »'
    },
    {
      syntax: '*',
      meaning: 'Zéro ou plusieurs répétitions de ce qui précède',
      example: 'o* reconnaît « » (vide), « o », « ooo »'
    },
    {
      syntax: '+',
      meaning: 'Une ou plusieurs répétitions de ce qui précède',
      example: '[0-9]+ reconnaît « 5 », « 42 », mais pas « »'
    },
    {
      syntax: '?',
      meaning: 'Zéro ou une occurrence (élément facultatif)',
      example: 'chats? reconnaît « chat » ou « chats »'
    },
    {
      syntax: '{n}',
      meaning: 'Exactement n répétitions',
      example: 'x{3} reconnaît « xxx », mais pas « xx » ni « xxxx »'
    },
    {
      syntax: '{n,m}',
      meaning: 'Entre n et m répétitions (inclus)',
      example: '[0-9]{1,2} reconnaît « 7 » et « 42 », mais pas « 123 »'
    },
    {
      syntax: '(abc)',
      meaning: 'Groupement (applique un quantificateur ou limite une alternative)',
      example: '(ha){2} reconnaît « haha » ; (oui|non)! reconnaît « oui! » ou « non! »'
    },
    {
      syntax: 'a|b',
      meaning: 'Alternative (« a » ou « b »)',
      example: 'oui|non reconnaît « oui » ou « non »'
    }
  ];

  const LEARNING_EXERCISES = [
    {
      id: 'A1',
      title: 'Exercice A1 — Code court',
      prompt: 'Écrire une expression régulière qui reconnaît deux majuscules ASCII suivies de trois chiffres.',
      reference: '[A-Z]{2}[0-9]{3}',
      visibleAccept: ['AB123', 'XY456'],
      visibleReject: ['A123', 'AB1234', 'ab123'],
      hiddenAccept: ['AA000', 'ZZ999', 'AZ019', 'MN507'],
      hiddenReject: [
        '',
        'AB12',
        'ABC123',
        'Ab123',
        'aB123',
        'ÉA123',
        'ÀB123',
        'AB\u0661\u0662\u0663',
        'AB\uFF11\uFF12\uFF13',
        'AB123\n',
        '\nAB123',
        'AB\n123',
        'xAB123',
        'AB123x',
        ' AB123',
        'AB123 ',
        '12345',
        'AB_123',
        'A_123',
        'AB-123',
        'AB123AB123'
      ]
    },
    {
      id: 'A2',
      title: 'Exercice A2 — Niveau de journalisation',
      prompt: 'Écrire une expression régulière qui reconnaît INFO ou WARN, suivi d’un tiret, puis de deux à quatre chiffres.',
      reference: '(INFO|WARN)-[0-9]{2,4}',
      visibleAccept: ['INFO-12', 'WARN-1234'],
      visibleReject: ['ERROR-12', 'INFO-1', 'WARN-12345'],
      hiddenAccept: ['INFO-00', 'INFO-123', 'INFO-9999', 'WARN-01', 'WARN-456', 'WARN-0000'],
      hiddenReject: [
        '',
        'INFO',
        'WARN',
        'INFO-',
        'WARN-',
        'WARN-1',
        'INFO-12345',
        'INFO-0',
        'info-12',
        'Warn-12',
        'Info-123',
        'INFO_12',
        'INFO 12',
        'INFO12',
        'WARN--12',
        'INFOWARN-12',
        'INF-12',
        'WARNING-12',
        'INFO-\u0661\u0662',
        'WARN-\uFF11\uFF12\uFF13',
        'INFO-12\n',
        '\nWARN-12',
        'xINFO-12',
        'WARN-12x',
        ' INFO-12',
        'INFO-12 ',
        'INFO-12a',
        'WARN-a12'
      ]
    },
    {
      id: 'A3',
      title: 'Exercice A3 — Identifiant avec suffixe facultatif',
      prompt:
        "Écrire une expression régulière qui reconnaît trois à cinq minuscules ASCII, éventuellement suivies d'un tiret et de deux chiffres.",
      reference: '[a-z]{3,5}(-[0-9]{2})?',
      visibleAccept: ['abc', 'hello-42'],
      visibleReject: ['ab', 'hello-4', 'ABC-42', 'abcdef'],
      hiddenAccept: ['aaa', 'zzz', 'abcd', 'abcde', 'abc-00', 'abcd-99', 'zyxwv-10'],
      hiddenReject: [
        '',
        'a',
        'ab-12',
        'abcdef-12',
        'abc-',
        'abc-1',
        'abc-123',
        'abc-12-34',
        'abc42',
        'abc_42',
        '-42',
        'Abc',
        'abcD',
        'Abc-12',
        'HELLO-42',
        'été',
        'café-12',
        'abc-\u0661\u0662',
        'abc-\uFF11\uFF12',
        'abc\n',
        'hello-42\n',
        '\nabc',
        'xhello-42',
        'hello-42x',
        'abc ',
        ' abc',
        'ab_c',
        'a1c-12'
      ]
    }
  ];

  const EVAL_EXERCISES = {
    E1: {
      id: 'E1',
      type: 'pattern',
      title: 'E1 — Production',
      prompt:
        'Écrire une expression régulière qui reconnaît deux à quatre minuscules ASCII, un tiret, puis exactement trois chiffres.',
      reference: '[a-z]{2,4}-[0-9]{3}',
      visibleAccept: ['ab-123', 'abcd-456'],
      visibleReject: ['a-123', 'abc-12', 'abcde-123'],
      hiddenAccept: ['az-000', 'abc-789', 'zzzz-999', 'xy-042'],
      hiddenReject: [
        '',
        'a-000',
        'abcde-000',
        'ab-12',
        'ab-1234',
        'ab-',
        'AB-123',
        'Ab-123',
        'abC-123',
        'ab123',
        'ab_123',
        'ab--123',
        '-123',
        'éé-123',
        'ab-\u0661\u0662\u0663',
        'ab-\uFF11\uFF12\uFF13',
        'ab-123\n',
        '\nab-123',
        '1ab-123',
        'xabcd-123',
        'ab-123x',
        ' ab-123',
        'ab-123 ',
        'a_b-123',
        'a1-123',
        'ab-12a'
      ]
    },
    E2: {
      id: 'E2',
      type: 'classify',
      title: 'E2 — Compréhension',
      prompt:
        'Pour l’expression régulière [A-Z]{2}(-[0-9]+)?, indiquer indépendamment pour chaque chaîne si elle est acceptée (Oui) ou refusée (Non) en correspondance complète.',
      pattern: '[A-Z]{2}(-[0-9]+)?',
      items: [
        { input: 'AB', expected: true },
        { input: 'AB-123', expected: true },
        { input: 'AB-', expected: false },
        { input: 'ABC-12', expected: false },
        { input: 'AB123', expected: false },
        { input: 'XY-0', expected: true }
      ]
    },
    E3: {
      id: 'E3',
      type: 'fix',
      title: 'E3 — Correction et explication',
      buggyPattern: 'GET|POST-[A-Z]{2}',
      prompt:
        'Le motif GET|POST-[A-Z]{2} doit reconnaître GET ou POST suivi d’un tiret et de deux majuscules ASCII. Corrigez le motif et expliquez l’erreur présente dans l’expression initiale.',
      reference: '(GET|POST)-[A-Z]{2}',
      expectedExplanation:
        "L'alternative | s'applique à GET seul d'une part et à POST-[A-Z]{2} d'autre part, en raison de la priorité plus faible de l'alternative par rapport à la concaténation. Il faut entourer GET|POST de parenthèses : (GET|POST)-[A-Z]{2}.",
      visibleAccept: [],
      visibleReject: [],
      hiddenAccept: ['GET-AB', 'GET-AA', 'GET-ZZ', 'POST-AB', 'POST-XY', 'POST-MN'],
      hiddenReject: [
        '',
        'GET',
        'POST',
        'GET-',
        'POST-',
        'GET-A',
        'GET-ABC',
        'POST-A',
        'POST-ABC',
        'get-AB',
        'Post-AB',
        'GET-ab',
        'POST-Ab',
        'PUT-AB',
        'HEAD-AB',
        'GETPOST-AB',
        'GET|POST-AB',
        'GETAB',
        'POST_AB',
        'GET--AB',
        'GET-ÉÀ',
        'POST-12',
        'GET-AB\n',
        '\nPOST-AB',
        'xGET-AB',
        'POST-ABx',
        ' GET-AB',
        'GET-AB '
      ]
    },
    E4: {
      id: 'E4',
      type: 'pattern',
      title: 'E4 — Transfert',
      prompt:
        'Écrire une expression régulière qui reconnaît TCP ou UDP, un tiret, deux à quatre chiffres, puis éventuellement un tiret et deux majuscules ASCII.',
      reference: '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?',
      visibleAccept: ['TCP-123', 'UDP-42', 'TCP-1234-AB', 'UDP-99-XY'],
      visibleReject: ['HTTP-123', 'UDP-1', 'TCP-123-ABC', 'UDP-99-'],
      hiddenAccept: [
        'TCP-00',
        'TCP-9999',
        'UDP-100',
        'UDP-0000',
        'TCP-12-AA',
        'TCP-123-ZZ',
        'UDP-1234-MN'
      ],
      hiddenReject: [
        '',
        'TCP',
        'UDP',
        'TCP-',
        'UDP-',
        'TCP-1',
        'UDP-12345',
        'TCP-12345-AB',
        'UDP-1-AB',
        'TCP-12-A',
        'UDP-12-ABC',
        'TCP-12-AB-CD',
        'tcp-123',
        'Udp-42',
        'TCP-123-ab',
        'UDP-42-Ab',
        'TCP123',
        'TCP-123AB',
        'TCP_123',
        'UDP-42_XY',
        'TCP-\u0661\u0662',
        'UDP-\uFF11\uFF12\uFF13',
        'TCP-12-ÉÀ',
        'TCP-123\n',
        'UDP-99-XY\n',
        '\nTCP-123',
        'xTCP-123',
        'UDP-42x',
        ' TCP-123',
        'TCP-123 ',
        'TCPUDP-12',
        'ICMP-123',
        'TCP-12a-AB'
      ]
    }
  };

  function getExerciseById(id) {
    const learning = LEARNING_EXERCISES.find((ex) => ex.id === id);
    if (learning) return learning;
    return EVAL_EXERCISES[id] || null;
  }

  function getTestCases(exercise) {
    const visible = [];
    (exercise.visibleAccept || []).forEach((input) => {
      visible.push({ input, expected: true, visible: true });
    });
    (exercise.visibleReject || []).forEach((input) => {
      visible.push({ input, expected: false, visible: true });
    });
    const hidden = [];
    (exercise.hiddenAccept || []).forEach((input) => {
      hidden.push({ input, expected: true, visible: false });
    });
    (exercise.hiddenReject || []).forEach((input) => {
      hidden.push({ input, expected: false, visible: false });
    });
    return { visible, hidden, all: visible.concat(hidden) };
  }

  function detectDelimiterHint(pattern) {
    if (typeof pattern !== 'string') return false;
    return /^\/.+\/[a-zA-Z]*$/.test(pattern.trim());
  }

  function formatRegexError(err) {
    const raw = err && err.message ? String(err.message) : 'Erreur de syntaxe';
    if (/Unterminated group|missing \)/i.test(raw)) {
      return 'Expression invalide : parenthèse ouvrante « ( » non fermée.';
    }
    if (/Unmatched '\)'/i.test(raw)) {
      return 'Expression invalide : parenthèse fermante « ) » sans parenthèse ouvrante correspondante.';
    }
    if (/Unterminated character class|missing \]/i.test(raw)) {
      return 'Expression invalide : classe de caractères « [ » non fermée.';
    }
    if (/Nothing to repeat/i.test(raw)) {
      return 'Expression invalide : quantificateur (*, +, ?, {n,m}) placé sans élément à répéter avant lui.';
    }
    if (/numbers out of order/i.test(raw)) {
      return 'Expression invalide : bornes de quantificateur {n,m} dans le mauvais ordre (n doit être inférieur ou égal à m).';
    }
    if (/Range out of order/i.test(raw)) {
      return 'Expression invalide : intervalle de caractères invalide dans [ ... ] (ex. [z-a] au lieu de [a-z]).';
    }
    if (/\\ at end of pattern/i.test(raw)) {
      return 'Expression invalide : barre oblique inverse « \\ » isolée en fin de motif.';
    }
    return 'Expression régulière invalide : ' + raw;
  }

  function buildFullMatchRegExp(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      return {
        ok: false,
        errorCode: 'EMPTY',
        error: 'Aucun motif saisi.'
      };
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
      return {
        ok: false,
        errorCode: 'TOO_LONG',
        error: 'Motif trop long (maximum ' + MAX_PATTERN_LENGTH + ' caractères).'
      };
    }
    try {
      new RegExp(pattern);
    } catch (err) {
      return {
        ok: false,
        errorCode: 'SYNTAX',
        error: formatRegexError(err)
      };
    }
    try {
      const regex = new RegExp('^(?:' + pattern + ')(?![\\s\\S])');
      return { ok: true, regex };
    } catch (err) {
      return {
        ok: false,
        errorCode: 'SYNTAX',
        error: formatRegexError(err)
      };
    }
  }

  function evaluateCasesSync(pattern, cases) {
    const compiled = buildFullMatchRegExp(pattern);
    if (!compiled.ok) {
      return {
        valid: false,
        passed: false,
        errorCode: compiled.errorCode,
        error: compiled.error,
        delimiterHint: detectDelimiterHint(pattern),
        visibleResults: [],
        visiblePassed: false,
        hiddenPassed: false,
        passedCount: 0,
        totalCount: cases.length
      };
    }

    const regex = compiled.regex;
    const visibleResults = [];
    let visiblePassed = true;
    let hiddenPassed = true;
    let passedCount = 0;

    for (let i = 0; i < cases.length; i += 1) {
      const testCase = cases[i];
      const actual = regex.test(testCase.input);
      const ok = actual === testCase.expected;
      if (ok) {
        passedCount += 1;
      } else if (testCase.visible) {
        visiblePassed = false;
      } else {
        hiddenPassed = false;
      }
      if (testCase.visible) {
        visibleResults.push({
          input: testCase.input,
          expected: testCase.expected,
          actual,
          ok
        });
      }
    }

    return {
      valid: true,
      passed: visiblePassed && hiddenPassed,
      errorCode: null,
      error: null,
      delimiterHint: detectDelimiterHint(pattern),
      visibleResults,
      visiblePassed,
      hiddenPassed,
      passedCount,
      totalCount: cases.length
    };
  }

  function evaluateExerciseSync(exerciseId, pattern) {
    const exercise = getExerciseById(exerciseId);
    if (!exercise || exercise.type === 'classify') {
      throw new Error('Exercice de motif inconnu : ' + exerciseId);
    }
    const { all } = getTestCases(exercise);
    return evaluateCasesSync(pattern, all);
  }

  function scoreE2(answersMap) {
    const items = EVAL_EXERCISES.E2.items;
    const sanitized = {};
    let correctCount = 0;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const val = answersMap && typeof answersMap[item.input] === 'boolean' ? answersMap[item.input] : null;
      sanitized[item.input] = val;
      if (val === item.expected) {
        correctCount += 1;
      }
    }
    const score = Number((correctCount / items.length).toFixed(4));
    return {
      answers: sanitized,
      correctCount,
      totalItems: items.length,
      score
    };
  }

  function round1(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return Math.round(value * 10) / 10;
  }

  function round2(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return Math.round(value * 100) / 100;
  }

  function computeAttemptScores(learning, selfEval, evaluation) {
    const learningIds = ['A1', 'A2', 'A3'];
    let learningTotal = 0;
    learningIds.forEach((id) => {
      if (learning && learning[id] && learning[id].passed === true) {
        learningTotal += 1;
      }
    });

    const e1Score = evaluation && evaluation.E1 && evaluation.E1.passed === true ? 1 : 0;
    const e2Score =
      evaluation && evaluation.E2 && typeof evaluation.E2.score === 'number'
        ? Math.max(0, Math.min(1, evaluation.E2.score))
        : 0;
    const e3Score = evaluation && evaluation.E3 && evaluation.E3.passed === true ? 1 : 0;
    const e4Score = evaluation && evaluation.E4 && evaluation.E4.passed === true ? 1 : 0;

    const evalTotal = round2(e1Score + e2Score + e3Score + e4Score);
    const learningPercent = round1((learningTotal / 3) * 100);
    const evalPercent = round1((evalTotal / 4) * 100);
    const evalOn10 = round2((evalTotal / 4) * 10);

    const autonomy =
      selfEval && typeof selfEval.autonomy === 'number' && Number.isFinite(selfEval.autonomy)
        ? selfEval.autonomy
        : null;
    const autonomyGap = autonomy !== null ? round2(autonomy - evalOn10) : null;

    return {
      learningTotal,
      learningMax: 3,
      learningPercent,
      evalTotal,
      evalMax: 4,
      evalPercent,
      evalOn10,
      autonomyGap
    };
  }

  function generateAnonymousId() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i += 1) {
      part1 += alphabet[bytes[i] % alphabet.length];
      part2 += alphabet[bytes[i + 4] % alphabet.length];
    }
    return 'ETU-' + part1 + '-' + part2;
  }

  function isValidIntScore0To10(v) {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10;
  }

  function isValidManualE3Score(v) {
    return v === null || v === undefined || v === 0 || v === 0.5 || v === 1;
  }

  function validateAttemptSchema(obj) {
    const errors = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, errors: ['Le fichier JSON ne contient pas un objet de tentative valide.'] };
    }
    if (obj.kind && obj.kind !== 'regex-exp-attempt') {
      errors.push('Type de document inattendu (« kind »).');
    }
    if (typeof obj.attemptId !== 'string' || obj.attemptId.trim().length < 4) {
      errors.push('Identifiant de tentative (attemptId) absent ou invalide.');
    }
    if (!['A', 'B', 'C'].includes(obj.group)) {
      errors.push('Groupe invalide (attendu : A, B ou C).');
    }
    const allowedFam = FAMILIARITY_OPTIONS.map((o) => o.value);
    if (obj.familiarity !== null && obj.familiarity !== undefined && !allowedFam.includes(obj.familiarity)) {
      errors.push('Familiarité préalable invalide.');
    }
    if (!obj.learning || typeof obj.learning !== 'object') {
      errors.push('Section « learning » absente.');
    }
    if (!obj.evaluation || typeof obj.evaluation !== 'object') {
      errors.push('Section « evaluation » absente.');
    }
    if (obj.selfEval && typeof obj.selfEval === 'object') {
      ['comprehension', 'autonomy', 'explain'].forEach((k) => {
        const val = obj.selfEval[k];
        if (val !== null && val !== undefined && !isValidIntScore0To10(val)) {
          errors.push('Valeur d’autoévaluation invalide pour ' + k + ' (entier 0 à 10 attendu).');
        }
      });
    }
    if (
      obj.evaluation &&
      obj.evaluation.E3 &&
      !isValidManualE3Score(obj.evaluation.E3.manualExplanationScore)
    ) {
      errors.push('Note manuelle E3 invalide (attendu : null, 0, 0.5 ou 1).');
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    // Normalisation sans modifier les données d'origine
    const normLearning = {};
    ['A1', 'A2', 'A3'].forEach((id) => {
      const src = obj.learning[id] || {};
      normLearning[id] = {
        pattern: typeof src.pattern === 'string' ? src.pattern : '',
        passed: Boolean(src.passed),
        attempts: typeof src.attempts === 'number' && src.attempts >= 0 ? Math.floor(src.attempts) : 0,
        timeSpentSec:
          typeof src.timeSpentSec === 'number' && src.timeSpentSec >= 0 ? Math.round(src.timeSpentSec) : 0,
        error: typeof src.error === 'string' ? src.error : null
      };
    });

    const normSelfEval = {
      comprehension:
        obj.selfEval && isValidIntScore0To10(obj.selfEval.comprehension)
          ? obj.selfEval.comprehension
          : null,
      autonomy:
        obj.selfEval && isValidIntScore0To10(obj.selfEval.autonomy) ? obj.selfEval.autonomy : null,
      explain:
        obj.selfEval && isValidIntScore0To10(obj.selfEval.explain) ? obj.selfEval.explain : null
    };

    const e1Src = obj.evaluation.E1 || {};
    const e2Src = obj.evaluation.E2 || {};
    const e3Src = obj.evaluation.E3 || {};
    const e4Src = obj.evaluation.E4 || {};

    const e2Computed =
      e2Src.answers && typeof e2Src.answers === 'object'
        ? scoreE2(e2Src.answers)
        : {
            answers: {},
            correctCount: typeof e2Src.correctCount === 'number' ? e2Src.correctCount : 0,
            totalItems: EVAL_EXERCISES.E2.items.length,
            score: typeof e2Src.score === 'number' ? Math.max(0, Math.min(1, e2Src.score)) : 0
          };

    const normEval = {
      E1: {
        pattern: typeof e1Src.pattern === 'string' ? e1Src.pattern : '',
        passed: Boolean(e1Src.passed),
        score: e1Src.passed ? 1 : 0,
        error: typeof e1Src.error === 'string' ? e1Src.error : null
      },
      E2: e2Computed,
      E3: {
        pattern: typeof e3Src.pattern === 'string' ? e3Src.pattern : '',
        passed: Boolean(e3Src.passed),
        score: e3Src.passed ? 1 : 0,
        error: typeof e3Src.error === 'string' ? e3Src.error : null,
        explanation: typeof e3Src.explanation === 'string' ? e3Src.explanation : '',
        manualExplanationScore:
          e3Src.manualExplanationScore === 0 ||
          e3Src.manualExplanationScore === 0.5 ||
          e3Src.manualExplanationScore === 1
            ? e3Src.manualExplanationScore
            : null
      },
      E4: {
        pattern: typeof e4Src.pattern === 'string' ? e4Src.pattern : '',
        passed: Boolean(e4Src.passed),
        score: e4Src.passed ? 1 : 0,
        error: typeof e4Src.error === 'string' ? e4Src.error : null
      }
    };

    const scores = computeAttemptScores(normLearning, normSelfEval, normEval);

    const normalized = {
      schemaVersion: typeof obj.schemaVersion === 'string' ? obj.schemaVersion : SCHEMA_VERSION,
      kind: 'regex-exp-attempt',
      attemptId: obj.attemptId.trim(),
      group: obj.group,
      assignmentMode: obj.assignmentMode === 'random' ? 'random' : 'manual',
      familiarity: allowedFam.includes(obj.familiarity) ? obj.familiarity : null,
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : null,
      submittedAt: typeof obj.submittedAt === 'string' ? obj.submittedAt : null,
      timings: obj.timings && typeof obj.timings === 'object' ? obj.timings : {},
      learning: normLearning,
      selfEval: normSelfEval,
      evaluation: normEval,
      scores,
      isDemo: Boolean(obj.isDemo)
    };

    return { ok: true, attempt: normalized, errors: [] };
  }

  function parseImportPayload(rawData, sourceLabel) {
    const label = sourceLabel || 'fichier';
    let parsed = rawData;
    if (typeof rawData === 'string') {
      try {
        parsed = JSON.parse(rawData);
      } catch (err) {
        return {
          accepted: [],
          rejected: [{ source: label, reason: 'JSON mal formé : ' + err.message }]
        };
      }
    }

    let candidates = [];
    if (Array.isArray(parsed)) {
      candidates = parsed;
    } else if (parsed && typeof parsed === 'object' && parsed.kind === 'regex-exp-bundle' && Array.isArray(parsed.attempts)) {
      candidates = parsed.attempts;
    } else if (parsed && typeof parsed === 'object') {
      candidates = [parsed];
    } else {
      return {
        accepted: [],
        rejected: [{ source: label, reason: 'Structure JSON non reconnue.' }]
      };
    }

    const accepted = [];
    const rejected = [];
    candidates.forEach((item, index) => {
      const itemLabel = candidates.length > 1 ? label + ' #' + (index + 1) : label;
      const result = validateAttemptSchema(item);
      if (result.ok) {
        // Ne jamais importer accidentellement un marquage démo dans une session réelle
        if (result.attempt.isDemo) {
          rejected.push({
            source: itemLabel,
            reason: 'Donnée marquée comme jeu de démonstration (non mélangeable avec des données réelles).'
          });
        } else {
          accepted.push(result.attempt);
        }
      } else {
        rejected.push({ source: itemLabel, reason: result.errors.join(' ') });
      }
    });

    return { accepted, rejected };
  }

  function mergeAttempts(existingAttempts, incomingAttempts) {
    const seen = new Set((existingAttempts || []).map((a) => a.attemptId));
    const merged = (existingAttempts || []).slice();
    const added = [];
    const duplicates = [];

    (incomingAttempts || []).forEach((att) => {
      if (seen.has(att.attemptId)) {
        duplicates.push(att.attemptId);
      } else {
        seen.add(att.attemptId);
        merged.push(att);
        added.push(att);
      }
    });

    return { merged, added, duplicates };
  }

  function meanOf(values) {
    const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (valid.length === 0) return null;
    const sum = valid.reduce((acc, v) => acc + v, 0);
    return sum / valid.length;
  }

  function computeGroupStats(attempts, groupKey) {
    const list = groupKey === 'ALL' ? attempts : attempts.filter((a) => a.group === groupKey);
    const n = list.length;

    const familiarityCounts = {
      jamais: 0,
      notions: 0,
      reguliere: 0,
      missing: 0
    };
    list.forEach((a) => {
      if (a.familiarity && Object.prototype.hasOwnProperty.call(familiarityCounts, a.familiarity)) {
        familiarityCounts[a.familiarity] += 1;
      } else {
        familiarityCounts.missing += 1;
      }
    });

    if (n === 0) {
      return {
        group: groupKey,
        count: 0,
        familiarityCounts,
        learningMean: null,
        learningPercentMean: null,
        evalMean: null,
        evalPercentMean: null,
        evalOn10Mean: null,
        exercises: {
          A1: null,
          A2: null,
          A3: null,
          E1: null,
          E2: null,
          E3: null,
          E4: null,
          E3Manual: null,
          E3ManualCount: 0
        },
        selfEval: {
          comprehension: null,
          autonomy: null,
          explain: null,
          autonomyCount: 0
        },
        autonomyGapMean: null
      };
    }

    const learningMean = round2(meanOf(list.map((a) => a.scores.learningTotal)));
    const learningPercentMean = round1(meanOf(list.map((a) => a.scores.learningPercent)));
    const evalMean = round2(meanOf(list.map((a) => a.scores.evalTotal)));
    const evalPercentMean = round1(meanOf(list.map((a) => a.scores.evalPercent)));
    const evalOn10Mean = round2(meanOf(list.map((a) => a.scores.evalOn10)));

    const e3ManualVals = list
      .map((a) => a.evaluation.E3.manualExplanationScore)
      .filter((v) => typeof v === 'number' && Number.isFinite(v));

    const autonomyVals = list
      .map((a) => a.selfEval.autonomy)
      .filter((v) => typeof v === 'number' && Number.isFinite(v));

    return {
      group: groupKey,
      count: n,
      familiarityCounts,
      learningMean,
      learningPercentMean,
      evalMean,
      evalPercentMean,
      evalOn10Mean,
      exercises: {
        A1: round1(meanOf(list.map((a) => (a.learning.A1.passed ? 100 : 0)))),
        A2: round1(meanOf(list.map((a) => (a.learning.A2.passed ? 100 : 0)))),
        A3: round1(meanOf(list.map((a) => (a.learning.A3.passed ? 100 : 0)))),
        E1: round1(meanOf(list.map((a) => (a.evaluation.E1.passed ? 100 : 0)))),
        E2: round1(meanOf(list.map((a) => a.evaluation.E2.score * 100))),
        E3: round1(meanOf(list.map((a) => (a.evaluation.E3.passed ? 100 : 0)))),
        E4: round1(meanOf(list.map((a) => (a.evaluation.E4.passed ? 100 : 0)))),
        E3Manual: e3ManualVals.length > 0 ? round2(meanOf(e3ManualVals)) : null,
        E3ManualCount: e3ManualVals.length
      },
      selfEval: {
        comprehension: round2(meanOf(list.map((a) => a.selfEval.comprehension))),
        autonomy: round2(meanOf(autonomyVals)),
        explain: round2(meanOf(list.map((a) => a.selfEval.explain))),
        autonomyCount: autonomyVals.length
      },
      autonomyGapMean: round2(meanOf(list.map((a) => a.scores.autonomyGap)))
    };
  }

  function aggregateByGroup(attempts) {
    const list = Array.isArray(attempts) ? attempts : [];
    return {
      A: computeGroupStats(list, 'A'),
      B: computeGroupStats(list, 'B'),
      C: computeGroupStats(list, 'C'),
      ALL: computeGroupStats(list, 'ALL')
    };
  }

  function escapeCsvCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[";,\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function rowsToCsv(headers, rows) {
    const lines = [headers.map(escapeCsvCell).join(';')];
    rows.forEach((row) => {
      lines.push(row.map(escapeCsvCell).join(';'));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function attemptsToIndividualCsv(attempts) {
    const headers = [
      'identifiant',
      'groupe',
      'mode_affectation',
      'familiarite',
      'remis_le',
      'A1_reussi',
      'A1_essais',
      'A1_temps_s',
      'A1_motif',
      'A2_reussi',
      'A2_essais',
      'A2_temps_s',
      'A2_motif',
      'A3_reussi',
      'A3_essais',
      'A3_temps_s',
      'A3_motif',
      'apprentissage_total_3',
      'apprentissage_pct',
      'autoeval_comprehension_10',
      'autoeval_autonomie_10',
      'autoeval_explication_10',
      'E1_score_1',
      'E1_motif',
      'E2_correct_6',
      'E2_score_1',
      'E3_score_1',
      'E3_motif',
      'E3_explication',
      'E3_note_manuelle_1',
      'E4_score_1',
      'E4_motif',
      'evaluation_total_4',
      'evaluation_pct',
      'evaluation_sur_10',
      'ecart_autoeval_autonomie_indicatif'
    ];

    const rows = (attempts || []).map((a) => [
      a.attemptId,
      a.group,
      a.assignmentMode,
      a.familiarity || '',
      a.submittedAt || '',
      a.learning.A1.passed ? 1 : 0,
      a.learning.A1.attempts,
      a.learning.A1.timeSpentSec,
      a.learning.A1.pattern,
      a.learning.A2.passed ? 1 : 0,
      a.learning.A2.attempts,
      a.learning.A2.timeSpentSec,
      a.learning.A2.pattern,
      a.learning.A3.passed ? 1 : 0,
      a.learning.A3.attempts,
      a.learning.A3.timeSpentSec,
      a.learning.A3.pattern,
      a.scores.learningTotal,
      a.scores.learningPercent,
      a.selfEval.comprehension === null ? '' : a.selfEval.comprehension,
      a.selfEval.autonomy === null ? '' : a.selfEval.autonomy,
      a.selfEval.explain === null ? '' : a.selfEval.explain,
      a.evaluation.E1.score,
      a.evaluation.E1.pattern,
      a.evaluation.E2.correctCount,
      a.evaluation.E2.score,
      a.evaluation.E3.score,
      a.evaluation.E3.pattern,
      a.evaluation.E3.explanation,
      a.evaluation.E3.manualExplanationScore === null ? '' : a.evaluation.E3.manualExplanationScore,
      a.evaluation.E4.score,
      a.evaluation.E4.pattern,
      a.scores.evalTotal,
      a.scores.evalPercent,
      a.scores.evalOn10,
      a.scores.autonomyGap === null ? '' : a.scores.autonomyGap
    ]);

    return rowsToCsv(headers, rows);
  }

  function attemptToCsv(attempt) {
    return attemptsToIndividualCsv([attempt]);
  }

  function aggregationToGroupCsv(agg) {
    const headers = [
      'groupe',
      'effectif',
      'familiarite_jamais',
      'familiarite_notions',
      'familiarite_reguliere',
      'familiarite_absente',
      'apprentissage_moy_3',
      'apprentissage_moy_pct',
      'evaluation_moy_4',
      'evaluation_moy_pct',
      'evaluation_moy_10',
      'A1_pct',
      'A2_pct',
      'A3_pct',
      'E1_pct',
      'E2_pct',
      'E3_pct',
      'E4_pct',
      'E3_explication_manuelle_moy_1',
      'E3_explication_notees_n',
      'autoeval_comprehension_10',
      'autoeval_autonomie_10',
      'autoeval_explication_10',
      'ecart_autoeval_autonomie_indicatif'
    ];

    const order = ['A', 'B', 'C', 'ALL'];
    const rows = order.map((k) => {
      const g = agg[k];
      return [
        k === 'ALL' ? 'Ensemble' : 'Groupe ' + k,
        g.count,
        g.familiarityCounts.jamais,
        g.familiarityCounts.notions,
        g.familiarityCounts.reguliere,
        g.familiarityCounts.missing,
        g.learningMean === null ? '' : g.learningMean,
        g.learningPercentMean === null ? '' : g.learningPercentMean,
        g.evalMean === null ? '' : g.evalMean,
        g.evalPercentMean === null ? '' : g.evalPercentMean,
        g.evalOn10Mean === null ? '' : g.evalOn10Mean,
        g.exercises.A1 === null ? '' : g.exercises.A1,
        g.exercises.A2 === null ? '' : g.exercises.A2,
        g.exercises.A3 === null ? '' : g.exercises.A3,
        g.exercises.E1 === null ? '' : g.exercises.E1,
        g.exercises.E2 === null ? '' : g.exercises.E2,
        g.exercises.E3 === null ? '' : g.exercises.E3,
        g.exercises.E4 === null ? '' : g.exercises.E4,
        g.exercises.E3Manual === null ? '' : g.exercises.E3Manual,
        g.exercises.E3ManualCount,
        g.selfEval.comprehension === null ? '' : g.selfEval.comprehension,
        g.selfEval.autonomy === null ? '' : g.selfEval.autonomy,
        g.selfEval.explain === null ? '' : g.selfEval.explain,
        g.autonomyGapMean === null ? '' : g.autonomyGapMean
      ];
    });

    return rowsToCsv(headers, rows);
  }

  // Jeu de démonstration explicitement marqué (isDemo: true) et neutre dans sa présentation
  function createDemoDataset() {
    const specs = [
      {
        id: 'DEMO-A001',
        group: 'A',
        fam: 'jamais',
        l: [true, true, true],
        se: [8, 8, 7],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': true, 'ABC-12': false, AB123: false, 'XY-0': true },
        e3: 'GET|POST-[A-Z]{2}',
        e3Exp: 'Je pense qu’il manque un tiret.',
        e4: '(TCP|UDP)-[0-9]{2,4}',
        manualE3: 0
      },
      {
        id: 'DEMO-A002',
        group: 'A',
        fam: 'notions',
        l: [true, true, true],
        se: [7, 7, 6],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: 'Sans parenthèses, GET est séparé du reste du motif.',
        e4: 'TCP|UDP-[0-9]{2,4}(-[A-Z]{2})?',
        manualE3: 1
      },
      {
        id: 'DEMO-A003',
        group: 'A',
        fam: 'jamais',
        l: [true, true, false],
        se: [6, 7, 5],
        e1: '[a-z]{2,4}[0-9]{3}',
        e2: { AB: false, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: true, 'XY-0': true },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: 'Il faut grouper GET et POST ensemble.',
        e4: '',
        manualE3: 0.5
      },
      {
        id: 'DEMO-B001',
        group: 'B',
        fam: 'jamais',
        l: [true, true, false],
        se: [5, 5, 5],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: "L'opérateur | a une priorité plus faible que la suite, donc GET seul était accepté.",
        e4: '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?',
        manualE3: 1
      },
      {
        id: 'DEMO-B002',
        group: 'B',
        fam: 'notions',
        l: [true, false, true],
        se: [6, 5, 6],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': false },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: 'Il manquait les parenthèses autour de l’alternative.',
        e4: '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?',
        manualE3: 0.5
      },
      {
        id: 'DEMO-B003',
        group: 'B',
        fam: 'jamais',
        l: [true, false, false],
        se: [4, 4, 3],
        e1: '[a-z]{2,4}-[0-9]{1,3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': true, AB123: false, 'XY-0': true },
        e3: 'GET-POST-[A-Z]{2}',
        e3Exp: '',
        e4: '(TCP|UDP)-[0-9]{2,4}',
        manualE3: null
      },
      {
        id: 'DEMO-C001',
        group: 'C',
        fam: 'jamais',
        l: [true, true, true],
        se: [7, 7, 7],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: 'Le | sépare tout ce qui est à gauche (GET) et tout ce qui est à droite (POST-[A-Z]{2}).',
        e4: '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?',
        manualE3: 1
      },
      {
        id: 'DEMO-C002',
        group: 'C',
        fam: 'reguliere',
        l: [true, true, true],
        se: [8, 8, 8],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: 'Priorité de l’alternative : il faut parenthéser (GET|POST).',
        e4: '(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?',
        manualE3: 1
      },
      {
        id: 'DEMO-C003',
        group: 'C',
        fam: 'notions',
        l: [true, true, false],
        se: [6, 6, 5],
        e1: '[a-z]{2,4}-[0-9]{3}',
        e2: { AB: true, 'AB-123': true, 'AB-': false, 'ABC-12': false, AB123: false, 'XY-0': true },
        e3: '(GET|POST)-[A-Z]{2}',
        e3Exp: 'Sans parenthèses, le tiret ne porte que sur POST.',
        e4: '(TCP|UDP)-[0-9]{2,4}-[A-Z]{2}?',
        manualE3: 1
      }
    ];

    return specs.map((s, idx) => {
      const e1Res = evaluateExerciseSync('E1', s.e1);
      const e2Res = scoreE2(s.e2);
      const e3Res = evaluateExerciseSync('E3', s.e3);
      const e4Res = evaluateExerciseSync('E4', s.e4);

      const learning = {
        A1: { pattern: s.l[0] ? '[A-Z]{2}[0-9]{3}' : '[A-Z]+[0-9]+', passed: s.l[0], attempts: 2, timeSpentSec: 90, error: null },
        A2: { pattern: s.l[1] ? '(INFO|WARN)-[0-9]{2,4}' : 'INFO|WARN-[0-9]{2,4}', passed: s.l[1], attempts: 3, timeSpentSec: 135, error: null },
        A3: { pattern: s.l[2] ? '[a-z]{3,5}(-[0-9]{2})?' : '[a-z]{3,5}-[0-9]{2}?', passed: s.l[2], attempts: 3, timeSpentSec: 150, error: null }
      };
      const selfEval = { comprehension: s.se[0], autonomy: s.se[1], explain: s.se[2] };
      const evaluation = {
        E1: { pattern: s.e1, passed: e1Res.passed, score: e1Res.passed ? 1 : 0, error: e1Res.error },
        E2: e2Res,
        E3: {
          pattern: s.e3,
          passed: e3Res.passed,
          score: e3Res.passed ? 1 : 0,
          error: e3Res.error,
          explanation: s.e3Exp,
          manualExplanationScore: s.manualE3
        },
        E4: { pattern: s.e4, passed: e4Res.passed, score: e4Res.passed ? 1 : 0, error: e4Res.error }
      };
      const scores = computeAttemptScores(learning, selfEval, evaluation);
      return {
        schemaVersion: SCHEMA_VERSION,
        kind: 'regex-exp-attempt',
        attemptId: s.id,
        group: s.group,
        assignmentMode: 'manual',
        familiarity: s.fam,
        createdAt: '2026-10-12T08:00:00.000Z',
        submittedAt: '2026-10-12T08:15:0' + idx + '.000Z',
        timings: {
          phase1DurationSec: PHASE_DURATIONS.phase1,
          phase1ElapsedSec: 375,
          phase1Expired: false,
          phase2DurationSec: PHASE_DURATIONS.phase2,
          phase2ElapsedSec: 45,
          phase3DurationSec: PHASE_DURATIONS.phase3,
          phase3ElapsedSec: 390,
          phase3Expired: false
        },
        learning,
        selfEval,
        evaluation,
        scores,
        isDemo: true
      };
    });
  }

  return {
    SCHEMA_VERSION,
    MAX_PATTERN_LENGTH,
    WORKER_TIMEOUT_MS,
    PHASE_DURATIONS,
    GROUP_C_PROMPT,
    GROUPS,
    FAMILIARITY_OPTIONS,
    SELF_EVAL_QUESTIONS,
    CHEATSHEET_ITEMS,
    LEARNING_EXERCISES,
    EVAL_EXERCISES,
    getExerciseById,
    getTestCases,
    detectDelimiterHint,
    formatRegexError,
    buildFullMatchRegExp,
    evaluateCasesSync,
    evaluateExerciseSync,
    scoreE2,
    computeAttemptScores,
    generateAnonymousId,
    validateAttemptSchema,
    parseImportPayload,
    mergeAttempts,
    aggregateByGroup,
    escapeCsvCell,
    attemptToCsv,
    attemptsToIndividualCsv,
    aggregationToGroupCsv,
    createDemoDataset
  };
});
