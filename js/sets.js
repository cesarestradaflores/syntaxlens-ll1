/**
 * sets.js
 * Cálculo genérico de los conjuntos FIRST y FOLLOW mediante iteración
 * hasta punto fijo, con traza detallada por iteración.
 *
 * Garantías:
 * - Maneja ε y secuencias de símbolos anulables en cadena (X1 X2 ... Xk).
 * - Calcula FIRST(X) para cada no terminal y FIRST(α) para cada producción.
 * - Incluye "$" en FOLLOW del símbolo inicial y garantiza que FOLLOW nunca contiene ε.
 */

(function (global) {
  'use strict';

  const EPSILON = 'ε';
  const EOF = '$';

  /**
   * Ordena un conjunto de símbolos preservando el orden de aparición de terminales
   * en la gramática y ubicando "ε" y "$" al final.
   */
  function sortSymbols(symbolSet, terminalOrder) {
    const orderMap = new Map();
    (terminalOrder || []).forEach((t, idx) => orderMap.set(t, idx));

    const arr = Array.from(symbolSet);
    arr.sort((a, b) => {
      const rank = (sym) => {
        if (sym === EPSILON) return 100000;
        if (sym === EOF) return 100001;
        if (orderMap.has(sym)) return orderMap.get(sym);
        return 50000;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
    return arr;
  }

  /**
   * Calcula FIRST(α) para una secuencia α = X1 X2 ... Xk a partir de un mapa FIRST.
   * @param {string[]} sequence
   * @param {Object<string, Set<string>|string[]>} firstMap
   * @param {Set<string>} nonTerminalSet
   * @returns {Set<string>}
   */
  function computeFirstOfSequence(sequence, firstMap, nonTerminalSet) {
    const result = new Set();

    if (!sequence || sequence.length === 0) {
      result.add(EPSILON);
      return result;
    }

    if (sequence.length === 1 && sequence[0] === EPSILON) {
      result.add(EPSILON);
      return result;
    }

    let allNullable = true;

    for (let i = 0; i < sequence.length; i++) {
      const sym = sequence[i];

      if (sym === EPSILON) {
        continue;
      }

      if (!nonTerminalSet.has(sym)) {
        result.add(sym);
        allNullable = false;
        break;
      }

      const symFirst = firstMap[sym] || new Set();
      let hasEps = false;
      symFirst.forEach((s) => {
        if (s === EPSILON) {
          hasEps = true;
        } else {
          result.add(s);
        }
      });

      if (!hasEps) {
        allNullable = false;
        break;
      }
    }

    if (allNullable) {
      result.add(EPSILON);
    }

    return result;
  }

  /**
   * Calcula FIRST para cada no terminal y para la parte derecha α de cada producción.
   * @param {Object} grammar Resultado válido de Grammar.parseGrammar().
   * @returns {Object} { first, firstSets, productionFirst, trace }
   */
  function computeFirst(grammar) {
    const nonTerminalSet = new Set(grammar.nonTerminals);
    const firstSets = {};
    grammar.nonTerminals.forEach((nt) => {
      firstSets[nt] = new Set();
    });

    const trace = [];
    let iteration = 0;
    let changed = true;

    while (changed) {
      changed = false;
      iteration += 1;
      const steps = [];

      for (let pIdx = 0; pIdx < grammar.productions.length; pIdx++) {
        const prod = grammar.productions[pIdx];
        const A = prod.lhs;
        const target = firstSets[A];

        if (prod.isEpsilon) {
          if (!target.has(EPSILON)) {
            target.add(EPSILON);
            changed = true;
            steps.push({
              ruleIndex: prod.index,
              production: prod.text,
              target: A,
              added: [EPSILON],
              reason: `Producción vacía: se añade ${EPSILON} a FIRST(${A}).`
            });
          }
          continue;
        }

        let allNullable = true;

        for (let i = 0; i < prod.rhs.length; i++) {
          const sym = prod.rhs[i];

          if (!nonTerminalSet.has(sym)) {
            if (!target.has(sym)) {
              target.add(sym);
              changed = true;
              const prefixNote =
                i > 0
                  ? ` (tras prefijo anulable ${prod.rhs.slice(0, i).join(' ')} ⇒* ${EPSILON})`
                  : '';
              steps.push({
                ruleIndex: prod.index,
                production: prod.text,
                target: A,
                added: [sym],
                reason: `Terminal "${sym}"${prefixNote}: se añade a FIRST(${A}).`
              });
            }
            allNullable = false;
            break;
          }

          const symFirst = firstSets[sym];
          const addedHere = [];
          symFirst.forEach((s) => {
            if (s !== EPSILON && !target.has(s)) {
              target.add(s);
              addedHere.push(s);
              changed = true;
            }
          });

          if (addedHere.length > 0) {
            const sortedAdded = sortSymbols(addedHere, grammar.terminals);
            const prefixNote =
              i > 0 ? ` porque ${prod.rhs.slice(0, i).join(' ')} ⇒* ${EPSILON}` : '';
            steps.push({
              ruleIndex: prod.index,
              production: prod.text,
              target: A,
              added: sortedAdded,
              reason: `FIRST(${sym}) \\ {${EPSILON}} aporta { ${sortedAdded.join(', ')} } a FIRST(${A})${prefixNote}.`
            });
          }

          if (!symFirst.has(EPSILON)) {
            allNullable = false;
            break;
          }
        }

        if (allNullable && !target.has(EPSILON)) {
          target.add(EPSILON);
          changed = true;
          steps.push({
            ruleIndex: prod.index,
            production: prod.text,
            target: A,
            added: [EPSILON],
            reason: `Todos los símbolos de "${prod.rhs.join(' ')}" son anulables: se añade ${EPSILON} a FIRST(${A}).`
          });
        }
      }

      trace.push({
        iteration,
        changed,
        steps,
        summary: changed
          ? `${steps.length} actualización(es) en la iteración ${iteration}.`
          : 'Punto fijo alcanzado: sin nuevos símbolos en FIRST.'
      });
    }

    const first = {};
    grammar.nonTerminals.forEach((nt) => {
      first[nt] = sortSymbols(firstSets[nt], grammar.terminals);
    });

    // FIRST(α) por producción numerada
    const productionFirst = grammar.productions.map((prod) => {
      const seqFirst = computeFirstOfSequence(prod.rhs, firstSets, nonTerminalSet);
      return {
        index: prod.index,
        lhs: prod.lhs,
        rhs: prod.rhs,
        text: prod.text,
        symbols: sortSymbols(seqFirst, grammar.terminals),
        nullable: seqFirst.has(EPSILON)
      };
    });

    return {
      first,
      firstSets,
      productionFirst,
      trace
    };
  }

  /**
   * Calcula FOLLOW para todos los no terminales hasta punto fijo.
   * Garantiza que FOLLOW nunca contenga ε.
   * @param {Object} grammar
   * @param {Object<string, Set<string>|string[]>} firstMap
   * @returns {Object} { follow, followSets, trace }
   */
  function computeFollow(grammar, firstMap) {
    const nonTerminalSet = new Set(grammar.nonTerminals);
    const normalizedFirst = {};
    grammar.nonTerminals.forEach((nt) => {
      const raw = firstMap[nt] || [];
      normalizedFirst[nt] = raw instanceof Set ? raw : new Set(raw);
    });

    const followSets = {};
    grammar.nonTerminals.forEach((nt) => {
      followSets[nt] = new Set();
    });

    const trace = [];

    // Regla 1: "$" en FOLLOW del símbolo inicial
    followSets[grammar.startSymbol].add(EOF);
    trace.push({
      iteration: 0,
      changed: true,
      steps: [
        {
          ruleIndex: null,
          production: 'Inicialización',
          target: grammar.startSymbol,
          added: [EOF],
          reason: `"${grammar.startSymbol}" es el símbolo inicial: se añade ${EOF} a FOLLOW(${grammar.startSymbol}).`
        }
      ],
      summary: `FOLLOW(${grammar.startSymbol}) inicializado con { ${EOF} }.`
    });

    let iteration = 0;
    let changed = true;

    while (changed) {
      changed = false;
      iteration += 1;
      const steps = [];

      for (let pIdx = 0; pIdx < grammar.productions.length; pIdx++) {
        const prod = grammar.productions[pIdx];
        if (prod.isEpsilon) continue;

        const A = prod.lhs;
        const rhs = prod.rhs;

        for (let i = 0; i < rhs.length; i++) {
          const B = rhs[i];
          if (!nonTerminalSet.has(B)) continue;

          const beta = rhs.slice(i + 1);
          const target = followSets[B];

          if (beta.length > 0) {
            const firstBeta = computeFirstOfSequence(beta, normalizedFirst, nonTerminalSet);

            // Regla 2: FIRST(β) \ {ε} ⊆ FOLLOW(B)
            const addedFromFirst = [];
            firstBeta.forEach((sym) => {
              if (sym !== EPSILON && !target.has(sym)) {
                target.add(sym);
                addedFromFirst.push(sym);
                changed = true;
              }
            });

            if (addedFromFirst.length > 0) {
              const sortedAdded = sortSymbols(addedFromFirst, grammar.terminals);
              steps.push({
                ruleIndex: prod.index,
                production: prod.text,
                target: B,
                added: sortedAdded,
                reason: `En ${prod.text}, tras "${B}" sigue β = "${beta.join(' ')}": FIRST(β) \\ {${EPSILON}} aporta { ${sortedAdded.join(', ')} } a FOLLOW(${B}).`
              });
            }

            // Regla 3a: si ε ∈ FIRST(β), FOLLOW(A) ⊆ FOLLOW(B)
            if (firstBeta.has(EPSILON)) {
              const addedFromFollowA = [];
              followSets[A].forEach((sym) => {
                if (sym !== EPSILON && !target.has(sym)) {
                  target.add(sym);
                  addedFromFollowA.push(sym);
                  changed = true;
                }
              });

              if (addedFromFollowA.length > 0) {
                const sortedAdded = sortSymbols(addedFromFollowA, grammar.terminals);
                steps.push({
                  ruleIndex: prod.index,
                  production: prod.text,
                  target: B,
                  added: sortedAdded,
                  reason: `Como β = "${beta.join(' ')}" es anulable (ε ∈ FIRST(β)), FOLLOW(${A}) aporta { ${sortedAdded.join(', ')} } a FOLLOW(${B}).`
                });
              }
            }
          } else {
            // Regla 3b: B está al final de A → α B, FOLLOW(A) ⊆ FOLLOW(B)
            const addedFromFollowA = [];
            followSets[A].forEach((sym) => {
              if (sym !== EPSILON && !target.has(sym)) {
                target.add(sym);
                addedFromFollowA.push(sym);
                changed = true;
              }
            });

            if (addedFromFollowA.length > 0) {
              const sortedAdded = sortSymbols(addedFromFollowA, grammar.terminals);
              steps.push({
                ruleIndex: prod.index,
                production: prod.text,
                target: B,
                added: sortedAdded,
                reason: `"${B}" está al final de ${prod.text}: FOLLOW(${A}) aporta { ${sortedAdded.join(', ')} } a FOLLOW(${B}).`
              });
            }
          }
        }
      }

      trace.push({
        iteration,
        changed,
        steps,
        summary: changed
          ? `${steps.length} actualización(es) en la iteración ${iteration}.`
          : 'Punto fijo alcanzado: sin nuevos símbolos en FOLLOW.'
      });
    }

    const follow = {};
    grammar.nonTerminals.forEach((nt) => {
      // Garantía explícita: nunca incluir ε en FOLLOW
      followSets[nt].delete(EPSILON);
      follow[nt] = sortSymbols(followSets[nt], grammar.terminals);
    });

    return {
      follow,
      followSets,
      trace
    };
  }

  /**
   * Calcula conjuntamente FIRST (no terminales + producciones) y FOLLOW.
   */
  function computeAllSets(grammar) {
    const firstRes = computeFirst(grammar);
    const followRes = computeFollow(grammar, firstRes.firstSets);

    return {
      first: firstRes.first,
      firstSets: firstRes.firstSets,
      productionFirst: firstRes.productionFirst,
      firstTrace: firstRes.trace,
      follow: followRes.follow,
      followSets: followRes.followSets,
      followTrace: followRes.trace
    };
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Sets = {
    EPSILON,
    EOF,
    sortSymbols,
    computeFirstOfSequence,
    computeFirst,
    computeFollow,
    computeAllSets
  };
})(typeof window !== 'undefined' ? window : globalThis);
