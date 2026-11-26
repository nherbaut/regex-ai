'use strict';

// Web Worker dédié à l'évaluation sécurisée des expressions régulières
// Exécute les tests en correspondance complète (fullmatch) hors du fil principal,
// afin que le parent puisse interrompre (terminate) toute expression pathologique (ReDoS).

const MAX_PATTERN_LENGTH = 200;

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
    return 'Expression invalide : bornes de quantificateur {n,m} dans le mauvais ordre.';
  }
  if (/Range out of order/i.test(raw)) {
    return 'Expression invalide : intervalle de caractères invalide dans [ ... ].';
  }
  if (/\\ at end of pattern/i.test(raw)) {
    return 'Expression invalide : barre oblique inverse « \\ » isolée en fin de motif.';
  }
  return 'Expression régulière invalide : ' + raw;
}

function detectDelimiterHint(pattern) {
  return typeof pattern === 'string' && /^\/.+\/[a-zA-Z]*$/.test(pattern.trim());
}

function evaluatePattern(pattern, cases) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return {
      valid: false,
      passed: false,
      errorCode: 'EMPTY',
      error: 'Aucun motif saisi.',
      delimiterHint: false,
      visibleResults: [],
      visiblePassed: false,
      hiddenPassed: false,
      passedCount: 0,
      totalCount: cases.length
    };
  }

  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      valid: false,
      passed: false,
      errorCode: 'TOO_LONG',
      error: 'Motif trop long (maximum ' + MAX_PATTERN_LENGTH + ' caractères).',
      delimiterHint: false,
      visibleResults: [],
      visiblePassed: false,
      hiddenPassed: false,
      passedCount: 0,
      totalCount: cases.length
    };
  }

  try {
    new RegExp(pattern);
  } catch (err) {
    return {
      valid: false,
      passed: false,
      errorCode: 'SYNTAX',
      error: formatRegexError(err),
      delimiterHint: detectDelimiterHint(pattern),
      visibleResults: [],
      visiblePassed: false,
      hiddenPassed: false,
      passedCount: 0,
      totalCount: cases.length
    };
  }

  let regex;
  try {
    regex = new RegExp('^(?:' + pattern + ')(?![\\s\\S])');
  } catch (err) {
    return {
      valid: false,
      passed: false,
      errorCode: 'SYNTAX',
      error: formatRegexError(err),
      delimiterHint: detectDelimiterHint(pattern),
      visibleResults: [],
      visiblePassed: false,
      hiddenPassed: false,
      passedCount: 0,
      totalCount: cases.length
    };
  }

  const visibleResults = [];
  let visiblePassed = true;
  let hiddenPassed = true;
  let passedCount = 0;

  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    const actual = regex.test(c.input);
    const ok = actual === c.expected;
    if (ok) {
      passedCount += 1;
    } else if (c.visible) {
      visiblePassed = false;
    } else {
      hiddenPassed = false;
    }
    if (c.visible) {
      visibleResults.push({
        input: c.input,
        expected: c.expected,
        actual: actual,
        ok: ok
      });
    }
  }

  return {
    valid: true,
    passed: visiblePassed && hiddenPassed,
    errorCode: null,
    error: null,
    delimiterHint: detectDelimiterHint(pattern),
    visibleResults: visibleResults,
    visiblePassed: visiblePassed,
    hiddenPassed: hiddenPassed,
    passedCount: passedCount,
    totalCount: cases.length
  };
}

self.onmessage = function (event) {
  const data = event.data || {};
  const id = data.id;
  const pattern = data.pattern;
  const cases = Array.isArray(data.cases) ? data.cases : [];
  const result = evaluatePattern(pattern, cases);
  self.postMessage({ id: id, result: result });
};
