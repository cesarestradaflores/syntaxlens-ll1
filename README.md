# SyntaxLens LL(1)

**Visualizador de análisis sintáctico predictivo** — aplicación web didáctica en **HTML, CSS y JavaScript puro** (sin frameworks, sin backend, sin npm y sin dependencias externas) desarrollada para la materia **Autómatas I**.

---

## Objetivo

Mostrar de manera transparente y paso a paso cómo trabaja internamente un analizador sintáctico predictivo **LL(1)**: desde el parseo y validación de cualquier gramática libre de contexto (GLC), el cálculo iterativo de **FIRST** y **FOLLOW**, la construcción de la **matriz predictiva `M[A, a]`** y la detección formal de conflictos o recursividad izquierda, hasta la **simulación con pila**, el árbol de derivación y la derivación por la izquierda.

---

## Compatibilidad y cómo ejecutar

La aplicación utiliza scripts clásicos ordenados bajo un único espacio de nombres global (`window.SyntaxLens`), sin módulos ES6 ni `fetch` a archivos locales, por lo que funciona **100% sin conexión** en los tres entornos:

1. **Apertura directa (`file://`):** haz doble clic en `index.html` para abrirlo directamente en Chrome, Edge, Firefox o Safari.
2. **Visual Studio Code + Live Server:** abre la carpeta `syntaxlens-ll1` en VS Code, haz clic derecho sobre `index.html` y selecciona **Open with Live Server**.
3. **GitHub Pages:** sube el contenido de la carpeta a un repositorio de GitHub y activa *Settings → Pages → Deploy from branch (`main` / root)*. Todas las rutas son relativas.

---

## Estructura de archivos

```text
/syntaxlens-ll1
├── index.html          # Estructura HTML, pestañas y carga ordenada de scripts
├── css/
│   └── styles.css      # Estilos minimalistas tipo herramienta de desarrollo (oscuro/claro)
├── js/
│   ├── examples.js     # 5 gramáticas precargadas (2 LL(1) válidas y 3 con conflictos/recursividad)
│   ├── grammar.js      # Parseo, validación con número de línea, advertencias y símbolos
│   ├── sets.js         # Algoritmos iterativos a punto fijo para FIRST, FIRST(α), FOLLOW y trazas
│   ├── table.js        # Matriz LL(1), conflictos FIRST/FIRST, FIRST/FOLLOW y recursividad izquierda
│   ├── parser.js       # Tokenizador (automático/espacios), simulador con pila, estabilidad y CSV/MD
│   ├── ui.js           # Controlador de pestañas, editor con líneas, tooltips, SVG y eventos
│   └── tests.js        # Suite de 31 pruebas automatizadas sobre el motor real (SyntaxLens.Tests.run())
├── README.md           # Guía de referencia rápida y ejecución
└── DOCUMENTACION.md    # Informe académico completo para Autómatas I
```

Orden de carga en `index.html`:
`examples.js` → `grammar.js` → `sets.js` → `table.js` → `parser.js` → `ui.js` → `tests.js`.

---

## Pruebas automatizadas

Puedes ejecutar las **31 pruebas automatizadas** en cualquier momento de dos maneras:

- Haciendo clic en el botón **Ejecutar pruebas** en la barra superior de la aplicación.
- Abriendo DevTools (`F12` → **Consola**) y ejecutando:

```js
SyntaxLens.Tests.run()
```

Todas las pruebas invocan el motor real (sin resultados precalculados) y verifican validaciones, FIRST/FOLLOW, matriz predictiva, conflictos `FIRST/FIRST` y `FIRST/FOLLOW`, recursividad izquierda directa/indirecta/por prefijo anulable, las 10 cadenas obligatorias, cadena vacía, tokenización, estabilidad del motor (bloqueo y límite de pasos `ANÁLISIS INCONCLUSO`) y 2 gramáticas personalizadas.

---

## Documentación académica

Consulta [DOCUMENTACION.md](DOCUMENTACION.md) para el documento completo de entrega con reglas formales de FIRST/FOLLOW, algoritmo de matriz predictiva, guía de uso, tabla de pruebas, marcadores de capturas de pantalla y sección de conclusión personal.
