/**
 * ui.js
 * Controlador de interfaz, renderizado interactivo y navegación por pestañas
 * de SyntaxLens LL(1) (Gramática | FIRST / FOLLOW | Matriz LL(1) | Simulación).
 */

(function (global) {
  'use strict';

  const SL = global.SyntaxLens;
  const { Examples, Grammar, Sets, Table, Parser, Assistant } = SL;

  const dom = {};

  const STALE_NOTICE =
    "La gramática cambió. Pulsa 'Analizar gramática' para actualizar los resultados.";

  const state = {
    activeTab: 'grammar',
    isAnalyzed: false,
    currentExample: null,
    grammar: null,
    sets: null,
    table: null,
    assistantReport: null,
    originalGrammarBeforeFix: null,
    matrixHighlight: { row: null, col: null },
    tokenizeMode: 'auto',
    simResult: null,
    simStepIndex: 0,
    simTimer: null,
    simSpeedMs: 600
  };

  /* ------------------------------------------------------------------------
     Inicialización
     ------------------------------------------------------------------------ */
  function init() {
    cacheDom();
    initTheme();
    populateExamples();
    bindEvents();

    // Cargar únicamente el texto del Ejemplo 1 en el editor (sin analizar automáticamente)
    loadExample(Examples.list[0].id);
    invalidateResults({ clearValidation: true, message: STALE_NOTICE });
  }

  function cacheDom() {
    dom.themeToggle = document.getElementById('theme-toggle');
    dom.themeLabel = document.getElementById('theme-label');
    dom.btnRunTests = document.getElementById('btn-run-tests');

    dom.globalVerdict = document.getElementById('global-verdict-banner');
    dom.badgeNt = document.getElementById('badge-nt');
    dom.badgeT = document.getElementById('badge-t');
    dom.badgeProd = document.getElementById('badge-prod');
    dom.badgeConflicts = document.getElementById('badge-conflicts');

    dom.tabBtns = document.querySelectorAll('.tab-btn');
    dom.tabViews = {
      grammar: document.getElementById('view-grammar'),
      sets: document.getElementById('view-sets'),
      matrix: document.getElementById('view-matrix'),
      sim: document.getElementById('view-sim')
    };
    dom.gotoBtns = document.querySelectorAll('[data-goto]');

    // Drawer de pruebas
    dom.testsDrawer = document.getElementById('tests-drawer');
    dom.testsSummaryText = document.getElementById('tests-summary-text');
    dom.testsTbody = document.getElementById('tests-tbody');
    dom.btnCloseTests = document.getElementById('btn-close-tests');

    // Pestaña Gramática
    dom.exampleSelect = document.getElementById('example-select');
    dom.exampleTag = document.getElementById('example-tag');
    dom.exampleDesc = document.getElementById('example-desc');
    dom.lineNumbers = document.getElementById('line-numbers');
    dom.grammarInput = document.getElementById('grammar-input');
    dom.btnAnalyze = document.getElementById('btn-analyze');
    dom.btnInsertEps = document.getElementById('btn-insert-eps');
    dom.btnClearGrammar = document.getElementById('btn-clear-grammar');
    dom.validationOutput = document.getElementById('validation-output');
    dom.grammarSummaryPanel = document.getElementById('grammar-summary-panel');
    dom.startSymbolBox = document.getElementById('start-symbol-box');
    dom.ntListBox = document.getElementById('nt-list-box');
    dom.tListBox = document.getElementById('t-list-box');
    dom.productionsOl = document.getElementById('productions-ol');

    // Pestaña FIRST / FOLLOW
    dom.setsEmptyState = document.getElementById('sets-empty-state');
    dom.setsContentPanel = document.getElementById('sets-content-panel');
    dom.firstTbody = document.getElementById('first-tbody');
    dom.followTbody = document.getElementById('follow-tbody');
    dom.prodFirstTbody = document.getElementById('prod-first-tbody');
    dom.traceTabBtns = document.querySelectorAll('[data-trace]');
    dom.traceFirstBox = document.getElementById('trace-first-box');
    dom.traceFollowBox = document.getElementById('trace-follow-box');

    // Pestaña Matriz LL(1)
    dom.matrixEmptyState = document.getElementById('matrix-empty-state');
    dom.matrixContentPanel = document.getElementById('matrix-content-panel');
    dom.matrixVerdictBox = document.getElementById('matrix-verdict-box');
    dom.assistantPanel = document.getElementById('assistant-panel');
    dom.matrixSelectionLabel = document.getElementById('matrix-selection-label');
    dom.btnClearMatrixHl = document.getElementById('btn-clear-matrix-hl');
    dom.mainMatrixTable = document.getElementById('main-matrix-table');
    dom.mainMatrixThead = document.getElementById('main-matrix-thead');
    dom.mainMatrixTbody = document.getElementById('main-matrix-tbody');
    dom.matrixTooltip = document.getElementById('matrix-tooltip');

    // Pestaña Simulación
    dom.simEmptyState = document.getElementById('sim-empty-state');
    dom.simContentPanel = document.getElementById('sim-content-panel');
    dom.simBlockedBox = document.getElementById('sim-blocked-box');
    dom.simBlockedMsg = document.getElementById('sim-blocked-msg');
    dom.btnBlockedGotoMatrix = document.getElementById('btn-blocked-goto-matrix');
    dom.simActiveArea = document.getElementById('sim-active-area');

    dom.chainInput = document.getElementById('chain-input');
    dom.btnSimStart = document.getElementById('btn-sim-start');
    dom.btnSimClear = document.getElementById('btn-sim-clear');
    dom.tokenizeMode = document.getElementById('tokenize-mode');
    dom.tokenizeModeDesc = document.getElementById('tokenize-mode-desc');
    dom.maxStepsInput = document.getElementById('max-steps-input');
    dom.tokenPreviewBar = document.getElementById('token-preview-bar');
    dom.chainExamplesRow = document.getElementById('chain-examples-row');
    dom.chainExamplesBtns = document.getElementById('chain-examples-btns');

    dom.playbackBar = document.getElementById('playback-bar');
    dom.btnStepReset = document.getElementById('btn-step-reset');
    dom.btnStepPrev = document.getElementById('btn-step-prev');
    dom.btnStepNext = document.getElementById('btn-step-next');
    dom.btnStepPlay = document.getElementById('btn-step-play');
    dom.btnStepAll = document.getElementById('btn-step-all');
    dom.speedRange = document.getElementById('speed-range');
    dom.speedLabel = document.getElementById('speed-label');
    dom.stepCounter = document.getElementById('step-counter');

    dom.simResultBanner = document.getElementById('sim-result-banner');
    dom.simStage = document.getElementById('sim-stage');
    dom.stackVisual = document.getElementById('stack-visual');
    dom.inputRibbon = document.getElementById('input-ribbon');
    dom.simCellIndicator = document.getElementById('sim-cell-indicator');
    dom.currentActionCard = document.getElementById('current-action-card');

    dom.simMatrixTable = document.getElementById('sim-matrix-table');
    dom.simMatrixThead = document.getElementById('sim-matrix-thead');
    dom.simMatrixTbody = document.getElementById('sim-matrix-tbody');

    dom.btnCopyTrace = document.getElementById('btn-copy-trace');
    dom.btnExportCsv = document.getElementById('btn-export-csv');
    dom.simTraceTbody = document.getElementById('sim-trace-tbody');

    dom.derivationBox = document.getElementById('derivation-box');
    dom.derivTabBtns = document.querySelectorAll('[data-deriv]');
    dom.derivTreeView = document.getElementById('deriv-tree-view');
    dom.derivLeftmostView = document.getElementById('deriv-leftmost-view');
    dom.leftmostOl = document.getElementById('leftmost-ol');
  }

  /* ------------------------------------------------------------------------
     Tema oscuro / claro
     ------------------------------------------------------------------------ */
  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem('syntaxlens-theme');
    } catch (_) {
      saved = null;
    }
    applyTheme(saved === 'light' ? 'light' : 'dark');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    dom.themeLabel.textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
    try {
      localStorage.setItem('syntaxlens-theme', theme);
    } catch (_) {
      // Sin almacenamiento local disponible
    }
  }

  /* ------------------------------------------------------------------------
     Navegación por pestañas y numeración de líneas
     ------------------------------------------------------------------------ */
  function setActiveTab(tabName) {
    if (!dom.tabViews[tabName]) return;
    state.activeTab = tabName;

    dom.tabBtns.forEach((btn) => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    Object.keys(dom.tabViews).forEach((key) => {
      dom.tabViews[key].classList.toggle('hidden', key !== tabName);
    });

    if (tabName !== 'sim') {
      stopAutoPlay();
    }
    hideMatrixTooltip();
  }

  function updateLineNumbers() {
    const lineCount = Math.max(1, dom.grammarInput.value.split(/\r?\n/).length);
    const nums = [];
    for (let i = 1; i <= lineCount; i++) {
      nums.push(String(i));
    }
    dom.lineNumbers.textContent = nums.join('\n');
    dom.lineNumbers.scrollTop = dom.grammarInput.scrollTop;
  }

  /* ------------------------------------------------------------------------
     Ejemplos y eventos
     ------------------------------------------------------------------------ */
  function populateExamples() {
    dom.exampleSelect.innerHTML = '';
    Examples.list.forEach((ex) => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.nombre;
      dom.exampleSelect.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = 'Gramática personalizada';
    dom.exampleSelect.appendChild(customOpt);
  }

  function loadExample(id) {
    const ex = Examples.getById(id);
    if (!ex) return;
    state.currentExample = ex;
    dom.exampleSelect.value = ex.id;
    dom.grammarInput.value = ex.gramatica;
    updateLineNumbers();
    updateExampleMeta(ex);
  }

  function updateExampleMeta(ex) {
    state.currentExample = ex || null;
    if (!ex) {
      dom.exampleTag.className = 'tag tag-info';
      dom.exampleTag.textContent = 'Personalizada';
      dom.exampleDesc.textContent =
        'Gramática editada manualmente. Presiona "Analizar gramática" para actualizar todas las vistas.';
      return;
    }

    dom.exampleTag.className = `tag ${ex.tipoEtiqueta === 'ok' ? 'tag-ok' : 'tag-error'}`;
    dom.exampleTag.textContent = ex.etiqueta;
    dom.exampleDesc.textContent = ex.descripcion;
  }

  function bindEvents() {
    dom.themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    dom.btnRunTests.addEventListener('click', runAndRenderTests);
    dom.btnCloseTests.addEventListener('click', () => {
      dom.testsDrawer.classList.add('hidden');
    });

    dom.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });

    dom.gotoBtns.forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.goto));
    });

    dom.btnBlockedGotoMatrix.addEventListener('click', () => setActiveTab('matrix'));

    dom.exampleSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      state.originalGrammarBeforeFix = null;
      if (val === '__custom__') {
        updateExampleMeta(null);
        invalidateResults({ clearValidation: true, message: STALE_NOTICE });
        return;
      }
      // Solo cargar el texto en el editor e invalidar resultados previos (sin calcular)
      loadExample(val);
      invalidateResults({ clearValidation: true, message: STALE_NOTICE });
    });

    dom.grammarInput.addEventListener('input', () => {
      state.originalGrammarBeforeFix = null;
      updateLineNumbers();
      const trimmed = dom.grammarInput.value.trim();
      const found = Examples.list.find((ex) => ex.gramatica.trim() === trimmed);
      if (found) {
        dom.exampleSelect.value = found.id;
        updateExampleMeta(found);
      } else {
        dom.exampleSelect.value = '__custom__';
        updateExampleMeta(null);
      }
      invalidateResults({ clearValidation: true, message: STALE_NOTICE });
    });

    dom.grammarInput.addEventListener('scroll', () => {
      dom.lineNumbers.scrollTop = dom.grammarInput.scrollTop;
    });

    dom.grammarInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        analyzeCurrentGrammar();
      }
    });

    dom.btnAnalyze.addEventListener('click', analyzeCurrentGrammar);

    dom.btnInsertEps.addEventListener('click', () => {
      insertAtCursor(dom.grammarInput, Grammar.EPSILON);
      dom.grammarInput.dispatchEvent(new Event('input'));
    });

    dom.btnClearGrammar.addEventListener('click', () => {
      stopAutoPlay();
      state.originalGrammarBeforeFix = null;
      dom.grammarInput.value = '';
      updateLineNumbers();
      dom.exampleSelect.value = '__custom__';
      updateExampleMeta(null);
      invalidateResults({ clearValidation: true, message: STALE_NOTICE });
      dom.grammarInput.focus();
    });

    // Subpestañas traza FIRST/FOLLOW
    dom.traceTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.trace;
        dom.traceTabBtns.forEach((b) => {
          const on = b.dataset.trace === target;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        dom.traceFirstBox.classList.toggle('hidden', target !== 'first');
        dom.traceFollowBox.classList.toggle('hidden', target !== 'follow');
      });
    });

    dom.btnClearMatrixHl.addEventListener('click', clearMatrixHighlight);
    global.addEventListener('scroll', hideMatrixTooltip, { passive: true });

    // Eventos del simulador
    dom.chainInput.addEventListener('input', updateTokenPreview);
    dom.chainInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startSimulation({ autoPlay: true });
      }
    });

    dom.tokenizeMode.addEventListener('change', (e) => {
      state.tokenizeMode = e.target.value;
      updateTokenizeModeDesc();
      updateTokenPreview();
    });

    dom.btnSimStart.addEventListener('click', () => startSimulation({ autoPlay: true }));

    dom.btnSimClear.addEventListener('click', () => {
      stopAutoPlay();
      dom.chainInput.value = '';
      updateTokenPreview();
      state.simResult = null;
      state.simStepIndex = 0;
      dom.playbackBar.classList.add('hidden');
      dom.simResultBanner.classList.add('hidden');
      dom.simStage.classList.add('hidden');
      clearSimMatrixHighlight();
      dom.chainInput.focus();
    });

    dom.btnStepReset.addEventListener('click', () => {
      stopAutoPlay();
      if (!state.simResult) return;
      state.simStepIndex = 0;
      renderCurrentStep();
    });

    dom.btnStepPrev.addEventListener('click', () => {
      stopAutoPlay();
      if (!state.simResult || state.simStepIndex <= 0) return;
      state.simStepIndex -= 1;
      renderCurrentStep();
    });

    dom.btnStepNext.addEventListener('click', () => {
      stopAutoPlay();
      if (!state.simResult || state.simStepIndex >= state.simResult.steps.length - 1) return;
      state.simStepIndex += 1;
      renderCurrentStep();
    });

    dom.btnStepPlay.addEventListener('click', toggleAutoPlay);

    dom.btnStepAll.addEventListener('click', () => {
      stopAutoPlay();
      if (!state.simResult || state.simResult.steps.length === 0) return;
      state.simStepIndex = state.simResult.steps.length - 1;
      renderCurrentStep();
    });

    dom.speedRange.addEventListener('input', (e) => {
      state.simSpeedMs = Number(e.target.value) || 600;
      dom.speedLabel.textContent = `${(state.simSpeedMs / 1000).toFixed(2)}s`;
      if (state.simTimer) {
        stopAutoPlay();
        startAutoPlay();
      }
    });

    dom.btnCopyTrace.addEventListener('click', copyTraceToClipboard);
    dom.btnExportCsv.addEventListener('click', exportTraceCSV);

    dom.derivTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.deriv;
        dom.derivTabBtns.forEach((b) => {
          const on = b.dataset.deriv === target;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        dom.derivTreeView.classList.toggle('hidden', target !== 'tree');
        dom.derivLeftmostView.classList.toggle('hidden', target !== 'leftmost');
      });
    });
  }

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  /* ------------------------------------------------------------------------
     Invalidación y flujo principal de análisis de la gramática
     ------------------------------------------------------------------------ */
  function setSimulationControlsDisabled(disabled) {
    const controls = [
      dom.chainInput,
      dom.btnSimStart,
      dom.btnSimClear,
      dom.tokenizeMode,
      dom.maxStepsInput,
      dom.btnStepReset,
      dom.btnStepPrev,
      dom.btnStepNext,
      dom.btnStepPlay,
      dom.btnStepAll,
      dom.btnCopyTrace,
      dom.btnExportCsv
    ];
    controls.forEach((el) => {
      if (el) el.disabled = Boolean(disabled);
    });
    if (dom.chainExamplesBtns) {
      dom.chainExamplesBtns.querySelectorAll('button').forEach((btn) => {
        btn.disabled = Boolean(disabled);
      });
    }
  }

  /**
   * Invalida los resultados anteriores cuando se carga un ejemplo o se edita el editor:
   * - Limpia badges ("—") y oculta el veredicto global.
   * - Muestra el aviso en FIRST/FOLLOW, Matriz LL(1) y Simulación.
   * - Deshabilita todos los controles de simulación.
   */
  function invalidateResults(opts) {
    const clearValidation = !opts || opts.clearValidation !== false;
    const notice = (opts && opts.message) || STALE_NOTICE;

    stopAutoPlay();
    hideMatrixTooltip();

    state.isAnalyzed = false;
    state.grammar = null;
    state.sets = null;
    state.table = null;
    state.assistantReport = null;
    state.simResult = null;
    state.simStepIndex = 0;
    state.matrixHighlight = { row: null, col: null };

    if (dom.assistantPanel) {
      dom.assistantPanel.innerHTML = '';
      dom.assistantPanel.classList.add('hidden');
    }

    if (clearValidation && dom.validationOutput) {
      dom.validationOutput.innerHTML = '';
    }

    updateGlobalBar(null, null);
    toggleResultPanels(false, notice);

    // Limpiar contenido previo de tablas y paneles para no conservar datos obsoletos
    if (dom.firstTbody) dom.firstTbody.innerHTML = '';
    if (dom.followTbody) dom.followTbody.innerHTML = '';
    if (dom.prodFirstTbody) dom.prodFirstTbody.innerHTML = '';
    if (dom.traceFirstBox) dom.traceFirstBox.innerHTML = '';
    if (dom.traceFollowBox) dom.traceFollowBox.innerHTML = '';
    if (dom.matrixVerdictBox) dom.matrixVerdictBox.innerHTML = '';
    if (dom.mainMatrixThead) dom.mainMatrixThead.innerHTML = '';
    if (dom.mainMatrixTbody) dom.mainMatrixTbody.innerHTML = '';
    if (dom.simMatrixThead) dom.simMatrixThead.innerHTML = '';
    if (dom.simMatrixTbody) dom.simMatrixTbody.innerHTML = '';
    if (dom.simTraceTbody) dom.simTraceTbody.innerHTML = '';
    if (dom.stackVisual) dom.stackVisual.innerHTML = '';
    if (dom.inputRibbon) dom.inputRibbon.innerHTML = '';
    if (dom.tokenPreviewBar) dom.tokenPreviewBar.innerHTML = '';
    if (dom.derivTreeView) dom.derivTreeView.innerHTML = '';
    if (dom.leftmostOl) dom.leftmostOl.innerHTML = '';

    dom.playbackBar.classList.add('hidden');
    dom.simResultBanner.classList.add('hidden');
    dom.simStage.classList.add('hidden');
    dom.derivationBox.classList.add('hidden');

    setSimulationControlsDisabled(true);
  }

  function analyzeCurrentGrammar() {
    stopAutoPlay();
    hideMatrixTooltip();

    const grammar = Grammar.parseGrammar(dom.grammarInput.value);

    if (!grammar.ok) {
      invalidateResults({
        clearValidation: false,
        message: "La gramática contiene errores. Corrígelos y pulsa 'Analizar gramática'."
      });
      renderValidation(grammar.errors, grammar.warnings);
      return;
    }

    renderValidation(grammar.errors, grammar.warnings);

    const sets = Sets.computeAllSets(grammar);
    const table = Table.buildParsingTable(grammar, sets);

    state.isAnalyzed = true;
    state.grammar = grammar;
    state.sets = sets;
    state.table = table;
    state.matrixHighlight = { row: null, col: null };
    state.simResult = null;

    updateGlobalBar(grammar, table);
    toggleResultPanels(true);

    renderGrammarSummary(grammar);
    renderSetsView(grammar, sets);
    renderMatrixView(grammar, table);
    setupSimulatorView(grammar, table);
  }

  function toggleResultPanels(hasValidGrammar, noticeMessage) {
    dom.grammarSummaryPanel.classList.toggle('hidden', !hasValidGrammar);

    if (!hasValidGrammar && noticeMessage) {
      dom.setsEmptyState.textContent = noticeMessage;
      dom.matrixEmptyState.textContent = noticeMessage;
      dom.simEmptyState.textContent = noticeMessage;
    }

    dom.setsEmptyState.classList.toggle('hidden', hasValidGrammar);
    dom.setsContentPanel.classList.toggle('hidden', !hasValidGrammar);

    dom.matrixEmptyState.classList.toggle('hidden', hasValidGrammar);
    dom.matrixContentPanel.classList.toggle('hidden', !hasValidGrammar);

    dom.simEmptyState.classList.toggle('hidden', hasValidGrammar);
    dom.simContentPanel.classList.toggle('hidden', !hasValidGrammar);
  }

  function updateGlobalBar(grammar, table) {
    if (!grammar || !table) {
      dom.globalVerdict.className = 'verdict-pill verdict-pill-info hidden';
      dom.globalVerdict.textContent = '';
      dom.badgeNt.innerHTML = 'No terminales: <strong>—</strong>';
      dom.badgeT.innerHTML = 'Terminales: <strong>—</strong>';
      dom.badgeProd.innerHTML = 'Producciones: <strong>—</strong>';
      dom.badgeConflicts.className = 'metric-badge';
      dom.badgeConflicts.innerHTML = 'Conflictos: <strong>—</strong>';
      return;
    }

    dom.globalVerdict.className = `verdict-pill ${
      table.isLL1 ? 'verdict-pill-ok' : 'verdict-pill-error'
    }`;
    dom.globalVerdict.textContent = table.bannerText;

    dom.badgeNt.innerHTML = `No terminales: <strong>${grammar.nonTerminals.length}</strong>`;
    dom.badgeT.innerHTML = `Terminales: <strong>${grammar.terminals.length}</strong>`;
    dom.badgeProd.innerHTML = `Producciones: <strong>${grammar.productions.length}</strong>`;

    const cCount = table.conflicts.length;
    dom.badgeConflicts.className = cCount > 0 ? 'metric-badge metric-badge-danger' : 'metric-badge';
    dom.badgeConflicts.innerHTML = `Conflictos: <strong>${cCount}</strong>`;
  }

  function renderValidation(errors, warnings) {
    dom.validationOutput.innerHTML = '';

    if (errors.length > 0) {
      const box = document.createElement('div');
      box.className = 'alert alert-error';
      box.setAttribute('role', 'alert');
      const title = document.createElement('div');
      title.className = 'alert-title';
      title.textContent = `Errores de validación (${errors.length})`;
      box.appendChild(title);

      const ul = document.createElement('ul');
      errors.forEach((e) => {
        const li = document.createElement('li');
        li.textContent = e.message;
        ul.appendChild(li);
      });
      box.appendChild(ul);
      dom.validationOutput.appendChild(box);
    }

    if (warnings.length > 0) {
      const box = document.createElement('div');
      box.className = 'alert alert-warn';
      box.setAttribute('role', 'status');
      const title = document.createElement('div');
      title.className = 'alert-title';
      title.textContent = `Advertencias (${warnings.length})`;
      box.appendChild(title);

      const ul = document.createElement('ul');
      warnings.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = w.message;
        ul.appendChild(li);
      });
      box.appendChild(ul);
      dom.validationOutput.appendChild(box);
    }
  }

  /* ------------------------------------------------------------------------
     Helpers visuales de símbolos y conjuntos
     ------------------------------------------------------------------------ */
  function createSymChip(symbol, kind) {
    const span = document.createElement('span');
    span.className = `sym sym-${kind}`;
    span.textContent = symbol;
    return span;
  }

  function createSetElement(symbols) {
    const wrap = document.createElement('div');
    wrap.className = 'set-wrap';

    const open = document.createElement('span');
    open.className = 'set-brace';
    open.textContent = '{';
    wrap.appendChild(open);

    if (!symbols || symbols.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'field-hint';
      empty.textContent = '∅';
      wrap.appendChild(empty);
    } else {
      symbols.forEach((s, idx) => {
        const kind = s === Grammar.EPSILON ? 'eps' : s === Grammar.EOF ? 'eof' : 'term';
        wrap.appendChild(createSymChip(s, kind));
        if (idx < symbols.length - 1) {
          const comma = document.createElement('span');
          comma.className = 'set-comma';
          comma.textContent = ',';
          wrap.appendChild(comma);
        }
      });
    }

    const close = document.createElement('span');
    close.className = 'set-brace';
    close.textContent = '}';
    wrap.appendChild(close);
    return wrap;
  }

  function createFormattedProd(prod, ntSet) {
    const expr = document.createElement('span');
    expr.className = 'prod-expr';
    expr.appendChild(createSymChip(prod.lhs, 'nt'));

    const arrow = document.createElement('span');
    arrow.className = 'prod-arrow';
    arrow.textContent = '→';
    expr.appendChild(arrow);

    prod.rhs.forEach((sym) => {
      const kind = sym === Grammar.EPSILON ? 'eps' : ntSet.has(sym) ? 'nt' : 'term';
      expr.appendChild(createSymChip(sym, kind));
    });
    return expr;
  }

  /* ------------------------------------------------------------------------
     Renderizado: Pestaña 1 (Resumen de gramática)
     ------------------------------------------------------------------------ */
  function renderGrammarSummary(grammar) {
    const ntSet = new Set(grammar.nonTerminals);

    dom.startSymbolBox.innerHTML = '';
    dom.startSymbolBox.appendChild(createSymChip(grammar.startSymbol, 'start'));

    dom.ntListBox.innerHTML = '';
    grammar.nonTerminals.forEach((nt) => {
      dom.ntListBox.appendChild(createSymChip(nt, nt === grammar.startSymbol ? 'start' : 'nt'));
    });

    dom.tListBox.innerHTML = '';
    if (grammar.terminals.length === 0) {
      const note = document.createElement('span');
      note.className = 'field-hint';
      note.textContent = 'Sin terminales explícitos';
      dom.tListBox.appendChild(note);
    } else {
      grammar.terminals.forEach((t) => {
        dom.tListBox.appendChild(createSymChip(t, 'term'));
      });
    }
    const eofChip = createSymChip(Grammar.EOF, 'eof');
    eofChip.title = 'Marcador de fin de entrada (reservado)';
    dom.tListBox.appendChild(eofChip);

    dom.productionsOl.innerHTML = '';
    grammar.productions.forEach((prod) => {
      const li = document.createElement('li');
      li.className = 'prod-card';
      const num = document.createElement('span');
      num.className = 'prod-idx';
      num.textContent = String(prod.index);
      li.appendChild(num);
      li.appendChild(createFormattedProd(prod, ntSet));
      dom.productionsOl.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------------
     Renderizado: Pestaña 2 (FIRST y FOLLOW + traza)
     ------------------------------------------------------------------------ */
  function renderSetsView(grammar, sets) {
    const ntSet = new Set(grammar.nonTerminals);

    dom.firstTbody.innerHTML = '';
    grammar.nonTerminals.forEach((nt) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.appendChild(createSymChip(nt, nt === grammar.startSymbol ? 'start' : 'nt'));
      const td2 = document.createElement('td');
      td2.appendChild(createSetElement(sets.first[nt]));
      tr.appendChild(td1);
      tr.appendChild(td2);
      dom.firstTbody.appendChild(tr);
    });

    dom.followTbody.innerHTML = '';
    grammar.nonTerminals.forEach((nt) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.appendChild(createSymChip(nt, nt === grammar.startSymbol ? 'start' : 'nt'));
      const td2 = document.createElement('td');
      td2.appendChild(createSetElement(sets.follow[nt]));
      tr.appendChild(td1);
      tr.appendChild(td2);
      dom.followTbody.appendChild(tr);
    });

    dom.prodFirstTbody.innerHTML = '';
    sets.productionFirst.forEach((pf) => {
      const prod = grammar.productions[pf.index - 1];
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className = 'col-num';
      const idx = document.createElement('span');
      idx.className = 'prod-idx';
      idx.textContent = String(pf.index);
      tdNum.appendChild(idx);

      const tdProd = document.createElement('td');
      tdProd.appendChild(createFormattedProd(prod, ntSet));

      const tdFirst = document.createElement('td');
      tdFirst.appendChild(createSetElement(pf.symbols));

      const tdNull = document.createElement('td');
      tdNull.className = 'col-center';
      const tag = document.createElement('span');
      tag.className = `tag ${pf.nullable ? 'tag-warn' : 'tag-ok'}`;
      tag.textContent = pf.nullable ? 'Sí (⇒* ε)' : 'No';
      tdNull.appendChild(tag);

      tr.appendChild(tdNum);
      tr.appendChild(tdProd);
      tr.appendChild(tdFirst);
      tr.appendChild(tdNull);
      dom.prodFirstTbody.appendChild(tr);
    });

    renderSetTrace(sets.firstTrace, dom.traceFirstBox, 'FIRST');
    renderSetTrace(sets.followTrace, dom.traceFollowBox, 'FOLLOW');
  }

  function renderSetTrace(traceList, container, label) {
    container.innerHTML = '';
    traceList.forEach((iter) => {
      const box = document.createElement('div');
      box.className = 'iter-box';

      const head = document.createElement('div');
      head.className = 'iter-head';
      const title = document.createElement('span');
      title.className = 'iter-title';
      title.textContent =
        iter.iteration === 0 ? `Paso inicial — ${label}` : `Iteración ${iter.iteration} — ${label}`;
      const sum = document.createElement('span');
      sum.className = 'field-hint';
      sum.textContent = iter.summary;
      head.appendChild(title);
      head.appendChild(sum);
      box.appendChild(head);

      if (iter.steps.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'iter-ul';
        iter.steps.forEach((s) => {
          const li = document.createElement('li');
          li.className = 'iter-li';
          const r = document.createElement('span');
          r.className = 'rule-chip';
          r.textContent = s.ruleIndex !== null ? `(#${s.ruleIndex}) ${s.production}` : s.production;
          const desc = document.createElement('span');
          desc.textContent = s.reason;
          li.appendChild(r);
          li.appendChild(desc);
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }

      container.appendChild(box);
    });
  }

  /* ------------------------------------------------------------------------
     Renderizado: Pestaña 3 (Matriz LL(1), conflictos y tooltips)
     ------------------------------------------------------------------------ */
  function renderMatrixView(grammar, table) {
    // Ocultar panel del asistente previo al renderizar un nuevo análisis
    closeAssistantPanel();

    // 1. Veredicto y diagnóstico
    dom.matrixVerdictBox.innerHTML = '';
    const card = document.createElement('div');
    card.className = `verdict-card ${table.isLL1 ? 'verdict-card-ok' : 'verdict-card-error'}`;

    const topRow = document.createElement('div');
    topRow.className = 'verdict-top-row';

    const titleWrap = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.className = 'verdict-heading';
    h3.textContent = table.verdictTitle;
    titleWrap.appendChild(h3);

    const p = document.createElement('p');
    p.className = 'verdict-copy';
    p.textContent = table.verdictSummary;
    titleWrap.appendChild(p);
    topRow.appendChild(titleWrap);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'verdict-actions-row';

    if (Assistant && Assistant.shouldOfferSuggestion(grammar, table)) {
      const suggestBtn = document.createElement('button');
      suggestBtn.type = 'button';
      suggestBtn.id = 'btn-suggest-fix';
      suggestBtn.className = 'btn btn-primary btn-sm';
      suggestBtn.textContent = 'Sugerir corrección';
      suggestBtn.addEventListener('click', openAssistantPanel);
      actionsWrap.appendChild(suggestBtn);
    }

    if (actionsWrap.childNodes.length > 0) {
      topRow.appendChild(actionsWrap);
    }
    card.appendChild(topRow);

    // Nota cuando hay producciones duplicadas aunque la tabla deduplicada sea LL(1)
    if (table.isLL1 && (grammar.duplicateCount || 0) > 0) {
      const dupNote = document.createElement('div');
      dupNote.className = 'verdict-dup-note';
      dupNote.textContent = `Se detectaron ${grammar.duplicateCount} producción(es) duplicada(s) en el texto original. Puedes usar "Sugerir corrección" para limpiar la gramática automáticamente.`;
      card.appendChild(dupNote);
    }

    // Franja de restauración rápida si el usuario acaba de aplicar una corrección
    if (state.originalGrammarBeforeFix !== null) {
      const restoreBar = document.createElement('div');
      restoreBar.className = 'restore-strip';

      const msg = document.createElement('span');
      msg.textContent = 'Se aplicó una corrección sugerida por el asistente.';
      restoreBar.appendChild(msg);

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.id = 'btn-restore-applied-fix';
      restoreBtn.className = 'btn btn-secondary btn-sm';
      restoreBtn.textContent = 'Restaurar gramática original';
      restoreBtn.addEventListener('click', () => restoreOriginalGrammar());
      restoreBar.appendChild(restoreBtn);

      card.appendChild(restoreBar);
    }

    if (!table.isLL1) {
      const grid = document.createElement('div');
      grid.className = 'verdict-grid';

      if (table.diagnostics.length > 0) {
        const sub = document.createElement('div');
        sub.className = 'verdict-sub';
        const h4 = document.createElement('h4');
        h4.textContent = 'Problemas detectados';
        sub.appendChild(h4);

        const ul = document.createElement('ul');
        ul.className = 'verdict-ul';
        table.diagnostics.forEach((d) => {
          const li = document.createElement('li');
          const strong = document.createElement('strong');
          strong.textContent = `${d.category}: `;
          li.appendChild(strong);
          li.appendChild(document.createTextNode(d.detail));
          ul.appendChild(li);
        });
        sub.appendChild(ul);
        grid.appendChild(sub);
      }

      if (table.conflicts.length > 0) {
        const sub = document.createElement('div');
        sub.className = 'verdict-sub';
        const h4 = document.createElement('h4');
        h4.textContent = `Celdas implicadas (${table.conflicts.length})`;
        sub.appendChild(h4);

        const ul = document.createElement('ul');
        ul.className = 'conflict-ul';
        table.conflicts.forEach((c) => {
          const li = document.createElement('li');
          li.className = 'conflict-li';

          const head = document.createElement('div');
          head.className = 'conflict-li-head';

          const jump = document.createElement('button');
          jump.type = 'button';
          jump.className = 'cell-jump-btn';
          jump.textContent = `M[${c.nonTerminal}, ${c.terminal}]`;
          jump.addEventListener('click', () => focusMainMatrixCell(c.nonTerminal, c.terminal));
          head.appendChild(jump);

          const typeTag = document.createElement('span');
          typeTag.className = 'tag tag-warn';
          typeTag.textContent = c.type;
          head.appendChild(typeTag);
          li.appendChild(head);

          const exp = document.createElement('span');
          exp.textContent = c.explanation;
          li.appendChild(exp);
          ul.appendChild(li);
        });
        sub.appendChild(ul);
        grid.appendChild(sub);
      }

      if (table.suggestions.length > 0) {
        const sub = document.createElement('div');
        sub.className = 'verdict-sub';
        const h4 = document.createElement('h4');
        h4.textContent = 'Sugerencias (sin modificar tu gramática)';
        sub.appendChild(h4);

        const ul = document.createElement('ul');
        ul.className = 'verdict-ul';
        table.suggestions.forEach((s) => {
          const li = document.createElement('li');
          li.textContent = s;
          ul.appendChild(li);
        });
        sub.appendChild(ul);
        grid.appendChild(sub);
      }

      card.appendChild(grid);
    }

    dom.matrixVerdictBox.appendChild(card);

    // 2. Tabla de matriz predictiva
    dom.mainMatrixThead.innerHTML = '';
    dom.mainMatrixTbody.innerHTML = '';
    updateMatrixSelectionLabel();

    const trHead = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'matrix-corner';
    corner.textContent = 'M[A, a]';
    trHead.appendChild(corner);

    table.columns.forEach((colSym) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.dataset.col = colSym;
      th.appendChild(createSymChip(colSym, colSym === Grammar.EOF ? 'eof' : 'term'));
      th.addEventListener('click', () => toggleMatrixHighlight(null, colSym));
      trHead.appendChild(th);
    });
    dom.mainMatrixThead.appendChild(trHead);

    table.rows.forEach((rowNt) => {
      const tr = document.createElement('tr');
      tr.dataset.row = rowNt;

      const rowTh = document.createElement('th');
      rowTh.scope = 'row';
      rowTh.className = 'matrix-row-th';
      rowTh.dataset.row = rowNt;
      rowTh.appendChild(createSymChip(rowNt, rowNt === grammar.startSymbol ? 'start' : 'nt'));
      rowTh.addEventListener('click', () => toggleMatrixHighlight(rowNt, null));
      tr.appendChild(rowTh);

      table.columns.forEach((colSym) => {
        const entries = table.matrix[rowNt][colSym] || [];
        const td = document.createElement('td');
        td.className = 'matrix-cell';
        td.dataset.row = rowNt;
        td.dataset.col = colSym;
        td.tabIndex = 0;

        if (entries.length === 0) {
          td.classList.add('matrix-cell-empty');
          const dash = document.createElement('span');
          dash.className = 'dash';
          dash.textContent = '—';
          td.appendChild(dash);
        } else {
          const isConflict = entries.length > 1;
          td.classList.add(isConflict ? 'matrix-cell-conflict' : 'matrix-cell-filled');

          const wrap = document.createElement('div');
          wrap.className = 'cell-entries';

          if (isConflict) {
            const confObj = table.conflicts.find(
              (c) => c.nonTerminal === rowNt && c.terminal === colSym
            );
            const lbl = document.createElement('span');
            lbl.className = 'conflict-mini-label';
            lbl.textContent = confObj ? confObj.type : 'Conflicto';
            wrap.appendChild(lbl);
          }

          entries.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'cell-prod';
            const num = document.createElement('span');
            num.className = 'cell-num';
            num.textContent = `#${entry.production.index}`;
            item.appendChild(num);
            item.appendChild(document.createTextNode(entry.production.text));
            wrap.appendChild(item);
          });

          td.appendChild(wrap);
        }

        td.addEventListener('mouseenter', () => showMatrixTooltip(td, rowNt, colSym, entries));
        td.addEventListener('mouseleave', hideMatrixTooltip);
        td.addEventListener('focus', () => showMatrixTooltip(td, rowNt, colSym, entries));
        td.addEventListener('blur', hideMatrixTooltip);
        td.addEventListener('click', () => toggleMatrixHighlight(rowNt, colSym));
        td.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleMatrixHighlight(rowNt, colSym);
          }
        });

        tr.appendChild(td);
      });

      dom.mainMatrixTbody.appendChild(tr);
    });
  }

  function toggleMatrixHighlight(rowNt, colSym) {
    if (state.matrixHighlight.row === rowNt && state.matrixHighlight.col === colSym) {
      clearMatrixHighlight();
      return;
    }
    applyMatrixHighlight(rowNt, colSym);
  }

  function applyMatrixHighlight(rowNt, colSym) {
    state.matrixHighlight = { row: rowNt, col: colSym };

    dom.mainMatrixTable.querySelectorAll('th, td').forEach((el) => {
      el.classList.remove('hl-row', 'hl-col', 'hl-th', 'hl-target');
    });

    if (colSym !== null) {
      dom.mainMatrixThead.querySelectorAll('th[data-col]').forEach((th) => {
        if (th.dataset.col === colSym) th.classList.add('hl-th');
      });
    }

    dom.mainMatrixTbody.querySelectorAll('tr').forEach((tr) => {
      const isRow = rowNt !== null && tr.dataset.row === rowNt;
      const rTh = tr.querySelector('th.matrix-row-th');
      if (isRow && rTh) rTh.classList.add('hl-th');

      tr.querySelectorAll('td.matrix-cell').forEach((td) => {
        const isCol = colSym !== null && td.dataset.col === colSym;
        if (isRow) td.classList.add('hl-row');
        if (isCol) td.classList.add('hl-col');
        if (isRow && isCol) td.classList.add('hl-target');
      });
    });

    updateMatrixSelectionLabel();
  }

  function clearMatrixHighlight() {
    state.matrixHighlight = { row: null, col: null };
    dom.mainMatrixTable.querySelectorAll('th, td').forEach((el) => {
      el.classList.remove('hl-row', 'hl-col', 'hl-th', 'hl-target');
    });
    updateMatrixSelectionLabel();
  }

  function focusMainMatrixCell(rowNt, colSym) {
    applyMatrixHighlight(rowNt, colSym);
    const cells = dom.mainMatrixTbody.querySelectorAll('td.matrix-cell');
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].dataset.row === rowNt && cells[i].dataset.col === colSym) {
        cells[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        cells[i].focus({ preventScroll: true });
        break;
      }
    }
  }

  function updateMatrixSelectionLabel() {
    const { row, col } = state.matrixHighlight;
    if (row === null && col === null) {
      dom.matrixSelectionLabel.textContent = 'Clic en celda o encabezado para resaltar';
      dom.btnClearMatrixHl.classList.add('hidden');
      return;
    }

    dom.btnClearMatrixHl.classList.remove('hidden');
    if (row !== null && col !== null && state.table) {
      const entries = (state.table.matrix[row] && state.table.matrix[row][col]) || [];
      if (entries.length === 0) {
        dom.matrixSelectionLabel.textContent = `M[${row}, ${col}] = vacía (error sintáctico)`;
      } else {
        const list = entries.map((e) => `(#${e.production.index}) ${e.production.text}`).join(' | ');
        dom.matrixSelectionLabel.textContent = `M[${row}, ${col}] = ${list}`;
      }
    } else if (row !== null) {
      dom.matrixSelectionLabel.textContent = `Fila resaltada: ${row}`;
    } else {
      dom.matrixSelectionLabel.textContent = `Columna resaltada: ${col}`;
    }
  }

  function showMatrixTooltip(cellEl, rowNt, colSym, entries) {
    const tip = dom.matrixTooltip;
    tip.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'tooltip-title';
    title.textContent = `Celda M[${rowNt}, ${colSym}]`;
    tip.appendChild(title);

    if (entries.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'tooltip-reason';
      msg.textContent = `Vacía: error sintáctico si el tope es "${rowNt}" y la entrada es "${colSym}".`;
      tip.appendChild(msg);
    } else {
      entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'tooltip-item';

        const prodLine = document.createElement('div');
        prodLine.className = 'tooltip-prod';
        prodLine.textContent = `(#${entry.production.index}) ${entry.production.text} [${entry.sources.join(' + ')}]`;
        item.appendChild(prodLine);

        entry.reasons.forEach((reason) => {
          const rLine = document.createElement('div');
          rLine.className = 'tooltip-reason';
          rLine.textContent = reason;
          item.appendChild(rLine);
        });

        tip.appendChild(item);
      });
    }

    tip.classList.remove('hidden');

    const rect = cellEl.getBoundingClientRect();
    const tRect = tip.getBoundingClientRect();
    const pad = 10;

    let left = rect.left + rect.width / 2 - tRect.width / 2;
    left = Math.max(pad, Math.min(left, global.innerWidth - tRect.width - pad));

    let top = rect.top - tRect.height - 8;
    if (top < pad) top = rect.bottom + 8;
    top = Math.max(pad, Math.min(top, global.innerHeight - tRect.height - pad));

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function hideMatrixTooltip() {
    if (dom.matrixTooltip) dom.matrixTooltip.classList.add('hidden');
  }

  /* ------------------------------------------------------------------------
     Asistente de corrección de gramáticas (Panel en pestaña Matriz LL(1))
     ------------------------------------------------------------------------ */
  function openAssistantPanel() {
    if (!Assistant || !state.grammar || !state.sets || !state.table) return;
    const report = Assistant.suggestCorrection(
      dom.grammarInput.value,
      state.grammar,
      state.sets,
      state.table
    );
    state.assistantReport = report;
    renderAssistantPanel(report);
    dom.assistantPanel.classList.remove('hidden');
    dom.assistantPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeAssistantPanel() {
    state.assistantReport = null;
    if (dom.assistantPanel) {
      dom.assistantPanel.innerHTML = '';
      dom.assistantPanel.classList.add('hidden');
    }
  }

  function renderAssistantPanel(report) {
    dom.assistantPanel.innerHTML = '';

    // Cabecera y comparativa de conflictos antes / después
    const head = document.createElement('div');
    head.className = 'assistant-head';

    const titleBox = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'assistant-title';
    title.textContent = 'Asistente de corrección de gramáticas';
    titleBox.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'assistant-subtitle';
    if (report.outcome === 'FIXED') {
      sub.textContent =
        'Propuesta re-validada con éxito: sin conflictos LL(1) y preservando el lenguaje original.';
    } else if (report.outcome === 'PARTIAL') {
      sub.textContent =
        'Se aplicó una transformación segura que reduce problemas, pero aún requiere revisión manual.';
    } else {
      sub.textContent =
        'Diagnóstico completado: no se aplicó ninguna modificación automática sobre tu gramática.';
    }
    titleBox.appendChild(sub);
    head.appendChild(titleBox);

    const metrics = document.createElement('div');
    metrics.className = 'assistant-metrics';

    const bBefore = document.createElement('span');
    bBefore.className = 'metric-badge';
    bBefore.innerHTML = `Conflictos antes: <strong>${report.metrics.conflictsBefore}</strong>`;
    metrics.appendChild(bBefore);

    const bAfter = document.createElement('span');
    bAfter.className =
      report.metrics.conflictsAfter === 0 && report.metrics.isLL1After
        ? 'tag tag-ok'
        : report.outcome === 'PARTIAL'
        ? 'tag tag-warn'
        : 'tag tag-error';
    bAfter.textContent = `Conflictos después: ${report.metrics.conflictsAfter}`;
    metrics.appendChild(bAfter);

    const lrTag = document.createElement('span');
    lrTag.className = report.metrics.leftRecAfter ? 'tag tag-error' : 'tag tag-ok';
    lrTag.textContent = `Rec. izquierda: ${report.metrics.leftRecBefore ? 'Sí' : 'No'} → ${
      report.metrics.leftRecAfter ? 'Sí' : 'No'
    }`;
    metrics.appendChild(lrTag);

    head.appendChild(metrics);
    dom.assistantPanel.appendChild(head);

    // Metadatos del problema: tipo, celdas afectadas, producciones involucradas y técnica
    const metaGrid = document.createElement('div');
    metaGrid.className = 'assistant-meta-grid';

    // Card 1: Tipo de conflicto / problema detectado
    const cardType = document.createElement('div');
    cardType.className = 'assistant-card';
    const tType = document.createElement('h4');
    tType.className = 'assistant-card-title';
    tType.textContent = 'Tipo de conflicto detectado';
    cardType.appendChild(tType);
    const typeChips = document.createElement('div');
    typeChips.className = 'chips-list';
    (report.problemTypes.length > 0 ? report.problemTypes : ['Sin conflictos']).forEach((pt) => {
      const tg = document.createElement('span');
      tg.className = pt.includes('duplicada') ? 'tag tag-warn' : 'tag tag-error';
      tg.textContent = pt;
      typeChips.appendChild(tg);
    });
    cardType.appendChild(typeChips);
    metaGrid.appendChild(cardType);

    // Card 2: Celdas afectadas
    const cardCells = document.createElement('div');
    cardCells.className = 'assistant-card';
    const tCells = document.createElement('h4');
    tCells.className = 'assistant-card-title';
    tCells.textContent = 'Celdas afectadas de la matriz';
    cardCells.appendChild(tCells);
    if (report.affectedCells.length === 0) {
      const pEmpty = document.createElement('p');
      pEmpty.className = 'assistant-card-body field-hint';
      pEmpty.textContent = 'Sin celdas en conflicto directo en M[A, a].';
      cardCells.appendChild(pEmpty);
    } else {
      const cellsWrap = document.createElement('div');
      cellsWrap.className = 'chips-list';
      report.affectedCells.forEach((cell) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell-jump-btn';
        btn.textContent = `${cell.coord} (${cell.type})`;
        btn.addEventListener('click', () => focusMainMatrixCell(cell.row, cell.col));
        cellsWrap.appendChild(btn);
      });
      cardCells.appendChild(cellsWrap);
    }
    metaGrid.appendChild(cardCells);

    // Card 3: Técnica de corrección utilizada
    const cardTech = document.createElement('div');
    cardTech.className = 'assistant-card';
    const tTech = document.createElement('h4');
    tTech.className = 'assistant-card-title';
    tTech.textContent = 'Técnica de corrección utilizada';
    cardTech.appendChild(tTech);
    const techChips = document.createElement('div');
    techChips.className = 'chips-list';
    report.techniques.forEach((tech) => {
      const tg = document.createElement('span');
      tg.className = report.canApply ? 'tag tag-info' : 'tag tag-warn';
      tg.textContent = tech;
      techChips.appendChild(tg);
    });
    cardTech.appendChild(techChips);
    metaGrid.appendChild(cardTech);

    dom.assistantPanel.appendChild(metaGrid);

    // Explicación del problema + Producciones involucradas
    const detailGrid = document.createElement('div');
    detailGrid.className = 'assistant-compare-grid';

    const expCard = document.createElement('div');
    expCard.className = 'assistant-card';
    const expTitle = document.createElement('h4');
    expTitle.className = 'assistant-card-title';
    expTitle.textContent = 'Explicación del problema';
    expCard.appendChild(expTitle);
    const expBody = document.createElement('p');
    expBody.className = 'assistant-card-body';
    expBody.textContent = report.problemExplanation;
    expCard.appendChild(expBody);
    detailGrid.appendChild(expCard);

    const prodsCard = document.createElement('div');
    prodsCard.className = 'assistant-card';
    const prodsTitle = document.createElement('h4');
    prodsTitle.className = 'assistant-card-title';
    prodsTitle.textContent = 'Producciones involucradas';
    prodsCard.appendChild(prodsTitle);
    const prodsUl = document.createElement('ul');
    prodsUl.className = 'verdict-ul mono';
    (report.involvedProductions.length > 0
      ? report.involvedProductions
      : ['(ninguna producción específica)']).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      prodsUl.appendChild(li);
    });
    prodsCard.appendChild(prodsUl);
    detailGrid.appendChild(prodsCard);

    dom.assistantPanel.appendChild(detailGrid);

    // Comparativa: Gramática original vs Gramática corregida propuesta
    const compareGrid = document.createElement('div');
    compareGrid.className = 'assistant-compare-grid';

    const origCard = document.createElement('div');
    origCard.className = 'assistant-card';
    const origTitle = document.createElement('h4');
    origTitle.className = 'assistant-card-title';
    origTitle.textContent = 'Gramática original';
    origCard.appendChild(origTitle);
    const origPre = document.createElement('pre');
    origPre.className = 'grammar-code-box';
    origPre.textContent = report.originalGrammar;
    origCard.appendChild(origPre);
    compareGrid.appendChild(origCard);

    const propCard = document.createElement('div');
    propCard.className = 'assistant-card';
    const propTitle = document.createElement('h4');
    propTitle.className = 'assistant-card-title';
    propTitle.textContent = 'Gramática corregida propuesta';
    propCard.appendChild(propTitle);

    if (report.canApply && report.proposedGrammar) {
      const propPre = document.createElement('pre');
      propPre.id = 'assistant-proposed-grammar';
      propPre.className = 'grammar-code-box grammar-code-proposed';
      propPre.textContent = report.proposedGrammar;
      propCard.appendChild(propPre);
    } else {
      const fb = document.createElement('div');
      fb.id = 'assistant-fallback-msg';
      fb.className = 'assistant-fallback';
      fb.textContent = report.fallbackMessage || Assistant.SAFE_FALLBACK_MESSAGE;
      propCard.appendChild(fb);
    }
    compareGrid.appendChild(propCard);
    dom.assistantPanel.appendChild(compareGrid);

    // Aviso adicional si la corrección fue parcial
    if (report.outcome === 'PARTIAL' && report.fallbackMessage) {
      const partialNote = document.createElement('div');
      partialNote.className = 'assistant-fallback';
      partialNote.textContent = report.fallbackMessage;
      dom.assistantPanel.appendChild(partialNote);
    }

    // Explicación paso a paso de la transformación
    const stepsCard = document.createElement('div');
    stepsCard.className = 'assistant-card';
    const stepsTitle = document.createElement('h4');
    stepsTitle.className = 'assistant-card-title';
    stepsTitle.textContent = 'Explicación paso a paso de la transformación';
    stepsCard.appendChild(stepsTitle);
    const ol = document.createElement('ol');
    ol.className = 'assistant-steps-ol';
    report.steps.forEach((st) => {
      const li = document.createElement('li');
      li.textContent = st;
      ol.appendChild(li);
    });
    stepsCard.appendChild(ol);

    if (report.manualGuidance && report.manualGuidance.length > 0) {
      const gTitle = document.createElement('h4');
      gTitle.className = 'assistant-card-title';
      gTitle.style.marginTop = '0.55rem';
      gTitle.textContent = 'Orientación para revisión manual';
      stepsCard.appendChild(gTitle);

      const gUl = document.createElement('ul');
      gUl.className = 'verdict-ul';
      report.manualGuidance.forEach((g) => {
        const li = document.createElement('li');
        li.textContent = g;
        gUl.appendChild(li);
      });
      stepsCard.appendChild(gUl);
    }

    dom.assistantPanel.appendChild(stepsCard);

    // Botones de acción requeridos
    const actions = document.createElement('div');
    actions.className = 'assistant-actions';

    const btnApply = document.createElement('button');
    btnApply.type = 'button';
    btnApply.id = 'btn-assistant-apply';
    btnApply.className = 'btn btn-primary btn-sm';
    btnApply.textContent = 'Aplicar corrección y analizar';
    btnApply.disabled = !report.canApply || !report.proposedGrammar;
    btnApply.addEventListener('click', () => applyAssistantCorrection(report));
    actions.appendChild(btnApply);

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button';
    btnCopy.id = 'btn-assistant-copy';
    btnCopy.className = 'btn btn-secondary btn-sm';
    btnCopy.textContent = 'Copiar gramática corregida';
    btnCopy.disabled = !report.canApply || !report.proposedGrammar;
    btnCopy.addEventListener('click', () => {
      if (!report.proposedGrammar) return;
      copyPlainText(report.proposedGrammar, btnCopy, 'Copiada ✓');
    });
    actions.appendChild(btnCopy);

    const btnRestore = document.createElement('button');
    btnRestore.type = 'button';
    btnRestore.id = 'btn-assistant-restore';
    btnRestore.className = 'btn btn-secondary btn-sm';
    btnRestore.textContent = 'Restaurar gramática original';
    btnRestore.disabled =
      state.originalGrammarBeforeFix === null &&
      dom.grammarInput.value.trim() === report.originalGrammar.trim();
    btnRestore.addEventListener('click', () => restoreOriginalGrammar(report.originalGrammar));
    actions.appendChild(btnRestore);

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.id = 'btn-assistant-cancel';
    btnCancel.className = 'btn btn-ghost btn-sm';
    btnCancel.textContent = 'Cancelar';
    btnCancel.addEventListener('click', closeAssistantPanel);
    actions.appendChild(btnCancel);

    dom.assistantPanel.appendChild(actions);
  }

  function applyAssistantCorrection(report) {
    if (!report || !report.canApply || !report.proposedGrammar) return;

    // Guardar copia de la gramática original antes de aplicar
    if (state.originalGrammarBeforeFix === null) {
      state.originalGrammarBeforeFix = dom.grammarInput.value;
    }

    stopAutoPlay();
    dom.grammarInput.value = report.proposedGrammar;
    updateLineNumbers();

    const matched = Examples.list.find(
      (ex) => ex.gramatica.trim() === report.proposedGrammar.trim()
    );
    if (matched) {
      dom.exampleSelect.value = matched.id;
      updateExampleMeta(matched);
    } else {
      dom.exampleSelect.value = '__custom__';
      updateExampleMeta(null);
    }

    // Re-analizar: actualiza todas las pestañas y reinicia simulación y árbol de derivación
    analyzeCurrentGrammar();
  }

  function restoreOriginalGrammar(fallbackOriginal) {
    const targetText =
      state.originalGrammarBeforeFix !== null ? state.originalGrammarBeforeFix : fallbackOriginal;
    if (typeof targetText !== 'string') return;

    state.originalGrammarBeforeFix = null;
    stopAutoPlay();
    dom.grammarInput.value = targetText;
    updateLineNumbers();

    const matched = Examples.list.find((ex) => ex.gramatica.trim() === targetText.trim());
    if (matched) {
      dom.exampleSelect.value = matched.id;
      updateExampleMeta(matched);
    } else {
      dom.exampleSelect.value = '__custom__';
      updateExampleMeta(null);
    }

    analyzeCurrentGrammar();
  }

  function copyPlainText(text, buttonEl, successLabel) {
    const notify = () => {
      if (!buttonEl) return;
      const prev = buttonEl.textContent;
      buttonEl.textContent = successLabel || 'Copiado ✓';
      global.setTimeout(() => {
        buttonEl.textContent = prev;
      }, 1500);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(notify).catch(() => fallbackCopy(text, notify));
    } else {
      fallbackCopy(text, notify);
    }
  }

  /* ------------------------------------------------------------------------
     Renderizado: Pestaña 4 (Simulador paso a paso)
     ------------------------------------------------------------------------ */
  function setupSimulatorView(grammar, table) {
    stopAutoPlay();
    state.simResult = null;
    state.simStepIndex = 0;

    // Reiniciar siempre simulación previa y árbol de derivación
    dom.derivationBox.classList.add('hidden');
    dom.derivTreeView.innerHTML = '';
    dom.leftmostOl.innerHTML = '';
    dom.simTraceTbody.innerHTML = '';
    dom.stackVisual.innerHTML = '';
    dom.inputRibbon.innerHTML = '';
    dom.simResultBanner.classList.add('hidden');

    if (!table.isLL1) {
      dom.simBlockedBox.classList.remove('hidden');
      dom.simBlockedMsg.textContent = table.verdictSummary;
      dom.simActiveArea.classList.add('hidden');
      setSimulationControlsDisabled(true);
      return;
    }

    dom.simBlockedBox.classList.add('hidden');
    dom.simActiveArea.classList.remove('hidden');
    setSimulationControlsDisabled(false);

    updateTokenizeModeDesc();
    renderChainExampleButtons();
    renderSimLiveMatrix(grammar, table);

    if (state.currentExample && state.currentExample.cadenaInicial) {
      dom.chainInput.value = state.currentExample.cadenaInicial;
      updateTokenPreview();
      // Preparar paso inicial sin iniciar reproducción en segundo plano hasta que el usuario pulse "Simular"
      startSimulation({ autoPlay: false });
    } else {
      dom.chainInput.value = '';
      updateTokenPreview();
      dom.playbackBar.classList.add('hidden');
      dom.simResultBanner.classList.add('hidden');
      dom.simStage.classList.add('hidden');
    }
  }

  function updateTokenizeModeDesc() {
    if (state.tokenizeMode === 'auto') {
      dom.tokenizeModeDesc.textContent =
        'Activo: coincidencia del terminal más largo primero (ignora espacios).';
    } else {
      dom.tokenizeModeDesc.textContent =
        'Activo: los tokens deben escribirse separados por espacios.';
    }
  }

  function updateTokenPreview() {
    dom.tokenPreviewBar.innerHTML = '';
    dom.tokenPreviewBar.classList.remove('token-preview-error');
    if (!state.grammar) return;

    const tok = Parser.tokenizeInput(dom.chainInput.value, state.grammar, state.tokenizeMode);

    const lbl = document.createElement('span');
    lbl.className = 'field-label';
    lbl.textContent =
      state.tokenizeMode === 'auto' ? 'Tokens (automático):' : 'Tokens (por espacios):';
    dom.tokenPreviewBar.appendChild(lbl);

    if (!tok.ok) {
      dom.tokenPreviewBar.classList.add('token-preview-error');
      const err = document.createElement('span');
      err.textContent = tok.error;
      dom.tokenPreviewBar.appendChild(err);
      return;
    }

    if (tok.tokens.length === 0) {
      dom.tokenPreviewBar.appendChild(createSymChip(Grammar.EPSILON, 'eps'));
      const note = document.createElement('span');
      note.className = 'field-hint';
      note.textContent = '(cadena vacía)';
      dom.tokenPreviewBar.appendChild(note);
    } else {
      tok.tokens.forEach((t) => dom.tokenPreviewBar.appendChild(createSymChip(t, 'term')));
    }

    dom.tokenPreviewBar.appendChild(createSymChip(Grammar.EOF, 'eof'));
  }

  function renderChainExampleButtons() {
    dom.chainExamplesBtns.innerHTML = '';
    const ex = state.currentExample;

    if (!ex || !ex.cadenasEjemplo || ex.cadenasEjemplo.length === 0) {
      dom.chainExamplesRow.classList.add('hidden');
      return;
    }

    dom.chainExamplesRow.classList.remove('hidden');

    ex.cadenasEjemplo.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'example-chain-btn';
      if (item.esperada !== null && item.esperada !== undefined) {
        const dot = document.createElement('span');
        dot.className = `dot ${item.esperada ? 'dot-ok' : 'dot-err'}`;
        btn.appendChild(dot);
      }
      btn.appendChild(document.createTextNode(item.cadena));
      btn.addEventListener('click', () => {
        dom.chainInput.value = item.cadena;
        updateTokenPreview();
        startSimulation({ autoPlay: true });
      });
      dom.chainExamplesBtns.appendChild(btn);
    });

    // Botón adicional para probar la cadena vacía fácilmente
    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'example-chain-btn';
    emptyBtn.textContent = '"" (vacía)';
    emptyBtn.title = 'Probar cadena completamente vacía';
    emptyBtn.addEventListener('click', () => {
      dom.chainInput.value = '';
      updateTokenPreview();
      startSimulation({ autoPlay: true });
    });
    dom.chainExamplesBtns.appendChild(emptyBtn);
  }

  function startSimulation(options) {
    // Detener siempre cualquier temporizador anterior para evitar duplicados
    stopAutoPlay();

    const jumpToEnd =
      typeof options === 'boolean' ? options : Boolean(options && options.jumpToEnd);
    const autoPlay =
      typeof options === 'boolean' ? false : Boolean(options && options.autoPlay);

    if (!state.grammar || !state.table || !state.table.isLL1) {
      if (state.table && !state.table.isLL1) {
        dom.simBlockedBox.classList.remove('hidden');
        dom.simBlockedMsg.textContent = state.table.verdictSummary;
        dom.simActiveArea.classList.add('hidden');
      }
      setSimulationControlsDisabled(true);
      return;
    }

    updateTokenPreview();
    state.simSpeedMs = Number(dom.speedRange.value) || 600;

    const maxSteps = Number(dom.maxStepsInput.value) || Parser.DEFAULT_MAX_STEPS;
    const sim = Parser.simulate(state.grammar, state.table, dom.chainInput.value, {
      mode: state.tokenizeMode,
      maxSteps
    });

    if (sim.blocked) {
      dom.simBlockedBox.classList.remove('hidden');
      dom.simBlockedMsg.textContent = sim.blockReason;
      dom.simActiveArea.classList.add('hidden');
      setSimulationControlsDisabled(true);
      return;
    }

    state.simResult = sim;
    state.simStepIndex = jumpToEnd && sim.steps.length > 0 ? sim.steps.length - 1 : 0;

    dom.playbackBar.classList.remove('hidden');
    dom.simStage.classList.remove('hidden');
    renderCurrentStep();

    // Al pulsar "Simular", iniciar reproducción automática paso a paso si hay más de un paso
    if (autoPlay && !jumpToEnd && sim.steps.length > 1) {
      startAutoPlay();
    }
  }

  function renderCurrentStep() {
    const sim = state.simResult;
    if (!sim || !sim.steps || sim.steps.length === 0) return;

    const total = sim.steps.length;
    const idx = Math.max(0, Math.min(state.simStepIndex, total - 1));
    state.simStepIndex = idx;
    const step = sim.steps[idx];
    const isLast = idx === total - 1;

    dom.stepCounter.innerHTML = `Paso <strong>${step.stepNumber}</strong> / ${total}`;
    dom.btnStepReset.disabled = idx === 0;
    dom.btnStepPrev.disabled = idx === 0;
    dom.btnStepNext.disabled = isLast;
    dom.btnStepAll.disabled = isLast;
    dom.btnStepPlay.disabled = total <= 1;

    renderStackVisual(step.stackBefore);
    renderInputRibbon(step);
    renderCurrentAction(step);
    highlightSimMatrix(step);
    renderTraceTable(sim, idx);

    if (isLast) {
      stopAutoPlay();
      renderSimResultBanner(sim);
      if (sim.status === 'ACCEPTED' && sim.parseTree) {
        dom.derivationBox.classList.remove('hidden');
        renderParseTreeSVG(sim.parseTree);
        renderLeftmostDerivation(sim.leftmostDerivation, state.grammar);
      } else {
        dom.derivationBox.classList.add('hidden');
      }
    } else {
      dom.simResultBanner.classList.add('hidden');
      dom.derivationBox.classList.add('hidden');
    }
  }

  function renderStackVisual(stackArr) {
    dom.stackVisual.innerHTML = '';
    const ntSet = new Set(state.grammar.nonTerminals);

    for (let i = stackArr.length - 1; i >= 0; i--) {
      const sym = stackArr[i];
      const isTop = i === stackArr.length - 1;
      const isBottom = i === 0;

      const div = document.createElement('div');
      const kind = sym === Grammar.EOF ? 'eof' : ntSet.has(sym) ? 'nt' : 'term';
      div.className = `stack-item stack-item-${kind}${isTop ? ' stack-item-top' : ''}`;

      if (isTop) {
        const tag = document.createElement('span');
        tag.className = 'stack-tag';
        tag.textContent = 'TOPE';
        div.appendChild(tag);
      }

      div.appendChild(document.createTextNode(sym));

      if (isBottom) {
        const btm = document.createElement('span');
        btm.className = 'stack-bottom-tag';
        btm.textContent = 'fondo';
        div.appendChild(btm);
      }

      dom.stackVisual.appendChild(div);
    }
  }

  function renderInputRibbon(step) {
    dom.inputRibbon.innerHTML = '';
    step.inputTokens.forEach((tok, i) => {
      const cell = document.createElement('div');
      cell.className = 'ribbon-cell';
      if (i < step.inputIndex) cell.classList.add('ribbon-done');
      else if (i === step.inputIndex) cell.classList.add('ribbon-now');
      if (tok === Grammar.EOF) cell.classList.add('ribbon-eof');

      const box = document.createElement('span');
      box.className = 'ribbon-tok';
      box.textContent = tok;
      cell.appendChild(box);

      if (i === step.inputIndex) {
        const ptr = document.createElement('span');
        ptr.className = 'ribbon-ptr';
        ptr.textContent = '▲ actual';
        cell.appendChild(ptr);
      }

      dom.inputRibbon.appendChild(cell);
    });
  }

  function renderCurrentAction(step) {
    dom.currentActionCard.innerHTML = '';
    dom.currentActionCard.className = 'action-card';

    const tag = document.createElement('span');
    if (step.actionType === 'EXPAND') {
      dom.currentActionCard.classList.add('action-expand');
      tag.className = 'tag tag-info';
      tag.textContent = 'Expandir';
    } else if (step.actionType === 'MATCH') {
      dom.currentActionCard.classList.add('action-match');
      tag.className = 'tag tag-ok';
      tag.textContent = 'Emparejar';
    } else if (step.actionType === 'ACCEPT') {
      dom.currentActionCard.classList.add('action-accept');
      tag.className = 'tag tag-ok';
      tag.textContent = 'Aceptar';
    } else if (step.actionType === 'INCONCLUSIVE') {
      dom.currentActionCard.classList.add('action-inconclusive');
      tag.className = 'tag tag-warn';
      tag.textContent = 'Inconcluso';
    } else {
      dom.currentActionCard.classList.add('action-error');
      tag.className = 'tag tag-error';
      tag.textContent = 'Error';
    }

    dom.currentActionCard.appendChild(tag);
    const txt = document.createElement('span');
    txt.className = 'mono';
    txt.textContent = step.actionText;
    dom.currentActionCard.appendChild(txt);

    if (step.matrixCell) {
      dom.simCellIndicator.textContent = `Consulta: M[${step.matrixCell.row}, ${step.matrixCell.col}]`;
    } else if (step.actionType === 'MATCH') {
      dom.simCellIndicator.textContent = `Tope "${step.topSymbol}" == Entrada "${step.currentToken}"`;
    } else if (step.actionType === 'ACCEPT') {
      dom.simCellIndicator.textContent = 'Tope "$" == Entrada "$"';
    } else {
      dom.simCellIndicator.textContent = '';
    }
  }

  function renderSimLiveMatrix(grammar, table) {
    dom.simMatrixThead.innerHTML = '';
    dom.simMatrixTbody.innerHTML = '';

    const trH = document.createElement('tr');
    const c = document.createElement('th');
    c.className = 'matrix-corner';
    c.textContent = 'M[A, a]';
    trH.appendChild(c);

    table.columns.forEach((colSym) => {
      const th = document.createElement('th');
      th.dataset.col = colSym;
      th.appendChild(createSymChip(colSym, colSym === Grammar.EOF ? 'eof' : 'term'));
      trH.appendChild(th);
    });
    dom.simMatrixThead.appendChild(trH);

    table.rows.forEach((rowNt) => {
      const tr = document.createElement('tr');
      tr.dataset.row = rowNt;

      const rTh = document.createElement('th');
      rTh.className = 'matrix-row-th';
      rTh.dataset.row = rowNt;
      rTh.appendChild(createSymChip(rowNt, rowNt === grammar.startSymbol ? 'start' : 'nt'));
      tr.appendChild(rTh);

      table.columns.forEach((colSym) => {
        const entries = table.matrix[rowNt][colSym] || [];
        const td = document.createElement('td');
        td.className = 'matrix-cell';
        td.dataset.row = rowNt;
        td.dataset.col = colSym;

        if (entries.length === 0) {
          td.classList.add('matrix-cell-empty');
          const dash = document.createElement('span');
          dash.className = 'dash';
          dash.textContent = '—';
          td.appendChild(dash);
        } else {
          td.classList.add('matrix-cell-filled');
          const e = entries[0];
          const item = document.createElement('div');
          item.className = 'cell-prod';
          const num = document.createElement('span');
          num.className = 'cell-num';
          num.textContent = `#${e.production.index}`;
          item.appendChild(num);
          item.appendChild(document.createTextNode(e.production.text));
          td.appendChild(item);
        }

        tr.appendChild(td);
      });
      dom.simMatrixTbody.appendChild(tr);
    });
  }

  function clearSimMatrixHighlight() {
    [dom.simMatrixTable, dom.mainMatrixTable].forEach((tbl) => {
      if (!tbl) return;
      tbl.querySelectorAll('th, td').forEach((el) => {
        el.classList.remove('hl-row', 'hl-col', 'hl-th', 'sim-cell-active', 'sim-cell-error');
      });
    });
  }

  function highlightSimMatrix(step) {
    clearSimMatrixHighlight();
    if (!step.matrixCell) return;

    const { row, col } = step.matrixCell;
    const isErr = step.actionType === 'ERROR';

    const mark = (thead, tbody) => {
      if (!thead || !tbody) return;
      thead.querySelectorAll('th[data-col]').forEach((th) => {
        if (th.dataset.col === col) th.classList.add('hl-th');
      });
      tbody.querySelectorAll('tr').forEach((tr) => {
        const isRow = tr.dataset.row === row;
        const rTh = tr.querySelector('th.matrix-row-th');
        if (isRow && rTh) rTh.classList.add('hl-th');
        tr.querySelectorAll('td.matrix-cell').forEach((td) => {
          const isCol = td.dataset.col === col;
          if (isRow) td.classList.add('hl-row');
          if (isCol) td.classList.add('hl-col');
          if (isRow && isCol) td.classList.add(isErr ? 'sim-cell-error' : 'sim-cell-active');
        });
      });
    };

    mark(dom.simMatrixThead, dom.simMatrixTbody);
    mark(dom.mainMatrixThead, dom.mainMatrixTbody);
  }

  function renderTraceTable(sim, activeIdx) {
    dom.simTraceTbody.innerHTML = '';

    for (let i = 0; i <= activeIdx; i++) {
      const st = sim.steps[i];
      const tr = document.createElement('tr');
      if (i === activeIdx) {
        if (st.actionType === 'ACCEPT') tr.classList.add('trace-row-ok');
        else if (st.actionType === 'ERROR') tr.classList.add('trace-row-err');
        else if (st.actionType === 'INCONCLUSIVE') tr.classList.add('trace-row-warn');
        else tr.classList.add('trace-row-now');
      }

      const tdStep = document.createElement('td');
      tdStep.className = 'col-num';
      const idxBadge = document.createElement('span');
      idxBadge.className = 'prod-idx';
      idxBadge.textContent = String(st.stepNumber);
      tdStep.appendChild(idxBadge);

      const tdStack = document.createElement('td');
      tdStack.className = 'mono-nowrap';
      if (st.stackBefore.length > 1) {
        tdStack.appendChild(document.createTextNode(st.stackBefore.slice(0, -1).join(' ') + ' '));
      }
      const topSpan = document.createElement('span');
      topSpan.className = 'top-accent';
      topSpan.textContent = st.stackBefore[st.stackBefore.length - 1] || '';
      tdStack.appendChild(topSpan);

      const tdInput = document.createElement('td');
      tdInput.className = 'mono-nowrap';
      const curSpan = document.createElement('span');
      curSpan.className = 'top-accent';
      curSpan.textContent = st.remainingInput[0] || '';
      tdInput.appendChild(curSpan);
      if (st.remainingInput.length > 1) {
        tdInput.appendChild(document.createTextNode(' ' + st.remainingInput.slice(1).join(' ')));
      }

      const tdAction = document.createElement('td');
      tdAction.className = 'mono';
      tdAction.textContent = st.actionText;

      tr.appendChild(tdStep);
      tr.appendChild(tdStack);
      tr.appendChild(tdInput);
      tr.appendChild(tdAction);

      tr.addEventListener('click', () => {
        stopAutoPlay();
        state.simStepIndex = i;
        renderCurrentStep();
      });

      dom.simTraceTbody.appendChild(tr);
    }

    const scroll = dom.simTraceTbody.closest('.trace-table-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  function renderSimResultBanner(sim) {
    dom.simResultBanner.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'sim-result-title';
    const msg = document.createElement('p');
    msg.className = 'sim-result-msg';

    if (sim.status === 'ACCEPTED') {
      dom.simResultBanner.className = 'sim-result sim-result-ok';
      title.textContent = 'CADENA ACEPTADA ✅';
      const display = sim.tokens.length > 0 ? sim.tokens.join(' ') : Grammar.EPSILON;
      msg.textContent = `La cadena "${display}" pertenece al lenguaje de la gramática (${sim.steps.length} paso(s)).`;
    } else if (sim.status === 'INCONCLUSIVE') {
      dom.simResultBanner.className = 'sim-result sim-result-warn';
      title.textContent = 'ANÁLISIS INCONCLUSO';
      msg.textContent =
        sim.inconclusiveReason ||
        'La simulación se detuvo por seguridad sin concluir aceptación ni rechazo.';
    } else {
      dom.simResultBanner.className = 'sim-result sim-result-err';
      title.textContent = 'CADENA RECHAZADA ❌';
      msg.textContent = `Motivo: ${sim.errorReason || 'Error sintáctico.'}`;
    }

    dom.simResultBanner.appendChild(title);
    dom.simResultBanner.appendChild(msg);
  }

  /* ------------------------------------------------------------------------
     Reproducción automática
     ------------------------------------------------------------------------ */
  function toggleAutoPlay() {
    if (state.simTimer) stopAutoPlay();
    else startAutoPlay();
  }

  function startAutoPlay() {
    // Garantizar que nunca existan dos temporizadores simultáneos
    stopAutoPlay();

    if (!state.simResult || state.simResult.steps.length <= 1) return;

    if (state.simStepIndex >= state.simResult.steps.length - 1) {
      state.simStepIndex = 0;
      renderCurrentStep();
    }

    state.simSpeedMs = Number(dom.speedRange.value) || 600;
    dom.btnStepPlay.textContent = 'Pausar';
    dom.btnStepPlay.setAttribute('aria-pressed', 'true');
    dom.btnStepPlay.disabled = false;

    state.simTimer = global.setInterval(() => {
      if (!state.simResult || state.simStepIndex >= state.simResult.steps.length - 1) {
        stopAutoPlay();
        return;
      }
      state.simStepIndex += 1;
      renderCurrentStep();
    }, state.simSpeedMs);
  }

  function stopAutoPlay() {
    if (state.simTimer !== null) {
      global.clearInterval(state.simTimer);
      state.simTimer = null;
    }
    if (dom.btnStepPlay) {
      dom.btnStepPlay.textContent = 'Reproducir';
      dom.btnStepPlay.setAttribute('aria-pressed', 'false');
    }
  }

  /* ------------------------------------------------------------------------
     Exportación CSV y Portapapeles
     ------------------------------------------------------------------------ */
  function exportTraceCSV() {
    if (!state.simResult) return;
    const csv = Parser.traceToCSV(state.simResult);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'syntaxlens-traza-ll1.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyTraceToClipboard() {
    if (!state.simResult) return;
    const text = Parser.traceToMarkdown(state.simResult);
    const notify = () => {
      const prev = dom.btnCopyTrace.textContent;
      dom.btnCopyTrace.textContent = 'Copiado ✓';
      global.setTimeout(() => {
        dom.btnCopyTrace.textContent = prev;
      }, 1500);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(notify).catch(() => fallbackCopy(text, notify));
    } else {
      fallbackCopy(text, notify);
    }
  }

  function fallbackCopy(text, onDone) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (onDone) onDone();
    } catch (_) {
      // Ignorar si falla la copia
    }
    document.body.removeChild(ta);
  }

  /* ------------------------------------------------------------------------
     Árbol de derivación (SVG) y derivación por la izquierda
     ------------------------------------------------------------------------ */
  function renderParseTreeSVG(rootNode) {
    dom.derivTreeView.innerHTML = '';
    if (!rootNode) return;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const H_GAP = 66;
    const V_GAP = 60;
    const PAD_X = 44;
    const PAD_Y = 30;
    const NODE_H = 28;

    let leafCursor = 0;
    let maxDepth = 0;
    const nodes = [];
    const edges = [];

    function layout(node, depth) {
      if (depth > maxDepth) maxDepth = depth;
      const y = PAD_Y + depth * V_GAP;
      let x;

      if (!node.children || node.children.length === 0) {
        x = PAD_X + leafCursor * H_GAP;
        leafCursor += 1;
      } else {
        const childPos = node.children.map((ch) => layout(ch, depth + 1));
        x = (childPos[0].x + childPos[childPos.length - 1].x) / 2;
        childPos.forEach((c) => {
          edges.push({ x1: x, y1: y + NODE_H / 2, x2: c.x, y2: c.y - NODE_H / 2 });
        });
      }

      const width = Math.max(36, node.symbol.length * 9 + 18);
      const info = { node, x, y, width, height: NODE_H };
      nodes.push(info);
      return info;
    }

    layout(rootNode, 0);

    const w = Math.max(220, PAD_X * 2 + Math.max(0, leafCursor - 1) * H_GAP);
    const h = PAD_Y * 2 + maxDepth * V_GAP + NODE_H;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Árbol de derivación sintáctica');

    edges.forEach((e) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'tree-edge');
      line.setAttribute('x1', String(e.x1));
      line.setAttribute('y1', String(e.y1));
      line.setAttribute('x2', String(e.x2));
      line.setAttribute('y2', String(e.y2));
      svg.appendChild(line);
    });

    nodes.forEach((item) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute(
        'class',
        item.node.isEpsilon ? 'tree-eps' : item.node.isTerminal ? 'tree-term' : 'tree-nt'
      );

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(item.x - item.width / 2));
      rect.setAttribute('y', String(item.y - item.height / 2));
      rect.setAttribute('width', String(item.width));
      rect.setAttribute('height', String(item.height));
      rect.setAttribute('rx', '5');
      g.appendChild(rect);

      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('class', 'tree-text');
      txt.setAttribute('x', String(item.x));
      txt.setAttribute('y', String(item.y));
      txt.textContent = item.node.symbol;
      g.appendChild(txt);

      svg.appendChild(g);
    });

    dom.derivTreeView.appendChild(svg);
  }

  function renderLeftmostDerivation(derivation, grammar) {
    dom.leftmostOl.innerHTML = '';
    const ntSet = new Set(grammar.nonTerminals);

    derivation.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'leftmost-li';

      const form = document.createElement('div');
      form.className = 'leftmost-form';

      if (idx > 0) {
        const arr = document.createElement('span');
        arr.className = 'rule-chip';
        arr.textContent = '⇒';
        form.appendChild(arr);
      }

      if (item.form.length === 0) {
        form.appendChild(createSymChip(Grammar.EPSILON, 'eps'));
      } else {
        item.form.forEach((sym) => {
          form.appendChild(createSymChip(sym, ntSet.has(sym) ? 'nt' : 'term'));
        });
      }

      const meta = document.createElement('span');
      meta.className = 'field-hint';
      meta.textContent = item.production
        ? `(#${item.production.index}) ${item.production.text}`
        : 'Símbolo inicial';

      li.appendChild(form);
      li.appendChild(meta);
      dom.leftmostOl.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------------
     Ejecución y renderizado de pruebas desde la UI
     ------------------------------------------------------------------------ */
  function runAndRenderTests() {
    if (!global.SyntaxLens.Tests || typeof global.SyntaxLens.Tests.run !== 'function') return;

    const report = global.SyntaxLens.Tests.run();
    dom.testsSummaryText.textContent = `Resultado: ${report.passed} PASS, ${report.failed} FAIL de ${report.total} pruebas ejecutadas sobre el motor real.`;

    dom.testsTbody.innerHTML = '';
    report.results.forEach((r, idx) => {
      const tr = document.createElement('tr');

      const tdIdx = document.createElement('td');
      tdIdx.className = 'col-num mono';
      tdIdx.textContent = String(idx + 1);

      const tdStatus = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = `tag ${r.status === 'PASS' ? 'tag-ok' : 'tag-error'}`;
      tag.textContent = r.status;
      tdStatus.appendChild(tag);

      const tdGroup = document.createElement('td');
      tdGroup.textContent = r.group;

      const tdName = document.createElement('td');
      tdName.textContent = r.name;

      const tdDetail = document.createElement('td');
      tdDetail.className = 'mono';
      tdDetail.textContent = r.detail;

      tr.appendChild(tdIdx);
      tr.appendChild(tdStatus);
      tr.appendChild(tdGroup);
      tr.appendChild(tdName);
      tr.appendChild(tdDetail);
      dom.testsTbody.appendChild(tr);
    });

    dom.testsDrawer.classList.remove('hidden');
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.UI = {
    state,
    STALE_NOTICE,
    setActiveTab,
    invalidateResults,
    analyzeCurrentGrammar,
    startSimulation,
    runAndRenderTests
  };

  document.addEventListener('DOMContentLoaded', init);
})(window);
