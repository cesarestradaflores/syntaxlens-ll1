# Documentación Técnica y Académica — SyntaxLens LL(1)

**Subtítulo:** Visualizador de análisis sintáctico predictivo  
**Materia:** Autómatas I  
**Tecnologías:** HTML5 + CSS3 + JavaScript puro (sin frameworks, sin backend, sin npm, 100% offline)

---

## 1. Objetivo de la aplicación

**SyntaxLens LL(1)** es una herramienta web didáctica diseñada para visualizar paso a paso el funcionamiento interno de un analizador sintáctico descendente predictivo **LL(1)**.

La aplicación no se limita a indicar si una cadena pertenece o no al lenguaje: siempre expone el procedimiento completo de forma genérica para **cualquier gramática libre de contexto (GLC)** ingresada por el usuario:

1. Validación de la gramática con número de línea, clasificación automática de símbolos ($S$, $V_N$, $V_T$) y numeración de producciones.
2. Cálculo iterativo hasta punto fijo de los conjuntos **FIRST** (por no terminal y por producción) y **FOLLOW**, acompañado de una traza explicativa por iteración.
3. Construcción de la **matriz predictiva $M[A, a]$**, detección de conflictos (`FIRST/FIRST`, `FIRST/FOLLOW`, `FOLLOW/FOLLOW`), recursividad izquierda (directa, indirecta y mediante prefijos anulables) y falta de factorización izquierda.
4. Simulación interactiva con pila visual, cinta de entrada, celda activa resaltada en la matriz, tabla de traza exportable (CSV y portapapeles), resultado detallado (**ACEPTADA**, **RECHAZADA** o **ANÁLISIS INCONCLUSO**), **árbol de derivación** y **derivación por la izquierda**.

> `[INSERTAR CAPTURA: Vista general de SyntaxLens LL(1) en la pestaña Gramática con el Ejemplo 1, editor con numeración de líneas y barra de veredicto]`

---

## 2. Funcionamiento y estructura del código

El proyecto está organizado bajo un único espacio de nombres global **`window.SyntaxLens`** cargado mediante scripts clásicos en orden determinista en `index.html`. Esta arquitectura elimina dependencias de servidores, evita errores de CORS con módulos ES6 bajo `file://` y garantiza compatibilidad directa con **archivo local**, **VS Code Live Server** y **GitHub Pages**.

### Módulos del sistema

| Archivo | Espacio de nombres | Responsabilidad |
| :--- | :--- | :--- |
| `index.html` | — | Estructura HTML de las 4 pestañas (*Gramática*, *FIRST / FOLLOW*, *Matriz LL(1)*, *Simulación*), barra global de estado, panel de pruebas y carga ordenada de scripts. |
| `css/styles.css` | — | Estética minimalista tipo herramienta de desarrollo, modo oscuro/claro, colores semánticos (verde, rojo, amarillo, azul), editor con líneas, matriz con encabezados fijos, pila visual y estilos SVG. |
| `js/examples.js` | `SyntaxLens.Examples` | Catálogo de los 5 ejemplos precargados (expresiones, $a^n b^n$, conflicto FIRST/FIRST, recursividad izquierda directa y conflicto FIRST/FOLLOW) y sus cadenas de prueba. |
| `js/grammar.js` | `SyntaxLens.Grammar` | Parseo línea por línea (`->` y `→`, `|`, `ε`/`eps`/`epsilon`), validación con número de línea, deduplicación de producciones, detección de posibles no terminales sin definir (advertencia amarilla) y clasificación de $V_N$ y $V_T$. |
| `js/sets.js` | `SyntaxLens.Sets` | Algoritmos iterativos a punto fijo para `FIRST(X)`, `FIRST(α)` por producción y `FOLLOW(X)` (garantizando $\varepsilon \notin \text{FOLLOW}$), además de trazas paso a paso. |
| `js/table.js` | `SyntaxLens.Table` | Construcción de $M[A, a]$ sin incluir $\varepsilon$ como columna, registro de procedencia (`FIRST`/`FOLLOW`) para tooltips, clasificación de conflictos, detección de recursividad izquierda directa/indirecta/anulable y sugerencias didácticas. |
| `js/parser.js` | `SyntaxLens.Parser` | Tokenizador (automático por terminal más largo primero y separado por espacios), soporte a cadenas vacías, bloqueo de `$` como token del usuario, simulador con pila, detección de ciclos, límite configurable de pasos (`1000`), árbol de derivación, derivación por la izquierda y exportadores CSV/Markdown. |
| `js/ui.js` | `SyntaxLens.UI` | Controlador de interfaz: pestañas, numeración de líneas sincronizada, tooltips flotantes, resaltado de filas/columnas, reproducción paso a paso con velocidad ajustable, renderizado del árbol SVG y visor de pruebas. |
| `js/tests.js` | `SyntaxLens.Tests` | Suite de 31 pruebas automatizadas independientes de la UI (`SyntaxLens.Tests.run()`), ejecutadas directamente sobre el motor real. |

### Arquitectura del flujo de datos

```text
Editor de gramática (con numeración de líneas)
   │
   ▼  SyntaxLens.Grammar.parseGrammar()
Validación + V_N + V_T + Símbolo inicial + Producciones numeradas (1..N)
   │
   ▼  SyntaxLens.Sets.computeAllSets()
FIRST(X), FIRST(α), FOLLOW(X) + Trazas de iteraciones hasta punto fijo
   │
   ▼  SyntaxLens.Table.buildParsingTable()
Matriz M[A, a] + Conflictos + Recursividad izq. + Factorización + Veredicto
   │
   ▼  SyntaxLens.Parser.simulate()  (solo si la gramática es LL(1))
Tokenización + Pila + Traza + Veredicto (ACEPTADA / RECHAZADA / INCONCLUSO) + Árbol SVG
```

---

## 3. Conjuntos FIRST y FOLLOW

### 3.1. Reglas de FIRST (Primeros)

$\text{FIRST}(\alpha)$ contiene todos los terminales que pueden iniciar alguna cadena derivada de $\alpha$, además de $\varepsilon$ si $\alpha \Rightarrow^* \varepsilon$.

1. Para todo terminal $t$: $\text{FIRST}(t) = \{ t \}$.
2. Si existe $A \to \varepsilon$: agregar $\varepsilon$ a $\text{FIRST}(A)$.
3. Para cada producción $A \to X_1 X_2 \dots X_k$:
   - Recorrer $i = 1 \dots k$: agregar $\text{FIRST}(X_i) \setminus \{ \varepsilon \}$ a $\text{FIRST}(A)$.
   - Si $\varepsilon \notin \text{FIRST}(X_i)$, detener el recorrido.
   - Si todos los $X_1 \dots X_k$ son anulables ($\varepsilon \in \text{FIRST}(X_i)$ para todo $i$), agregar $\varepsilon$ a $\text{FIRST}(A)$.
4. Repetir hasta alcanzar un **punto fijo** (ningún conjunto cambia en una iteración completa).

### 3.2. Reglas de FOLLOW (Siguientes)

$\text{FOLLOW}(A)$ contiene todos los terminales (y el marcador `$`) que pueden aparecer inmediatamente después de $A$ en alguna forma sentencial derivada desde el símbolo inicial $S$. **$\text{FOLLOW}(A)$ nunca contiene $\varepsilon$.**

1. **Inicialización:** agregar `$` a $\text{FOLLOW}(S)$ (símbolo inicial).
2. **Sufijo no vacío:** para toda producción $A \to \alpha B \beta$ (con $B \in V_N$ y $\beta \neq \varepsilon$), agregar $\text{FIRST}(\beta) \setminus \{ \varepsilon \}$ a $\text{FOLLOW}(B)$.
3. **Final o sufijo anulable:** para toda producción $A \to \alpha B$, o $A \to \alpha B \beta$ donde $\varepsilon \in \text{FIRST}(\beta)$, agregar $\text{FOLLOW}(A)$ a $\text{FOLLOW}(B)$.
4. Repetir las reglas 2 y 3 hasta alcanzar un **punto fijo**.

> `[INSERTAR CAPTURA: Pestaña FIRST / FOLLOW mostrando las tablas de FIRST, FOLLOW, FIRST(α) por producción y el panel colapsable "Ver cómo se calculó"]`

---

## 4. Construcción de la Matriz Predictiva LL(1)

La matriz $M[A, a]$ tiene una fila por cada no terminal $A \in V_N$ y una columna por cada terminal $a \in V_T$ más `$`. **$\varepsilon$ nunca aparece como columna.**

Para cada producción numerada $A \to \alpha$:

1. Para cada terminal $a \in \text{FIRST}(\alpha)$ (excepto $\varepsilon$), insertar $A \to \alpha$ en $M[A, a]$ registrando procedencia `FIRST` y motivo `a ∈ FIRST(α)`.
2. Si $\varepsilon \in \text{FIRST}(\alpha)$, para cada $b \in \text{FOLLOW}(A)$ (incluyendo `$`), insertar $A \to \alpha$ en $M[A, b]$ registrando procedencia `FOLLOW` y motivo `ε ∈ FIRST(α) y b ∈ FOLLOW(A)`.
3. Si la misma producción se inserta dos veces en la misma celda, **no** se considera conflicto; únicamente si dos o más producciones **distintas** caen en $M[A, a]$ se marca la celda como **CONFLICTO** y se clasifica en:
   - **FIRST/FIRST:** ambas entraron vía `FIRST`.
   - **FIRST/FOLLOW:** una entró vía `FIRST` y otra anulable entró vía `FOLLOW`.
   - **FOLLOW/FOLLOW:** varias producciones anulables del mismo no terminal coincidieron en `FOLLOW`.
4. Adicionalmente, se verifica recursividad izquierda directa, indirecta y a través de prefijos anulables (p. ej. $A \to B A$ con $B \Rightarrow^* \varepsilon$), así como prefijos comunes que sugieren factorización por la izquierda.

> `[INSERTAR CAPTURA: Pestaña Matriz LL(1) del Ejemplo 1 sin conflictos, con tooltip explicativo y fila/columna resaltadas]`

> `[INSERTAR CAPTURA: Pestaña Matriz LL(1) del Ejemplo 3 (conflicto FIRST/FIRST) o Ejemplo 5 (conflicto FIRST/FOLLOW) mostrando el veredicto NO es LL(1), las celdas implicadas y las sugerencias]`

---

## 5. Instrucciones de uso

### Cómo abrir la aplicación
- **Apertura directa (`file://`):** haz doble clic en `index.html`.
- **Visual Studio Code + Live Server:** abre la carpeta `syntaxlens-ll1` en VS Code, haz clic derecho en `index.html` y selecciona **Open with Live Server**.
- **GitHub Pages:** publica la carpeta raíz en un repositorio y activa GitHub Pages sobre la rama principal.

### Flujo recomendado
1. En la pestaña **Gramática**, selecciona un ejemplo precargado (Ejemplos 1 a 5) o escribe tu propia gramática en el editor con numeración de líneas y presiona **Analizar gramática** (o `Ctrl + Enter`).
2. Revisa en la barra global el veredicto (`Gramática LL(1) válida · 0 conflictos` o `Gramática NO es LL(1)`) y los 4 badges de conteo.
3. Abre la pestaña **FIRST / FOLLOW** para inspeccionar las tablas y desplegar **Ver cómo se calculó**.
4. Abre la pestaña **Matriz LL(1)** para inspeccionar `M[A, a]`, leer tooltips al pasar el cursor y resaltar filas/columnas con clic.
5. Si la gramática es LL(1), ve a la pestaña **Simulación**:
   - Elige el modo de tokenización (**Automático** o **Separado por espacios**).
   - Escribe una cadena (o déjala vacía para probar $\varepsilon$) o haz clic en una cadena de ejemplo.
   - Usa **Paso siguiente**, **Paso anterior**, **Reproducir / Pausar** (con velocidad ajustable), **Ejecutar todo** o **Reiniciar**.
   - Exporta la traza en **CSV** o cópiala al portapapeles con **Copiar traza**.
6. Presiona **Ejecutar pruebas** en la barra superior (o ejecuta `SyntaxLens.Tests.run()` en la consola) para verificar todas las pruebas automatizadas sobre el motor real.

> `[INSERTAR CAPTURA: Pestaña Simulación ejecutando id+id*id paso a paso con pila visual, cinta de entrada, celda activa M[A, a] y tabla de traza]`

> `[INSERTAR CAPTURA: Resultado "CADENA ACEPTADA ✅" con Árbol de derivación SVG y Derivación por la izquierda]`

> `[INSERTAR CAPTURA: Resultado "CADENA RECHAZADA ❌" para id+*id con explicación exacta del error sintáctico]`

> `[INSERTAR CAPTURA: Panel de pruebas automatizadas mostrando 31 PASS, 0 FAIL]`

---

## 6. Tabla de cadenas aceptadas y rechazadas por ejemplo

### Ejemplo 1: Expresiones aritméticas (`LL(1): Sí`)
`E -> T E'`, `E' -> + T E' | ε`, `T -> F T'`, `T' -> * F T' | ε`, `F -> ( E ) | id`

| Cadena | Tokens (`$` automático) | Resultado | Pasos | Motivo / Observación |
| :--- | :--- | :---: | :---: | :--- |
| `id+id` | `id + id $` | **ACEPTADA ✅** | 13 | Derivación completa de suma de dos identificadores. |
| `id*id` | `id * id $` | **ACEPTADA ✅** | 11 | Expande `T' → * F T'` y empareja correctamente. |
| `id+id*id` | `id + id * id $` | **ACEPTADA ✅** | 17 | Respeta precedencia de `*` sobre `+`. |
| `(id+id)*id` | `( id + id ) * id $` | **ACEPTADA ✅** | 24 | Expande `F → ( E )`, empareja paréntesis y aplica `* id`. |
| `id+*id` | `id + * id $` | **RECHAZADA ❌** | 8 | Celda vacía en `M[T, *]`: se esperaba uno de `{ (, id }` pero se encontró `*`. |
| `""` *(vacía)* | `$` | **RECHAZADA ❌** | 1 | Celda vacía en `M[E, $]`: `E` no deriva $\varepsilon$. |

### Ejemplo 2: Cadenas con `a` y `b` (`LL(1): Sí`)
`S -> a S b | ε`

| Cadena | Tokens (`$` automático) | Resultado | Pasos | Motivo / Observación |
| :--- | :--- | :---: | :---: | :--- |
| `ab` | `a b $` | **ACEPTADA ✅** | 5 | $n = 1$ (`a` y `b` balanceados). |
| `aabb` | `a a b b $` | **ACEPTADA ✅** | 8 | $n = 2$. |
| `aaabbb` | `a a a b b b $` | **ACEPTADA ✅** | 11 | $n = 3$. |
| `""` *(vacía)* | `$` | **ACEPTADA ✅** | 2 | $n = 0$: aplica `M[S, $] = S → ε` y acepta. |
| `aab` | `a a b $` | **RECHAZADA ❌** | 7 | Entrada agotada con pila no vacía: se esperaba `'b'` y se encontró `$`. |
| `abb` | `a b b $` | **RECHAZADA ❌** | 5 | Entrada pendiente con pila vacía en `$`: sobra `'b'`. |

### Ejemplos 3, 4 y 5 (`LL(1): No` — simulación bloqueada)

| Ejemplo | Gramática | Diagnóstico real del motor | Simulación |
| :--- | :--- | :--- | :---: |
| **Ejemplo 3** | `S -> A a \| A b`, `A -> c \| ε` | Conflicto **FIRST/FIRST** en `M[S, c]` (`S → A a` vs `S → A b`) y falta de factorización izquierda (prefijo común `A`). | Bloqueada |
| **Ejemplo 4** | `E -> E + T \| T`, `T -> id` | **Recursividad izquierda directa** (`E ⇒ E`) y conflicto **FIRST/FIRST** en `M[E, id]`. | Bloqueada |
| **Ejemplo 5** | `S -> A a`, `A -> a \| ε` | `FIRST(A)={a, ε}`, `FOLLOW(A)={a}` → conflicto **FIRST/FOLLOW** en `M[A, a]` (`A → a` vs `A → ε`). | Bloqueada |

---

## 7. Conclusión personal

> *(Espacio en blanco reservado para redactar tu conclusión personal sobre el diseño, pruebas y aprendizaje obtenido con SyntaxLens LL(1) en Autómatas I.)*

<br>
<br>
<br>
