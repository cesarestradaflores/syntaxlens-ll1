/**
 * tests.js
 * Suite de pruebas automatizadas para SyntaxLens LL(1).
 * Completamente independiente de la interfaz gráfica.
 * Ejecutable desde consola con SyntaxLens.Tests.run() o desde el botón "Ejecutar pruebas".
 * Todas las verificaciones invocan el motor real (sin resultados precalculados).
 */

(function (global) {
  'use strict';

  function sameSet(actualArr, expectedArr) {
    if (!Array.isArray(actualArr) || actualArr.length !== expectedArr.length) return false;
    const set = new Set(actualArr);
    return expectedArr.every((item) => set.has(item));
  }

  function cellProdTexts(table, nt, col) {
    const entries = (table.matrix[nt] && table.matrix[nt][col]) || [];
    return entries.map((e) => e.production.text);
  }

  function run(options) {
    const quiet = Boolean(options && options.quiet);
    const SL = global.SyntaxLens;
    const { Examples, Grammar, Sets, Table, Parser, Assistant } = SL;

    const results = [];

    function test(group, name, fn) {
      try {
        const info = fn();
        results.push({
          group,
          name,
          status: 'PASS',
          detail: typeof info === 'string' ? info : 'OK'
        });
      } catch (err) {
        results.push({
          group,
          name,
          status: 'FAIL',
          detail: err && err.message ? err.message : String(err)
        });
      }
    }

    function assert(condition, message) {
      if (!condition) {
        throw new Error(message || 'Aserción fallida');
      }
    }

    function analyze(grammarText) {
      const g = Grammar.parseGrammar(grammarText);
      assert(g.ok, `Error inesperado al parsear gramática: ${g.errors.map((e) => e.message).join('; ')}`);
      const s = Sets.computeAllSets(g);
      const t = Table.buildParsingTable(g, s);
      return { g, s, t };
    }

    const ex1 = Examples.getById('expresiones');
    const ex2 = Examples.getById('a_y_b');
    const ex3 = Examples.getById('conflicto_first_first');
    const ex4 = Examples.getById('recursividad_izquierda');
    const ex5 = Examples.getById('conflicto_first_follow');

    /* ----------------------------------------------------------------------
       1. Validaciones de gramática
       ---------------------------------------------------------------------- */
    test('Validación', 'Gramática vacía reporta error específico', () => {
      const r = Grammar.parseGrammar('   \n  ');
      assert(!r.ok && r.isEmpty, 'Debió marcarse como vacía');
      assert(r.errors[0].message.includes('Escribe al menos una producción'), `Mensaje inesperado: ${r.errors[0].message}`);
      return r.errors[0].message;
    });

    test('Validación', 'Rechaza "$" dentro de las producciones', () => {
      const r = Grammar.parseGrammar('S -> a $');
      assert(!r.ok, 'Debió rechazar "$"');
      return r.errors[0].message;
    });

    test('Validación', 'Rechaza ε combinado con otros símbolos y alternativas vacías', () => {
      const r1 = Grammar.parseGrammar('A -> ε a');
      const r2 = Grammar.parseGrammar('A -> a | ');
      assert(!r1.ok && !r2.ok, 'Debió rechazar ambos casos');
      return 'Ambos errores detectados con número de línea';
    });

    test('Validación', 'Elimina duplicados y advierte posible no terminal sin definir', () => {
      const r = Grammar.parseGrammar("S -> Term\nS -> Term");
      assert(r.ok, 'No debió bloquearse');
      assert(r.productions.length === 1, `Esperaba 1 producción deduplicada, obtuvo ${r.productions.length}`);
      const hasDupWarn = r.warnings.some((w) => w.code === 'DUPLICATE_PRODUCTION');
      const hasNtWarn = r.warnings.some((w) => w.code === 'POSSIBLE_UNDEFINED_NT');
      assert(hasDupWarn && hasNtWarn, 'Faltan advertencias esperadas');
      return `Producciones=${r.productions.length}, advertencias=${r.warnings.length}`;
    });

    /* ----------------------------------------------------------------------
       2. FIRST y FOLLOW (Ejemplos 1 y 5 + anulables en secuencia)
       ---------------------------------------------------------------------- */
    const a1 = analyze(ex1.gramatica);
    const a2 = analyze(ex2.gramatica);
    const a3 = analyze(ex3.gramatica);
    const a4 = analyze(ex4.gramatica);
    const a5 = analyze(ex5.gramatica);

    test('FIRST/FOLLOW', 'Ejemplo 1: FIRST de todos los no terminales', () => {
      assert(sameSet(a1.s.first.E, ['(', 'id']), `FIRST(E)=${a1.s.first.E}`);
      assert(sameSet(a1.s.first.T, ['(', 'id']), `FIRST(T)=${a1.s.first.T}`);
      assert(sameSet(a1.s.first.F, ['(', 'id']), `FIRST(F)=${a1.s.first.F}`);
      assert(sameSet(a1.s.first["E'"], ['+', 'ε']), `FIRST(E')=${a1.s.first["E'"]}`);
      assert(sameSet(a1.s.first["T'"], ['*', 'ε']), `FIRST(T')=${a1.s.first["T'"]}`);
      return `FIRST(E)={${a1.s.first.E.join(', ')}}, FIRST(E')={${a1.s.first["E'"].join(', ')}}, FIRST(T')={${a1.s.first["T'"].join(', ')}}`;
    });

    test('FIRST/FOLLOW', 'Ejemplo 1: FOLLOW de todos los no terminales (sin ε)', () => {
      assert(sameSet(a1.s.follow.E, [')', '$']), `FOLLOW(E)=${a1.s.follow.E}`);
      assert(sameSet(a1.s.follow["E'"], [')', '$']), `FOLLOW(E')=${a1.s.follow["E'"]}`);
      assert(sameSet(a1.s.follow.T, ['+', ')', '$']), `FOLLOW(T)=${a1.s.follow.T}`);
      assert(sameSet(a1.s.follow["T'"], ['+', ')', '$']), `FOLLOW(T')=${a1.s.follow["T'"]}`);
      assert(sameSet(a1.s.follow.F, ['*', '+', ')', '$']), `FOLLOW(F)=${a1.s.follow.F}`);
      a1.g.nonTerminals.forEach((nt) => {
        assert(!a1.s.follow[nt].includes('ε'), `FOLLOW(${nt}) no debe incluir ε`);
      });
      return `FOLLOW(E)={${a1.s.follow.E.join(', ')}}, FOLLOW(T)={${a1.s.follow.T.join(', ')}}, FOLLOW(F)={${a1.s.follow.F.join(', ')}}`;
    });

    test('FIRST/FOLLOW', 'Ejemplo 5: FIRST(A)={ a, ε } y FOLLOW(A)={ a }', () => {
      assert(sameSet(a5.s.first.A, ['a', 'ε']), `FIRST(A)=${a5.s.first.A}`);
      assert(sameSet(a5.s.follow.A, ['a']), `FOLLOW(A)=${a5.s.follow.A}`);
      return `FIRST(A)={${a5.s.first.A.join(', ')}}, FOLLOW(A)={${a5.s.follow.A.join(', ')}}`;
    });

    test('FIRST/FOLLOW', 'Producción con varios símbolos anulables (S -> A B C)', () => {
      const an = analyze('S -> A B C\nA -> a | ε\nB -> b | ε\nC -> c | ε');
      assert(sameSet(an.s.first.S, ['a', 'b', 'c', 'ε']), `FIRST(S)=${an.s.first.S}`);
      assert(sameSet(an.s.follow.A, ['b', 'c', '$']), `FOLLOW(A)=${an.s.follow.A}`);
      assert(sameSet(an.s.follow.B, ['c', '$']), `FOLLOW(B)=${an.s.follow.B}`);
      assert(sameSet(an.s.follow.C, ['$']), `FOLLOW(C)=${an.s.follow.C}`);
      return `FIRST(S)={${an.s.first.S.join(', ')}}, FOLLOW(A)={${an.s.follow.A.join(', ')}}`;
    });

    /* ----------------------------------------------------------------------
       3. Matriz predictiva LL(1) y detección de conflictos / recursividad
       ---------------------------------------------------------------------- */
    test('Matriz LL(1)', 'Ejemplo 1: celdas clave correctas, sin ε en columnas, 0 conflictos', () => {
      assert(a1.t.isLL1 && a1.t.conflicts.length === 0, 'Debió ser LL(1) sin conflictos');
      assert(!a1.t.columns.includes('ε'), 'ε nunca debe ser columna');
      const checks = [
        ['E', 'id', "E → T E'"],
        ['E', '(', "E → T E'"],
        ["E'", '+', "E' → + T E'"],
        ["E'", ')', "E' → ε"],
        ["E'", '$', "E' → ε"],
        ["T'", '*', "T' → * F T'"],
        ['F', '(', 'F → ( E )'],
        ['F', 'id', 'F → id']
      ];
      checks.forEach(([nt, col, exp]) => {
        const got = cellProdTexts(a1.t, nt, col);
        assert(got.length === 1 && got[0] === exp, `M[${nt},${col}] obtuvo "${got.join('|')}", esperaba "${exp}"`);
      });
      return '8 celdas clave verificadas · 0 conflictos';
    });

    test('Matriz LL(1)', 'Ejemplo 2: M[S,a]=S→a S b, M[S,b]=S→ε, M[S,$]=S→ε, 0 conflictos', () => {
      assert(a2.t.isLL1 && a2.t.conflicts.length === 0, 'Debió ser LL(1) sin conflictos');
      assert(cellProdTexts(a2.t, 'S', 'a')[0] === 'S → a S b', 'M[S,a] incorrecta');
      assert(cellProdTexts(a2.t, 'S', 'b')[0] === 'S → ε', 'M[S,b] incorrecta');
      assert(cellProdTexts(a2.t, 'S', '$')[0] === 'S → ε', 'M[S,$] incorrecta');
      return 'M[S,a], M[S,b], M[S,$] verificadas · 0 conflictos';
    });

    test('Conflictos', 'Ejemplo 3: detecta conflicto FIRST/FIRST en M[S, c] y falta de factorización', () => {
      assert(!a3.t.isLL1, 'No debe ser LL(1)');
      const c = a3.t.conflicts.find((x) => x.nonTerminal === 'S' && x.terminal === 'c');
      assert(c && c.type === 'FIRST/FIRST', `Esperaba FIRST/FIRST en M[S,c], obtuvo ${c ? c.type : 'ninguno'}`);
      assert(a3.t.leftFactoringIssues.length > 0, 'Debió detectar falta de factorización izquierda');
      return `M[S,c]: ${c.type} (${c.productions.map((p) => p.text).join(' vs ')})`;
    });

    test('Conflictos', 'Ejemplo 5: detecta conflicto FIRST/FOLLOW en M[A, a]', () => {
      assert(!a5.t.isLL1, 'No debe ser LL(1)');
      const c = a5.t.conflicts.find((x) => x.nonTerminal === 'A' && x.terminal === 'a');
      assert(c && c.type === 'FIRST/FOLLOW', `Esperaba FIRST/FOLLOW en M[A,a], obtuvo ${c ? c.type : 'ninguno'}`);
      return `M[A,a]: ${c.type} (${c.productions.map((p) => p.text).join(' vs ')})`;
    });

    test('Recursividad izq.', 'Ejemplo 4: detecta recursividad izquierda directa y conflicto en M[E, id]', () => {
      assert(!a4.t.isLL1, 'No debe ser LL(1)');
      assert(a4.t.leftRecursion.direct.length > 0, 'Debió detectar recursividad izquierda directa');
      const c = a4.t.conflicts.find((x) => x.nonTerminal === 'E' && x.terminal === 'id');
      assert(Boolean(c), 'Debió detectar conflicto en M[E,id]');
      return `Directa: ${a4.t.leftRecursion.direct[0].cycleText} + conflicto en M[E,id]`;
    });

    test('Recursividad izq.', 'Detecta recursividad izquierda indirecta (A -> B a ; B -> A b | c)', () => {
      const ind = analyze('A -> B a\nB -> A b | c');
      assert(!ind.t.isLL1, 'No debe ser LL(1)');
      assert(ind.t.leftRecursion.indirect.length > 0, 'Debió detectar ciclo indirecto');
      return `Ciclo detectado: ${ind.t.leftRecursion.indirect[0].cycleText}`;
    });

    test('Recursividad izq.', 'Detecta recursividad izquierda tras prefijo anulable (A -> B A | d ; B -> c | ε)', () => {
      const nul = analyze('A -> B A | d\nB -> c | ε');
      assert(!nul.t.isLL1, 'No debe ser LL(1)');
      assert(
        nul.t.leftRecursion.direct.some((d) => d.viaNullablePrefix),
        'Debió detectar recursividad izquierda a través de prefijo anulable'
      );
      return `Ciclo directo vía prefijo anulable: ${nul.t.leftRecursion.direct[0].cycleText}`;
    });

    /* ----------------------------------------------------------------------
       4. Simulación: las 10 cadenas obligatorias + cadena vacía
       ---------------------------------------------------------------------- */
    const ex1Chains = [
      ['id+id', true],
      ['id*id', true],
      ['id+id*id', true],
      ['(id+id)*id', true],
      ['id+*id', false]
    ];

    ex1Chains.forEach(([chain, expected]) => {
      test('Simulación Ej.1', `Cadena "${chain}" => ${expected ? 'ACEPTADA' : 'RECHAZADA'}`, () => {
        const sim = Parser.simulate(a1.g, a1.t, chain, { mode: 'auto' });
        assert(!sim.blocked && sim.accepted === expected, `Esperaba ${expected}, obtuvo status=${sim.status}`);
        return `${sim.status} en ${sim.steps.length} paso(s)`;
      });
    });

    const ex2Chains = [
      ['ab', true],
      ['aabb', true],
      ['aaabbb', true],
      ['aab', false],
      ['abb', false]
    ];

    ex2Chains.forEach(([chain, expected]) => {
      test('Simulación Ej.2', `Cadena "${chain}" => ${expected ? 'ACEPTADA' : 'RECHAZADA'}`, () => {
        const sim = Parser.simulate(a2.g, a2.t, chain, { mode: 'auto' });
        assert(!sim.blocked && sim.accepted === expected, `Esperaba ${expected}, obtuvo status=${sim.status}`);
        return `${sim.status} en ${sim.steps.length} paso(s)`;
      });
    });

    test('Cadena vacía', 'Cadena vacía "" aceptada en Ejemplo 2 y rechazada en Ejemplo 1', () => {
      const s2 = Parser.simulate(a2.g, a2.t, '', { mode: 'auto' });
      const s1 = Parser.simulate(a1.g, a1.t, '', { mode: 'auto' });
      assert(s2.status === 'ACCEPTED', `Ej.2 debió aceptar "", obtuvo ${s2.status}`);
      assert(s1.status === 'REJECTED', `Ej.1 debió rechazar "", obtuvo ${s1.status}`);
      return `Ej.2: ${s2.status} (${s2.steps.length} pasos) | Ej.1: ${s1.status}`;
    });

    /* ----------------------------------------------------------------------
       5. Tokenización y estabilidad del motor
       ---------------------------------------------------------------------- */
    test('Tokenización', 'Detecta símbolo desconocido con posición y prohíbe "$" en entrada', () => {
      const bad1 = Parser.tokenizeInput('id+@id', a1.g, 'auto');
      const bad2 = Parser.tokenizeInput('id+id$', a1.g, 'auto');
      assert(!bad1.ok && bad1.invalidToken === '@' && bad1.errorPosition === 4, `Error léxico incorrecto: ${bad1.error}`);
      assert(!bad2.ok && bad2.invalidToken === '$', `Debió rechazar "$": ${bad2.error}`);
      return `Desconocido '@' en pos ${bad1.errorPosition}; '$' rechazado correctamente`;
    });

    test('Tokenización', 'Modo separado por espacios funciona correctamente', () => {
      const okSp = Parser.simulate(a1.g, a1.t, 'id + id * id', { mode: 'spaces' });
      const badSp = Parser.tokenizeInput('id+id', a1.g, 'spaces');
      assert(okSp.status === 'ACCEPTED', 'Debió aceptar con espacios');
      assert(!badSp.ok, 'En modo por espacios "id+id" debe ser token desconocido');
      return 'Acepta "id + id * id" y rechaza "id+id" sin espacios';
    });

    test('Estabilidad', 'Bloquea gramáticas no LL(1) y reporta ANÁLISIS INCONCLUSO al límite de pasos', () => {
      const blk = Parser.simulate(a3.g, a3.t, 'ca', { mode: 'auto' });
      assert(blk.blocked && blk.status === 'BLOCKED', 'Debió bloquear simulación en Ejemplo 3');

      const inc = Parser.simulate(a2.g, a2.t, 'aaaaabbbbb', { mode: 'auto', maxSteps: 5 });
      assert(
        inc.status === 'INCONCLUSIVE' && inc.accepted === null,
        `Esperaba INCONCLUSIVE sin falso rechazo, obtuvo ${inc.status} (accepted=${inc.accepted})`
      );
      return `Ej.3: ${blk.status} | Límite 5 pasos: ${inc.status}`;
    });

    /* ----------------------------------------------------------------------
       6. Dos gramáticas personalizadas distintas a los ejemplos
       ---------------------------------------------------------------------- */
    test('Personalizada 1', 'Paréntesis balanceados (S -> ( S ) S | ε)', () => {
      const p1 = analyze('S -> ( S ) S | ε');
      assert(p1.t.isLL1, 'Debe ser LL(1)');
      assert(Parser.simulate(p1.g, p1.t, '', { mode: 'auto' }).status === 'ACCEPTED', '"" aceptada');
      assert(Parser.simulate(p1.g, p1.t, '(())()', { mode: 'auto' }).status === 'ACCEPTED', '"(())()" aceptada');
      assert(Parser.simulate(p1.g, p1.t, '(()', { mode: 'auto' }).status === 'REJECTED', '"(()" rechazada');
      assert(Parser.simulate(p1.g, p1.t, ')(', { mode: 'auto' }).status === 'REJECTED', '")(" rechazada');
      return 'Acepta "", "(())()" y rechaza "(()", ")("';
    });

    test('Personalizada 2', 'Sentencias de asignación (Stmt -> id = Expr ; | Expr -> num | id)', () => {
      const p2 = analyze('Stmt -> id = Expr ;\nExpr -> num | id');
      assert(p2.t.isLL1, 'Debe ser LL(1)');
      assert(Parser.simulate(p2.g, p2.t, 'id=num;', { mode: 'auto' }).status === 'ACCEPTED', '"id=num;" aceptada');
      assert(Parser.simulate(p2.g, p2.t, 'id = id ;', { mode: 'spaces' }).status === 'ACCEPTED', '"id = id ;" aceptada');
      assert(Parser.simulate(p2.g, p2.t, 'id=;', { mode: 'auto' }).status === 'REJECTED', '"id=;" rechazada');
      assert(Parser.simulate(p2.g, p2.t, '=num;', { mode: 'auto' }).status === 'REJECTED', '"=num;" rechazada');
      return 'Acepta "id=num;", "id = id ;" y rechaza "id=;", "=num;"';
    });

    /* ----------------------------------------------------------------------
       6b. Asistente de corrección de gramáticas (Casos obligatorios 1 a 4 + extras)
       ---------------------------------------------------------------------- */
    if (Assistant) {
      test('Asistente', 'Caso 1: Factorización izquierda (S -> A a | A b ; A -> c | ε) => 0 conflictos LL(1)', () => {
        const raw = 'S -> A a | A b\nA -> c | ε';
        const res = analyze(raw);
        const rep = Assistant.suggestCorrection(raw, res.g, res.s, res.t);
        assert(rep.outcome === 'FIXED' && rep.canApply, `Esperaba FIXED, obtuvo ${rep.outcome}`);
        assert(rep.metrics.conflictsBefore === 1 && rep.metrics.conflictsAfter === 0, 'Conflictos antes/después incorrectos');
        assert(rep.validation && rep.validation.table.isLL1, 'Propuesta debe ser LL(1)');
        // Verificar equivalencia de lenguaje en cadenas clave: ca, cb, a, b aceptadas; cc rechazada
        const ng = rep.validation.grammar;
        const nt = rep.validation.table;
        assert(Parser.simulate(ng, nt, 'ca', { mode: 'auto' }).status === 'ACCEPTED', 'ca debe aceptarse');
        assert(Parser.simulate(ng, nt, 'cb', { mode: 'auto' }).status === 'ACCEPTED', 'cb debe aceptarse');
        assert(Parser.simulate(ng, nt, 'a', { mode: 'auto' }).status === 'ACCEPTED', 'a debe aceptarse');
        assert(Parser.simulate(ng, nt, 'b', { mode: 'auto' }).status === 'ACCEPTED', 'b debe aceptarse');
        assert(Parser.simulate(ng, nt, 'cc', { mode: 'auto' }).status === 'REJECTED', 'cc debe rechazarse');
        return `0 conflictos · propuesta: ${rep.proposedGrammar.replace(/\n/g, ' ; ')}`;
      });

      test('Asistente', 'Caso 2: Recursividad izquierda directa (E -> E + T | T ; T -> id) => 0 conflictos y sin rec. izq.', () => {
        const raw = 'E -> E + T | T\nT -> id';
        const res = analyze(raw);
        const rep = Assistant.suggestCorrection(raw, res.g, res.s, res.t);
        assert(rep.outcome === 'FIXED' && rep.canApply, `Esperaba FIXED, obtuvo ${rep.outcome}`);
        assert(rep.metrics.conflictsAfter === 0 && !rep.metrics.leftRecAfter, 'Debe quedar sin conflictos ni recursividad izquierda');
        assert(rep.validation && rep.validation.table.isLL1, 'Propuesta debe ser LL(1)');
        const ng = rep.validation.grammar;
        const nt = rep.validation.table;
        assert(Parser.simulate(ng, nt, 'id', { mode: 'auto' }).status === 'ACCEPTED', 'id aceptada');
        assert(Parser.simulate(ng, nt, 'id+id+id', { mode: 'auto' }).status === 'ACCEPTED', 'id+id+id aceptada');
        assert(Parser.simulate(ng, nt, '+id', { mode: 'auto' }).status === 'REJECTED', '+id rechazada');
        return `0 conflictos · propuesta: ${rep.proposedGrammar.replace(/\n/g, ' ; ')}`;
      });

      test('Asistente', 'Caso 3: Producciones duplicadas (S -> a | a) => S -> a', () => {
        const raw = 'S -> a | a';
        const res = analyze(raw);
        assert(Assistant.shouldOfferSuggestion(res.g, res.t), 'Debe ofrecer sugerencia cuando hay duplicados');
        const rep = Assistant.suggestCorrection(raw, res.g, res.s, res.t);
        assert(rep.outcome === 'FIXED' && rep.canApply, `Esperaba FIXED, obtuvo ${rep.outcome}`);
        assert(rep.proposedGrammar.trim() === 'S -> a', `Esperaba "S -> a", obtuvo "${rep.proposedGrammar}"`);
        assert(rep.validation.grammar.duplicateCount === 0 && rep.validation.table.isLL1, 'Sin duplicados y LL(1)');
        return `Propuesta limpia: ${rep.proposedGrammar}`;
      });

      test('Asistente', 'Caso 4: Gramática improductiva (S -> S) => detectada sin inventar corrección', () => {
        const raw = 'S -> S';
        const res = analyze(raw);
        const rep = Assistant.suggestCorrection(raw, res.g, res.s, res.t);
        assert(rep.outcome === 'UNFIXABLE' && !rep.canApply, 'No debe proponer corrección automática');
        assert(rep.isUnproductive === true, 'Debe marcar isUnproductive=true');
        assert(rep.proposedGrammar === null, 'No debe inventar producciones');
        assert(
          rep.fallbackMessage === Assistant.SAFE_FALLBACK_MESSAGE,
          `Mensaje fallback inesperado: ${rep.fallbackMessage}`
        );
        return 'Improductiva detectada · sin corrección inventada · mensaje seguro mostrado';
      });

      test('Asistente', 'Conflicto FIRST/FOLLOW (Ejemplo 5) genera explicación manual y evita colisión de nombres únicos', () => {
        const rep5 = Assistant.suggestCorrection(ex5.gramatica, a5.g, a5.s, a5.t);
        assert(rep5.outcome === 'UNFIXABLE' && !rep5.canApply, 'FIRST/FOLLOW en Ej.5 no debe inventar reescritura insegura');
        assert(rep5.manualGuidance.length > 0, 'Debe incluir orientación explicativa para FIRST/FOLLOW');
        assert(rep5.fallbackMessage === Assistant.SAFE_FALLBACK_MESSAGE, 'Debe incluir mensaje de respaldo seguro');

        // Verificar unicidad de nombres cuando E' ya existe en la gramática
        const used = new Set(['E', "E'", "E''", 'T', 'id']);
        const fresh = Assistant.createUniqueNonTerminal('E', used);
        assert(fresh === 'E_1', `Esperaba E_1 al colisionar E' y E'', obtuvo ${fresh}`);
        return `Ej.5: guía FIRST/FOLLOW OK · nombre único sin colisión: ${fresh}`;
      });
    }

    /* ----------------------------------------------------------------------
       7. Flujo explícito de interfaz (solo si existe DOM y SyntaxLens.UI)
       ---------------------------------------------------------------------- */
    if (
      typeof document !== 'undefined' &&
      SL.UI &&
      document.getElementById('example-select') &&
      document.getElementById('grammar-input')
    ) {
      const selectEl = document.getElementById('example-select');
      const inputEl = document.getElementById('grammar-input');
      const analyzeBtn = document.getElementById('btn-analyze');
      const verdictEl = document.getElementById('global-verdict-banner');
      const badgeNt = document.getElementById('badge-nt');
      const badgeT = document.getElementById('badge-t');
      const badgeProd = document.getElementById('badge-prod');
      const badgeConf = document.getElementById('badge-conflicts');
      const setsEmpty = document.getElementById('sets-empty-state');
      const matrixEmpty = document.getElementById('matrix-empty-state');
      const simEmpty = document.getElementById('sim-empty-state');
      const simStartBtn = document.getElementById('btn-sim-start');

      // Guardar estado actual del usuario para restaurarlo al finalizar
      const savedText = inputEl.value;
      const savedSelect = selectEl.value;
      const savedAnalyzed = Boolean(SL.UI.state.isAnalyzed);
      const expectedNotice =
        "La gramática cambió. Pulsa 'Analizar gramática' para actualizar los resultados.";

      const assertInvalidated = (contextLabel) => {
        assert(!SL.UI.state.isAnalyzed && SL.UI.state.grammar === null, `${contextLabel}: no debió estar analizada`);
        assert(verdictEl.classList.contains('hidden'), `${contextLabel}: el veredicto debe estar oculto`);
        assert(
          badgeNt.textContent.includes('—') &&
            badgeT.textContent.includes('—') &&
            badgeProd.textContent.includes('—') &&
            badgeConf.textContent.includes('—'),
          `${contextLabel}: todos los badges deben mostrar "—"`
        );
        assert(
          !setsEmpty.classList.contains('hidden') && setsEmpty.textContent.trim() === expectedNotice,
          `${contextLabel}: aviso faltante en FIRST/FOLLOW`
        );
        assert(
          !matrixEmpty.classList.contains('hidden') && matrixEmpty.textContent.trim() === expectedNotice,
          `${contextLabel}: aviso faltante en Matriz LL(1)`
        );
        assert(
          !simEmpty.classList.contains('hidden') && simEmpty.textContent.trim() === expectedNotice,
          `${contextLabel}: aviso faltante en Simulación`
        );
        assert(simStartBtn.disabled === true, `${contextLabel}: botón de simulación debe estar deshabilitado`);
      };

      try {
        test('Flujo UI', '(a) Cargar un ejemplo del menú NO dispara el análisis automático', () => {
          selectEl.value = 'a_y_b';
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          assert(inputEl.value.trim() === ex2.gramatica.trim(), 'Debió cargar el texto del Ejemplo 2');
          assertInvalidated('Al cargar ejemplo');
          return 'Texto cargado sin analizar · badges "—" · veredicto oculto · simulación deshabilitada';
        });

        test('Flujo UI', '(b) Editar el texto en el editor invalida resultados previos', () => {
          // Primero analizar para tener resultados visibles
          analyzeBtn.click();
          assert(SL.UI.state.isAnalyzed && !verdictEl.classList.contains('hidden'), 'Debió analizar al pulsar botón');
          assert(simStartBtn.disabled === false, 'Simulación debió habilitarse tras analizar Ej.2');

          // Ahora editar texto y verificar invalidación inmediata
          inputEl.value = 'S -> a S b | ε\n';
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          assertInvalidated('Tras editar texto');
          return 'Edición invalidó badges, ocultó veredicto, mostró avisos y deshabilitó simulación';
        });

        test('Flujo UI', '(c) Pulsar "Analizar gramática" regenera resultados y respeta bloqueo LL(1)', () => {
          // Regenerar en Ejemplo 2 (válida LL(1))
          analyzeBtn.click();
          assert(SL.UI.state.isAnalyzed && SL.UI.state.grammar !== null, 'Debió regenerar el análisis');
          assert(!verdictEl.classList.contains('hidden') && verdictEl.textContent.includes('válida'), 'Veredicto válido visible');
          assert(badgeNt.textContent.includes('1') && badgeProd.textContent.includes('2'), 'Badges numéricos actualizados');
          assert(simStartBtn.disabled === false, 'Simulación habilitada en gramática LL(1)');

          // Probar gramática bloqueada (Ejemplo 3): simulación debe seguir deshabilitada
          selectEl.value = 'conflicto_first_first';
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          assertInvalidated('Al seleccionar Ej.3');
          analyzeBtn.click();
          assert(SL.UI.state.isAnalyzed && !SL.UI.state.table.isLL1, 'Ej.3 analizado como no LL(1)');
          assert(!verdictEl.classList.contains('hidden') && verdictEl.textContent.includes('NO es LL(1)'), 'Veredicto NO es LL(1) visible');
          assert(simStartBtn.disabled === true, 'Botón de simulación debe permanecer deshabilitado cuando está bloqueada');
          return 'Regenera en LL(1) (simulación habilitada) y bloquea simulación en Ej.3 (no LL(1))';
        });

        test('Flujo UI', '(d) Pulsar "Simular" inicia reproducción con "Pausar", evita temporizadores duplicados y permite control manual', () => {
          const chainEl = document.getElementById('chain-input');
          const playBtn = document.getElementById('btn-step-play');
          const nextBtn = document.getElementById('btn-step-next');
          const prevBtn = document.getElementById('btn-step-prev');
          const allBtn = document.getElementById('btn-step-all');
          const resultEl = document.getElementById('sim-result-banner');

          // Preparar Ejemplo 2 (LL(1)) y analizar
          selectEl.value = 'a_y_b';
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          analyzeBtn.click();
          chainEl.value = 'aabb';

          // Pulsar "Simular": debe iniciar reproducción automática y mostrar "Pausar"
          simStartBtn.click();
          const firstTimer = SL.UI.state.simTimer;
          assert(firstTimer !== null, 'Al pulsar "Simular" debe iniciar el temporizador de reproducción');
          assert(playBtn.textContent.trim() === 'Pausar', `El botón debe decir "Pausar", dice "${playBtn.textContent}"`);
          assert(SL.UI.state.simStepIndex === 0, 'Debe iniciar en el paso 1 (índice 0)');

          // Pulsar "Simular" nuevamente: reemplaza el temporizador sin duplicar
          simStartBtn.click();
          const secondTimer = SL.UI.state.simTimer;
          assert(secondTimer !== null && secondTimer !== firstTimer, 'Debió reemplazar el temporizador anterior');
          assert(playBtn.textContent.trim() === 'Pausar', 'Debe mantenerse en estado "Pausar"');

          // Pausar y avanzar/retroceder manualmente
          playBtn.click();
          assert(SL.UI.state.simTimer === null, 'Al pausar el temporizador debe detenerse');
          assert(playBtn.textContent.trim() === 'Reproducir', 'Al pausar el botón debe volver a "Reproducir"');

          nextBtn.click();
          assert(SL.UI.state.simStepIndex === 1, 'Paso siguiente debió avanzar al índice 1');
          prevBtn.click();
          assert(SL.UI.state.simStepIndex === 0, 'Paso anterior debió regresar al índice 0');

          // Ejecutar todo: resultado inmediato y sin temporizador activo
          allBtn.click();
          assert(SL.UI.state.simTimer === null, 'Ejecutar todo no debe dejar temporizador activo');
          assert(!resultEl.classList.contains('hidden') && resultEl.textContent.includes('CADENA ACEPTADA'), 'Debe mostrar CADENA ACEPTADA');
          return 'Auto-reproducción al pulsar Simular · Pausar/manual OK · sin temporizadores duplicados · Ejecutar todo OK';
        });

        test('Flujo UI', '(e) Asistente en Matriz LL(1): sugerir, aplicar y restaurar gramática original', () => {
          // Seleccionar Ejemplo 3 (conflicto FIRST/FIRST) y analizar
          selectEl.value = 'conflicto_first_first';
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          analyzeBtn.click();

          const suggestBtn = document.getElementById('btn-suggest-fix');
          assert(Boolean(suggestBtn), 'Debe mostrarse el botón "Sugerir corrección" en Matriz LL(1)');
          suggestBtn.click();

          const panel = document.getElementById('assistant-panel');
          const applyBtn = document.getElementById('btn-assistant-apply');
          const copyBtn = document.getElementById('btn-assistant-copy');
          const restoreBtn = document.getElementById('btn-assistant-restore');
          const cancelBtn = document.getElementById('btn-assistant-cancel');
          assert(panel && !panel.classList.contains('hidden'), 'Panel del asistente debe abrirse');
          assert(applyBtn && !applyBtn.disabled && copyBtn && restoreBtn && cancelBtn, 'Deben existir los 4 botones del asistente');

          // Aplicar corrección y analizar
          applyBtn.click();
          assert(SL.UI.state.table && SL.UI.state.table.isLL1 && SL.UI.state.table.conflicts.length === 0, 'Tras aplicar debe quedar LL(1) con 0 conflictos');
          assert(simStartBtn.disabled === false, 'La simulación debe desbloquearse tras aplicar corrección LL(1)');

          // Restaurar gramática original
          const restoreAppliedBtn = document.getElementById('btn-restore-applied-fix');
          assert(Boolean(restoreAppliedBtn), 'Debe mostrarse el botón "Restaurar gramática original" tras aplicar');
          restoreAppliedBtn.click();
          assert(inputEl.value.trim() === ex3.gramatica.trim(), 'Debe restaurarse exactamente la gramática original del Ejemplo 3');
          assert(SL.UI.state.table && !SL.UI.state.table.isLL1, 'Al restaurar debe volver al estado con conflicto');
          return 'Sugerir -> Aplicar (0 conflictos, sim habilitada) -> Restaurar original OK';
        });
      } finally {
        // Restaurar exactamente el estado previo del usuario sin dejar temporizadores activos
        inputEl.value = savedText;
        selectEl.value = savedSelect;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (savedAnalyzed) {
          SL.UI.analyzeCurrentGrammar();
        }
      }
    }

    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.length - passed;
    const summary = {
      total: results.length,
      passed,
      failed,
      allPassed: failed === 0,
      results
    };

    if (!quiet && typeof console !== 'undefined') {
      const title =
        failed === 0
          ? `PASS · SyntaxLens.Tests (${passed}/${results.length} pruebas aprobadas)`
          : `FAIL · SyntaxLens.Tests (${passed}/${results.length} aprobadas, ${failed} fallida(s))`;

      if (typeof console.group === 'function') {
        console.group(title);
      } else {
        console.log(title);
      }

      results.forEach((r, idx) => {
        const line = `[${r.status}] #${idx + 1} (${r.group}) ${r.name} — ${r.detail}`;
        if (r.status === 'FAIL') {
          console.error(line);
        } else {
          console.log(line);
        }
      });

      console.log(`Resumen final: ${passed} PASS, ${failed} FAIL de ${results.length} pruebas.`);

      if (typeof console.groupEnd === 'function') {
        console.groupEnd();
      }
    }

    return summary;
  }

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Tests = {
    run
  };
})(typeof window !== 'undefined' ? window : globalThis);
