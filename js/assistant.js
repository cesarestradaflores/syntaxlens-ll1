/**
 * assistant.js
 * Asistente genérico de corrección de gramáticas para SyntaxLens LL(1).
 *
 * Implementa transformaciones formales que preservan el lenguaje original:
 * - Detección de gramáticas / símbolos improductivos (sin cadenas terminales).
 * - Eliminación de producciones duplicadas.
 * - Eliminación de recursividad izquierda directa e indirecta (cuando es segura).
 * - Factorización izquierda por prefijos comunes más largos.
 * - Orientación explicativa para conflictos FIRST/FOLLOW y FOLLOW/FOLLOW.
 * - Re-validación completa (Grammar -> Sets -> Table) antes de aceptar cualquier propuesta.
 *
 * Prohibido usar soluciones precargadas: todos los algoritmos son 100% genéricos.
 */

(function (global) {
  'use strict';

  const EPSILON = 'ε';
  const EOF = '$';
  const MAX_GENERATED_PRODUCTIONS = 60;
  const MAX_FACTOR_ITERATIONS = 20;
  const SAFE_FALLBACK_MESSAGE =
    'No se encontró una corrección automática segura para esta gramática. Se recomienda revisar manualmente las producciones involucradas.';

  /**
   * Genera un nombre único para un nuevo no terminal evitando colisiones
   * con cualquier terminal, no terminal o símbolo reservado existente.
   * Ejemplo: E -> E' -> E'' -> E_1 -> E_2 ...
   * @param {string} base
   * @param {Set<string>} usedSymbols
   * @returns {string}
   */
  function createUniqueNonTerminal(base, usedSymbols) {
    const candidates = [];
    if (!base.endsWith("'")) {
      candidates.push(`${base}'`);
      candidates.push(`${base}''`);
    } else {
      candidates.push(`${base}'`);
    }

    for (let i = 0; i < candidates.length; i++) {
      if (!usedSymbols.has(candidates[i])) {
        usedSymbols.add(candidates[i]);
        return candidates[i];
      }
    }

    const cleanBase = base.replace(/'+$/, '');
    let counter = 1;
    while (counter < 1000) {
      const candidate = `${cleanBase}_${counter}`;
      if (!usedSymbols.has(candidate)) {
        usedSymbols.add(candidate);
        return candidate;
      }
      counter += 1;
    }

    const fallback = `${cleanBase}_aux_${Date.now()}`;
    usedSymbols.add(fallback);
    return fallback;
  }

  /**
   * Calcula qué no terminales son productivos (pueden derivar al menos una
   * cadena compuesta únicamente por terminales o ε) mediante punto fijo.
   * @param {Object} grammar
   * @returns {Object} { productive, unproductive, startIsUnproductive }
   */
  function findProductiveNonTerminals(grammar) {
    const ntSet = new Set(grammar.nonTerminals);
    const productive = new Set();
    let changed = true;

    while (changed) {
      changed = false;
      for (let i = 0; i < grammar.productions.length; i++) {
        const prod = grammar.productions[i];
        if (productive.has(prod.lhs)) continue;

        if (prod.isEpsilon) {
          productive.add(prod.lhs);
          changed = true;
          continue;
        }

        const allProd = prod.rhs.every((sym) => !ntSet.has(sym) || productive.has(sym));
        if (allProd) {
          productive.add(prod.lhs);
          changed = true;
        }
      }
    }

    const unproductive = grammar.nonTerminals.filter((nt) => !productive.has(nt));
    return {
      productive: Array.from(productive),
      unproductive,
      startIsUnproductive: !productive.has(grammar.startSymbol)
    };
  }

  /**
   * Formatea el diccionario de reglas agrupadas por no terminal en texto de gramática limpio.
   * @param {string[]} ntOrder
   * @param {Object<string, string[][]>} rulesByNt
   * @returns {string}
   */
  function formatRulesAsGrammar(ntOrder, rulesByNt) {
    const lines = [];
    ntOrder.forEach((nt) => {
      const alts = rulesByNt[nt] || [];
      if (alts.length === 0) return;
      const altsText = alts.map((rhs) => rhs.join(' ')).join(' | ');
      lines.push(`${nt} -> ${altsText}`);
    });
    return lines.join('\n');
  }

  /**
   * Deduplica alternativas idénticas de cada no terminal preservando su orden.
   */
  function deduplicateRules(ntOrder, rulesByNt) {
    let removed = 0;
    ntOrder.forEach((nt) => {
      const seen = new Set();
      const unique = [];
      (rulesByNt[nt] || []).forEach((rhs) => {
        const normalized = rhs.length === 0 ? [EPSILON] : rhs;
        const key = normalized.join('\u0001');
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(normalized);
        } else {
          removed += 1;
        }
      });
      rulesByNt[nt] = unique;
    });
    return removed;
  }

  function countTotalRules(ntOrder, rulesByNt) {
    let count = 0;
    ntOrder.forEach((nt) => {
      count += (rulesByNt[nt] || []).length;
    });
    return count;
  }

  /**
   * Determina si una alternativa representa ε.
   */
  function isEpsilonRhs(rhs) {
    return rhs.length === 0 || (rhs.length === 1 && rhs[0] === EPSILON);
  }

  /**
   * Calcula el prefijo común más largo entre una lista de arreglos de símbolos.
   */
  function longestCommonPrefix(rhsList) {
    if (!rhsList || rhsList.length < 2) return [];
    const minLen = Math.min(...rhsList.map((r) => r.length));
    const prefix = [];
    for (let i = 0; i < minLen; i++) {
      const sym = rhsList[0][i];
      if (rhsList.every((r) => r[i] === sym)) {
        prefix.push(sym);
      } else {
        break;
      }
    }
    return prefix;
  }

  /**
   * Encuentra el mejor grupo factorizable en un no terminal A:
   * prioriza el prefijo común más largo compartido por al menos 2 producciones.
   */
  function findBestFactorableGroup(alts) {
    const nonEpsIndices = [];
    alts.forEach((rhs, idx) => {
      if (!isEpsilonRhs(rhs)) nonEpsIndices.push(idx);
    });

    let best = null;

    // Agrupar primero por primer símbolo
    const byFirst = {};
    nonEpsIndices.forEach((idx) => {
      const firstSym = alts[idx][0];
      if (!byFirst[firstSym]) byFirst[firstSym] = [];
      byFirst[firstSym].push(idx);
    });

    Object.keys(byFirst).forEach((firstSym) => {
      const indices = byFirst[firstSym];
      if (indices.length < 2) return;

      // Buscar el prefijo más largo compartido por al menos 2 producciones dentro del grupo
      // Probamos todos los prefijos de cada producción del grupo
      const prefixMap = new Map();
      indices.forEach((idx) => {
        const rhs = alts[idx];
        for (let len = 1; len <= rhs.length; len++) {
          const slice = rhs.slice(0, len);
          const key = slice.join('\u0001');
          if (!prefixMap.has(key)) {
            prefixMap.set(key, { prefix: slice, indices: [] });
          }
          prefixMap.get(key).indices.push(idx);
        }
      });

      prefixMap.forEach((entry) => {
        if (entry.indices.length < 2) return;
        if (
          !best ||
          entry.prefix.length > best.prefix.length ||
          (entry.prefix.length === best.prefix.length &&
            entry.indices.length > best.indices.length)
        ) {
          best = entry;
        }
      });
    });

    return best;
  }

  /**
   * Aplica factorización izquierda iterativamente sobre todos los no terminales
   * hasta que no queden prefijos comunes explícitos.
   */
  function applyLeftFactoring(ntOrder, rulesByNt, usedSymbols, steps, techniques) {
    let appliedAny = false;
    let iteration = 0;

    while (iteration < MAX_FACTOR_ITERATIONS) {
      iteration += 1;
      let changed = false;

      for (let i = 0; i < ntOrder.length; i++) {
        const A = ntOrder[i];
        const alts = rulesByNt[A] || [];
        const group = findBestFactorableGroup(alts);
        if (!group) continue;

        if (countTotalRules(ntOrder, rulesByNt) >= MAX_GENERATED_PRODUCTIONS) {
          return { appliedAny, abortedByLimit: true };
        }

        const { prefix, indices } = group;
        const indexSet = new Set(indices);
        const newNt = createUniqueNonTerminal(A, usedSymbols);

        const matchedRhs = indices.map((idx) => alts[idx]);
        const prefixLen = prefix.length;

        // Reconstruir producciones de A: reemplazar el grupo por una sola regla A -> prefix newNt
        const newAltsForA = [];
        let inserted = false;
        alts.forEach((rhs, idx) => {
          if (indexSet.has(idx)) {
            if (!inserted) {
              newAltsForA.push([...prefix, newNt]);
              inserted = true;
            }
          } else {
            newAltsForA.push(rhs);
          }
        });
        rulesByNt[A] = newAltsForA;

        // Crear producciones de newNt con los sufijos restantes (o ε si el sufijo queda vacío)
        const newAltsForNewNt = [];
        const seenRem = new Set();
        matchedRhs.forEach((rhs) => {
          const rem = rhs.slice(prefixLen);
          const normRem = rem.length === 0 ? [EPSILON] : rem;
          const key = normRem.join('\u0001');
          if (!seenRem.has(key)) {
            seenRem.add(key);
            newAltsForNewNt.push(normRem);
          }
        });

        ntOrder.push(newNt);
        rulesByNt[newNt] = newAltsForNewNt;

        const oldFormatted = matchedRhs.map((r) => `${A} → ${r.join(' ')}`).join(' | ');
        const newNtFormatted = newAltsForNewNt.map((r) => r.join(' ')).join(' | ');
        steps.push(
          `Factorización izquierda en ${A}: se extrajo el prefijo común "${prefix.join(' ')}" de (${oldFormatted}) creando el no terminal único "${newNt}". Resultado: ${A} → ${prefix.join(' ')} ${newNt} y ${newNt} → ${newNtFormatted}.`
        );

        appliedAny = true;
        changed = true;
        break; // Reiniciar pasada para mantener consistencia
      }

      if (!changed) break;
    }

    if (appliedAny && !techniques.includes('Factorización izquierda')) {
      techniques.push('Factorización izquierda');
    }

    return { appliedAny, abortedByLimit: false };
  }

  /**
   * Elimina recursividad izquierda directa (y cuando es viable, indirecta)
   * preservando exactamente el lenguaje generado.
   */
  function applyLeftRecursionElimination(
    ntOrder,
    rulesByNt,
    usedSymbols,
    leftRecursion,
    unproductiveSet,
    steps,
    techniques
  ) {
    let appliedDirect = false;
    let appliedIndirect = false;

    // 1. Recursividad izquierda indirecta: sustituir solo en no terminales que participan en ciclos indirectos
    if (leftRecursion.indirect.length > 0) {
      const indirectNts = new Set();
      leftRecursion.indirect.forEach((c) => {
        c.cycle.forEach((nt) => indirectNts.add(nt));
      });

      // Si algún no terminal del ciclo es improductivo, abortar para no inventar lenguaje
      for (const nt of indirectNts) {
        if (unproductiveSet.has(nt)) {
          return {
            appliedAny: false,
            abortedUnsafe: true,
            reason: `El no terminal "${nt}" involucrado en el ciclo indirecto es improductivo.`
          };
        }
      }

      const originalOrderSnapshot = [...ntOrder];
      for (let i = 0; i < originalOrderSnapshot.length; i++) {
        const Ai = originalOrderSnapshot[i];
        if (!indirectNts.has(Ai)) continue;

        for (let j = 0; j < i; j++) {
          const Aj = originalOrderSnapshot[j];
          if (!indirectNts.has(Aj)) continue;

          const currentAlts = rulesByNt[Ai] || [];
          const ajAlts = rulesByNt[Aj] || [];
          let substituted = false;
          const nextAlts = [];

          for (let k = 0; k < currentAlts.length; k++) {
            const rhs = currentAlts[k];
            if (!isEpsilonRhs(rhs) && rhs[0] === Aj) {
              const gamma = rhs.slice(1);
              substituted = true;
              ajAlts.forEach((delta) => {
                if (isEpsilonRhs(delta)) {
                  nextAlts.push(gamma.length === 0 ? [EPSILON] : [...gamma]);
                } else {
                  nextAlts.push([...delta, ...gamma]);
                }
              });
            } else {
              nextAlts.push(rhs);
            }
          }

          if (substituted) {
            rulesByNt[Ai] = nextAlts;
            deduplicateRules(ntOrder, rulesByNt);
            if (countTotalRules(ntOrder, rulesByNt) > MAX_GENERATED_PRODUCTIONS) {
              return {
                appliedAny: false,
                abortedUnsafe: true,
                reason: 'La sustitución para recursividad indirecta superó el límite seguro de producciones.'
              };
            }
            appliedIndirect = true;
            steps.push(
              `Eliminación de recursividad izquierda indirecta: se sustituyeron las apariciones iniciales de "${Aj}" en "${Ai}" para exponer recursividad directa.`
            );
          }
        }
      }
    }

    // 2. Exponer recursividad directa oculta tras un prefijo anulable simple (ej. A -> B A | d, B -> c | ε)
    const nullableDirect = leftRecursion.direct.filter((d) => d.viaNullablePrefix);
    nullableDirect.forEach((item) => {
      const A = item.nonTerminal;
      if (unproductiveSet.has(A)) return;
      const prefixFirstNt = item.nullablePrefix && item.nullablePrefix[0];
      if (!prefixFirstNt || !rulesByNt[prefixFirstNt]) return;

      const nextAlts = [];
      let expanded = false;
      (rulesByNt[A] || []).forEach((rhs) => {
        if (!isEpsilonRhs(rhs) && rhs[0] === prefixFirstNt) {
          const rest = rhs.slice(1);
          expanded = true;
          (rulesByNt[prefixFirstNt] || []).forEach((delta) => {
            if (isEpsilonRhs(delta)) {
              nextAlts.push(rest.length === 0 ? [EPSILON] : [...rest]);
            } else {
              nextAlts.push([...delta, ...rest]);
            }
          });
        } else {
          nextAlts.push(rhs);
        }
      });

      if (expanded && nextAlts.length <= MAX_GENERATED_PRODUCTIONS) {
        rulesByNt[A] = nextAlts;
        deduplicateRules(ntOrder, rulesByNt);
        steps.push(
          `Prefijo anulable en ${A}: se expandió "${prefixFirstNt}" al inicio de las producciones de ${A} para exponer la recursividad izquierda directa.`
        );
      }
    });

    // 3. Eliminación de recursividad izquierda directa (A -> A α | β  ==>  A -> β A', A' -> α A' | ε)
    const ntsToCheck = [...ntOrder];
    for (let i = 0; i < ntsToCheck.length; i++) {
      const A = ntsToCheck[i];
      const alts = rulesByNt[A] || [];
      const alphas = [];
      const betas = [];

      alts.forEach((rhs) => {
        if (!isEpsilonRhs(rhs) && rhs[0] === A) {
          alphas.push(rhs.slice(1));
        } else {
          betas.push(rhs);
        }
      });

      if (alphas.length === 0) continue;

      // Si no existen casos base β, A es improductivo: NO inventar reglas
      if (betas.length === 0 || unproductiveSet.has(A)) {
        return {
          appliedAny: false,
          abortedUnsafe: true,
          reason: `El no terminal "${A}" tiene recursividad izquierda sin caso base (no genera cadenas terminales).`
        };
      }

      // Filtrar ciclos triviales A -> A (no aportan cadenas nuevas cuando hay casos base β)
      const nonEmptyAlphas = alphas.filter((a) => a.length > 0);
      const removedTrivialLoop = alphas.length - nonEmptyAlphas.length;

      if (nonEmptyAlphas.length === 0) {
        // Solo había A -> A junto con casos base β: eliminar A -> A preserva el lenguaje
        rulesByNt[A] = betas;
        appliedDirect = true;
        steps.push(
          `Se eliminó la producción autorreferencial trivial "${A} → ${A}" conservando los casos base de ${A}.`
        );
        continue;
      }

      const newNt = createUniqueNonTerminal(A, usedSymbols);
      const newAltsForA = betas.map((beta) =>
        isEpsilonRhs(beta) ? [newNt] : [...beta, newNt]
      );
      const newAltsForNewNt = nonEmptyAlphas.map((alpha) => [...alpha, newNt]);
      newAltsForNewNt.push([EPSILON]);

      rulesByNt[A] = newAltsForA;
      rulesByNt[newNt] = newAltsForNewNt;

      // Insertar A' inmediatamente después de A para mayor legibilidad
      const posA = ntOrder.indexOf(A);
      ntOrder.splice(posA + 1, 0, newNt);

      const trivialNote =
        removedTrivialLoop > 0
          ? ` (también se descartó la producción trivial ${A} → ${A})`
          : '';
      steps.push(
        `Eliminación de recursividad izquierda directa en ${A}${trivialNote}: se creó el no terminal único "${newNt}". Reglas resultantes: ${A} → ${newAltsForA
          .map((r) => r.join(' '))
          .join(' | ')} y ${newNt} → ${newAltsForNewNt.map((r) => r.join(' ')).join(' | ')}.`
      );
      appliedDirect = true;
    }

    if (appliedIndirect) {
      techniques.push('Eliminación de recursividad izquierda indirecta');
    }
    if (appliedDirect) {
      techniques.push('Eliminación de recursividad izquierda directa');
    }

    return { appliedAny: appliedDirect || appliedIndirect, abortedUnsafe: false };
  }

  /**
   * Genera explicaciones didácticas para conflictos FIRST/FOLLOW y FOLLOW/FOLLOW
   * que requieren análisis o reestructuración manual.
   */
  function buildManualConflictGuidance(conflicts) {
    const notes = [];
    conflicts.forEach((c) => {
      if (c.type.includes('FIRST/FOLLOW')) {
        notes.push(
          `Conflicto FIRST/FOLLOW en M[${c.nonTerminal}, ${c.terminal}]: una producción de ${c.nonTerminal} comienza con "${c.terminal}" mientras otra deriva ε y "${c.terminal}" también puede aparecer después de ${c.nonTerminal} (FOLLOW(${c.nonTerminal})). Revisa si la opcionalidad puede moverse al no terminal que invoca a ${c.nonTerminal} o si existe ambigüedad inherente.`
        );
      } else if (c.type === 'FOLLOW/FOLLOW') {
        notes.push(
          `Conflicto FOLLOW/FOLLOW en M[${c.nonTerminal}, ${c.terminal}]: dos alternativas distintas de ${c.nonTerminal} pueden derivar ε. Unifica la derivación vacía en una sola ruta para eliminar la ambigüedad.`
        );
      }
    });
    return notes;
  }

  /**
   * Punto de entrada principal del Asistente de corrección de gramáticas.
   * Recibe el texto original y los resultados ya calculados (grammar, sets, table)
   * y devuelve un informe completo + propuesta re-validada (sin modificar el editor).
   *
   * @param {string} rawText Texto actual del editor.
   * @param {Object} grammar Resultado de Grammar.parseGrammar().
   * @param {Object} sets Resultado de Sets.computeAllSets().
   * @param {Object} table Resultado de Table.buildParsingTable().
   * @returns {Object} Reporte estructurado de corrección.
   */
  function suggestCorrection(rawText, grammar, sets, table) {
    const SL = global.SyntaxLens;
    const Grammar = SL.Grammar;
    const Sets = SL.Sets;
    const Table = SL.Table;

    const prodInfo = findProductiveNonTerminals(grammar);
    const unproductiveSet = new Set(prodInfo.unproductive);
    const hasDuplicates = (grammar.duplicateCount || 0) > 0;

    // 1. Recopilar tipos de problema, celdas afectadas y producciones involucradas
    const problemTypes = [];
    if (prodInfo.startIsUnproductive || prodInfo.unproductive.length > 0) {
      problemTypes.push('Gramática improductiva');
    }
    if (table.leftRecursion.direct.length > 0) {
      problemTypes.push('Recursividad izquierda directa');
    }
    if (table.leftRecursion.indirect.length > 0) {
      problemTypes.push('Recursividad izquierda indirecta');
    }
    table.conflicts.forEach((c) => {
      const label = `Conflicto ${c.type}`;
      if (!problemTypes.includes(label)) problemTypes.push(label);
    });
    if (table.leftFactoringIssues.length > 0) {
      problemTypes.push('Falta de factorización izquierda');
    }
    if (hasDuplicates) {
      problemTypes.push('Producciones duplicadas');
    }

    const affectedCells = table.conflicts.map((c) => ({
      row: c.nonTerminal,
      col: c.terminal,
      coord: `M[${c.nonTerminal}, ${c.terminal}]`,
      type: c.type
    }));

    // Producciones involucradas (deduplicadas)
    const involvedMap = new Map();
    table.conflicts.forEach((c) => {
      c.productions.forEach((p) => involvedMap.set(p.index, `(#${p.index}) ${p.text}`));
    });
    table.leftRecursion.direct.forEach((d) => {
      involvedMap.set(d.production.index, `(#${d.production.index}) ${d.production.text}`);
    });
    table.leftRecursion.indirect.forEach((ind) => {
      ind.productions.forEach((p) => involvedMap.set(p.index, `(#${p.index}) ${p.text}`));
    });
    table.leftFactoringIssues.forEach((f) => {
      f.productions.forEach((p) => involvedMap.set(p.index, `(#${p.index}) ${p.text}`));
    });
    prodInfo.unproductive.forEach((nt) => {
      (grammar.productionsByLhs[nt] || []).forEach((p) => {
        involvedMap.set(p.index, `(#${p.index}) ${p.text}`);
      });
    });
    const involvedProductions = Array.from(involvedMap.values());
    (grammar.duplicateProductions || []).forEach((dup) => {
      involvedProductions.push(`(duplicada línea ${dup.line}) ${dup.text}`);
    });

    const conflictsBefore = table.conflicts.length;
    const leftRecBefore = table.leftRecursion.hasAny;

    // 2. Caso crítico: el símbolo inicial es improductivo (ej. S -> S)
    if (prodInfo.startIsUnproductive) {
      const unprodList = prodInfo.unproductive.join(', ');
      return {
        outcome: 'UNFIXABLE',
        canApply: false,
        isUnproductive: true,
        unproductiveNonTerminals: prodInfo.unproductive,
        problemTypes,
        affectedCells,
        involvedProductions,
        problemExplanation: `La gramática es improductiva: el símbolo inicial "${grammar.startSymbol}" (no terminales improductivos: ${unprodList}) no genera ninguna cadena de terminales (L(G) = ∅). No existe una derivación finita hacia terminales.`,
        techniques: ['Ninguna transformación automática aplicada'],
        originalGrammar: rawText.trim(),
        proposedGrammar: null,
        steps: [
          `Se ejecutó el análisis de productividad sobre V_N = { ${grammar.nonTerminals.join(', ')} } y se comprobó que "${grammar.startSymbol}" nunca alcanza cadenas terminales.`,
          'Cualquier producción base inventada alteraría el lenguaje original L(G) = ∅, por lo que no se propone una reescritura automática.'
        ],
        manualGuidance: [
          `Agrega al menos una producción base (con terminales o ε) para "${grammar.startSymbol}" o corrige el ciclo improductivo según el lenguaje que deseas definir.`
        ],
        fallbackMessage: SAFE_FALLBACK_MESSAGE,
        metrics: {
          conflictsBefore,
          conflictsAfter: conflictsBefore,
          leftRecBefore,
          leftRecAfter: leftRecBefore,
          duplicatesBefore: grammar.duplicateCount || 0,
          duplicatesAfter: grammar.duplicateCount || 0,
          isLL1After: false
        },
        validation: null
      };
    }

    // 3. Preparar copia editable de reglas (a partir de las producciones ya deduplicadas por Grammar)
    const ntOrder = [...grammar.nonTerminals];
    const rulesByNt = {};
    ntOrder.forEach((nt) => {
      rulesByNt[nt] = (grammar.productionsByLhs[nt] || []).map((p) => [...p.rhs]);
    });
    const usedSymbols = new Set([...grammar.nonTerminals, ...grammar.terminals, EPSILON, EOF]);

    const techniques = [];
    const steps = [];

    // Paso A: Producciones duplicadas
    if (hasDuplicates) {
      const dupDesc = grammar.duplicateProductions.map((d) => `"${d.text}"`).join(', ');
      techniques.push('Eliminación de producciones duplicadas');
      steps.push(
        `Eliminación de producciones duplicadas: se eliminaron ${grammar.duplicateCount} producción(es) repetida(s) (${dupDesc}) conservando una única copia de cada regla.`
      );
    }

    // Paso B: Eliminación de recursividad izquierda (indirecta y directa)
    let leftRecAbortedReason = null;
    if (table.leftRecursion.hasAny) {
      const lrRes = applyLeftRecursionElimination(
        ntOrder,
        rulesByNt,
        usedSymbols,
        table.leftRecursion,
        unproductiveSet,
        steps,
        techniques
      );
      if (lrRes.abortedUnsafe) {
        leftRecAbortedReason = lrRes.reason;
      }
    }

    // Paso C: Factorización izquierda (prefijos comunes)
    applyLeftFactoring(ntOrder, rulesByNt, usedSymbols, steps, techniques);

    // Deduplicación de seguridad tras transformaciones
    const extraDupsRemoved = deduplicateRules(ntOrder, rulesByNt);
    if (extraDupsRemoved > 0) {
      steps.push(
        `Limpieza final: se consolidaron ${extraDupsRemoved} producción(es) repetida(s) surgidas durante la transformación.`
      );
    }

    // 4. Re-validación completa de la gramática propuesta
    const proposedText = formatRulesAsGrammar(ntOrder, rulesByNt);
    const manualGuidance = buildManualConflictGuidance(table.conflicts);

    if (leftRecAbortedReason) {
      steps.push(`No se pudo completar automáticamente la eliminación de recursividad izquierda: ${leftRecAbortedReason}`);
    }

    if (techniques.length === 0) {
      return {
        outcome: 'UNFIXABLE',
        canApply: false,
        isUnproductive: prodInfo.unproductive.length > 0,
        unproductiveNonTerminals: prodInfo.unproductive,
        problemTypes,
        affectedCells,
        involvedProductions,
        problemExplanation: buildProblemExplanation(grammar, table, prodInfo),
        techniques: ['Análisis diagnóstico (sin transformación automática aplicable)'],
        originalGrammar: rawText.trim(),
        proposedGrammar: null,
        steps:
          steps.length > 0
            ? steps
            : [
                'Se analizaron duplicados, recursividad izquierda y prefijos comunes para factorización izquierda.',
                'Los conflictos detectados no corresponden a una transformación automática segura que garantice preservar el lenguaje.'
              ],
        manualGuidance,
        fallbackMessage: SAFE_FALLBACK_MESSAGE,
        metrics: {
          conflictsBefore,
          conflictsAfter: conflictsBefore,
          leftRecBefore,
          leftRecAfter: leftRecBefore,
          duplicatesBefore: grammar.duplicateCount || 0,
          duplicatesAfter: grammar.duplicateCount || 0,
          isLL1After: table.isLL1
        },
        validation: null
      };
    }

    // Recalcular pipeline completo: parseo -> FIRST -> FOLLOW -> matriz -> conflictos -> recursividad
    const newGrammar = Grammar.parseGrammar(proposedText);
    if (!newGrammar.ok) {
      return buildUnfixableReport(
        rawText,
        grammar,
        table,
        prodInfo,
        problemTypes,
        affectedCells,
        involvedProductions,
        steps.concat(['La re-validación sintáctica de la gramática transformada falló; se descarta la propuesta.']),
        manualGuidance
      );
    }

    const newProdInfo = findProductiveNonTerminals(newGrammar);
    if (newProdInfo.startIsUnproductive) {
      return buildUnfixableReport(
        rawText,
        grammar,
        table,
        prodInfo,
        problemTypes,
        affectedCells,
        involvedProductions,
        steps.concat(['La gramática transformada resultó improductiva; se descarta para preservar el lenguaje original.']),
        manualGuidance
      );
    }

    const newSets = Sets.computeAllSets(newGrammar);
    const newTable = Table.buildParsingTable(newGrammar, newSets);

    const conflictsAfter = newTable.conflicts.length;
    const leftRecAfter = newTable.leftRecursion.hasAny;
    const duplicatesAfter = newGrammar.duplicateCount || 0;

    steps.push(
      `Re-validación completa: ${newGrammar.nonTerminals.length} no terminal(es), ${newGrammar.terminals.length} terminal(es), ${newGrammar.productions.length} producción(es), ${conflictsAfter} conflicto(s) LL(1), recursividad izquierda: ${leftRecAfter ? 'Sí' : 'No'}.`
    );

    const remainingGuidance = buildManualConflictGuidance(newTable.conflicts);
    const combinedGuidance = remainingGuidance.length > 0 ? remainingGuidance : manualGuidance;

    // Verificar mejora real
    const fixedCompletely = newTable.isLL1 && conflictsAfter === 0 && duplicatesAfter === 0;
    const improvedPartially =
      conflictsAfter < conflictsBefore ||
      (leftRecBefore && !leftRecAfter) ||
      (hasDuplicates && duplicatesAfter === 0);

    if (!fixedCompletely && !improvedPartially) {
      return buildUnfixableReport(
        rawText,
        grammar,
        table,
        prodInfo,
        problemTypes,
        affectedCells,
        involvedProductions,
        steps.concat(['La transformación no redujo los conflictos LL(1); se descarta la propuesta automática.']),
        combinedGuidance
      );
    }

    return {
      outcome: fixedCompletely ? 'FIXED' : 'PARTIAL',
      canApply: true,
      isUnproductive: prodInfo.unproductive.length > 0,
      unproductiveNonTerminals: prodInfo.unproductive,
      problemTypes,
      affectedCells,
      involvedProductions,
      problemExplanation: buildProblemExplanation(grammar, table, prodInfo),
      techniques,
      originalGrammar: rawText.trim(),
      proposedGrammar: proposedText,
      steps,
      manualGuidance: fixedCompletely ? [] : combinedGuidance,
      fallbackMessage: fixedCompletely ? null : SAFE_FALLBACK_MESSAGE,
      metrics: {
        conflictsBefore,
        conflictsAfter,
        leftRecBefore,
        leftRecAfter,
        duplicatesBefore: grammar.duplicateCount || 0,
        duplicatesAfter,
        isLL1After: newTable.isLL1
      },
      validation: {
        grammar: newGrammar,
        sets: newSets,
        table: newTable
      }
    };
  }

  function buildProblemExplanation(grammar, table, prodInfo) {
    const parts = [];
    if (prodInfo.unproductive.length > 0) {
      parts.push(
        `No terminal(es) improductivo(s): ${prodInfo.unproductive.join(', ')} (no derivan cadenas terminales).`
      );
    }
    if (table.leftRecursion.direct.length > 0) {
      const cycles = table.leftRecursion.direct.map((d) => d.cycleText).join(', ');
      parts.push(
        `Recursividad izquierda directa (${cycles}), incompatible con el análisis descendente predictivo LL(1).`
      );
    }
    if (table.leftRecursion.indirect.length > 0) {
      const cycles = table.leftRecursion.indirect.map((c) => c.cycleText).join(', ');
      parts.push(`Recursividad izquierda indirecta detectada en el ciclo ${cycles}.`);
    }
    if (table.leftFactoringIssues.length > 0) {
      parts.push(
        'Existen producciones del mismo no terminal que comparten un prefijo común, generando ambigüedad con 1 símbolo de adelanto.'
      );
    }
    if (table.conflicts.length > 0) {
      const cells = table.conflicts.map((c) => `M[${c.nonTerminal}, ${c.terminal}] (${c.type})`).join(', ');
      parts.push(`Celdas con múltiples producciones en pugna: ${cells}.`);
    }
    if ((grammar.duplicateCount || 0) > 0) {
      parts.push(
        `Se encontraron ${grammar.duplicateCount} producción(es) duplicada(s) en el texto original.`
      );
    }
    return parts.join(' ');
  }

  function buildUnfixableReport(
    rawText,
    grammar,
    table,
    prodInfo,
    problemTypes,
    affectedCells,
    involvedProductions,
    steps,
    manualGuidance
  ) {
    return {
      outcome: 'UNFIXABLE',
      canApply: false,
      isUnproductive: prodInfo.unproductive.length > 0,
      unproductiveNonTerminals: prodInfo.unproductive,
      problemTypes,
      affectedCells,
      involvedProductions,
      problemExplanation: buildProblemExplanation(grammar, table, prodInfo),
      techniques: ['Ninguna transformación automática segura aplicada'],
      originalGrammar: rawText.trim(),
      proposedGrammar: null,
      steps,
      manualGuidance,
      fallbackMessage: SAFE_FALLBACK_MESSAGE,
      metrics: {
        conflictsBefore: table.conflicts.length,
        conflictsAfter: table.conflicts.length,
        leftRecBefore: table.leftRecursion.hasAny,
        leftRecAfter: table.leftRecursion.hasAny,
        duplicatesBefore: grammar.duplicateCount || 0,
        duplicatesAfter: grammar.duplicateCount || 0,
        isLL1After: table.isLL1
      },
      validation: null
    };
  }

  /**
   * Determina si debe mostrarse el botón "Sugerir corrección" en la pestaña Matriz LL(1).
   */
  function shouldOfferSuggestion(grammar, table) {
    if (!grammar || !table) return false;
    if (table.conflicts.length > 0 || table.leftRecursion.hasAny) return true;
    if ((grammar.duplicateCount || 0) > 0) return true;
    const prodInfo = findProductiveNonTerminals(grammar);
    return prodInfo.startIsUnproductive || prodInfo.unproductive.length > 0;
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Assistant = {
    SAFE_FALLBACK_MESSAGE,
    createUniqueNonTerminal,
    findProductiveNonTerminals,
    shouldOfferSuggestion,
    suggestCorrection
  };
})(typeof window !== 'undefined' ? window : globalThis);
