/**
 * grammar.js
 * Parseo, normalización y validación de gramáticas libres de contexto (GLC)
 * para SyntaxLens LL(1).
 *
 * Convenciones:
 * - Una producción por línea con "->" o "→".
 * - Alternativas separadas por "|".
 * - Epsilon puede escribirse como "ε", "eps" o "epsilon".
 * - Símbolos de la parte derecha separados por espacios.
 * - Un símbolo es no terminal si aparece al lado izquierdo de alguna producción;
 *   el resto se clasifica como terminal.
 * - El primer no terminal es el símbolo inicial.
 * - "$" está reservado exclusivamente para fin de entrada.
 */

(function (global) {
  'use strict';

  const EPSILON = 'ε';
  const EOF = '$';
  const EPSILON_ALIASES = new Set(['ε', 'eps', 'epsilon']);

  /**
   * Comprueba si un token equivale a epsilon (ε, eps o epsilon).
   */
  function isEpsilonToken(token) {
    return typeof token === 'string' && EPSILON_ALIASES.has(token.toLowerCase());
  }

  /**
   * Heurística didáctica: detecta símbolos en la parte derecha que tienen
   * apariencia de no terminal (empiezan en mayúscula o terminan en comilla ').
   */
  function looksLikeNonTerminal(symbol) {
    if (!symbol) return false;
    if (symbol.endsWith("'")) return true;
    return /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9_']*$/.test(symbol);
  }

  /**
   * Formatea una producción con flecha Unicode legible.
   */
  function formatProduction(lhs, rhs) {
    return `${lhs} → ${rhs.join(' ')}`;
  }

  /**
   * Parsea y valida el texto de entrada de una gramática.
   * @param {string} rawText Texto ingresado por el usuario.
   * @returns {Object} Estructura con estado, errores, advertencias, símbolos y producciones.
   */
  function parseGrammar(rawText) {
    const errors = [];
    const warnings = [];
    const rawEntries = [];

    // Caso específico: gramática vacía
    if (typeof rawText !== 'string' || rawText.trim().length === 0) {
      errors.push({
        line: null,
        code: 'EMPTY_GRAMMAR',
        message: 'Escribe al menos una producción.'
      });
      return buildEmptyResult(errors, warnings, true);
    }

    const lines = rawText.split(/\r?\n/);
    const nonTerminalOrder = [];
    const nonTerminalSet = new Set();
    const seenProductionKeys = new Set();
    const duplicateProductions = [];

    // Fase 1: Validar cada línea no vacía conservando su número de línea real
    lines.forEach((originalLine, idx) => {
      const lineNumber = idx + 1;
      const trimmed = originalLine.trim();

      // Ignorar líneas vacías y espacios sobrantes
      if (trimmed.length === 0) {
        return;
      }

      const arrowMatches = trimmed.match(/->|→/g);
      if (!arrowMatches) {
        errors.push({
          line: lineNumber,
          code: 'MISSING_ARROW',
          message: `Línea ${lineNumber}: falta el operador de producción ("->" o "→") en "${trimmed}".`
        });
        return;
      }

      if (arrowMatches.length > 1) {
        errors.push({
          line: lineNumber,
          code: 'MULTIPLE_ARROWS',
          message: `Línea ${lineNumber}: se encontró más de una flecha en la misma línea. Escribe una producción por línea.`
        });
        return;
      }

      const parts = trimmed.split(/->|→/);
      const lhsStr = parts[0].trim();
      const rhsStr = parts[1].trim();

      // Validar lado izquierdo (exactamente un no terminal)
      if (!lhsStr) {
        errors.push({
          line: lineNumber,
          code: 'MISSING_LHS',
          message: `Línea ${lineNumber}: falta el no terminal del lado izquierdo antes de la flecha.`
        });
        return;
      }

      const lhsTokens = lhsStr.split(/\s+/);
      if (lhsTokens.length > 1) {
        errors.push({
          line: lineNumber,
          code: 'INVALID_LHS_COUNT',
          message: `Línea ${lineNumber}: el lado izquierdo ("${lhsStr}") debe contener exactamente un no terminal.`
        });
        return;
      }

      const lhs = lhsTokens[0];

      if (isEpsilonToken(lhs)) {
        errors.push({
          line: lineNumber,
          code: 'EPSILON_LHS',
          message: `Línea ${lineNumber}: "${lhs}" (epsilon) no puede aparecer como no terminal en el lado izquierdo.`
        });
        return;
      }

      if (lhs === EOF || lhs.includes(EOF)) {
        errors.push({
          line: lineNumber,
          code: 'RESERVED_EOF',
          message: `Línea ${lineNumber}: "${EOF}" está reservado exclusivamente como fin de entrada y no puede usarse en la gramática.`
        });
        return;
      }

      if (lhs.includes('|')) {
        errors.push({
          line: lineNumber,
          code: 'PIPE_IN_LHS',
          message: `Línea ${lineNumber}: el símbolo "|" no puede formar parte del no terminal "${lhs}".`
        });
        return;
      }

      // Validar lado derecho
      if (!rhsStr) {
        errors.push({
          line: lineNumber,
          code: 'EMPTY_RHS',
          message: `Línea ${lineNumber}: la parte derecha de "${lhs} →" está vacía. Usa explícitamente "${EPSILON}", "eps" o "epsilon" para la cadena vacía.`
        });
        return;
      }

      // Registrar no terminal en orden de aparición
      if (!nonTerminalSet.has(lhs)) {
        nonTerminalSet.add(lhs);
        nonTerminalOrder.push(lhs);
      }

      // Procesar alternativas separadas por "|"
      const alternatives = rhsStr.split('|');

      alternatives.forEach((rawAlt, altIdx) => {
        const altTrimmed = rawAlt.trim();

        if (!altTrimmed) {
          errors.push({
            line: lineNumber,
            code: 'EMPTY_ALTERNATIVE',
            message: `Línea ${lineNumber}: alternativa #${altIdx + 1} vacía junto a "|". Si deseas una producción vacía, escribe explícitamente "${EPSILON}".`
          });
          return;
        }

        const rawTokens = altTrimmed.split(/\s+/);

        // Prohibir "$" en cualquier posición de la gramática
        if (rawTokens.some((tok) => tok === EOF)) {
          errors.push({
            line: lineNumber,
            code: 'RESERVED_EOF',
            message: `Línea ${lineNumber}: el símbolo "${EOF}" está reservado exclusivamente como fin de entrada y no puede aparecer en las producciones.`
          });
          return;
        }

        // Prohibir combinar ε con otros símbolos
        const hasEpsilon = rawTokens.some(isEpsilonToken);
        if (hasEpsilon && rawTokens.length > 1) {
          errors.push({
            line: lineNumber,
            code: 'MIXED_EPSILON',
            message: `Línea ${lineNumber}: no se permite combinar "${EPSILON}" con otros símbolos en la misma producción ("${altTrimmed}").`
          });
          return;
        }

        const normalizedRhs = hasEpsilon ? [EPSILON] : rawTokens;
        const prodKey = `${lhs} -> ${normalizedRhs.join(' ')}`;

        // Detectar producciones duplicadas: avisar y omitir del cálculo
        if (seenProductionKeys.has(prodKey)) {
          const dupText = formatProduction(lhs, normalizedRhs);
          duplicateProductions.push({
            line: lineNumber,
            lhs,
            rhs: normalizedRhs,
            text: dupText
          });
          warnings.push({
            line: lineNumber,
            code: 'DUPLICATE_PRODUCTION',
            message: `Línea ${lineNumber}: producción duplicada "${dupText}" eliminada del cálculo para evitar conflictos falsos.`
          });
          return;
        }

        seenProductionKeys.add(prodKey);
        rawEntries.push({
          line: lineNumber,
          lhs,
          rhs: normalizedRhs,
          isEpsilon: hasEpsilon
        });
      });
    });

    if (rawEntries.length === 0 && errors.length === 0) {
      errors.push({
        line: null,
        code: 'EMPTY_GRAMMAR',
        message: 'Escribe al menos una producción.'
      });
      return buildEmptyResult(errors, warnings, true);
    }

    if (errors.length > 0) {
      return buildEmptyResult(errors, warnings, false);
    }

    // Fase 2: Construir producciones numeradas (1, 2, 3...) y clasificar terminales
    const startSymbol = nonTerminalOrder[0];
    const terminalOrder = [];
    const terminalSet = new Set();
    const productionsByLhs = {};

    nonTerminalOrder.forEach((nt) => {
      productionsByLhs[nt] = [];
    });

    const productions = rawEntries.map((entry, idx) => {
      const prod = {
        index: idx + 1,
        lhs: entry.lhs,
        rhs: entry.rhs,
        isEpsilon: entry.isEpsilon,
        line: entry.line,
        text: formatProduction(entry.lhs, entry.rhs)
      };

      productionsByLhs[entry.lhs].push(prod);

      if (!entry.isEpsilon) {
        entry.rhs.forEach((sym) => {
          if (!nonTerminalSet.has(sym) && !terminalSet.has(sym)) {
            terminalSet.add(sym);
            terminalOrder.push(sym);
          }
        });
      }

      return prod;
    });

    // Fase 3: Advertencias didácticas (amarillas, no bloqueantes)

    // 3a. Posibles no terminales sin definir en la parte derecha
    terminalOrder.forEach((term) => {
      if (looksLikeNonTerminal(term)) {
        warnings.push({
          line: null,
          code: 'POSSIBLE_UNDEFINED_NT',
          message: `Posible no terminal sin definir: '${term}' (no tiene producciones al lado izquierdo, por lo que se clasificó como terminal).`
        });
      }
    });

    // 3b. No terminales inalcanzables desde el símbolo inicial
    const reachable = findReachableNonTerminals(startSymbol, productionsByLhs, nonTerminalSet);
    nonTerminalOrder.forEach((nt) => {
      if (!reachable.has(nt)) {
        warnings.push({
          line: null,
          code: 'UNREACHABLE_NT',
          message: `El no terminal '${nt}' es inalcanzable desde el símbolo inicial '${startSymbol}'.`
        });
      }
    });

    return {
      ok: true,
      isEmpty: false,
      errors,
      warnings,
      startSymbol,
      nonTerminals: nonTerminalOrder,
      terminals: terminalOrder,
      productions,
      productionsByLhs,
      duplicateProductions,
      duplicateCount: duplicateProductions.length
    };
  }

  /**
   * Recorrido BFS para detectar no terminales alcanzables desde el símbolo inicial.
   */
  function findReachableNonTerminals(startSymbol, productionsByLhs, nonTerminalSet) {
    const visited = new Set([startSymbol]);
    const queue = [startSymbol];

    while (queue.length > 0) {
      const current = queue.shift();
      const prods = productionsByLhs[current] || [];
      prods.forEach((p) => {
        if (p.isEpsilon) return;
        p.rhs.forEach((sym) => {
          if (nonTerminalSet.has(sym) && !visited.has(sym)) {
            visited.add(sym);
            queue.push(sym);
          }
        });
      });
    }
    return visited;
  }

  function buildEmptyResult(errors, warnings, isEmpty) {
    return {
      ok: false,
      isEmpty: Boolean(isEmpty),
      errors,
      warnings,
      startSymbol: null,
      nonTerminals: [],
      terminals: [],
      productions: [],
      productionsByLhs: {},
      duplicateProductions: [],
      duplicateCount: 0
    };
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Grammar = {
    EPSILON,
    EOF,
    isEpsilonToken,
    looksLikeNonTerminal,
    formatProduction,
    parseGrammar
  };
})(typeof window !== 'undefined' ? window : globalThis);
