# Notas

Aplicación de notas en `notas.html`. Conserva la interfaz original y funciona aunque el servicio de Google Apps Script no esté disponible.

## Funcionamiento actual

Las notas se abren y guardan primero en el dispositivo, mediante transacciones de IndexedDB. Cada cambio también crea una copia inmediata de recuperación en localStorage antes del guardado diferido. La carga y el guardado locales no esperan a Google. Tras una primera apertura con conexión y la instalación de su caché, la aplicación también puede abrirse y recargarse sin red.

Las pestañas del mismo navegador coordinan las escrituras mediante las transacciones del almacén común y se notifican los cambios. Ediciones independientes se combinan. Si dos versiones del mismo texto son incompatibles, se conservan ambas con identificadores distintos y deterministas, sin repetir la copia al reintentar. En una carrera entre editar y borrar se conserva la edición. El texto de las notas se mantiene íntegro.

El almacenamiento local pertenece al navegador, perfil y dispositivo utilizados. **No equivale a una copia en Google ni a sincronización entre dispositivos.** Borrar los datos del sitio, usar un perfil temporal o perder el dispositivo puede eliminar ese almacenamiento; la exportación JSON permite conservar una copia independiente. Si el navegador rechaza IndexedDB, se conserva la copia inmediata de recuperación cuando localStorage está disponible. Si ambos fallan, la aplicación informa que no pudo guardar y pide exportar antes de cerrar.

## Recuperación y sincronización

Se recuperan la última copia local y los respaldos pendientes de versiones anteriores. Los respaldos utilizan claves inmutables; la confirmación de una versión antigua con clave reutilizable se registra en una clave separada, para no borrar cambios más nuevos de otra pestaña.

La sincronización remota se intenta en segundo plano. Un servidor antiguo se puede leer, pero nunca se sobrescribe sin control de versión. Una respuesta inválida o una conexión fallida no reemplaza las notas locales. Los cambios remotos se combinan con los del dispositivo y se guardan también localmente. Si no existe una base remota conocida, solo se incorporan datos: no se infieren eliminaciones de información que nunca se ha leído.

El endpoint que figura en el código mostró «El archivo que solicitaste no existe» durante la revisión. La cuenta conectada de Drive tampoco pudo acceder a la hoja configurada (`404 / File not found`). La copia anterior del proyecto en Drive utiliza esos mismos identificadores. No se eliminó ni se sustituyó la hoja original, no se inventó un nuevo origen de datos y no se modificaron notas reales para probarlo. El funcionamiento local permite publicar la reparación sin depender de ese servicio inaccesible; su recuperación y la sincronización entre dispositivos siguen pendientes de acceso real.

## Compatibilidad del backend opcional

El código completo `app script.txt` implementa el protocolo v5:

- El cliente envía `baseRevision`, una huella del estado leído. El servidor comprueba la coincidencia bajo `ScriptLock`; rechaza clientes atrasados o escrituras sin versión.
- Lecturas y escrituras usan el mismo bloqueo. La pestaña oculta `_notas_recovery_v5` guarda el estado anterior antes de escribir. Si una operación se interrumpe, la siguiente lectura o escritura de esta API restaura ese estado antes de continuar.
- Se validan IDs, categorías, fechas, longitud de texto y encabezados. Columnas movidas o desconocidas se rechazan sin reetiquetar datos. Se admite la migración conocida de los encabezados internos al español y la columna adicional de plegado de fijadas.
- Las filas nuevas se escriben antes de limpiar las sobrantes y se amplía la hoja cuando hace falta. Los textos que empiezan por `=` o apóstrofe se guardan literalmente.
- Las confirmaciones de guardado requieren un `requestId` correlacionado, origen Google y una revisión confirmada. La respuesta del iframe anidado se dirige a `https://gruemp.github.io` y escapa terminadores de script.

Actualizar el TXT en GitHub no despliega Apps Script. Si se recupera el acceso al proyecto, sustituir todo su código por ese archivo, guardar y actualizar la implementación web mediante una versión nueva. Mantener la misma hoja de datos y URL `/exec` si siguen vigentes; actualizar únicamente `API_URL` si el despliegue autorizado tiene otra URL. Verificar primero `?action=ping` y `?action=getState` (`v: 5`, revisión y datos existentes), y realizar las pruebas de escritura en una hoja aislada antes de habilitar la sincronización sobre datos reales. La aplicación funciona localmente mientras tanto.

`assertAuthorized_` sigue sin autenticación. La revisión evita carreras, pero **no sustituye permisos de usuario ni autenticación**. Quien pueda acceder al despliegue público podría leer datos y enviar cambios con la revisión actual. No se agregaron secretos al JavaScript público. La autenticación del servicio remoto requiere definir y verificar el acceso con su propietario. El bloqueo de Apps Script tampoco impide escrituras manuales en Sheets ni las de otros proyectos.

## Apariencia e importaciones

Se conservan CSS, colores, fuentes, botones, iconos, tamaños, espacios, marcado visual y reglas de adaptación originales. Una prueba comprueba la huella exacta del CSS y del marcado estático de la versión original de `main`; las pruebas de navegador comparan también capturas con una tolerancia inferior al 0,002 % para diferencias de rasterización de bordes nativos, además de exigir los mismos SVG en escritorio y móvil emulado.

La importación JSON evita duplicar registros equivalentes y normaliza booleanos y fechas. Si un mismo ID contiene otra versión, conserva ambas. La exportación JSON incluye las variantes pendientes recuperables. TXT mantiene sus secciones legibles e incorpora un anexo JSON para reimportar notas vacías, espacios, párrafos y separadores literales sin pérdidas. Sigue admitiendo el TXT antiguo, cuyo formato no puede representar esos casos sin ambigüedad.

## Pruebas

Con Node.js 22 o posterior:

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

`npm test` compila los scripts y ejecuta 34 pruebas funcionales del código real con dobles controlados de DOM/red/Sheets. Cubren versiones, concurrencia, respaldos, primer arranque sin API, guardado durante solicitudes lentas, recuperación, cuotas, conflictos, validación, escritura interrumpida, fórmulas literales, búsqueda, importaciones, exportaciones y deshacer.

La suite de navegador ejecuta Chromium con perfiles aislados, un servidor HTTP local y todas las solicitudes externas interceptadas. Prueba la interfaz en escritorio y móvil emulado, almacenamiento real en IndexedDB, recarga, categorías, búsqueda, portapapeles, eliminación/deshacer, navegación, exportación, pestañas simultáneas, conflicto sobre una misma nota, recarga completamente sin red mediante service worker, protocolo v5 con iframe de otro origen y comparación visual con `main` original. No lee ni escribe notas de producción. GitHub Actions ejecuta ambas suites y conserva las capturas como artefactos.

Las pruebas de móvil emulado no sustituyen un dispositivo físico. El protocolo remoto se comprueba con el código real del backend y servicios de Google simulados; no constituye un despliegue ni una escritura real en Google Sheets.
