/**
 * table.js
 * Construcción genérica de la matriz predictiva LL(1), detección de conflictos
 * (FIRST/FIRST, FIRST/FOLLOW, FOLLOW/FOLLOW), detección de recursividad izquierda
 * (directa, indirecta y por prefijos anulables) y falta de factorización izquierda.
 */

(function (global) {
  'use strict';

  const EPSILON = 'ε';
  const EOF = '$';

  /**
   * Construye la matriz predictiva LL(1) M[A, a] y emite el diagnóstico completo.
   * @param {Object} grammar Resultado válido de Grammar.parseGrammar().
   * @param {Object} sets Resultado de Sets.computeAllSets(grammar).
   * @returns {Object}
   */
  function buildParsingTable(grammar, sets) {
    const rows = [...grammar.nonTerminals];
    // Columnas: únicamente terminales (sin ε) y "$" al final
    const columns = grammar.terminals.filter((t) => t !== EPSILON && t !== EOF).concat([EOF]);

    // Inicializar matriz vacía: matrix[A][col] = []
    const matrix = {};
    rows.forEach((nt) => {
      matrix[nt] = {};
      columns.forEach((col) => {
        matrix[nt][col] = [];
      });
    });

    /**
     * Inserta una producción en M[A, terminal].
     * Si la misma producción ya fue insertada en esa celda, NO crea conflicto;
     * únicamente añade el origen y motivo adicional para el tooltip.
     */
    function addCellEntry(nonTerminal, terminal, prod, source, symbolCause, reason) {
      if (terminal === EPSILON) return;
      if (!matrix[nonTerminal] || !matrix[nonTerminal][terminal]) return;

      const cell = matrix[nonTerminal][terminal];
      const existing = cell.find((entry) => entry.production.index === prod.index);
      if (existing) {
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
        if (!existing.reasons.includes(reason)) {
          existing.reasons.push(reason);
        }
        existing.insertions.push({ source, symbol: symbolCause, reason });
      } else {
        cell.push({
          production: prod,
          sources: [source],
          reasons: [reason],
          insertions: [{ source, symbol: symbolCause, reason }]
        });
      }
    }

    // Aplicar las dos reglas clásicas de construcción de la matriz LL(1)
    sets.productionFirst.forEach((pf) => {
      const prod = grammar.productions[pf.index - 1];
      const A = prod.lhs;
      const rhsText = prod.rhs.join(' ');

      // Regla 1: Para cada terminal a ∈ FIRST(α), excepto ε -> M[A, a] = A → α
      pf.symbols.forEach((sym) => {
        if (sym === EPSILON) return;
        const reason = `${sym} ∈ FIRST(${rhsText})`;
        addCellEntry(A, sym, prod, 'FIRST', sym, reason);
      });

      // Regla 2: Si ε ∈ FIRST(α), para cada b ∈ FOLLOW(A) (incluyendo $) -> M[A, b] = A → α
      if (pf.nullable) {
        const followA = sets.follow[A] || [];
        followA.forEach((b) => {
          if (b === EPSILON) return;
          const reason = prod.isEpsilon
            ? `ε ∈ FIRST(${EPSILON}) y ${b} ∈ FOLLOW(${A})`
            : `ε ∈ FIRST(${rhsText}) y ${b} ∈ FOLLOW(${A})`;
          addCellEntry(A, b, prod, 'FOLLOW', b, reason);
        });
      }
    });

    // 1. Identificar conflictos de celdas (> 1 producción distinta)
    const conflicts = [];
    rows.forEach((A) => {
      columns.forEach((col) => {
        const entries = matrix[A][col];
        if (entries.length > 1) {
          const type = classifyCellConflict(entries);
          conflicts.push({
            nonTerminal: A,
            terminal: col,
            type,
            entries,
            productions: entries.map((e) => e.production),
            explanation: buildConflictExplanation(A, col, type, entries)
          });
        }
      });
    });

    // 2. Detectar recursividad izquierda (directa, indirecta y vía prefijos anulables)
    const leftRecursion = detectLeftRecursion(grammar, sets.firstSets);

    // 3. Detectar posible falta de factorización izquierda
    const leftFactoringIssues = detectLeftFactoringIssues(grammar, conflicts);

    // 4. Determinar si la gramática es LL(1)
    const isLL1 = conflicts.length === 0 && !leftRecursion.hasAny;

    // 5. Diagnósticos, sugerencias y veredicto
    const diagnostics = buildDiagnostics(conflicts, leftRecursion, leftFactoringIssues);
    const suggestions = buildSuggestions(conflicts, leftRecursion, leftFactoringIssues);

    let filledCells = 0;
    rows.forEach((A) => {
      columns.forEach((col) => {
        if (matrix[A][col].length > 0) filledCells += 1;
      });
    });

    const totalProblems = conflicts.length + (conflicts.length === 0 && leftRecursion.hasAny ? 1 : 0);
    const bannerText = isLL1
      ? 'Gramática LL(1) válida · 0 conflictos'
      : conflicts.length > 0
      ? `Gramática NO es LL(1) · ${conflicts.length} conflicto${conflicts.length === 1 ? '' : 's'}`
      : `Gramática NO es LL(1) · recursividad izquierda detectada`;

    return {
      rows,
      columns,
      matrix,
      conflicts,
      leftRecursion,
      leftFactoringIssues,
      isLL1,
      bannerText,
      verdictTitle: isLL1 ? 'La gramática SÍ es LL(1)' : 'La gramática NO es LL(1)',
      verdictSummary: buildVerdictSummary(isLL1, conflicts, leftRecursion),
      diagnostics,
      suggestions,
      stats: {
        totalCells: rows.length * columns.length,
        filledCells,
        conflictCells: conflicts.length,
        totalProblems
      }
    };
  }

  /**
   * Clasifica el conflicto de una celda según la procedencia (FIRST / FOLLOW)
   * de las producciones en pugna.
   */
  function classifyCellConflict(entries) {
    let firstCount = 0;
    let followCount = 0;

    entries.forEach((entry) => {
      if (entry.sources.includes('FIRST')) firstCount += 1;
      if (entry.sources.includes('FOLLOW')) followCount += 1;
    });

    if (firstCount > 1 && followCount > 0) return 'FIRST/FIRST y FIRST/FOLLOW';
    if (firstCount > 0 && followCount > 0) return 'FIRST/FOLLOW';
    if (firstCount > 1) return 'FIRST/FIRST';
    return 'FOLLOW/FOLLOW';
  }

  function buildConflictExplanation(A, col, type, entries) {
    const prodsStr = entries
      .map((e) => `(#${e.production.index}) ${e.production.text}`)
      .join(' y ');

    if (type === 'FIRST/FIRST') {
      return `En M[${A}, ${col}] compiten ${prodsStr} porque "${col}" pertenece a FIRST de más de una alternativa de ${A}.`;
    }
    if (type === 'FIRST/FOLLOW') {
      return `En M[${A}, ${col}] compiten ${prodsStr}: una alternativa inicia con "${col}" (vía FIRST) y otra deriva ${EPSILON} usando "${col}" ∈ FOLLOW(${A}).`;
    }
    if (type === 'FOLLOW/FOLLOW') {
      return `En M[${A}, ${col}] compiten ${prodsStr} porque varias alternativas anulables de ${A} coinciden sobre "${col}" ∈ FOLLOW(${A}).`;
    }
    return `En M[${A}, ${col}] confluyen ${prodsStr} por intersección en FIRST y por anulabilidad con FOLLOW(${A}).`;
  }

  /**
   * Detecta recursividad izquierda directa e indirecta, incluyendo casos donde
   * un prefijo anulable permite alcanzar la recursividad (ej. A -> B A con B ⇒* ε).
   */
  function detectLeftRecursion(grammar, firstSets) {
    const ntSet = new Set(grammar.nonTerminals);
    const direct = [];
    const directKeys = new Set();
    const adj = {};

    grammar.nonTerminals.forEach((nt) => {
      adj[nt] = [];
    });

    grammar.productions.forEach((prod) => {
      if (prod.isEpsilon) return;
      const A = prod.lhs;

      for (let i = 0; i < prod.rhs.length; i++) {
        const sym = prod.rhs[i];
        if (!ntSet.has(sym)) {
          break;
        }

        const nullablePrefix = prod.rhs.slice(0, i);
        const viaNullablePrefix = i > 0;

        if (sym === A) {
          const key = `${A}#${prod.index}`;
          if (!directKeys.has(key)) {
            directKeys.add(key);
            direct.push({
              nonTerminal: A,
              production: prod,
              viaNullablePrefix,
              nullablePrefix,
              cycleText: `${A} ⇒ ${A}`
            });
          }
        } else {
          adj[A].push({
            to: sym,
            production: prod,
            viaNullablePrefix,
            nullablePrefix
          });
        }

        const symFirst = firstSets[sym];
        if (!symFirst || !symFirst.has(EPSILON)) {
          break;
        }
      }
    });

    // Búsqueda de ciclos de longitud >= 2 para recursividad izquierda indirecta
    const indirect = [];
    const seenCycles = new Set();

    grammar.nonTerminals.forEach((startNt) => {
      const pathNodes = [startNt];
      const pathProds = [];
      const pathNullable = [];
      const visited = new Set([startNt]);

      function dfs(current) {
        const edges = adj[current] || [];
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const next = edge.to;

          if (next === startNt && pathNodes.length >= 2) {
            const sig = canonicalizeCycle(pathNodes);
            if (!seenCycles.has(sig)) {
              seenCycles.add(sig);
              const cycle = [...pathNodes, startNt];
              indirect.push({
                cycle,
                cycleText: cycle.join(' ⇒ '),
                productions: [...pathProds, edge.production],
                viaNullablePrefix: pathNullable.some(Boolean) || edge.viaNullablePrefix
              });
            }
          } else if (!visited.has(next)) {
            visited.add(next);
            pathNodes.push(next);
            pathProds.push(edge.production);
            pathNullable.push(edge.viaNullablePrefix);
            dfs(next);
            pathNullable.pop();
            pathProds.pop();
            pathNodes.pop();
            visited.delete(next);
          }
        }
      }

      dfs(startNt);
    });

    return {
      direct,
      indirect,
      hasAny: direct.length > 0 || indirect.length > 0
    };
  }

  function canonicalizeCycle(nodes) {
    if (nodes.length === 0) return '';
    let minIdx = 0;
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i] < nodes[minIdx]) minIdx = i;
    }
    return [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)].join('⇒');
  }

  /**
   * Detecta producciones del mismo no terminal que comparten un prefijo común
   * (posible falta de factorización izquierda).
   */
  function detectLeftFactoringIssues(grammar, conflicts) {
    const issues = [];
    const ntsWithExplicit = new Set();

    grammar.nonTerminals.forEach((A) => {
      const prods = grammar.productionsByLhs[A] || [];
      const groups = {};

      prods.forEach((p) => {
        if (p.isEpsilon || p.rhs.length === 0) return;
        const firstSym = p.rhs[0];
        if (firstSym === A) return; // Recursividad directa pura
        if (!groups[firstSym]) groups[firstSym] = [];
        groups[firstSym].push(p);
      });

      Object.keys(groups).forEach((firstSym) => {
        const group = groups[firstSym];
        if (group.length > 1) {
          const commonPrefix = findLongestCommonPrefix(group.map((p) => p.rhs));
          ntsWithExplicit.add(A);
          issues.push({
            kind: 'explicit',
            nonTerminal: A,
            prefix: commonPrefix,
            productions: group,
            description: `El no terminal "${A}" tiene ${group.length} producciones con prefijo común "${commonPrefix.join(' ')}" (${group.map((p) => `(#${p.index}) ${p.text}`).join(', ')}).`
          });
        }
      });
    });

    // Conflictos FIRST/FIRST sin prefijo explícito igual (prefijo común indirecto)
    const indirectByNt = {};
    conflicts.forEach((c) => {
      if (c.type.includes('FIRST/FIRST') && !ntsWithExplicit.has(c.nonTerminal)) {
        const hasDirectLeftRec = c.productions.some(
          (p) => !p.isEpsilon && p.rhs[0] === c.nonTerminal
        );
        if (hasDirectLeftRec) return;

        if (!indirectByNt[c.nonTerminal]) {
          indirectByNt[c.nonTerminal] = {
            nonTerminal: c.nonTerminal,
            terminals: new Set(),
            prodsMap: new Map()
          };
        }
        indirectByNt[c.nonTerminal].terminals.add(c.terminal);
        c.productions.forEach((p) => indirectByNt[c.nonTerminal].prodsMap.set(p.index, p));
      }
    });

    Object.values(indirectByNt).forEach((info) => {
      const prods = Array.from(info.prodsMap.values());
      const terms = Array.from(info.terminals);
      issues.push({
        kind: 'indirect',
        nonTerminal: info.nonTerminal,
        prefix: [],
        productions: prods,
        description: `El no terminal "${info.nonTerminal}" tiene intersección en FIRST sobre { ${terms.join(', ')} } entre producciones con distinto primer símbolo (${prods.map((p) => `(#${p.index}) ${p.text}`).join(', ')}).`
      });
    });

    return issues;
  }

  function findLongestCommonPrefix(lists) {
    if (!lists || lists.length === 0) return [];
    const prefix = [];
    const minLen = Math.min(...lists.map((l) => l.length));
    for (let i = 0; i < minLen; i++) {
      const sym = lists[0][i];
      if (lists.every((l) => l[i] === sym)) {
        prefix.push(sym);
      } else {
        break;
      }
    }
    return prefix;
  }

  function buildDiagnostics(conflicts, leftRecursion, leftFactoringIssues) {
    const diagnostics = [];

    leftRecursion.direct.forEach((item) => {
      const prefixNote = item.viaNullablePrefix
        ? ` a través del prefijo anulable "${item.nullablePrefix.join(' ')}"`
        : '';
      diagnostics.push({
        category: 'Recursividad izquierda directa',
        severity: 'error',
        detail: `Ciclo ${item.cycleText} en (#${item.production.index}) ${item.production.text}${prefixNote}.`
      });
    });

    leftRecursion.indirect.forEach((item) => {
      const prodsStr = item.productions.map((p) => `(#${p.index}) ${p.text}`).join(' ; ');
      const nullNote = item.viaNullablePrefix ? ' (involucra prefijo anulable)' : '';
      diagnostics.push({
        category: 'Recursividad izquierda indirecta',
        severity: 'error',
        detail: `Ciclo detectado: ${item.cycleText}${nullNote} mediante ${prodsStr}.`
      });
    });

    leftFactoringIssues.forEach((issue) => {
      diagnostics.push({
        category:
          issue.kind === 'explicit'
            ? 'Falta de factorización izquierda'
            : 'Posible factorización izquierda',
        severity: 'warn',
        detail: issue.description
      });
    });

    const ffCount = conflicts.filter((c) => c.type.includes('FIRST/FIRST')).length;
    const ffolCount = conflicts.filter((c) => c.type.includes('FIRST/FOLLOW')).length;
    const folfolCount = conflicts.filter((c) => c.type === 'FOLLOW/FOLLOW').length;

    if (ffCount > 0) {
      diagnostics.push({
        category: 'Conflicto FIRST/FIRST',
        severity: 'error',
        detail: `${ffCount} celda(s) donde múltiples alternativas entran por FIRST.`
      });
    }
    if (ffolCount > 0) {
      diagnostics.push({
        category: 'Conflicto FIRST/FOLLOW',
        severity: 'error',
        detail: `${ffolCount} celda(s) donde una alternativa entra por FIRST y otra anulable (ε) entra por FOLLOW.`
      });
    }
    if (folfolCount > 0) {
      diagnostics.push({
        category: 'Conflicto FOLLOW/FOLLOW',
        severity: 'error',
        detail: `${folfolCount} celda(s) donde dos producciones anulables del mismo no terminal coinciden en FOLLOW.`
      });
    }

    return diagnostics;
  }

  function buildSuggestions(conflicts, leftRecursion, leftFactoringIssues) {
    const suggestions = [];

    if (leftRecursion.direct.length > 0) {
      const nts = [...new Set(leftRecursion.direct.map((d) => d.nonTerminal))].join(', ');
      suggestions.push(
        `Eliminar la recursividad izquierda directa en ${nts}: transformar "A → A α | β" en "A → β A'" y "A' → α A' | ε".`
      );
    }

    if (leftRecursion.indirect.length > 0) {
      const cycles = leftRecursion.indirect.map((c) => c.cycleText).join(', ');
      suggestions.push(
        `Eliminar la recursividad izquierda indirecta (${cycles}): ordenar los no terminales, sustituir las derivaciones hacia no terminales previos para convertir el ciclo en recursividad directa y luego eliminarla.`
      );
    }

    if (leftFactoringIssues.length > 0) {
      const explicit = leftFactoringIssues
        .filter((i) => i.kind === 'explicit')
        .map((i) => `${i.nonTerminal} (prefijo "${i.prefix.join(' ')}")`);

      if (explicit.length > 0) {
        suggestions.push(
          `Factorizar por la izquierda en ${explicit.join(', ')}: agrupar "A → α β₁ | α β₂" como "A → α A'" y "A' → β₁ | β₂".`
        );
      } else {
        suggestions.push(
          'Sustituir el primer no terminal de las alternativas en conflicto para exponer el prefijo común y aplicar factorización por la izquierda.'
        );
      }
    }

    const hasFirstFollow = conflicts.some(
      (c) => c.type.includes('FIRST/FOLLOW') || c.type === 'FOLLOW/FOLLOW'
    );
    if (hasFirstFollow) {
      suggestions.push(
        'Resolver conflictos FIRST/FOLLOW: revisar si la gramática es ambigua o reestructurar las reglas anulables para que FIRST(α) y FOLLOW(A) sean disjuntos.'
      );
    }

    return suggestions;
  }

  function buildVerdictSummary(isLL1, conflicts, leftRecursion) {
    if (isLL1) {
      return 'Todas las celdas de la matriz tienen a lo sumo una producción y no existe recursividad izquierda. Lista para el simulador predictivo LL(1).';
    }

    const parts = [];
    if (conflicts.length > 0) {
      parts.push(`${conflicts.length} celda(s) en conflicto`);
    }
    if (leftRecursion.direct.length > 0) {
      parts.push('recursividad izquierda directa');
    }
    if (leftRecursion.indirect.length > 0) {
      parts.push('recursividad izquierda indirecta');
    }
    return `Se detectó ${parts.join(', ')}. Con 1 símbolo de adelanto el analizador no puede elegir deterministamente.`;
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Table = {
    buildParsingTable,
    detectLeftRecursion,
    detectLeftFactoringIssues
  };
})(typeof window !== 'undefined' ? window : globalThis);
