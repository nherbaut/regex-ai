(function () {
  'use strict';

  const Exp = window.RegexExp;
  if (!Exp) {
    throw new Error('Module RegexExp introuvable.');
  }

  const STORAGE_KEY = 'regex_exp_teacher_v1';

  let realAttempts = loadRealAttempts();
  let demoMode = false;
  let demoAttempts = [];
  let filterGroup = 'ALL';
  let solutionsVisible = false;

  // Chronomètre indicatif de 5 minutes pour la restitution
  let teacherRemainingSec = Exp.PHASE_DURATIONS.teacher;
  let teacherTimerRunning = false;
  let teacherTimerId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function loadRealAttempts() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const valid = [];
      parsed.forEach((item) => {
        const res = Exp.validateAttemptSchema(item);
        if (res.ok && !res.attempt.isDemo) {
          valid.push(res.attempt);
        }
      });
      return valid;
    } catch (_err) {
      return [];
    }
  }

  function saveRealAttempts() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(realAttempts));
    } catch (_err) {
      // ignore storage errors
    }
  }

  function getActiveAttempts() {
    return demoMode ? demoAttempts : realAttempts;
  }

  function fmtNum(value, decimals) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const d = typeof decimals === 'number' ? decimals : 2;
    return Number(value).toFixed(d).replace('.', ',');
  }

  function fmtPct(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return Number(value).toFixed(1).replace('.', ',') + ' %';
  }

  function fmtSigned(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const num = Number(value);
    const sign = num > 0 ? '+' : '';
    return sign + num.toFixed(2).replace('.', ',');
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
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

  function showImportReport(lines, type) {
    const box = $('import-report');
    box.className = 'callout ' + (type === 'err' ? 'callout-err' : type === 'warn' ? 'callout-warn' : 'callout-info');
    box.innerHTML = '';
    const ul = document.createElement('ul');
    ul.style.margin = '0 0 0 1.2rem';
    lines.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Impossible de lire le fichier ' + file.name));
      reader.readAsText(file, 'utf-8');
    });
  }

  async function handleFilesImport(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const reportLines = [];
    if (demoMode) {
      demoMode = false;
      demoAttempts = [];
      reportLines.push(
        'Mode démonstration désactivé automatiquement afin de ne jamais mélanger données fictives et données réelles.'
      );
    }

    let totalAdded = 0;
    let totalDuplicates = 0;
    const rejectedMessages = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      try {
        const text = await readFileAsText(file);
        const parsed = Exp.parseImportPayload(text, file.name);
        const merged = Exp.mergeAttempts(realAttempts, parsed.accepted);
        realAttempts = merged.merged;
        totalAdded += merged.added.length;
        totalDuplicates += merged.duplicates.length;
        parsed.rejected.forEach((r) => {
          rejectedMessages.push(r.source + ' : ' + r.reason);
        });
      } catch (err) {
        rejectedMessages.push(file.name + ' : ' + err.message);
      }
    }

    saveRealAttempts();

    reportLines.push(
      'Fichiers traités : ' +
        files.length +
        ' — Tentatives ajoutées : ' +
        totalAdded +
        ' — Doublons ignorés : ' +
        totalDuplicates +
        ' — Rejets : ' +
        rejectedMessages.length +
        '.'
    );
    rejectedMessages.forEach((m) => reportLines.push('Rejet — ' + m));

    showImportReport(
      reportLines,
      rejectedMessages.length > 0 && totalAdded === 0 ? 'err' : rejectedMessages.length > 0 ? 'warn' : 'info'
    );

    renderAll();
  }

  // ---- TABLEAUX AGRÉGÉS ----
  function renderGroupTables(agg) {
    const order = ['A', 'B', 'C', 'ALL'];
    const labels = {
      A: 'Groupe A (IA libre)',
      B: 'Groupe B (Aide-mémoire)',
      C: 'Groupe C (IA tuteur)',
      ALL: 'Ensemble'
    };

    const mainBody = $('group-stats-tbody');
    mainBody.innerHTML = '';

    order.forEach((key) => {
      const g = agg[key];
      const tr = document.createElement('tr');
      if (key === 'ALL') tr.style.fontWeight = '700';

      const famText =
        g.count === 0
          ? '—'
          : g.familiarityCounts.jamais +
            ' / ' +
            g.familiarityCounts.notions +
            ' / ' +
            g.familiarityCounts.reguliere +
            (g.familiarityCounts.missing > 0 ? ' (+' + g.familiarityCounts.missing + ' abs.)' : '');

      const learnText =
        g.count === 0 ? '—' : fmtNum(g.learningMean, 2) + ' / 3 (' + fmtPct(g.learningPercentMean) + ')';
      const evalText =
        g.count === 0 ? '—' : fmtNum(g.evalMean, 2) + ' / 4 (' + fmtPct(g.evalPercentMean) + ')';

      const seText =
        g.count === 0
          ? '—'
          : fmtNum(g.selfEval.comprehension, 1) +
            ' / ' +
            fmtNum(g.selfEval.autonomy, 1) +
            ' / ' +
            fmtNum(g.selfEval.explain, 1);

      const gapText = g.count === 0 ? '—' : fmtSigned(g.autonomyGapMean);

      const cells = [
        { text: labels[key], cls: '' },
        { text: String(g.count), cls: 'num' },
        { text: famText, cls: '' },
        { text: learnText, cls: 'num' },
        { text: evalText, cls: 'num' },
        { text: seText, cls: 'num' },
        { text: gapText, cls: 'num' }
      ];

      cells.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = c.text;
        if (c.cls) td.className = c.cls;
        tr.appendChild(td);
      });
      mainBody.appendChild(tr);
    });

    const exBody = $('exercise-stats-tbody');
    exBody.innerHTML = '';

    order.forEach((key) => {
      const g = agg[key];
      const tr = document.createElement('tr');
      if (key === 'ALL') tr.style.fontWeight = '700';

      const e3ManText =
        g.exercises.E3Manual === null
          ? '—'
          : fmtNum(g.exercises.E3Manual, 2) + ' / 1 (n=' + g.exercises.E3ManualCount + ')';

      const cells = [
        { text: labels[key], cls: '' },
        { text: fmtPct(g.exercises.A1), cls: 'num' },
        { text: fmtPct(g.exercises.A2), cls: 'num' },
        { text: fmtPct(g.exercises.A3), cls: 'num' },
        { text: fmtPct(g.exercises.E1), cls: 'num' },
        { text: fmtPct(g.exercises.E2), cls: 'num' },
        { text: fmtPct(g.exercises.E3), cls: 'num' },
        { text: fmtPct(g.exercises.E4), cls: 'num' },
        { text: e3ManText, cls: 'num' }
      ];

      cells.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = c.text;
        if (c.cls) td.className = c.cls;
        tr.appendChild(td);
      });
      exBody.appendChild(tr);
    });
  }

  // ---- GRAPHIQUES SVG NATIFS ----
  function svgEl(tag, attrs, textContent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => {
      el.setAttribute(k, String(attrs[k]));
    });
    if (textContent !== undefined) {
      el.textContent = String(textContent);
    }
    return el;
  }

  function renderGroupedBarChart(container, config) {
    container.innerHTML = '';

    // Légende
    const legend = document.createElement('div');
    legend.className = 'legend-row';
    config.series.forEach((s) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = s.color;
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.label));
      legend.appendChild(item);
    });
    container.appendChild(legend);

    const width = config.width || 460;
    const height = config.height || 230;
    const pad = { top: 20, right: 16, bottom: 42, left: 42 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      class: 'chart-svg',
      role: 'img',
      'aria-label': config.ariaLabel
    });

    // Lignes horizontales de grille
    const ticks = config.ticks || [0, 25, 50, 75, 100];
    ticks.forEach((t) => {
      const y = pad.top + plotH - (t / config.maxValue) * plotH;
      svg.appendChild(
        svgEl('line', {
          x1: pad.left,
          y1: y,
          x2: width - pad.right,
          y2: y,
          stroke: '#d0d7de',
          'stroke-width': 1
        })
      );
      svg.appendChild(
        svgEl(
          'text',
          {
            x: pad.left - 6,
            y: y + 4,
            'text-anchor': 'end',
            'font-size': 11,
            fill: '#57606a'
          },
          String(t) + (config.unit || '')
        )
      );
    });

    const catCount = config.categories.length;
    const seriesCount = config.series.length;
    const catWidth = plotW / Math.max(1, catCount);
    const barGap = 4;
    const innerPad = Math.min(18, catWidth * 0.14);
    const barW = Math.max(8, (catWidth - innerPad * 2 - barGap * (seriesCount - 1)) / seriesCount);

    config.categories.forEach((cat, cIdx) => {
      const groupX = pad.left + cIdx * catWidth;
      const centerX = groupX + catWidth / 2;

      svg.appendChild(
        svgEl(
          'text',
          {
            x: centerX,
            y: height - 18,
            'text-anchor': 'middle',
            'font-size': 12,
            'font-weight': '600',
            fill: '#1c2128'
          },
          cat.label
        )
      );
      if (cat.sublabel) {
        svg.appendChild(
          svgEl(
            'text',
            {
              x: centerX,
              y: height - 4,
              'text-anchor': 'middle',
              'font-size': 10,
              fill: '#57606a'
            },
            cat.sublabel
          )
        );
      }

      config.series.forEach((s, sIdx) => {
        const val = s.values[cIdx];
        const x = groupX + innerPad + sIdx * (barW + barGap);
        if (val === null || val === undefined || Number.isNaN(val)) {
          svg.appendChild(
            svgEl(
              'text',
              {
                x: x + barW / 2,
                y: pad.top + plotH - 6,
                'text-anchor': 'middle',
                'font-size': 10,
                fill: '#8c959f'
              },
              '—'
            )
          );
          return;
        }
        const clamped = Math.max(0, Math.min(config.maxValue, val));
        const barH = (clamped / config.maxValue) * plotH;
        const y = pad.top + plotH - barH;
        svg.appendChild(
          svgEl('rect', {
            x: x,
            y: y,
            width: barW,
            height: Math.max(1, barH),
            rx: 2,
            fill: s.color
          })
        );
        svg.appendChild(
          svgEl(
            'text',
            {
              x: x + barW / 2,
              y: Math.max(12, y - 4),
              'text-anchor': 'middle',
              'font-size': 10,
              'font-weight': '600',
              fill: '#1c2128'
            },
            config.formatValue ? config.formatValue(val) : String(Math.round(val))
          )
        );
      });
    });

    container.appendChild(svg);
  }

  function renderCharts(agg) {
    const groups = ['A', 'B', 'C'];

    renderGroupedBarChart($('chart-phase-comparison'), {
      ariaLabel: 'Réussite moyenne en apprentissage et en évaluation autonome par groupe',
      maxValue: 100,
      ticks: [0, 25, 50, 75, 100],
      unit: '%',
      categories: groups.map((k) => ({
        label: 'Groupe ' + k,
        sublabel: 'n = ' + agg[k].count
      })),
      series: [
        {
          label: 'Apprentissage (/3 en %)',
          color: '#1d4ed8',
          values: groups.map((k) => agg[k].learningPercentMean)
        },
        {
          label: 'Évaluation autonome (/4 en %)',
          color: '#0f766e',
          values: groups.map((k) => agg[k].evalPercentMean)
        }
      ],
      formatValue: (v) => Math.round(v) + '%'
    });

    renderGroupedBarChart($('chart-calibration'), {
      ariaLabel: "Autoévaluation d'autonomie et score autonome ramené sur 10 par groupe",
      maxValue: 10,
      ticks: [0, 2, 4, 6, 8, 10],
      unit: '',
      categories: groups.map((k) => ({
        label: 'Groupe ' + k,
        sublabel: 'n = ' + agg[k].count
      })),
      series: [
        {
          label: 'Autoévaluation autonomie (/10)',
          color: '#7c3aed',
          values: groups.map((k) => agg[k].selfEval.autonomy)
        },
        {
          label: 'Score autonome ramené à /10',
          color: '#0f766e',
          values: groups.map((k) => agg[k].evalOn10Mean)
        }
      ],
      formatValue: (v) => Number(v).toFixed(1).replace('.', ',')
    });

    const exKeys = ['A1', 'A2', 'A3', 'E1', 'E2', 'E3', 'E4'];
    renderGroupedBarChart($('chart-exercises'), {
      ariaLabel: 'Réussite moyenne par exercice et par groupe',
      width: 780,
      height: 245,
      maxValue: 100,
      ticks: [0, 25, 50, 75, 100],
      unit: '%',
      categories: exKeys.map((id) => ({
        label: id,
        sublabel: id.startsWith('A') ? 'Phase 1' : 'Phase 3'
      })),
      series: [
        {
          label: 'Groupe A (n=' + agg.A.count + ')',
          color: '#1d4ed8',
          values: exKeys.map((id) => agg.A.exercises[id])
        },
        {
          label: 'Groupe B (n=' + agg.B.count + ')',
          color: '#0f766e',
          values: exKeys.map((id) => agg.B.exercises[id])
        },
        {
          label: 'Groupe C (n=' + agg.C.count + ')',
          color: '#7c3aed',
          values: exKeys.map((id) => agg.C.exercises[id])
        }
      ],
      formatValue: (v) => Math.round(v) + '%'
    });
  }

  // ---- LISTE INDIVIDUELLE & NOTATION MANUELLE E3 ----
  function renderAttemptsTable() {
    const tbody = $('attempts-list-tbody');
    tbody.innerHTML = '';

    const active = getActiveAttempts();
    const list = filterGroup === 'ALL' ? active : active.filter((a) => a.group === filterGroup);

    if (list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      td.style.textAlign = 'center';
      td.style.color = '#57606a';
      td.textContent =
        active.length === 0
          ? 'Aucune tentative chargée. Importez des fichiers JSON étudiants ou chargez le jeu de démonstration.'
          : 'Aucune tentative dans le groupe sélectionné.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const famMap = {};
    Exp.FAMILIARITY_OPTIONS.forEach((o) => {
      famMap[o.value] = o.label;
    });

    list.forEach((att) => {
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      const codeId = document.createElement('code');
      codeId.textContent = att.attemptId;
      tdId.appendChild(codeId);

      const tdGrp = document.createElement('td');
      const grpBadge = document.createElement('span');
      grpBadge.className = 'badge badge-accent';
      grpBadge.textContent = 'Groupe ' + att.group;
      tdGrp.appendChild(grpBadge);

      const tdFam = document.createElement('td');
      tdFam.textContent = att.familiarity ? famMap[att.familiarity] || att.familiarity : '—';

      const tdLearn = document.createElement('td');
      tdLearn.className = 'num';
      tdLearn.textContent = att.scores.learningTotal + ' / 3';

      const tdEval = document.createElement('td');
      tdEval.className = 'num';
      tdEval.textContent = fmtNum(att.scores.evalTotal, 2) + ' / 4';

      const tdE3Pat = document.createElement('td');
      const e3Code = document.createElement('code');
      e3Code.textContent = att.evaluation.E3.pattern || '(vide)';
      tdE3Pat.appendChild(e3Code);
      const statusSpan = document.createElement('span');
      statusSpan.className = 'badge ' + (att.evaluation.E3.passed ? 'badge-ok' : 'badge-err');
      statusSpan.style.marginLeft = '0.4rem';
      statusSpan.textContent = att.evaluation.E3.passed ? '1/1' : '0/1';
      tdE3Pat.appendChild(statusSpan);

      const tdE3Exp = document.createElement('td');
      tdE3Exp.textContent = att.evaluation.E3.explanation ? att.evaluation.E3.explanation : '— (aucune explication)';
      tdE3Exp.style.maxWidth = '280px';

      const tdManual = document.createElement('td');
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Note manuelle E3 pour ' + att.attemptId);
      const opts = [
        { value: '', label: 'Non évaluée' },
        { value: '0', label: '0' },
        { value: '0.5', label: '0,5' },
        { value: '1', label: '1' }
      ];
      const currentManual =
        att.evaluation.E3.manualExplanationScore === null ||
        att.evaluation.E3.manualExplanationScore === undefined
          ? ''
          : String(att.evaluation.E3.manualExplanationScore);
      opts.forEach((o) => {
        const op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        if (o.value === currentManual) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', () => {
        const val = sel.value === '' ? null : Number(sel.value);
        att.evaluation.E3.manualExplanationScore = val;
        if (!demoMode) saveRealAttempts();
        renderSummaryAndChartsOnly();
      });
      tdManual.appendChild(sel);

      const tdAct = document.createElement('td');
      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'btn btn-small btn-danger';
      rmBtn.textContent = 'Retirer';
      rmBtn.addEventListener('click', () => {
        removeAttempt(att.attemptId);
      });
      tdAct.appendChild(rmBtn);

      tr.appendChild(tdId);
      tr.appendChild(tdGrp);
      tr.appendChild(tdFam);
      tr.appendChild(tdLearn);
      tr.appendChild(tdEval);
      tr.appendChild(tdE3Pat);
      tr.appendChild(tdE3Exp);
      tr.appendChild(tdManual);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function removeAttempt(attemptId) {
    if (demoMode) {
      demoAttempts = demoAttempts.filter((a) => a.attemptId !== attemptId);
    } else {
      realAttempts = realAttempts.filter((a) => a.attemptId !== attemptId);
      saveRealAttempts();
    }
    renderAll();
  }

  // ---- CORRIGÉ DE RÉFÉRENCE (VOLONTAIRE) ----
  function renderSolutionsContent() {
    const box = $('solutions-content');
    if (box.children.length > 0) return;

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML =
      '<thead><tr><th>Exercice</th><th>Énoncé résumé</th><th>Référence interne</th><th>Points de vigilance</th></tr></thead>';
    const tbody = document.createElement('tbody');

    const rows = [
      {
        id: 'A1',
        desc: '2 majuscules ASCII + 3 chiffres',
        ref: Exp.LEARNING_EXERCISES[0].reference,
        note: 'Quantificateurs exacts {2} et {3} ; majuscules ASCII uniquement.'
      },
      {
        id: 'A2',
        desc: 'INFO ou WARN, tiret, 2 à 4 chiffres',
        ref: Exp.LEARNING_EXERCISES[1].reference,
        note: 'Parenthèses obligatoires autour de INFO|WARN.'
      },
      {
        id: 'A3',
        desc: '3 à 5 minuscules + (-2 chiffres) optionnel',
        ref: Exp.LEARNING_EXERCISES[2].reference,
        note: 'Parenthèses autour de (-[0-9]{2})? pour rendre tout le suffixe facultatif.'
      },
      {
        id: 'E1',
        desc: '2 à 4 minuscules, tiret, 3 chiffres',
        ref: Exp.EVAL_EXERCISES.E1.reference,
        note: 'Vérifier les bornes {2,4} et {3}, pas de majuscules.'
      },
      {
        id: 'E2',
        desc: 'Compréhension de [A-Z]{2}(-[0-9]+)?',
        ref: 'AB : Oui | AB-123 : Oui | AB- : Non | ABC-12 : Non | AB123 : Non | XY-0 : Oui',
        note: 'Le + impose au moins un chiffre après le tiret (d’où AB- refusé et XY-0 accepté).'
      },
      {
        id: 'E3',
        desc: 'Correction de GET|POST-[A-Z]{2}',
        ref: Exp.EVAL_EXERCISES.E3.reference,
        note: Exp.EVAL_EXERCISES.E3.expectedExplanation
      },
      {
        id: 'E4',
        desc: 'TCP ou UDP, tiret, 2–4 chiffres, (-2 maj.)?',
        ref: Exp.EVAL_EXERCISES.E4.reference,
        note: 'Combine groupement d’alternative (TCP|UDP) et suffixe optionnel (-[A-Z]{2})?.'
      }
    ];

    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.innerHTML = '<strong>' + r.id + '</strong>';
      const td2 = document.createElement('td');
      td2.textContent = r.desc;
      const td3 = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = r.ref;
      td3.appendChild(code);
      const td4 = document.createElement('td');
      td4.textContent = r.note;
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tr.appendChild(td4);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    box.appendChild(table);
  }

  function renderSummaryAndChartsOnly() {
    const active = getActiveAttempts();
    const agg = Exp.aggregateByGroup(active);
    renderGroupTables(agg);
    renderCharts(agg);
  }

  function renderAll() {
    const active = getActiveAttempts();
    const count = active.length;
    $('teacher-count-badge').textContent =
      count + (count > 1 ? ' tentatives chargées' : ' tentative chargée') + (demoMode ? ' (démo)' : '');

    if (demoMode) {
      $('teacher-demo-badge').classList.remove('hidden');
      $('demo-banner').classList.remove('hidden');
    } else {
      $('teacher-demo-badge').classList.add('hidden');
      $('demo-banner').classList.add('hidden');
    }

    const hasData = count > 0;
    $('btn-export-group-csv').disabled = !hasData;
    $('btn-export-indiv-csv').disabled = !hasData;
    $('btn-export-bundle-json').disabled = !hasData || demoMode;
    $('btn-clear-all-data').disabled = !hasData;

    renderSummaryAndChartsOnly();
    renderAttemptsTable();
  }

  // ---- CHRONOMÈTRE ENSEIGNANT (5 MIN) ----
  function updateTeacherTimerDisplay() {
    $('teacher-timer-display').textContent = formatMMSS(teacherRemainingSec);
    const box = $('teacher-timer-box');
    box.classList.remove('timer-warning', 'timer-expired');
    if (teacherRemainingSec <= 60 && teacherRemainingSec > 0) box.classList.add('timer-warning');
    if (teacherRemainingSec <= 0) box.classList.add('timer-expired');
  }

  function toggleTeacherTimer() {
    const btn = $('btn-teacher-timer-toggle');
    if (teacherTimerRunning) {
      teacherTimerRunning = false;
      window.clearInterval(teacherTimerId);
      btn.textContent = 'Reprendre';
    } else {
      if (teacherRemainingSec <= 0) teacherRemainingSec = Exp.PHASE_DURATIONS.teacher;
      teacherTimerRunning = true;
      btn.textContent = 'Pause';
      teacherTimerId = window.setInterval(() => {
        teacherRemainingSec -= 1;
        updateTeacherTimerDisplay();
        if (teacherRemainingSec <= 0) {
          teacherTimerRunning = false;
          window.clearInterval(teacherTimerId);
          btn.textContent = 'Redémarrer';
        }
      }, 1000);
    }
  }

  function resetTeacherTimer() {
    teacherTimerRunning = false;
    window.clearInterval(teacherTimerId);
    teacherRemainingSec = Exp.PHASE_DURATIONS.teacher;
    $('btn-teacher-timer-toggle').textContent = 'Démarrer';
    updateTeacherTimerDisplay();
  }

  function bindEvents() {
    const fileInput = $('import-file-input');
    fileInput.addEventListener('change', (e) => {
      handleFilesImport(e.target.files);
      fileInput.value = '';
    });

    const dropZone = $('import-drop-zone');
    ['dragenter', 'dragover'].forEach((evName) => {
      dropZone.addEventListener(evName, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach((evName) => {
      dropZone.addEventListener(evName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFilesImport(e.dataTransfer.files);
      }
    });

    $('btn-load-demo').addEventListener('click', () => {
      if (realAttempts.length > 0) {
        const ok = window.confirm(
          'Des données étudiantes réelles sont déjà chargées. Passer en mode démonstration masquera temporairement vos données réelles (sans les supprimer) pour éviter tout mélange. Continuer ?'
        );
        if (!ok) return;
      }
      demoMode = true;
      demoAttempts = Exp.createDemoDataset();
      showImportReport(
        [
          'Jeu de démonstration synthétique chargé (9 tentatives fictives, 3 par groupe).',
          'Vos éventuelles données réelles restent isolées et ne sont pas mélangées.'
        ],
        'warn'
      );
      renderAll();
    });

    $('btn-exit-demo').addEventListener('click', () => {
      demoMode = false;
      demoAttempts = [];
      showImportReport(['Mode démonstration quitté. Retour aux données réelles locales.'], 'info');
      renderAll();
    });

    $('btn-clear-all-data').addEventListener('click', () => {
      const label = demoMode ? 'les données de démonstration' : 'toutes les tentatives importées localement';
      if (!window.confirm('Voulez-vous vraiment vider ' + label + ' ?')) return;
      if (demoMode) {
        demoMode = false;
        demoAttempts = [];
      } else {
        realAttempts = [];
        saveRealAttempts();
      }
      $('import-report').classList.add('hidden');
      renderAll();
    });

    $('filter-group-select').addEventListener('change', (e) => {
      filterGroup = e.target.value;
      renderAttemptsTable();
    });

    $('btn-export-group-csv').addEventListener('click', () => {
      const agg = Exp.aggregateByGroup(getActiveAttempts());
      const suffix = demoMode ? '-demo' : '';
      downloadFile('synthese-groupes-regex' + suffix + '.csv', Exp.aggregationToGroupCsv(agg), 'text/csv;charset=utf-8');
    });

    $('btn-export-indiv-csv').addEventListener('click', () => {
      const suffix = demoMode ? '-demo' : '';
      downloadFile(
        'resultats-individuels-regex' + suffix + '.csv',
        Exp.attemptsToIndividualCsv(getActiveAttempts()),
        'text/csv;charset=utf-8'
      );
    });

    $('btn-export-bundle-json').addEventListener('click', () => {
      if (demoMode) return;
      const bundle = {
        schemaVersion: Exp.SCHEMA_VERSION,
        kind: 'regex-exp-bundle',
        exportedAt: new Date().toISOString(),
        attempts: realAttempts
      };
      downloadFile('session-enseignant-regex.json', JSON.stringify(bundle, null, 2), 'application/json;charset=utf-8');
    });

    $('btn-toggle-solutions').addEventListener('click', () => {
      solutionsVisible = !solutionsVisible;
      const box = $('solutions-content');
      const btn = $('btn-toggle-solutions');
      if (solutionsVisible) {
        renderSolutionsContent();
        box.classList.remove('hidden');
        btn.textContent = 'Masquer le corrigé de référence';
        btn.setAttribute('aria-expanded', 'true');
      } else {
        box.classList.add('hidden');
        btn.textContent = 'Afficher le corrigé de référence';
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    $('btn-projection-toggle').addEventListener('click', () => {
      const active = document.body.classList.toggle('projection-mode');
      const btn = $('btn-projection-toggle');
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.textContent = active ? 'Quitter le mode projection' : 'Mode projection';
    });

    $('btn-teacher-timer-toggle').addEventListener('click', toggleTeacherTimer);
    $('btn-teacher-timer-reset').addEventListener('click', resetTeacherTimer);
  }

  bindEvents();
  updateTeacherTimerDisplay();
  renderAll();
})();
