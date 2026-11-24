/**
 * parser.js
 * Tokenización (modo automático por terminal más largo y modo separado por espacios),
 * simulador predictivo LL(1) paso a paso con pila, detección de ciclos, límite de
 * pasos configurable, árbol de derivación, derivación por la izquierda y exportación.
 */

(function (global) {
  'use strict';

  const EPSILON = 'ε';
  const EOF = '$';
  const DEFAULT_MAX_STEPS = 1000;

  /**
   * Tokeniza una cadena de entrada según los terminales de la gramática.
   * - Permite cadenas completamente vacías ("" o solo espacios) -> tokens = [].
   * - Agrega "$" automáticamente después; NO permite que el usuario escriba "$".
   * - Reporta símbolos desconocidos indicando cuál y su posición (1-based).
   *
   * @param {string} rawInput
   * @param {Object} grammar
   * @param {'auto'|'spaces'} [mode='auto']
   * @returns {Object}
   */
  function tokenizeInput(rawInput, grammar, mode) {
    const selectedMode = mode === 'spaces' ? 'spaces' : 'auto';
    const inputStr = typeof rawInput === 'string' ? rawInput : '';
    const trimmed = inputStr.trim();

    // Cadena vacía: completamente válida como entrada (se analiza contra "$")
    if (trimmed.length === 0) {
      return {
        ok: true,
        tokens: [],
        mode: selectedMode,
        isEmptyInput: true,
        error: null,
        invalidToken: null,
        errorPosition: null
      };
    }

    const terminalSet = new Set(grammar.terminals);

    // Modo A: Tokens separados por espacios
    if (selectedMode === 'spaces') {
      const tokens = [];
      const regex = /\S+/g;
      let match;

      while ((match = regex.exec(inputStr)) !== null) {
        const tok = match[0];
        const pos = match.index + 1;

        if (tok === EOF || tok.includes(EOF)) {
          return {
            ok: false,
            tokens,
            mode: selectedMode,
            isEmptyInput: false,
            invalidToken: EOF,
            errorPosition: pos,
            error: `El símbolo "${EOF}" en la posición ${pos} está reservado como fin de entrada y se agrega automáticamente; no lo incluyas en la cadena.`
          };
        }

        if (!terminalSet.has(tok)) {
          return {
            ok: false,
            tokens,
            mode: selectedMode,
            isEmptyInput: false,
            invalidToken: tok,
            errorPosition: pos,
            error: `Símbolo desconocido "${tok}" en la posición ${pos}. Terminales válidos: { ${grammar.terminals.join(', ') || '∅'} }.`
          };
        }

        tokens.push(tok);
      }

      return {
        ok: true,
        tokens,
        mode: selectedMode,
        isEmptyInput: tokens.length === 0,
        error: null,
        invalidToken: null,
        errorPosition: null
      };
    }

    // Modo B: Automático (coincidencia del terminal más largo primero)
    const sortedTerminals = [...grammar.terminals].sort((a, b) => b.length - a.length);
    const tokens = [];
    let pos = 0;

    while (pos < inputStr.length) {
      if (/\s/.test(inputStr[pos])) {
        pos += 1;
        continue;
      }

      if (inputStr[pos] === EOF) {
        return {
          ok: false,
          tokens,
          mode: selectedMode,
          isEmptyInput: false,
          invalidToken: EOF,
          errorPosition: pos + 1,
          error: `El símbolo "${EOF}" en la posición ${pos + 1} está reservado como fin de entrada y se agrega automáticamente; no lo incluyas en la cadena.`
        };
      }

      let matched = null;
      for (let i = 0; i < sortedTerminals.length; i++) {
        const candidate = sortedTerminals[i];
        if (candidate.length > 0 && inputStr.startsWith(candidate, pos)) {
          matched = candidate;
          break;
        }
      }

      if (matched !== null) {
        tokens.push(matched);
        pos += matched.length;
      } else {
        // Extraer el fragmento desconocido hasta el próximo espacio, "$" o terminal válido
        let end = pos + 1;
        while (end < inputStr.length && !/\s/.test(inputStr[end]) && inputStr[end] !== EOF) {
          const startsValid = sortedTerminals.some(
            (t) => t.length > 0 && inputStr.startsWith(t, end)
          );
          if (startsValid) break;
          end += 1;
        }
        const badFragment = inputStr.slice(pos, end);
        return {
          ok: false,
          tokens,
          mode: selectedMode,
          isEmptyInput: false,
          invalidToken: badFragment,
          errorPosition: pos + 1,
          error: `Símbolo desconocido "${badFragment}" en la posición ${pos + 1}. Terminales válidos: { ${grammar.terminals.join(', ') || '∅'} }.`
        };
      }
    }

    return {
      ok: true,
      tokens,
      mode: selectedMode,
      isEmptyInput: tokens.length === 0,
      error: null,
      invalidToken: null,
      errorPosition: null
    };
  }

  /**
   * Simula el análisis sintáctico predictivo LL(1) paso a paso.
   *
   * Estados finales posibles:
   * - BLOCKED: la gramática no es LL(1) (conflictos o recursividad izquierda).
   * - ACCEPTED: cadena aceptada (pila y entrada llegan a "$").
   * - REJECTED: error léxico o sintáctico concreto con motivo exacto.
   * - INCONCLUSIVE: se detectó un ciclo (configuración repetida pila+entrada)
   *   o se alcanzó el límite máximo de pasos (sin rechazar falsamente la cadena).
   *
   * @param {Object} grammar
   * @param {Object} table
   * @param {string} rawInput
   * @param {Object} [options] { mode: 'auto'|'spaces', maxSteps: number }
   * @returns {Object}
   */
  function simulate(grammar, table, rawInput, options) {
    const mode = (options && options.mode) || 'auto';
    const requestedMax = options && Number(options.maxSteps);
    const maxSteps =
      Number.isFinite(requestedMax) && requestedMax >= 1
        ? Math.floor(requestedMax)
        : DEFAULT_MAX_STEPS;

    // 1. Bloquear simulación si la gramática no es LL(1)
    if (!table || !table.isLL1) {
      return {
        blocked: true,
        accepted: null,
        status: 'BLOCKED',
        blockReason:
          (table && table.verdictSummary) ||
          'La gramática contiene conflictos LL(1) o recursividad izquierda.',
        rawInput,
        mode,
        maxSteps,
        tokens: [],
        inputWithEof: [EOF],
        steps: [],
        errorReason: null,
        inconclusiveReason: null,
        parseTree: null,
        leftmostDerivation: []
      };
    }

    // 2. Tokenizar la entrada
    const tokRes = tokenizeInput(rawInput, grammar, mode);
    if (!tokRes.ok) {
      const initialStack = [EOF, grammar.startSymbol];
      const previewTokens = [...tokRes.tokens, tokRes.invalidToken || '?', EOF];
      return {
        blocked: false,
        accepted: false,
        status: 'REJECTED',
        isLexicalError: true,
        rawInput,
        mode: tokRes.mode,
        maxSteps,
        tokens: tokRes.tokens,
        inputWithEof: previewTokens,
        steps: [
          {
            stepNumber: 1,
            stackBefore: [...initialStack],
            stackAfter: [...initialStack],
            inputIndex: tokRes.tokens.length,
            inputTokens: previewTokens,
            remainingInput: [tokRes.invalidToken || '?', EOF],
            topSymbol: grammar.startSymbol,
            currentToken: tokRes.invalidToken || '?',
            actionType: 'ERROR',
            actionText: `Error: ${tokRes.error}`,
            production: null,
            matrixCell: null
          }
        ],
        errorReason: tokRes.error,
        inconclusiveReason: null,
        parseTree: null,
        leftmostDerivation: []
      };
    }

    const nonTerminalSet = new Set(grammar.nonTerminals);
    const tokens = tokRes.tokens;
    const inputTokens = [...tokens, EOF];

    // Pila inicializada con [$, símbolo inicial] (tope = último elemento)
    const stack = [EOF, grammar.startSymbol];

    // Construcción paralela del árbol de derivación
    let nextNodeId = 1;
    const rootNode = {
      id: nextNodeId++,
      symbol: grammar.startSymbol,
      isTerminal: false,
      isEpsilon: false,
      productionIndex: null,
      children: []
    };
    const nodeStack = [null, rootNode];

    // Derivación por la izquierda
    let sententialForm = [grammar.startSymbol];
    const leftmostDerivation = [
      {
        step: 0,
        form: [...sententialForm],
        production: null
      }
    ];

    // Control de ciclos (configuración repetida pila + puntero de entrada)
    const seenConfigurations = new Set();

    const steps = [];
    let ip = 0;
    let stepCount = 0;
    let status = 'INCONCLUSIVE';
    let accepted = null;
    let errorReason = null;
    let inconclusiveReason = null;

    while (true) {
      const configKey = stack.join('\u0001') + '\u0002' + ip;
      const stackBefore = [...stack];
      const remainingInput = inputTokens.slice(ip);
      const top = stack[stack.length - 1];
      const current = inputTokens[ip];

      // Detección de ciclo (configuración repetida)
      if (seenConfigurations.has(configKey)) {
        stepCount += 1;
        inconclusiveReason = `Se detectó un ciclo: configuración repetida de pila [${stackBefore.join(' ')}] y entrada pendiente [${remainingInput.join(' ')}].`;
        status = 'INCONCLUSIVE';
        accepted = null;
        steps.push({
          stepNumber: stepCount,
          stackBefore,
          stackAfter: [...stack],
          inputIndex: ip,
          inputTokens,
          remainingInput,
          topSymbol: top,
          currentToken: current,
          actionType: 'INCONCLUSIVE',
          actionText: `Inconcluso: ${inconclusiveReason}`,
          production: null,
          matrixCell: null
        });
        break;
      }
      seenConfigurations.add(configKey);

      // Límite de seguridad de pasos
      if (stepCount >= maxSteps) {
        inconclusiveReason = `Se alcanzó el límite de seguridad de ${maxSteps} paso(s) sin concluir el análisis.`;
        status = 'INCONCLUSIVE';
        accepted = null;
        steps.push({
          stepNumber: stepCount + 1,
          stackBefore,
          stackAfter: [...stack],
          inputIndex: ip,
          inputTokens,
          remainingInput,
          topSymbol: top,
          currentToken: current,
          actionType: 'INCONCLUSIVE',
          actionText: `Inconcluso: ${inconclusiveReason}`,
          production: null,
          matrixCell: null
        });
        break;
      }

      stepCount += 1;

      // Caso 1: Aceptar ($ en tope y $ en entrada)
      if (top === EOF && current === EOF) {
        steps.push({
          stepNumber: stepCount,
          stackBefore,
          stackAfter: [...stack],
          inputIndex: ip,
          inputTokens,
          remainingInput,
          topSymbol: top,
          currentToken: current,
          actionType: 'ACCEPT',
          actionText: 'Aceptar',
          production: null,
          matrixCell: null
        });
        status = 'ACCEPTED';
        accepted = true;
        break;
      }

      // Caso 2: Pila vacía en $ con entrada todavía pendiente
      if (top === EOF && current !== EOF) {
        errorReason = `Entrada pendiente con pila vacía: la pila llegó a '$' pero aún resta '${remainingInput.slice(0, -1).join(' ')}' (token actual '${current}').`;
        status = 'REJECTED';
        accepted = false;
        steps.push({
          stepNumber: stepCount,
          stackBefore,
          stackAfter: [...stack],
          inputIndex: ip,
          inputTokens,
          remainingInput,
          topSymbol: top,
          currentToken: current,
          actionType: 'ERROR',
          actionText: `Error: ${errorReason}`,
          production: null,
          matrixCell: null
        });
        break;
      }

      // Caso 3: Tope de pila es un terminal
      if (!nonTerminalSet.has(top)) {
        if (top === current) {
          stack.pop();
          nodeStack.pop();
          const nextIp = ip + 1;
          steps.push({
            stepNumber: stepCount,
            stackBefore,
            stackAfter: [...stack],
            inputIndex: ip,
            inputTokens,
            remainingInput,
            topSymbol: top,
            currentToken: current,
            actionType: 'MATCH',
            actionText: `Emparejar ${current}`,
            production: null,
            matrixCell: null
          });
          ip = nextIp;
          continue;
        }

        if (current === EOF) {
          errorReason = `Entrada agotada con pila no vacía: se esperaba '${top}' y se encontró fin de entrada ($).`;
        } else {
          errorReason = `Token inesperado: se esperaba '${top}' y se encontró '${current}'.`;
        }

        status = 'REJECTED';
        accepted = false;
        steps.push({
          stepNumber: stepCount,
          stackBefore,
          stackAfter: [...stack],
          inputIndex: ip,
          inputTokens,
          remainingInput,
          topSymbol: top,
          currentToken: current,
          actionType: 'ERROR',
          actionText: `Error: ${errorReason}`,
          production: null,
          matrixCell: null
        });
        break;
      }

      // Caso 4: Tope de pila es un no terminal -> consultar M[top, current]
      const entries = (table.matrix[top] && table.matrix[top][current]) || [];
      const matrixCell = { row: top, col: current };

      if (entries.length === 0) {
        const expectedCols = table.columns.filter(
          (col) => table.matrix[top] && table.matrix[top][col].length > 0
        );

        if (current === EOF) {
          errorReason =
            expectedCols.length > 0
              ? `Entrada agotada con pila no vacía: para '${top}' se esperaba uno de { ${expectedCols.join(', ')} } (celda vacía en M[${top}, $]).`
              : `Entrada agotada con pila no vacía: celda vacía en M[${top}, $].`;
        } else {
          errorReason =
            expectedCols.length > 0
              ? `Se esperaba uno de { ${expectedCols.join(', ')} } pero se encontró '${current}' (celda vacía en M[${top}, ${current}]).`
              : `Celda vacía en M[${top}, ${current}]: no existe producción aplicable para '${top}'.`;
        }

        status = 'REJECTED';
        accepted = false;
        steps.push({
          stepNumber: stepCount,
          stackBefore,
          stackAfter: [...stack],
          inputIndex: ip,
          inputTokens,
          remainingInput,
          topSymbol: top,
          currentToken: current,
          actionType: 'ERROR',
          actionText: `Error: ${errorReason}`,
          production: null,
          matrixCell
        });
        break;
      }

      // Expandir A → α
      const prod = entries[0].production;
      stack.pop();
      const parentNode = nodeStack.pop();
      parentNode.productionIndex = prod.index;

      if (prod.isEpsilon) {
        parentNode.children.push({
          id: nextNodeId++,
          symbol: EPSILON,
          isTerminal: false,
          isEpsilon: true,
          productionIndex: null,
          children: []
        });
      } else {
        const childNodes = prod.rhs.map((sym) => ({
          id: nextNodeId++,
          symbol: sym,
          isTerminal: !nonTerminalSet.has(sym),
          isEpsilon: false,
          productionIndex: null,
          children: []
        }));
        parentNode.children = childNodes;

        for (let i = prod.rhs.length - 1; i >= 0; i--) {
          stack.push(prod.rhs[i]);
          nodeStack.push(childNodes[i]);
        }
      }

      // Actualizar derivación por la izquierda
      const leftNtIdx = sententialForm.findIndex((sym) => nonTerminalSet.has(sym));
      if (leftNtIdx !== -1) {
        const replacement = prod.isEpsilon ? [] : prod.rhs;
        sententialForm = [
          ...sententialForm.slice(0, leftNtIdx),
          ...replacement,
          ...sententialForm.slice(leftNtIdx + 1)
        ];
        leftmostDerivation.push({
          step: leftmostDerivation.length,
          form: [...sententialForm],
          production: prod
        });
      }

      steps.push({
        stepNumber: stepCount,
        stackBefore,
        stackAfter: [...stack],
        inputIndex: ip,
        inputTokens,
        remainingInput,
        topSymbol: top,
        currentToken: current,
        actionType: 'EXPAND',
        actionText: `Expandir ${prod.text} (producción #${prod.index})`,
        production: prod,
        matrixCell
      });
    }

    return {
      blocked: false,
      accepted,
      status,
      isLexicalError: false,
      rawInput,
      mode: tokRes.mode,
      maxSteps,
      tokens,
      inputWithEof: inputTokens,
      steps,
      errorReason,
      inconclusiveReason,
      parseTree: status === 'ACCEPTED' ? rootNode : null,
      leftmostDerivation: status === 'ACCEPTED' ? leftmostDerivation : []
    };
  }

  /**
   * Exporta la traza en CSV con BOM UTF-8 (compatible con Excel).
   */
  function traceToCSV(simResult) {
    if (!simResult || !simResult.steps || simResult.steps.length === 0) return '';

    const escapeCsv = (val) => {
      const str = String(val == null ? '' : val);
      return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = [['Paso', 'Pila (fondo -> tope)', 'Entrada pendiente', 'Acción']];
    simResult.steps.forEach((st) => {
      rows.push([
        st.stepNumber,
        st.stackBefore.join(' '),
        st.remainingInput.join(' '),
        st.actionText
      ]);
    });

    return '\uFEFF' + rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');
  }

  /**
   * Formatea la traza como tabla Markdown para copiar al portapapeles.
   */
  function traceToMarkdown(simResult) {
    if (!simResult || !simResult.steps || simResult.steps.length === 0) return '';

    const lines = [
      '| Paso | Pila (fondo → tope) | Entrada pendiente | Acción |',
      '| ---: | :--- | :--- | :--- |'
    ];

    simResult.steps.forEach((st) => {
      lines.push(
        `| ${st.stepNumber} | \`${st.stackBefore.join(' ')}\` | \`${st.remainingInput.join(' ')}\` | ${st.actionText} |`
      );
    });

    lines.push('');
    if (simResult.status === 'ACCEPTED') {
      lines.push('**Resultado:** CADENA ACEPTADA ✅');
    } else if (simResult.status === 'INCONCLUSIVE') {
      lines.push(`**Resultado:** ANÁLISIS INCONCLUSO (${simResult.inconclusiveReason || ''})`);
    } else {
      lines.push(`**Resultado:** CADENA RECHAZADA ❌ (${simResult.errorReason || ''})`);
    }

    return lines.join('\n');
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Parser = {
    DEFAULT_MAX_STEPS,
    tokenizeInput,
    simulate,
    traceToCSV,
    traceToMarkdown
  };
})(typeof window !== 'undefined' ? window : globalThis);
