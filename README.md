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

