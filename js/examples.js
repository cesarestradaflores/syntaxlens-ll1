/**
 * examples.js
 * Catálogo de gramáticas precargadas para SyntaxLens LL(1) (Autómatas I).
 * Incluye gramáticas LL(1) válidas y casos con conflictos o recursividad izquierda.
 */

(function (global) {
  'use strict';

  const EXAMPLES = [
    {
      id: 'expresiones',
      nombre: 'Ejemplo 1: Expresiones aritméticas (LL(1): Sí)',
      ll1Esperado: true,
      etiqueta: 'LL(1): Sí',
      tipoEtiqueta: 'ok',
      descripcion:
        'Gramática clásica de expresiones con suma, multiplicación, paréntesis e identificadores, sin recursividad izquierda.',
      gramatica: [
        "E  -> T E'",
        "E' -> + T E' | ε",
        "T  -> F T'",
        "T' -> * F T' | ε",
        'F  -> ( E ) | id'
      ].join('\n'),
      cadenaInicial: 'id+id*id',
      cadenasEjemplo: [
        { cadena: 'id+id', esperada: true },
        { cadena: 'id*id', esperada: true },
        { cadena: 'id+id*id', esperada: true },
        { cadena: '(id+id)*id', esperada: true },
        { cadena: 'id+*id', esperada: false }
      ]
    },
    {
      id: 'a_y_b',
      nombre: 'Ejemplo 2: Cadenas con a y b (LL(1): Sí)',
      ll1Esperado: true,
      etiqueta: 'LL(1): Sí',
      tipoEtiqueta: 'ok',
      descripcion:
        'Lenguaje a^n b^n (incluyendo la cadena vacía ε). Permite observar recursión central y aceptación de cadena vacía.',
      gramatica: 'S -> a S b | ε',
      cadenaInicial: 'aabb',
      cadenasEjemplo: [
        { cadena: 'ab', esperada: true },
        { cadena: 'aabb', esperada: true },
        { cadena: 'aaabbb', esperada: true },
        { cadena: 'aab', esperada: false },
        { cadena: 'abb', esperada: false }
      ]
    },
    {
      id: 'conflicto_first_first',
      nombre: 'Ejemplo 3: Conflicto FIRST/FIRST (LL(1): No)',
      ll1Esperado: false,
      etiqueta: 'LL(1): No',
      tipoEtiqueta: 'error',
      descripcion:
        'Las alternativas de S comparten el prefijo común A y producen un conflicto FIRST/FIRST en M[S, c].',
      gramatica: ['S -> A a | A b', 'A -> c | ε'].join('\n'),
      cadenaInicial: 'ca',
      cadenasEjemplo: [
        { cadena: 'ca', esperada: null },
        { cadena: 'cb', esperada: null }
      ]
    },
    {
      id: 'recursividad_izquierda',
      nombre: 'Ejemplo 4: Recursividad izquierda directa (LL(1): No)',
      ll1Esperado: false,
      etiqueta: 'LL(1): No',
      tipoEtiqueta: 'error',
      descripcion:
        'Gramática con recursividad izquierda directa (E -> E + T), lo que provoca conflicto en M[E, id] e impide análisis LL(1).',
      gramatica: ['E -> E + T | T', 'T -> id'].join('\n'),
      cadenaInicial: 'id+id',
      cadenasEjemplo: [{ cadena: 'id+id', esperada: null }]
    },
    {
      id: 'conflicto_first_follow',
      nombre: 'Ejemplo 5: Conflicto FIRST/FOLLOW (LL(1): No)',
      ll1Esperado: false,
      etiqueta: 'LL(1): No',
      tipoEtiqueta: 'error',
      descripcion:
        'A deriva tanto "a" como ε, y "a" también está en FOLLOW(A), generando un conflicto FIRST/FOLLOW en M[A, a].',
      gramatica: ['S -> A a', 'A -> a | ε'].join('\n'),
      cadenaInicial: 'aa',
      cadenasEjemplo: [
        { cadena: 'aa', esperada: null },
        { cadena: 'a', esperada: null }
      ]
    }
  ];

  global.SyntaxLens = global.SyntaxLens || {};
  global.SyntaxLens.Examples = {
    list: EXAMPLES,
    getById: function (id) {
      return EXAMPLES.find((ex) => ex.id === id) || null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
