# Notas

Aplicación de notas en `notas.html`. Conserva la interfaz original y funciona aunque el servicio de Google Apps Script no esté disponible.

## Funcionamiento actual

Las notas se abren y guardan primero en el dispositivo, mediante transacciones de IndexedDB. Cada cambio también crea una copia inmediata de recuperación en localStorage antes del guardado diferido. La carga y el guardado locales no esperan a Google. Tras una primera apertura con conexión y la instalación de su caché, la aplicación también puede abrirse y recargarse sin red.

Las pestañas del mismo navegador coordinan las escrituras mediante las transacciones del almacén común y se notifican los cambios. Ediciones independientes se combinan. Si dos versiones del mismo texto son incompatibles, se conservan ambas con identificadores distintos y deterministas, sin repetir la copia al reintentar. En una carrera entre editar y borrar se conserva la edición. El texto de las notas se mantiene íntegro.

El almacenamiento local pertenece al navegador, perfil y dispositivo utilizados. **No equivale a una copia en Google ni a sincronización entre dispositivos.** Borrar los datos del sitio, usar un perfil temporal o perder el dispositivo puede eliminar ese almacenamiento; la exportación JSON permite conservar una copia independiente. Si el navegador rechaza IndexedDB, se conserva la copia inmediata de recuperación cuando localStorage está disponible. Si ambos fallan, la aplicación informa que no pudo guardar y pide exportar antes de cerrar.

## Recuperación y sincronización

Se recuperan la última copia local y los respaldos pendientes de versiones anteriores. Los respaldos utilizan claves inmutables; la confirmación de una versión antigua con clave reutilizable se registra en una clave separada, para no borrar cambios más nuevos de otra pestaña.

La sincronización remota se intenta en segundo plano. Un servidor antiguo se puede leer, pero nunca se sobrescribe sin control de versión. Una respuesta inválida o una conexión fallida no reemplaza las notas locales. Los cambios remotos se combinan con los del dispositivo y se guardan también localmente. Si no existe una base remota conocida, solo se incorporan datos: no se infieren eliminaciones de información que nunca se ha leído.

En la comprobación con Edge, Google indicó que la hoja original está eliminada. No se encontró su ID entre las hojas visibles de la papelera; esto no demuestra que sea irrecuperable. No se restauraron carpetas ajenas ni se modificaron datos anteriores. El servicio original sigue inaccesible.

Esta rama prepara una conexión nueva y protegida. Se creó un proyecto privado de Apps Script y se guardó en él el código completo, sin ejecutar su inicialización, conceder permisos nuevos ni desplegarlo. **La URL del cliente todavía apunta al servicio anterior: la nube nueva no está activada y esta rama debe permanecer en borrador hasta comprobarla.** El funcionamiento publicado en `main` continúa siendo local mientras tanto.

Al cambiar de servidor, el cliente descarta únicamente la base de comparación remota del servidor anterior y conserva las notas locales. Una hoja nueva vacía se combina mediante incorporación de datos; no representa una orden de borrado. Los registros antiguos sin identificador de servidor conservan su base cuando se sigue usando la URL original.

## Compatibilidad del backend opcional

El código completo `app script.txt` implementa el protocolo v5:

- El cliente envía `baseRevision`, una huella del estado leído. El servidor comprueba la coincidencia bajo `ScriptLock`; rechaza clientes atrasados o escrituras sin versión.
- Lecturas y escrituras usan el mismo bloqueo. La pestaña oculta `_notas_recovery_v5` guarda el estado anterior antes de escribir. Si una operación se interrumpe, la siguiente lectura o escritura de esta API restaura ese estado antes de continuar.
- Se validan IDs, categorías, fechas, longitud de texto y encabezados. Columnas movidas o desconocidas se rechazan sin reetiquetar datos. Se admite la migración conocida de los encabezados internos al español y la columna adicional de plegado de fijadas.
- Las filas nuevas se escriben antes de limpiar las sobrantes y se amplía la hoja cuando hace falta. Los textos que empiezan por `=` o apóstrofe se guardan literalmente.
- Las confirmaciones de guardado requieren un `requestId` correlacionado, origen Google y una revisión confirmada. La respuesta del iframe anidado se dirige a `https://gruemp.github.io` y escapa terminadores de script.

Actualizar el TXT en GitHub no despliega Apps Script. La preparación prevista, pendiente de autorización de seguridad en Edge, es:

1. En el proyecto privado, guardar todo `app script.txt` y ejecutar `prepararNotas` desde el editor como propietario. Google solicitará los permisos detectados por Apps Script, incluido acceso a Sheets e identidad del usuario. La función crea una hoja nueva con fecha, registra `NOTAS_SPREADSHEET_ID` y genera `NOTAS_API_TOKEN` en las propiedades privadas del proyecto. Un reintento reutiliza la hoja y la clave.
2. Publicar una implementación web que se ejecute como propietario y sea accesible al cliente de Pages. Aunque la URL sea accesible por Internet, GET y POST rechazan toda lectura y escritura sin la clave de 64 caracteres hexadecimales. Una persona que obtenga esa clave podrá leer y modificar las notas: debe tratarse como una contraseña.
3. Comprobar que peticiones sin clave o con clave incorrecta son rechazadas. Verificar lectura, control de revisión y escritura únicamente con notas de prueba identificadas en la hoja nueva, antes de conectar notas reales. No usar la hoja anterior para pruebas.
4. Sustituir solo `API_URL` por la URL `/exec` real del nuevo despliegue, conservando `LEGACY_API_URL` como referencia de migración. Ejecutar ambas suites en Actions y mantener el diseño original.
5. Ejecutar `verConexionPrivada` como propietario. Su registro muestra un enlace privado a Pages con `#notas_key=…`. Abrirlo exclusivamente en los dispositivos autorizados. El cliente consume la clave, elimina ese parámetro de la dirección y la guarda localmente asociada a la URL fijada en el código. No admite un servidor arbitrario desde el enlace. No publicar el enlace, los registros con la clave ni las propiedades privadas en GitHub.
6. Tras verificar el despliegue real, incorporar el PR a `main`, comprobar Pages y confirmar lectura/guardado/recarga desde Edge. La sincronización en otros dispositivos requiere abrir allí el mismo enlace privado. Hasta entonces, no presentar la nube como operativa.

La clave se envía por HTTPS a Google en las peticiones JSONP y en el formulario de guardado. Es accesible al JavaScript del mismo origen y a quien use ese perfil: no sustituye la protección del dispositivo ni una cuenta individual por usuario. Los auxiliares públicos de preparación comprueban que la identidad activa coincide con la efectiva; las operaciones HTTP no los invocan. El bloqueo de Apps Script tampoco impide escrituras manuales en Sheets ni las de otros proyectos.

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

`npm test` compila los scripts y ejecuta 40 pruebas funcionales del código real con dobles controlados de DOM/red/Sheets. Cubren versiones, concurrencia, respaldos, primer arranque sin API, guardado durante solicitudes lentas, recuperación, cuotas, conflictos, validación, escritura interrumpida, fórmulas literales, búsqueda, importaciones, exportaciones, deshacer, rechazo de claves inválidas, preparación idempotente y migración conservadora a otro servidor.

La suite de navegador contiene 14 pruebas y ejecuta Chromium con perfiles aislados, un servidor HTTP local y todas las solicitudes externas interceptadas. Prueba la interfaz en escritorio y móvil emulado, almacenamiento real en IndexedDB, recarga, categorías, búsqueda, portapapeles, eliminación/deshacer, navegación, exportación, pestañas simultáneas, conflicto sobre una misma nota, recarga completamente sin red mediante service worker, protocolo v5 con iframe de otro origen y comparación visual con `main` original. No lee ni escribe notas de producción. GitHub Actions ejecuta ambas suites y conserva las capturas como artefactos.

Las pruebas de móvil emulado no sustituyen un dispositivo físico. El protocolo remoto se comprueba con el código real del backend y servicios de Google simulados; no constituye un despliegue ni una escritura real en Google Sheets.
