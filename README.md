# Notas — guardado y recuperación v6

Aplicación personal de notas para escritorio y móvil. Mantiene los controles y el editor originales e incorpora un panel de guardado, conexión con Google, papelera, versiones y respaldos.

## Uso

- **Guardado visible:** indica si hay cambios guardándose en el dispositivo, pendientes de subir o confirmados en Google. Muestra la hora de la última sincronización y del respaldo independiente. El guardado local no se presenta como guardado en la nube.
- **Conectar con Google:** abre una implementación de Apps Script que exige iniciar sesión y está restringida a la cuenta propietaria. Después de verificar la identidad, “Conectar este dispositivo” regresa a Pages. La clave existente se conserva y no se publica en el código. Cada navegador se conecta por separado. Se siguen admitiendo los enlaces privados anteriores.
- **Errores y reintentos:** identifica falta de conexión o autorización, espera agotada, cuotas, conflicto y versión incompatible. El reintento manual está siempre disponible cuando no hay una sincronización en curso. Los reintentos automáticos esperan entre 15 segundos y 5 minutos y se reactivan al volver Internet.
- **Errores de guardado en el dispositivo:** si falla el almacenamiento principal, el panel mantiene un aviso visible y distingue si existe una copia de emergencia. Exporta las notas antes de cerrar. Al restaurar una nota, la aplicación solo confirma éxito cuando el guardado local ha finalizado; si falla, conserva la copia de recuperación y ofrece una advertencia para reintentar.
- **Papelera e historial:** las notas eliminadas y las versiones previas se conservan. Antes de eliminar se exige confirmar una copia local. La recuperación de una versión conserva también el texto que reemplaza. Las versiones creadas sin conexión se envían al archivo de Google cuando vuelve a funcionar la sincronización. El panel distingue copias del dispositivo y de Google.
- **Respaldos automáticos:** el dispositivo conserva una copia diaria. Google crea una hoja de cálculo independiente antes de la primera escritura de cada día de uso, con la versión anterior a ese cambio. No hay tarea programada en días sin actividad. La recuperación incorpora las notas del respaldo sin eliminar las actuales; los IDs con versiones distintas generan una copia. No se elimina automáticamente ninguna copia ni elemento de la papelera.

Las copias locales pertenecen al navegador y no sustituyen las copias independientes de Google. Una copia en Google solo se confirma después de que el servidor responde. Los respaldos independientes están en Drive como `AAAA-MM-DD_notas_respaldo`. El archivo `_notas_archive_v6` conserva metadatos, textos y snapshots en fragmentos de 30.000 caracteres para respetar los límites por celda de Sheets. Las copias no contienen la clave de conexión.

## Instalación de Apps Script

Actualizar `app script.txt` en GitHub no despliega el servicio. Para repetir la instalación:

1. Copiar todo el archivo al proyecto privado y guardar. Mantener sus propiedades `NOTAS_SPREADSHEET_ID` y `NOTAS_API_TOKEN`; no generar otra hoja ni otra clave. Ejecutar `prepararMejorasNotas` como propietario: registra `NOTAS_OWNER_EMAIL` y prepara la tabla de recuperación sin alterar las notas.
2. Actualizar la implementación API existente a una nueva versión, manteniendo su URL, ejecución como propietario y acceso anónimo protegido por la clave. Las solicitudes GET y POST sin clave siguen siendo rechazadas. Esto conserva la compatibilidad de los clientes v5.
3. Crear una segunda implementación web para la conexión, con **Ejecutar como: Usuario que accede a la app web** y **Usuarios con acceso: Solo yo**. Fijar su URL `/exec` en `GOOGLE_CONNECT_URL` del cliente. La ruta `?action=connect` verifica identidad activa, efectiva y propietaria antes de generar el enlace de retorno fijo a `https://gruemp.github.io/notas/notas.html`; no acepta un destino arbitrario.
4. Comprobar el acceso con la cuenta propietaria, el rechazo anónimo y de otras identidades, y un ciclo de escritura y recuperación exclusivamente con una nota de prueba. Publicar el cliente tras completar Actions.

El botón de conexión utiliza la autenticación de Apps Script; no es un sistema de cuentas múltiples. La API conserva una clave privada por instalación. Quien obtenga esa clave podrá leer y modificar las notas. La clave se consume desde el fragmento del enlace y se retira de la dirección. Si el navegador rechaza localStorage, la clave puede funcionar en memoria durante esa sesión y el panel advierte que será necesario reconectar.

## Conservación de datos

IndexedDB conserva las notas mediante transacciones y localStorage mantiene un diario inmediato de recuperación. Las pestañas combinan cambios y conservan versiones incompatibles. La nube usa un bloqueo de Apps Script y una revisión del estado para rechazar escrituras atrasadas; mantiene la recuperación transaccional v5. El archivo duradero v6 es adicional y no altera el cálculo de revisión de las notas activas.

Los cambios a otro servidor conservan las notas locales; una hoja nueva vacía no implica borrar datos. La hoja original anterior fue reportada como eliminada y no se recuperó en este trabajo. No borrar datos del navegador para intentar solucionar la conexión.

Los respaldos y el archivo dependen de las cuotas de Google y del espacio disponible. Si no se puede asegurar la copia anterior, la escritura remota falla y los cambios permanecen pendientes localmente. La papelera no ofrece borrado definitivo desde esta versión. Las escrituras manuales en Sheets no pasan por el historial del servicio.

## Validación

```sh
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
```

La suite funcional comprueba versiones, concurrencia, recuperación, almacenamiento rechazado, identidad de Google, papelera, historial, fragmentación de textos largos, respaldos independientes e importación sin pérdida. Chromium prueba escritorio y móvil emulado, guardado real en IndexedDB, recarga, trabajo sin conexión, carreras entre pestañas, protocolo con iframe y recuperación mediante la interfaz. Las peticiones externas de las pruebas se interceptan y no leen ni modifican producción.

La prueba visual protege el CSS y marcado originales excluyendo únicamente los bloques nuevos señalados `NOTAS_V6_BEGIN/END`; compara también la interfaz original con el panel nuevo oculto. Las nuevas pantallas tienen capturas propias y una comprobación de desbordamiento en móvil.


## Nueva interfaz y reversión (octubre de 2026)

La vista principal incorpora tarjetas, encabezado de estado, búsqueda, filtros por categoría y navegación inferior a Notas, Categorías y Papelera. El engranaje abre las herramientas de ordenación, importación, exportación, tema y conexión. Las acciones por nota se abren desde «⋮». La pantalla de categorías permite abrir una categoría o moverla, junto con sus notas, a la papelera después de conservar cada nota y un respaldo local completo. El respaldo se puede importar desde la sección «Respaldos automáticos» del panel de recuperación, sin reemplazar las notas actuales.

**Reversión de diseño:** la versión anterior exacta, incluida su lógica y su service worker, quedó inmovilizada en la rama [`backup/notas-original-ui-20261029`](https://github.com/gruemp/notas/tree/backup/notas-original-ui-20261029), commit `ad70f6f2a97893b178b357f7c090e66c1340bc27`. Para volver atrás sin eliminar datos, restaurar los archivos de esa rama en una nueva rama de trabajo, ejecutar las pruebas y fusionar el PR a `main`; GitHub Pages lo publicará automáticamente. No borrar datos del navegador ni modificar la hoja o la clave de Google. Los cambios de datos hechos con la interfaz nueva no se revierten al restaurar solo el diseño.

## Distribución para PC y móvil

A partir de 1024 px, la aplicación ocupa un ancho máximo de 1560 px: navegación lateral fija dentro de la página, búsqueda y filtros en la cabecera, creación de notas arriba a la derecha, tarjetas en varias columnas y categorías en rejilla. Por debajo de 1024 px se conserva la distribución móvil original de la versión anterior. Este ajuste solo modifica la presentación y la versión de la caché offline, no la estructura de datos ni el servicio de Google.

**Revertir únicamente la disposición de escritorio:** la versión previa al ajuste se conserva en [`backup/notas-mobile-ui-before-desktop-20261029`](https://github.com/gruemp/notas/tree/backup/notas-mobile-ui-before-desktop-20261029). Restaurar el CSS y la caché de esa rama mediante un nuevo PR permite volver al ancho anterior sin borrar las notas ni cambiar credenciales.

## Pulido visual de la interfaz (octubre de 2026)

Se han refinado únicamente los estilos CSS de la cabecera, estado de sincronización, búsqueda, filtros, tarjetas, categorías, navegación y modales. Mejora la jerarquía, superficies, contraste y consistencia entre temas claro y oscuro, sin cambiar la estructura funcional de las notas, las columnas originales ni los puntos de ruptura existentes (móvil, tableta y PC). El estado de sincronización tiene representación visual neutral mientras está pendiente, verde al sincronizarse y ámbar en caso de error. La caché offline cambia de nombre para asegurar que se descarguen los nuevos estilos.

**Reversión:** la versión inmediatamente anterior al pulido está respaldada en [`backup/notas-before-visual-polish-20261029`](https://github.com/gruemp/notas/tree/backup/notas-before-visual-polish-20261029), commit `cc61265947c83ffe2e957dad0626a2234d420fdb`. Puede recuperarse mediante otro PR que restablezca el HTML, la caché y la documentación, sin borrar datos del usuario.

## Navegación sin elementos fijados (octubre de 2026)

La navegación y el botón «Nueva nota» ahora forman parte del documento y se desplazan naturalmente en móvil, tableta y escritorio. En móvil aparecen debajo de la cabecera y antes de las notas; en PC se conserva la barra lateral, pero sin fijarla. Los filtros de categoría se distribuyen en líneas y no requieren un área horizontal con desplazamiento propio. El estado de sincronización y los avisos de «Deshacer» aparecen en la cabecera en el flujo normal. El menú de eliminación sigue utilizando su diálogo temporal accesible; no se cambian las operaciones de datos ni la conexión de Google.

El cambio de presentación se puede revertir sin borrar notas mediante la rama de respaldo [`backup/notas-before-flow-layout-20261029`](https://github.com/gruemp/notas/tree/backup/notas-before-flow-layout-20261029), commit `d18d693e87cec7a54acfa67d0a688c83ab859001`. Los tests comprueban que no haya navegación fija, pérdida de las acciones existentes ni desbordamientos.

## Navegación simplificada (octubre de 2026)

La aplicación abre directamente en **Notas**, por lo que se ha retirado su pestaña redundante de la navegación. Se conservan **Categorías** y **Papelera**; desde la pantalla de categorías se vuelve a la lista mediante un botón contextual **Volver** junto al título. La operación no modifica las notas, los filtros, la estructura de almacenamiento ni la conexión con Google.

La versión inmediatamente anterior está en la rama [`backup/notas-before-removing-notes-tab-20261029`](https://github.com/gruemp/notas/tree/backup/notas-before-removing-notes-tab-20261029). Se puede recuperar la navegación anterior sin tocar los datos.

## Refinamiento visual contextual (30 de octubre de 2026)

Se ajustaron exclusivamente los estilos de la interfaz en `notas.html`: cabecera y búsqueda, navegación, jerarquía tipográfica, separación de tarjetas, categorías, estados, controles táctiles y adaptación a escritorio y móvil, conservando las cuadrículas, los puntos de ruptura, el orden accesible y las funciones actuales. Las notas fijadas se distinguen por un borde superior y las categorías por su identificación visual. El aviso «Deshacer» ya no desplaza su contenido fuera de la pantalla ni deja espacio vacío cuando está inactivo. Se reservó espacio en la cabecera de escritorio para evitar que «Nueva nota» tape el botón de configuración.

Todos los elementos de navegación permanecen en el flujo normal de la página, sin anclarse durante el desplazamiento. No se modificaron el motor de notas, las credenciales, Google Apps Script ni la sincronización. El `service worker` usa una nueva versión de caché para actualizar la presentación en dispositivos sin eliminar información local.

**Validación:** `npm test` y `npm run test:browser`. Las pruebas de navegador comprueban también la ausencia de superposición de los controles superiores y que el aviso «Deshacer» quepa en móvil.

## Agregar portapapeles directamente a una nota

El menú de acciones «⋮» de cada nota contiene ahora el botón **«Agregar portapapeles»** (portapapeles con signo +), entre copiar y limpiar. Al pulsarlo, se lee el texto del portapapeles y se agrega al final de la nota, separado por una línea en blanco cuando ya existe contenido. No se abre el editor, no se reemplaza el texto anterior y no se crea una nota adicional. La versión anterior se guarda en el historial antes del cambio.

El guardado se confirma primero en este dispositivo a través del almacenamiento duradero existente; la sincronización de Google sigue el mismo proceso habitual y se confirma por separado en el indicador de conexión. Si el portapapeles está vacío, se deniega la lectura o la nota cambia durante una lectura pendiente, no se sobreescribe el contenido. Cuando el navegador no permite leer automáticamente, se ofrece la alternativa existente de pegar en un cuadro del navegador, sin abrir la nota.

El cambio actualiza la caché offline de la aplicación. Las pruebas de navegador verifican escritorio, móvil, recarga, ausencia de apertura del editor, lecturas fallidas o tardías y sincronización con el servicio simulado de Google.
