(function () {
  'use strict';

  const Exp = window.RegexExp;
  if (!Exp) {
    throw new Error('Module RegexExp introuvable.');
  }

  const STORAGE_KEY = 'regex_exp_student_v1';

  // Client Web Worker avec terminaison en cas de délai dépassé (protection ReDoS)
  function createWorkerClient() {
    let worker = null;
    let reqCounter = 0;
    let blobUrl = null;

    const inlineWorkerSource = `
      'use strict';
      const MAX_PATTERN_LENGTH = ${Exp.MAX_PATTERN_LENGTH};
      function detectDelimiterHint(p) { return typeof p === 'string' && /^\\/.+\\/[a-zA-Z]*$/.test(p.trim()); }
      function evaluatePattern(pattern, cases) {
        if (typeof pattern !== 'string' || pattern.length === 0) {
          return { valid: false, passed: false, errorCode: 'EMPTY', error: 'Aucun motif saisi.', delimiterHint: false, visibleResults: [], visiblePassed: false, hiddenPassed: false, passedCount: 0, totalCount: cases.length };
        }
        if (pattern.length > MAX_PATTERN_LENGTH) {
          return { valid: false, passed: false, errorCode: 'TOO_LONG', error: 'Motif trop long (maximum ' + MAX_PATTERN_LENGTH + ' caractères).', delimiterHint: false, visibleResults: [], visiblePassed: false, hiddenPassed: false, passedCount: 0, totalCount: cases.length };
        }
        try { new RegExp(pattern); } catch (e) {
          return { valid: false, passed: false, errorCode: 'SYNTAX', error: 'Expression régulière invalide : ' + (e.message || 'erreur de syntaxe'), delimiterHint: detectDelimiterHint(pattern), visibleResults: [], visiblePassed: false, hiddenPassed: false, passedCount: 0, totalCount: cases.length };
        }
        let regex;
        try { regex = new RegExp('^(?:' + pattern + ')(?![\\\\s\\\\S])'); } catch (e) {
          return { valid: false, passed: false, errorCode: 'SYNTAX', error: 'Expression régulière invalide : ' + (e.message || 'erreur de syntaxe'), delimiterHint: detectDelimiterHint(pattern), visibleResults: [], visiblePassed: false, hiddenPassed: false, passedCount: 0, totalCount: cases.length };
        }
        const visibleResults = [];
        let visiblePassed = true, hiddenPassed = true, passedCount = 0;
        for (let i = 0; i < cases.length; i += 1) {
          const c = cases[i];
          const actual = regex.test(c.input);
          const ok = actual === c.expected;
          if (ok) passedCount += 1;
          else if (c.visible) visiblePassed = false;
          else hiddenPassed = false;
          if (c.visible) visibleResults.push({ input: c.input, expected: c.expected, actual: actual, ok: ok });
        }
        return { valid: true, passed: visiblePassed && hiddenPassed, errorCode: null, error: null, delimiterHint: detectDelimiterHint(pattern), visibleResults: visibleResults, visiblePassed: visiblePassed, hiddenPassed: hiddenPassed, passedCount: passedCount, totalCount: cases.length };
      }
      self.onmessage = function (ev) {
        const d = ev.data || {};
        self.postMessage({ id: d.id, result: evaluatePattern(d.pattern, Array.isArray(d.cases) ? d.cases : []) });
      };
    `;

    function spawnWorker() {
      if (typeof Worker === 'undefined') return null;
      try {
        return new Worker('./regex-worker.js');
      } catch (_err) {
        try {
          if (!blobUrl) {
            const blob = new Blob([inlineWorkerSource], { type: 'application/javascript' });
            blobUrl = URL.createObjectURL(blob);
          }
          return new Worker(blobUrl);
        } catch (_err2) {
          return null;
        }
      }
    }

    function terminateWorker() {
      if (worker) {
        try {
          worker.terminate();
        } catch (_err) {
          // ignore
        }
        worker = null;
      }
    }

    function evaluate(pattern, cases, timeoutMs) {
      const limit = typeof timeoutMs === 'number' ? timeoutMs : Exp.WORKER_TIMEOUT_MS;
      return new Promise((resolve) => {
        if (!worker) {
          worker = spawnWorker();
        }
        if (!worker) {
          resolve(Exp.evaluateCasesSync(pattern, cases));
          return;
        }

        const currentId = ++reqCounter;
        let settled = false;

        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          terminateWorker();
          resolve({
            valid: false,
            passed: false,
            errorCode: 'TIMEOUT',
            error:
              "Évaluation interrompue : le délai maximal (" +
              limit +
              " ms) a été dépassé. Simplifiez votre expression (évitez les répétitions imbriquées).",
            delimiterHint: Exp.detectDelimiterHint(pattern),
            visibleResults: [],
            visiblePassed: false,
            hiddenPassed: false,
            passedCount: 0,
            totalCount: cases.length
          });
        }, limit);

        function cleanup() {
          window.clearTimeout(timer);
          if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
          }
        }

        worker.onmessage = function (ev) {
          if (settled) return;
          const payload = ev.data || {};
          if (payload.id !== currentId) return;
          settled = true;
          cleanup();
          resolve(payload.result);
        };

        worker.onerror = function () {
          if (settled) return;
          settled = true;
          cleanup();
          terminateWorker();
          // Repli sûr si le chargement du fichier Worker échoue (ex. ouverture file://)
          try {
            if (!blobUrl) {
              const blob = new Blob([inlineWorkerSource], { type: 'application/javascript' });
              blobUrl = URL.createObjectURL(blob);
            }
            worker = new Worker(blobUrl);
            evaluate(pattern, cases, limit).then(resolve);
          } catch (_fallbackErr) {
            resolve(Exp.evaluateCasesSync(pattern, cases));
          }
        };

        worker.postMessage({ id: currentId, pattern: pattern, cases: cases });
      });
    }

    return { evaluate, terminateWorker };
  }

  const workerClient = createWorkerClient();

  function createInitialState() {
    const learning = {};
    Exp.LEARNING_EXERCISES.forEach((ex) => {
      learning[ex.id] = {
        pattern: '',
        passed: false,
        attempts: 0,
        timeSpentSec: 0,
        error: null,
        lastTestedPattern: null,
        lastResult: null
      };
    });

    const e2Answers = {};
    Exp.EVAL_EXERCISES.E2.items.forEach((item) => {
      e2Answers[item.input] = null;
    });

    return {
      schemaVersion: Exp.SCHEMA_VERSION,
      attemptId: Exp.generateAnonymousId(),
      createdAt: new Date().toISOString(),
      phase: 0,
      group: null,
      assignmentMode: 'manual',
      familiarity: null,
      rulesConfirmed: false,
      activeLearningIndex: 0,
      activeExerciseEnteredAt: null,
      phase1StartedAt: null,
      phase1EndsAt: null,
      phase1LockedAt: null,
      phase1Expired: false,
      phase2StartedAt: null,
      phase2EndsAt: null,
      phase2CompletedAt: null,
      phase3StartedAt: null,
      phase3EndsAt: null,
      phase3SubmittedAt: null,
      phase3Expired: false,
      learning: learning,
      selfEval: {
        comprehension: null,
        autonomy: null,
        explain: null
      },
      evaluation: {
        E1: { pattern: '', passed: false, score: 0, error: null },
        E2: { answers: e2Answers, correctCount: 0, totalItems: Exp.EVAL_EXERCISES.E2.items.length, score: 0 },
        E3: { pattern: '', passed: false, score: 0, error: null, explanation: '', manualExplanationScore: null },
        E4: { pattern: '', passed: false, score: 0, error: null }
      },
      finalExport: null,
      downloadedJson: false
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.attemptId) {
        return createInitialState();
      }
      return parsed;
    } catch (_err) {
      return createInitialState();
    }
  }

  let state = loadState();
  let tickInterval = null;
  let isTransitioning = false;

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_err) {
      // Ignore quota errors gracefully
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function announce(msg) {
    const el = $('global-announcement');
    if (el) {
      el.textContent = '';
      window.setTimeout(() => {
        el.textContent = msg;
      }, 20);
    }
  }

  function formatMMSS(totalSeconds) {
    const clamped = Math.max(0, Math.ceil(totalSeconds));
    const min = Math.floor(clamped / 60);
    const sec = clamped % 60;
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  function renderCodeList(container, items) {
    container.innerHTML = '';
    items.forEach((text) => {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = text;
      li.appendChild(code);
      container.appendChild(li);
    });
  }

  function flushActiveLearningTime() {
    if (state.phase !== 1 || !state.activeExerciseEnteredAt) return;
    const ex = Exp.LEARNING_EXERCISES[state.activeLearningIndex];
    if (!ex) return;
    const now = Date.now();
    const effectiveNow = state.phase1EndsAt ? Math.min(now, state.phase1EndsAt) : now;
    const deltaSec = Math.max(0, Math.round((effectiveNow - state.activeExerciseEnteredAt) / 1000));
    state.learning[ex.id].timeSpentSec = (state.learning[ex.id].timeSpentSec || 0) + deltaSec;
    state.activeExerciseEnteredAt = now;
  }

  function updateStepperAndStatus() {
    const phaseNames = [
      'Étape 0 : Accueil',
      'Étape 1 : Apprentissage (7 min)',
      'Étape 2 : Autoévaluation (1 min)',
      'Étape 3 : Évaluation autonome (7 min)',
      'Étape 4 : Remise'
    ];

    $('status-attempt-id').textContent = state.attemptId;
    const groupBadge = $('status-group-badge');
    if (state.group && Exp.GROUPS[state.group]) {
      groupBadge.textContent = Exp.GROUPS[state.group].label;
      groupBadge.className = 'badge badge-accent';
    } else {
      groupBadge.textContent = 'Groupe non choisi';
      groupBadge.className = 'badge';
    }
    $('status-phase-badge').textContent = phaseNames[state.phase] || '';

    for (let i = 0; i <= 4; i += 1) {
      const li = $('step-' + i);
      if (!li) continue;
      li.classList.remove('step-active', 'step-done');
      if (i < state.phase) li.classList.add('step-done');
      else if (i === state.phase) li.classList.add('step-active');
    }

    for (let i = 0; i <= 4; i += 1) {
      const sec = $('phase-' + i);
      if (!sec) continue;
      if (i === state.phase) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    }

    const timerBox = $('timer-box');
    if (state.phase === 1 || state.phase === 2 || state.phase === 3) {
      timerBox.classList.remove('hidden');
    } else {
      timerBox.classList.add('hidden');
    }
  }

  // ---- PHASE 0 : ACCUEIL ----
  function updateWelcomeUI() {
    $('welcome-attempt-id').textContent = state.attemptId;
    $('welcome-prompt-quote').textContent = Exp.GROUP_C_PROMPT;

    document.querySelectorAll('input[name="familiarity"]').forEach((input) => {
      input.checked = input.value === state.familiarity;
    });

    document.querySelectorAll('input[name="group"]').forEach((input) => {
      input.checked = input.value === state.group;
    });

    $('confirm-rules').checked = Boolean(state.rulesConfirmed);

    const rulesBox = $('group-rules-box');
    const promptC = $('group-c-welcome-prompt');
    if (state.group && Exp.GROUPS[state.group]) {
      const g = Exp.GROUPS[state.group];
      rulesBox.classList.remove('hidden');
      $('group-rules-title').textContent = 'Consignes — ' + g.label;
      $('group-rules-text').textContent = g.phase1Rule;
      if (state.group === 'C') {
        promptC.classList.remove('hidden');
      } else {
        promptC.classList.add('hidden');
      }
    } else {
      rulesBox.classList.add('hidden');
      promptC.classList.add('hidden');
    }

    const canStart = Boolean(state.familiarity && state.group && state.rulesConfirmed);
    $('btn-start-phase1').disabled = !canStart;
  }

  function copyGroupCPrompt(feedbackEl) {
    const text = Exp.GROUP_C_PROMPT;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          feedbackEl.textContent = 'Prompt copié dans le presse-papiers.';
        })
        .catch(() => {
          fallbackCopy(text, feedbackEl);
        });
    } else {
      fallbackCopy(text, feedbackEl);
    }
  }

  function fallbackCopy(text, feedbackEl) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      feedbackEl.textContent = 'Prompt copié.';
    } catch (_err) {
      feedbackEl.textContent = 'Sélectionnez le texte manuellement pour le copier.';
    }
    document.body.removeChild(ta);
  }

  function startPhase1() {
    if (!state.familiarity || !state.group || !state.rulesConfirmed) {
      const errEl = $('welcome-error');
      errEl.textContent = 'Veuillez renseigner votre familiarité, sélectionner un groupe et confirmer les consignes.';
      errEl.classList.remove('hidden');
      return;
    }
    $('welcome-error').classList.add('hidden');

    const now = Date.now();
    state.phase = 1;
    state.phase1StartedAt = now;
    state.phase1EndsAt = now + Exp.PHASE_DURATIONS.phase1 * 1000;
    state.activeLearningIndex = 0;
    state.activeExerciseEnteredAt = now;
    saveState();
    renderCurrentPhase();
    announce('Phase 1 démarrée. Vous disposez de 7 minutes.');
  }

  // ---- PHASE 1 : APPRENTISSAGE ----
  function renderCheatsheetOnce() {
    const tbody = $('cheatsheet-tbody');
    if (tbody.children.length > 0) return;
    Exp.CHEATSHEET_ITEMS.forEach((item) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = item.syntax;
      td1.appendChild(code);

      const td2 = document.createElement('td');
      td2.textContent = item.meaning;

      const td3 = document.createElement('td');
      td3.textContent = item.example;

      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tbody.appendChild(tr);
    });
  }

  function renderPhase1() {
    const groupInfo = Exp.GROUPS[state.group] || Exp.GROUPS.A;
    $('phase1-group-banner').textContent = groupInfo.phase1Reminder;

    const layout = $('learning-layout');
    const cheatsheet = $('cheatsheet-aside');
    const groupCBox = $('phase1-group-c-box');

    if (state.group === 'B') {
      renderCheatsheetOnce();
      cheatsheet.classList.remove('hidden');
      layout.classList.add('has-sidebar');
    } else {
      cheatsheet.classList.add('hidden');
      layout.classList.remove('has-sidebar');
    }

    if (state.group === 'C') {
      $('phase1-prompt-quote').textContent = Exp.GROUP_C_PROMPT;
      groupCBox.classList.remove('hidden');
    } else {
      groupCBox.classList.add('hidden');
    }

    renderLearningTabs();
    renderActiveLearningExercise();
  }

  function renderLearningTabs() {
    const container = $('learning-tabs');
    container.innerHTML = '';
    Exp.LEARNING_EXERCISES.forEach((ex, idx) => {
      const rec = state.learning[ex.id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn' + (rec && rec.passed ? ' tab-passed' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', idx === state.activeLearningIndex ? 'true' : 'false');
      btn.textContent = ex.id + (rec && rec.passed ? ' ✓' : '');
      btn.addEventListener('click', () => {
        switchLearningExercise(idx);
      });
      container.appendChild(btn);
    });
  }

  function switchLearningExercise(nextIndex) {
    if (state.phase !== 1) return;
    if (nextIndex < 0 || nextIndex >= Exp.LEARNING_EXERCISES.length) return;
    flushActiveLearningTime();
    state.activeLearningIndex = nextIndex;
    state.activeExerciseEnteredAt = Date.now();
    saveState();
    renderLearningTabs();
    renderActiveLearningExercise();
  }

  function renderActiveLearningExercise() {
    const ex = Exp.LEARNING_EXERCISES[state.activeLearningIndex];
    const rec = state.learning[ex.id];

    $('learning-exercise-title').textContent = ex.title;
    $('learning-exercise-prompt').textContent = ex.prompt;
    renderCodeList($('learning-examples-accept'), ex.visibleAccept);
    renderCodeList($('learning-examples-reject'), ex.visibleReject);

    const input = $('learning-pattern-input');
    input.value = rec.pattern || '';
    $('learning-char-count').textContent = input.value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
    $('learning-exercise-meta').textContent =
      'Essais : ' + (rec.attempts || 0) + (rec.passed ? ' — Exercice réussi' : '');

    $('btn-prev-learning').disabled = state.activeLearningIndex === 0;
    $('btn-next-learning').disabled = state.activeLearningIndex === Exp.LEARNING_EXERCISES.length - 1;

    renderLearningFeedback(rec.lastResult);
  }

  function renderLearningFeedback(result) {
    const box = $('learning-feedback');
    if (!result) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    box.classList.remove('hidden');
    box.innerHTML = '';

    const banner = document.createElement('div');
    if (!result.valid) {
      banner.className = 'callout callout-err';
      banner.textContent = result.error || 'Expression invalide.';
    } else if (result.passed) {
      banner.className = 'callout callout-ok';
      banner.textContent =
        'Réussi : tous les exemples affichés et les vérifications internes sont satisfaits.';
    } else if (result.visiblePassed && !result.hiddenPassed) {
      banner.className = 'callout callout-warn';
      banner.textContent =
        'Presque : les exemples affichés sont corrects, mais au moins un cas limite caché échoue (vérifiez la chaîne vide, les bornes de longueur, la casse, les caractères ASCII, les alternatives ou les espaces/sauts de ligne).';
    } else {
      banner.className = 'callout callout-err';
      banner.textContent =
        'Non réussi : certains exemples ci-dessous ne sont pas classés comme attendu.';
    }
    box.appendChild(banner);

    if (result.delimiterHint) {
      const hint = document.createElement('p');
      hint.className = 'help-text';
      hint.textContent =
        'Conseil : saisissez uniquement le motif, sans entourer votre expression de barres obliques /.../ ni ajouter de flags.';
      box.appendChild(hint);
    }

    if (result.valid && Array.isArray(result.visibleResults) && result.visibleResults.length > 0) {
      const table = document.createElement('table');
      table.className = 'test-results-table';
      const thead = document.createElement('thead');
      thead.innerHTML =
        '<tr><th>Chaîne</th><th>Attendu</th><th>Obtenu</th><th>Statut</th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      result.visibleResults.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = row.ok ? 'row-ok' : 'row-fail';

        const tdInput = document.createElement('td');
        const code = document.createElement('code');
        code.textContent = row.input;
        tdInput.appendChild(code);

        const tdExp = document.createElement('td');
        tdExp.textContent = row.expected ? 'Acceptée' : 'Refusée';

        const tdAct = document.createElement('td');
        tdAct.textContent = row.actual ? 'Acceptée' : 'Refusée';

        const tdStatus = document.createElement('td');
        tdStatus.textContent = row.ok ? 'Correct' : 'Incorrect';

        tr.appendChild(tdInput);
        tr.appendChild(tdExp);
        tr.appendChild(tdAct);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);
    }
  }

  async function testCurrentLearningExercise() {
    if (state.phase !== 1 || isTransitioning) return;
    const ex = Exp.LEARNING_EXERCISES[state.activeLearningIndex];
    const rec = state.learning[ex.id];
    const pattern = $('learning-pattern-input').value;

    flushActiveLearningTime();
    rec.pattern = pattern;
    rec.attempts = (rec.attempts || 0) + 1;

    const btn = $('btn-test-pattern');
    btn.disabled = true;
    btn.textContent = 'Test en cours...';

    const { all } = Exp.getTestCases(ex);
    const result = await workerClient.evaluate(pattern, all, Exp.WORKER_TIMEOUT_MS);

    btn.disabled = false;
    btn.textContent = 'Tester';

    if (state.phase !== 1) return;

    rec.passed = Boolean(result.passed);
    rec.error = result.error || null;
    rec.lastTestedPattern = pattern;
    rec.lastResult = result;
    saveState();

    renderLearningTabs();
    renderActiveLearningExercise();
    announce(result.passed ? 'Exercice ' + ex.id + ' réussi.' : 'Exercice ' + ex.id + ' non encore réussi.');
  }

  async function lockPhase1AndProceed(expiredByTimer) {
    if (state.phase !== 1 || isTransitioning) return;
    isTransitioning = true;

    flushActiveLearningTime();

    // Évaluer la dernière saisie non encore testée pour chaque exercice d'apprentissage
    for (let i = 0; i < Exp.LEARNING_EXERCISES.length; i += 1) {
      const ex = Exp.LEARNING_EXERCISES[i];
      const rec = state.learning[ex.id];
      if (rec.pattern && rec.pattern !== rec.lastTestedPattern) {
        const { all } = Exp.getTestCases(ex);
        const res = await workerClient.evaluate(rec.pattern, all, Exp.WORKER_TIMEOUT_MS);
        rec.passed = Boolean(res.passed);
        rec.error = res.error || null;
        rec.lastTestedPattern = rec.pattern;
        rec.lastResult = res;
      } else if (!rec.pattern) {
        rec.passed = false;
      }
    }

    const now = Date.now();
    state.phase1LockedAt = now;
    state.phase1Expired = Boolean(expiredByTimer);
    state.phase = 2;
    state.phase2StartedAt = now;
    state.phase2EndsAt = now + Exp.PHASE_DURATIONS.phase2 * 1000;
    state.activeExerciseEnteredAt = null;
    saveState();

    isTransitioning = false;
    renderCurrentPhase();
    announce(
      expiredByTimer
        ? "Le temps de la phase 1 est écoulé. Vos réponses sont verrouillées. Passez à l'autoévaluation."
        : "Phase 1 terminée. Passez à l'autoévaluation (1 minute)."
    );
  }

  // ---- PHASE 2 : AUTOÉVALUATION ----
  function renderPhase2() {
    const container = $('self-eval-questions');
    container.innerHTML = '';

    Exp.SELF_EVAL_QUESTIONS.forEach((q, qIdx) => {
      const fs = document.createElement('fieldset');
      fs.className = 'scale-fieldset';

      const legend = document.createElement('legend');
      legend.textContent = qIdx + 1 + '. ' + q.label;
      fs.appendChild(legend);

      const grid = document.createElement('div');
      grid.className = 'scale-grid';

      for (let val = 0; val <= 10; val += 1) {
        const label = document.createElement('label');
        label.className = 'scale-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'self_' + q.id;
        input.value = String(val);
        input.checked = state.selfEval[q.id] === val;
        input.addEventListener('change', () => {
          state.selfEval[q.id] = val;
          $('self-eval-error').classList.add('hidden');
          saveState();
        });

        const span = document.createElement('span');
        span.textContent = String(val);

        label.appendChild(input);
        label.appendChild(span);
        grid.appendChild(label);
      }

      fs.appendChild(grid);

      const anchors = document.createElement('div');
      anchors.className = 'scale-anchors';
      anchors.innerHTML = '<span>0 — Pas du tout</span><span>10 — Tout à fait</span>';
      fs.appendChild(anchors);

      container.appendChild(fs);
    });

    const alertEl = $('phase2-timer-alert');
    if (state.phase2EndsAt && Date.now() >= state.phase2EndsAt) {
      alertEl.classList.remove('hidden');
    } else {
      alertEl.classList.add('hidden');
    }
  }

  function submitPhase2() {
    const missing = Exp.SELF_EVAL_QUESTIONS.filter(
      (q) => typeof state.selfEval[q.id] !== 'number'
    );
    const errEl = $('self-eval-error');
    if (missing.length > 0) {
      errEl.textContent =
        'Veuillez sélectionner une note entière de 0 à 10 pour chacune des trois questions avant de poursuivre.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const now = Date.now();
    state.phase2CompletedAt = now;
    state.phase = 3;
    state.phase3StartedAt = now;
    state.phase3EndsAt = now + Exp.PHASE_DURATIONS.phase3 * 1000;
    saveState();
    renderCurrentPhase();
    announce('Autoévaluation enregistrée. Phase 3 (évaluation autonome) démarrée pour 7 minutes.');
  }

  // ---- PHASE 3 : ÉVALUATION AUTONOME ----
  function renderPhase3() {
    const e1 = Exp.EVAL_EXERCISES.E1;
    const e2 = Exp.EVAL_EXERCISES.E2;
    const e3 = Exp.EVAL_EXERCISES.E3;
    const e4 = Exp.EVAL_EXERCISES.E4;

    $('eval-e1-title').textContent = e1.title;
    $('eval-e1-prompt').textContent = e1.prompt;
    renderCodeList($('eval-e1-accept'), e1.visibleAccept);
    renderCodeList($('eval-e1-reject'), e1.visibleReject);
    $('eval-e1-input').value = state.evaluation.E1.pattern || '';
    $('eval-e1-count').textContent =
      $('eval-e1-input').value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';

    $('eval-e2-title').textContent = e2.title;
    $('eval-e2-prompt').textContent = e2.prompt;
    $('eval-e2-pattern').textContent = e2.pattern;

    const e2Body = $('eval-e2-tbody');
    e2Body.innerHTML = '';
    e2.items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const tdStr = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = item.input;
      tdStr.appendChild(code);

      const currentVal = state.evaluation.E2.answers[item.input];

      const tdYes = document.createElement('td');
      const lblYes = document.createElement('label');
      lblYes.className = 'radio-card';
      const rYes = document.createElement('input');
      rYes.type = 'radio';
      rYes.name = 'e2_item_' + idx;
      rYes.value = 'true';
      rYes.checked = currentVal === true;
      rYes.addEventListener('change', () => {
        state.evaluation.E2.answers[item.input] = true;
        saveState();
      });
      lblYes.appendChild(rYes);
      lblYes.appendChild(document.createTextNode('Oui'));
      tdYes.appendChild(lblYes);

      const tdNo = document.createElement('td');
      const lblNo = document.createElement('label');
      lblNo.className = 'radio-card';
      const rNo = document.createElement('input');
      rNo.type = 'radio';
      rNo.name = 'e2_item_' + idx;
      rNo.value = 'false';
      rNo.checked = currentVal === false;
      rNo.addEventListener('change', () => {
        state.evaluation.E2.answers[item.input] = false;
        saveState();
      });
      lblNo.appendChild(rNo);
      lblNo.appendChild(document.createTextNode('Non'));
      tdNo.appendChild(lblNo);

      tr.appendChild(tdStr);
      tr.appendChild(tdYes);
      tr.appendChild(tdNo);
      e2Body.appendChild(tr);
    });

    $('eval-e3-title').textContent = e3.title;
    $('eval-e3-prompt').textContent = e3.prompt;
    $('eval-e3-buggy').textContent = e3.buggyPattern;
    $('eval-e3-pattern').value = state.evaluation.E3.pattern || '';
    $('eval-e3-count').textContent =
      $('eval-e3-pattern').value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
    $('eval-e3-explanation').value = state.evaluation.E3.explanation || '';

    $('eval-e4-title').textContent = e4.title;
    $('eval-e4-prompt').textContent = e4.prompt;
    renderCodeList($('eval-e4-accept'), e4.visibleAccept);
    renderCodeList($('eval-e4-reject'), e4.visibleReject);
    $('eval-e4-input').value = state.evaluation.E4.pattern || '';
    $('eval-e4-count').textContent =
      $('eval-e4-input').value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
  }

  async function submitPhase3(expiredByTimer) {
    if (state.phase !== 3 || isTransitioning) return;
    isTransitioning = true;

    const btn = $('btn-submit-phase3');
    btn.disabled = true;
    btn.textContent = 'Enregistrement et calcul en cours...';

    // Capturer les valeurs actuelles des champs
    state.evaluation.E1.pattern = $('eval-e1-input').value;
    state.evaluation.E3.pattern = $('eval-e3-pattern').value;
    state.evaluation.E3.explanation = $('eval-e3-explanation').value.trim();
    state.evaluation.E4.pattern = $('eval-e4-input').value;

    const e1Cases = Exp.getTestCases(Exp.EVAL_EXERCISES.E1).all;
    const e3Cases = Exp.getTestCases(Exp.EVAL_EXERCISES.E3).all;
    const e4Cases = Exp.getTestCases(Exp.EVAL_EXERCISES.E4).all;

    const e1Res = await workerClient.evaluate(state.evaluation.E1.pattern, e1Cases, Exp.WORKER_TIMEOUT_MS);
    const e3Res = await workerClient.evaluate(state.evaluation.E3.pattern, e3Cases, Exp.WORKER_TIMEOUT_MS);
    const e4Res = await workerClient.evaluate(state.evaluation.E4.pattern, e4Cases, Exp.WORKER_TIMEOUT_MS);
    const e2Res = Exp.scoreE2(state.evaluation.E2.answers);

    state.evaluation.E1 = {
      pattern: state.evaluation.E1.pattern,
      passed: Boolean(e1Res.passed),
      score: e1Res.passed ? 1 : 0,
      error: e1Res.error || null
    };
    state.evaluation.E2 = e2Res;
    state.evaluation.E3 = {
      pattern: state.evaluation.E3.pattern,
      passed: Boolean(e3Res.passed),
      score: e3Res.passed ? 1 : 0,
      error: e3Res.error || null,
      explanation: state.evaluation.E3.explanation,
      manualExplanationScore: null
    };
    state.evaluation.E4 = {
      pattern: state.evaluation.E4.pattern,
      passed: Boolean(e4Res.passed),
      score: e4Res.passed ? 1 : 0,
      error: e4Res.error || null
    };

    const now = Date.now();
    state.phase3SubmittedAt = now;
    state.phase3Expired = Boolean(expiredByTimer);

    const learningExport = {};
    ['A1', 'A2', 'A3'].forEach((id) => {
      const src = state.learning[id];
      learningExport[id] = {
        pattern: src.pattern || '',
        passed: Boolean(src.passed),
        attempts: src.attempts || 0,
        timeSpentSec: src.timeSpentSec || 0,
        error: src.error || null
      };
    });

    const scores = Exp.computeAttemptScores(learningExport, state.selfEval, state.evaluation);

    const p1Elapsed = state.phase1StartedAt
      ? Math.min(Exp.PHASE_DURATIONS.phase1, Math.max(0, Math.round(((state.phase1LockedAt || now) - state.phase1StartedAt) / 1000)))
      : 0;
    const p2Elapsed = state.phase2StartedAt
      ? Math.max(0, Math.round(((state.phase2CompletedAt || now) - state.phase2StartedAt) / 1000))
      : 0;
    const p3Elapsed = state.phase3StartedAt
      ? Math.min(Exp.PHASE_DURATIONS.phase3, Math.max(0, Math.round((now - state.phase3StartedAt) / 1000)))
      : 0;

    state.finalExport = {
      schemaVersion: Exp.SCHEMA_VERSION,
      kind: 'regex-exp-attempt',
      attemptId: state.attemptId,
      group: state.group,
      assignmentMode: state.assignmentMode,
      familiarity: state.familiarity,
      createdAt: state.createdAt,
      submittedAt: new Date(now).toISOString(),
      timings: {
        phase1DurationSec: Exp.PHASE_DURATIONS.phase1,
        phase1ElapsedSec: p1Elapsed,
        phase1Expired: Boolean(state.phase1Expired),
        phase2DurationSec: Exp.PHASE_DURATIONS.phase2,
        phase2ElapsedSec: p2Elapsed,
        phase3DurationSec: Exp.PHASE_DURATIONS.phase3,
        phase3ElapsedSec: p3Elapsed,
        phase3Expired: Boolean(state.phase3Expired)
      },
      learning: learningExport,
      selfEval: {
        comprehension: state.selfEval.comprehension,
        autonomy: state.selfEval.autonomy,
        explain: state.selfEval.explain
      },
      evaluation: state.evaluation,
      scores: scores
    };

    state.phase = 4;
    saveState();
    isTransitioning = false;
    btn.disabled = false;
    btn.textContent = 'Remettre définitivement mes réponses';
    renderCurrentPhase();
    announce('Vos réponses ont été remises et verrouillées. Téléchargez votre fichier JSON.');
  }

  // ---- PHASE 4 : REMISE ----
  function renderPhase4() {
    const exp = state.finalExport;
    const box = $('summary-meta');
    if (!exp) {
      box.textContent = 'Aucune donnée enregistrée.';
      return;
    }

    const famObj = Exp.FAMILIARITY_OPTIONS.find((f) => f.value === exp.familiarity);
    const e2Answered = Object.values(exp.evaluation.E2.answers || {}).filter((v) => typeof v === 'boolean').length;
    const submittedDate = exp.submittedAt ? new Date(exp.submittedAt).toLocaleTimeString('fr-FR') : '—';

    box.innerHTML = '';
    const list = document.createElement('ul');
    list.style.margin = '0.2rem 0 0 1.2rem';

    const items = [
      'Identifiant anonyme : ' + exp.attemptId,
      'Groupe : ' + (Exp.GROUPS[exp.group] ? Exp.GROUPS[exp.group].label : exp.group),
      'Familiarité déclarée : ' + (famObj ? famObj.label : '—'),
      'Heure de remise : ' + submittedDate + (exp.timings.phase3Expired ? ' (à expiration du temps)' : ''),
      'Exercices phase 3 renseignés : E1 (' +
        (exp.evaluation.E1.pattern ? 'saisi' : 'vide') +
        '), E2 (' +
        e2Answered +
        '/6 classés), E3 (' +
        (exp.evaluation.E3.pattern ? 'motif saisi' : 'vide') +
        '), E4 (' +
        (exp.evaluation.E4.pattern ? 'saisi' : 'vide') +
        ').',
      'Correction détaillée : masquée jusqu’à la mise en commun animée par l’enseignant.'
    ];

    items.forEach((txt) => {
      const li = document.createElement('li');
      li.textContent = txt;
      list.appendChild(li);
    });
    box.appendChild(list);
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- CHRONOMÈTRE PERSISTANT ----
  function updateTimerTick() {
    const timerBox = $('timer-box');
    const timerDisplay = $('timer-display');
    const timerLabel = $('timer-label');

    timerBox.classList.remove('timer-warning', 'timer-expired');

    if (state.phase === 1 && state.phase1EndsAt) {
      const remainingSec = (state.phase1EndsAt - Date.now()) / 1000;
      timerLabel.textContent = 'Phase 1 — Temps restant :';
      timerDisplay.textContent = formatMMSS(remainingSec);
      if (remainingSec <= 60 && remainingSec > 0) timerBox.classList.add('timer-warning');
      if (remainingSec <= 0) {
        timerBox.classList.add('timer-expired');
        lockPhase1AndProceed(true);
      }
    } else if (state.phase === 2 && state.phase2EndsAt) {
      const remainingSec = (state.phase2EndsAt - Date.now()) / 1000;
      timerLabel.textContent = 'Autoévaluation — Temps indicatif :';
      timerDisplay.textContent = formatMMSS(remainingSec);
      if (remainingSec <= 15 && remainingSec > 0) timerBox.classList.add('timer-warning');
      if (remainingSec <= 0) {
        timerBox.classList.add('timer-expired');
        $('phase2-timer-alert').classList.remove('hidden');
      }
    } else if (state.phase === 3 && state.phase3EndsAt) {
      const remainingSec = (state.phase3EndsAt - Date.now()) / 1000;
      timerLabel.textContent = 'Phase 3 — Temps restant :';
      timerDisplay.textContent = formatMMSS(remainingSec);
      if (remainingSec <= 60 && remainingSec > 0) timerBox.classList.add('timer-warning');
      if (remainingSec <= 0) {
        timerBox.classList.add('timer-expired');
        submitPhase3(true);
      }
    }
  }

  function renderCurrentPhase() {
    updateStepperAndStatus();
    if (state.phase === 0) updateWelcomeUI();
    else if (state.phase === 1) renderPhase1();
    else if (state.phase === 2) renderPhase2();
    else if (state.phase === 3) renderPhase3();
    else if (state.phase === 4) renderPhase4();
    updateTimerTick();
  }

  function resetSession() {
    const extraWarn =
      state.phase === 4 && !state.downloadedJson
        ? "\n\nAttention : vous n'avez pas encore téléchargé votre fichier JSON !"
        : '';
    const ok = window.confirm(
      'Voulez-vous vraiment effacer la progression locale et générer un nouvel identifiant anonyme ?' + extraWarn
    );
    if (!ok) return;
    workerClient.terminateWorker();
    window.localStorage.removeItem(STORAGE_KEY);
    state = createInitialState();
    saveState();
    renderCurrentPhase();
    announce('Session réinitialisée.');
  }

  function bindEvents() {
    // Phase 0
    document.querySelectorAll('input[name="familiarity"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.familiarity = input.value;
        saveState();
        updateWelcomeUI();
      });
    });

    document.querySelectorAll('input[name="group"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.group = input.value;
        state.assignmentMode = 'manual';
        $('random-group-note').classList.add('hidden');
        saveState();
        updateWelcomeUI();
      });
    });

    $('btn-random-group').addEventListener('click', () => {
      const groups = ['A', 'B', 'C'];
      const arr = new Uint32Array(1);
      let idx;
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(arr);
        idx = arr[0] % groups.length;
      } else {
        idx = Math.floor(Math.random() * groups.length);
      }
      state.group = groups[idx];
      state.assignmentMode = 'random';
      const note = $('random-group-note');
      note.textContent =
        'Groupe tiré au sort localement : Groupe ' +
        state.group +
        " (rappel : le tirage local ne garantit pas l'équilibre des effectifs dans la salle).";
      note.classList.remove('hidden');
      saveState();
      updateWelcomeUI();
    });

    $('confirm-rules').addEventListener('change', (e) => {
      state.rulesConfirmed = e.target.checked;
      saveState();
      updateWelcomeUI();
    });

    $('btn-copy-prompt-welcome').addEventListener('click', () => {
      copyGroupCPrompt($('copy-feedback-welcome'));
    });

    $('welcome-form').addEventListener('submit', (e) => {
      e.preventDefault();
      startPhase1();
    });

    // Phase 1
    $('btn-copy-prompt-p1').addEventListener('click', () => {
      copyGroupCPrompt($('copy-feedback-p1'));
    });

    $('learning-pattern-input').addEventListener('input', (e) => {
      if (state.phase !== 1) return;
      const ex = Exp.LEARNING_EXERCISES[state.activeLearningIndex];
      state.learning[ex.id].pattern = e.target.value;
      $('learning-char-count').textContent =
        e.target.value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
      saveState();
    });

    $('learning-pattern-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        testCurrentLearningExercise();
      }
    });

    $('btn-test-pattern').addEventListener('click', () => {
      testCurrentLearningExercise();
    });

    $('btn-prev-learning').addEventListener('click', () => {
      switchLearningExercise(state.activeLearningIndex - 1);
    });

    $('btn-next-learning').addEventListener('click', () => {
      switchLearningExercise(state.activeLearningIndex + 1);
    });

    $('btn-finish-phase1').addEventListener('click', () => {
      const doneCount = Exp.LEARNING_EXERCISES.filter((ex) => state.learning[ex.id].passed).length;
      const msg =
        doneCount < Exp.LEARNING_EXERCISES.length
          ? 'Vous avez réussi ' +
            doneCount +
            ' exercice(s) sur 3. Terminer la phase 1 verrouillera vos réponses et vous fera passer à l’autoévaluation. Continuer ?'
          : 'Terminer la phase 1 et passer à l’autoévaluation ? Vos réponses de la phase 1 seront verrouillées.';
      if (window.confirm(msg)) {
        lockPhase1AndProceed(false);
      }
    });

    // Phase 2
    $('self-eval-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitPhase2();
    });

    // Phase 3
    $('eval-e1-input').addEventListener('input', (e) => {
      if (state.phase !== 3) return;
      state.evaluation.E1.pattern = e.target.value;
      $('eval-e1-count').textContent =
        e.target.value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
      saveState();
    });

    $('eval-e3-pattern').addEventListener('input', (e) => {
      if (state.phase !== 3) return;
      state.evaluation.E3.pattern = e.target.value;
      $('eval-e3-count').textContent =
        e.target.value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
      saveState();
    });

    $('eval-e3-explanation').addEventListener('input', (e) => {
      if (state.phase !== 3) return;
      state.evaluation.E3.explanation = e.target.value;
      saveState();
    });

    $('eval-e4-input').addEventListener('input', (e) => {
      if (state.phase !== 3) return;
      state.evaluation.E4.pattern = e.target.value;
      $('eval-e4-count').textContent =
        e.target.value.length + ' / ' + Exp.MAX_PATTERN_LENGTH + ' caractères';
      saveState();
    });

    $('btn-submit-phase3').addEventListener('click', () => {
      const ok = window.confirm(
        'Voulez-vous remettre définitivement vos réponses ? Après remise, aucune modification ne sera possible.'
      );
      if (ok) {
        submitPhase3(false);
      }
    });

    // Phase 4
    $('btn-download-json').addEventListener('click', () => {
      if (!state.finalExport) return;
      const fname =
        'resultat-' + state.finalExport.attemptId + '-groupe-' + state.finalExport.group + '.json';
      downloadFile(fname, JSON.stringify(state.finalExport, null, 2), 'application/json;charset=utf-8');
      state.downloadedJson = true;
      saveState();
    });

    $('btn-download-csv').addEventListener('click', () => {
      if (!state.finalExport) return;
      const fname =
        'resultat-' + state.finalExport.attemptId + '-groupe-' + state.finalExport.group + '.csv';
      downloadFile(fname, Exp.attemptToCsv(state.finalExport), 'text/csv;charset=utf-8');
    });

    $('btn-reset-top').addEventListener('click', resetSession);
    $('btn-reset-bottom').addEventListener('click', resetSession);

    window.addEventListener('beforeunload', () => {
      if (state.phase === 1) {
        flushActiveLearningTime();
        saveState();
      }
    });
  }

  function init() {
    bindEvents();
    // Si rechargement en phase 1, reprendre le suivi du temps sur l'exercice actif
    if (state.phase === 1) {
      state.activeExerciseEnteredAt = Date.now();
      saveState();
    }
    renderCurrentPhase();
    tickInterval = window.setInterval(updateTimerTick, 500);
  }

  init();
})();
