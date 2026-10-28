# Notas

Aplicación de notas en `notas.html`, con Google Sheets y un Web App de Google Apps Script. `index.html` abre la aplicación desde la raíz de GitHub Pages.

## Estado de la revisión de 2026-10-28

Se revisaron todos los archivos de `main` en `5e6ad21`, su historial y el PR #1, incluido el hallazgo sobre respaldos compartidos entre pestañas. Las pruebas originales solo verificaban sintaxis.

La continuación también comprobó que la cuenta de Drive conectada devuelve `404 / File not found` al consultar la hoja configurada. Esto indica falta de acceso o de disponibilidad, no demuestra eliminación. La copia anterior de HTML y Apps Script encontrada en la carpeta de Drive del proyecto utiliza los mismos identificadores, por lo que no proporciona un despliegue alternativo.

En la comprobación real del sitio publicado, GitHub Pages abrió `notas.html`, pero la aplicación mostró «Error cargando datos». La consola registró un error JSONP. Al abrir el endpoint `/exec?action=ping` configurado en el HTML, Google mostró «El archivo que solicitaste no existe». Esto es lo observado desde el navegador de comprobación; no demuestra si el proyecto fue eliminado, cambió de despliegue o exige otro acceso.

**La actualización v5 requiere publicar Apps Script y HTML de forma coordinada. No fusionar este PR ni dar por resuelto el servicio en producción antes de completar la puesta en marcha descrita abajo.**

## Correcciones v5

- Respaldos pendientes con una clave independiente e inmutable por versión. Primero se escribe la nueva versión y después se retira la anterior de esa misma instancia. Al recuperar una copia antigua con clave reutilizable, se registra un recibo del contenido confirmado y se conserva su clave; una actualización de otra pestaña nunca puede perderse entre la lectura y la limpieza.
- Recuperación de respaldos con su versión base. Los respaldos antiguos sin base y los conflictos se conservan y requieren conciliación; nunca se aplican ciegamente sobre Sheets. La exportación JSON incluye `pendingBackups` para conservar las variantes pendientes.
- Fusión de cambios independientes por ID y campo. Ediciones incompatibles y eliminaciones concurrentes se detienen y permanecen respaldadas. No se escoge una versión por su fecha ni se generan duplicados automáticamente para resolver conflictos.
- Control de versión en el servidor: `baseRevision` debe coincidir con la huella SHA-256 del estado actual, comprobada bajo `ScriptLock`. Un cliente antiguo o atrasado no puede reemplazar todo el estado.
- Lecturas y escrituras comparten el bloqueo. Un diario de recuperación en la pestaña oculta `_notas_recovery_v5` conserva el estado anterior completo antes de escribir. Una escritura interrumpida se revierte antes de la siguiente lectura o escritura de la API. No borrar ni editar esa pestaña.
- Validación del esquema antes de leer: encabezados movidos o desconocidos se rechazan sin reetiquetar las columnas. Se admite la migración conocida de encabezados internos al español y la columna nueva de plegado de fijadas.
- Escritura de datos nuevos antes de limpiar filas sobrantes; ampliación de filas cuando hace falta, validación de IDs, categorías, fechas y longitud de texto. Los textos que empiezan por `=` o apóstrofe se guardan literalmente.
- La confirmación de guardado exige un `requestId` aleatorio correlacionado, origen Google y una revisión confirmada. El HTML de respuesta escapa terminadores de script y envía la respuesta a la ventana superior de `https://gruemp.github.io`, atravesando el iframe anidado de HtmlService.
- Las ediciones durante una solicitud permanecen pendientes y se guardan después; una lectura periódica iniciada antes de una edición no puede reemplazarla aunque esa edición ya se haya guardado.
- El pegado asíncrono comprueba que la nota siga existiendo y no haya cambiado. Los errores de almacenamiento no se presentan como respaldo exitoso.
- Importación JSON repetida sin duplicar registros equivalentes; normalización de valores booleanos y fechas inválidas. Una versión distinta con el mismo ID se conserva con un ID nuevo.
- TXT conserva la sección legible habitual e incorpora un anexo JSON v5 para reimportar sin perder notas vacías, espacios, párrafos o líneas que parecen separadores. Sigue admitiendo TXT antiguo, cuyo formato es ambiguo para esos casos.

El CSS, el marcado visual y las plantillas de iconos/filas se conservan. Se verificó identidad del CSS y del marcado estático respecto a la base; no se realizó comparación visual de la versión v5 en navegadores móviles reales.

## Pruebas reproducibles

Con Node.js 22 o posterior, sin paquetes adicionales:

```sh
node tests/check.js
node --test tests/functional.js
```

Las 31 pruebas funcionales ejecutan el JavaScript real del cliente y del backend en contextos aislados. Sustituyen DOM, red, temporizadores y servicios de Google por dobles controlados; no usan datos ni credenciales reales. Cubren concurrencia, conflictos, edición durante guardado, timeout, respaldos por pestaña, recarga lógica, lectura atrasada, escritura interrumpida, validación, fórmulas literales, ampliación de filas, búsqueda, importación/exportación, deshacer y lógica con puntero grueso, arranque completo con varias copias pendientes, recibos de versiones antiguas, cuotas locales y encabezados cambiados. GitHub Actions ejecuta ambas verificaciones.

Esto **no** equivale a una prueba de navegador completa, un dispositivo móvil físico, una escritura real en Google Sheets ni un despliegue Apps Script verificado. El sitio actual se comprobó en navegador sin crear, modificar ni eliminar notas. El fallo de su endpoint impide validar esos flujos en producción.

## Puesta en marcha coordinada

1. Con la cuenta propietaria, localizar el proyecto Apps Script que usa la hoja de datos indicada por `SPREADSHEET_ID`. No cambiar ese ID ni crear una hoja de datos vacía como sustituto. Si no se encuentra el proyecto anterior, crear el proyecto autorizado apuntando a la misma hoja existente.
2. Antes del cambio, exportar las notas y los respaldos pendientes de cada navegador/pestaña. Conservar además una copia de seguridad de la hoja y del código/despliegue anterior. Cerrar las pestañas antiguas durante la ventana de actualización para evitar escrituras de clientes antiguos.
3. Sustituir **todo** el código de Apps Script por `app script.txt` de este PR. Guardar y comprobar los permisos sobre la hoja. No es necesario activar servicios avanzados ni introducir tokens en el HTML.
4. En **Implementar → Administrar implementaciones**, editar el despliegue web y seleccionar **Nueva versión**. Mantener su URL `/exec` si sigue disponible. Si se requiere uno nuevo, usar **Nueva implementación → Aplicación web**, revisar el acceso con el propietario y copiar la URL `/exec` real. El acceso público anterior no es apropiado para notas privadas; no ampliarlo sin una decisión explícita sobre autenticación.
5. Si la URL cambió, actualizar únicamente `API_URL` en `notas.html`. El origen de confirmación está fijado a `https://gruemp.github.io`; si se utiliza otro dominio, actualizar y probar también ese destino en `postMessageHtml_`.
6. Verificar `?action=ping` y después `?action=getState` con la cuenta/acceso previsto. La segunda respuesta debe contener `ok: true`, `v: 5`, `revision` no vacía y los datos existentes. Revisar IDs y cantidades sin publicar el contenido de las notas.
7. En una **copia aislada de prueba** de la hoja y un despliegue de prueba, ejecutar el flujo HTML v5 completo: crear, editar, categorías, fijar, eliminar/deshacer, copiar/pegar, búsqueda, TXT/JSON y recarga. Desconectar la red, recargar con cambios pendientes, reintentar y abrir dos pestañas. Confirmar que cambios independientes se combinan y que conflictos en la misma nota permanecen pendientes. Probar escritorio y móvil, incluyendo arrastre, teclado y navegación.
8. Con las comprobaciones satisfactorias y Actions en verde para el último commit, fusionar el PR. Confirmar el despliegue de GitHub Pages correspondiente al commit fusionado y volver a abrir la raíz y `notas.html`. Reabrir las pestañas con la versión nueva.
9. Confirmar lectura y guardado en producción únicamente con una operación controlada autorizada; no realizar pruebas destructivas sobre las notas existentes. Conservar los respaldos hasta verificar el resultado.

Publicar el backend v5 invalida las escrituras de clientes antiguos, deliberadamente, para impedir sobrescrituras sin versión. No dejar versiones mezcladas abiertas. Modificar el TXT en GitHub no actualiza Apps Script; no se ha desplegado desde esta revisión por falta de una herramienta/acceso al proyecto.

## Conflictos y recuperación

Cuando se muestre «Conflicto», exportar JSON en las pestañas afectadas antes de cerrar o resolver nada. Las notas remotas siguen en Sheets y las variantes locales en respaldos separados. El JSON conserva `pendingBackups`; al reimportarlo, las variantes distintas se conservan como notas separadas para su conciliación. No borrar el almacenamiento del navegador hasta completar esa conciliación. Los respaldos v1 sin base verificable requieren comparar/exportar sus datos antes de decidir qué versión conservar.

## Límites de seguridad e integridad

`assertAuthorized_` continúa sin autenticación. Quien conozca el endpoint y tenga acceso al despliegue puede leer datos y enviar una escritura con la revisión actual. La revisión y la validación de `postMessage` evitan carreras o confirmaciones falsas; **no sustituyen autenticación ni permisos de usuario**. Un secreto en JavaScript público tampoco lo resolvería. Autenticación/autorización del backend sigue pendiente de definir y probar con el propietario para no interrumpir el acceso existente. No se agregaron credenciales.

El diario recupera escrituras interrumpidas realizadas por esta API, pero `ScriptLock` no bloquea a personas editando manualmente la hoja ni a otros proyectos que escriban directamente. Evitar esas escrituras durante las operaciones de la aplicación. El almacenamiento local depende de la cuota y disponibilidad del navegador; si falla, la aplicación pide exportar y no afirma que existe una copia local.
