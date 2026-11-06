# Sincronización Google Drive ↔ GitHub — SUSPENDIDA

**Proyecto:** `gruemp/notas` (carpeta `paginas web/notas/` en Google Drive).

**Estado (6 de noviembre de 2026):** PAUSADA. No se autoriza ejecutar transferencias, actualizaciones, merges, eliminaciones ni sincronización automática de fuentes entre Google Drive y GitHub.

## Dirección de futuras sincronizaciones (solo con nueva orden)
- Origen vigente: Google Drive, `paginas web/notas/codigo/`.
- Destino previsto: raíz de `gruemp/notas` en GitHub, respetando rutas relativas del código y la rama operativa.
- Queda prohibido usar GitHub → Google Drive salvo instrucción expresa que cambie la dirección para una operación concreta.
- **Exclusión absoluta:** `paginas web/notas/recursos/`; nunca transferir, actualizar, borrar ni reorganizar sus elementos como consecuencia de una sincronización.
- No se sincronizan copias históricas de Apps Script ni se modifican/proporcionan despliegues oficiales de Apps Script desde este repositorio.
- Este archivo es documentación de control solo en GitHub y no forma parte del código que deba replicarse a Drive.

## Protocolo cuando el titular autorice una operación
1. Identificar el sitio, alcance, dirección autorizada y origen real. Verificar la estructura `codigo/` y las rutas antes de modificar nada.
2. Comparar recursivamente archivos, nombres, tamaños y SHA-256. Presentar una lista de creaciones, cambios, ausencias, renombrados y conflictos; los archivos faltantes en Drive no autorizan borrar los de GitHub.
3. Excluir recursos, respaldos, claves, secretos, artefactos históricos y los archivos propios de control de GitHub. Los binarios y rutas usadas por la web requieren verificación de dependencias.
4. Aplicar **solo los cambios expresamente autorizados** en una rama de revisión. No modificar `main`, fusionar, borrar, tocar workflows o iniciar publicaciones por simple inferencia.
5. Comprobar resultados y pruebas, registrar la confirmación del titular y conservar el último estado verificado. Detenerse ante cualquier ambigüedad.
6. Cualquier cambio futuro de dirección requerirá instrucción expresa del titular. No habilitar cron, webhooks ni jobs de sincronización por defecto.

Los workflows ordinarios de pruebas o de GitHub Pages no son, por sí solos, autorizaciones para sincronizar fuentes con Google Drive.
