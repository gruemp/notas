# Notas

Aplicación de notas publicada como `notas.html`, con datos en Google Sheets a través de un Web App de Google Apps Script.

## Correcciones de estabilidad

- Guardado en serie: un único POST activo y confirmaciones correlacionadas con `requestId`.
- Una respuesta sin confirmar o un timeout **no** se consideran guardados exitosos.
- Respaldo local automático de cambios pendientes; recuperación al cargar la página.
- Última copia local disponible cuando la API no responde.
- La sincronización periódica no reemplaza ediciones, guardados ni diálogos activos.
- Estado independiente de plegado de categorías fijadas y normales, con persistencia local y en Sheets.
- Exportaciones TXT reimportables con categorías, fijación y párrafos preservados.
- Mejor validación de importaciones JSON y corrección de pegado cancelado y deshacer.

No se cambiaron las reglas CSS ni el marcado visual de la página.

## Publicación del backend

**Importante:** modificar `app script.txt` en GitHub NO actualiza el servicio de Google Apps Script que ya está publicado. Para activar las correcciones del backend:

1. Abrir el proyecto Apps Script que atiende la URL `/exec` utilizada por `notas.html`.
2. Sustituir su código por el contenido revisado de `app script.txt`.
3. Guardar, crear una versión nueva del despliegue web existente y comprobar que conserva la URL `/exec`.
4. Comprobar que el despliegue tiene permisos sobre la hoja de datos y que la hoja `Categories` incorpora la columna `Fijadas contraídas` después de la primera lectura o escritura.

**Seguridad pendiente:** el Web App actual no exige autenticación. Cualquier persona con acceso al endpoint puede leer o sobrescribir datos. Un secreto en JavaScript público no soluciona el problema: antes de guardar información privada se debe implementar autenticación y permisos reales, lo que exige revisar también el modelo de acceso y despliegue.

## Verificaciones

Ejecutar `node tests/check.js` para la comprobación sintáctica. Probar también manualmente en navegador:

- Crear, editar, borrar, deshacer, fijar y cambiar de categoría.
- Guardar, cerrar, volver a abrir y confirmar persistencia en Sheets.
- Desconectar la red antes de guardar, recargar y verificar recuperación local.
- Buscar por varios términos sin distinguir mayúsculas ni tildes.
- Exportar TXT con notas fijadas, varias categorías y varios párrafos; importar y comparar.
- Exportar/importar JSON, cancelar pegado y gestionar el modo manual/arrastre en escritorio y móvil.
- Confirmar que dos pestañas con cambios no sobrescriben modificaciones sin aviso.

Las comprobaciones automáticas no sustituyen pruebas en el navegador ni la actualización manual de Apps Script.
