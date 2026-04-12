---
description: Actualizar el token de ChocoPop TV cuando cambian las URLs de los streams
---

# Workflow: Actualizar Token de ChocoPop TV

Seguir estos pasos cuando los streams de TV en Vivo dejan de funcionar (señal rota en todos los canales).

## Paso 1 — Verificar si el token cambió

Abrir el navegador y entrar a http://tv.chocopopflow.com/?m=0

Si los streams siguen sin funcionar, el token del relay habrá cambiado. Continuar con el paso 2.

## Paso 2 — Extraer el nuevo token

En el navegador, ir a `view-source:http://tv.chocopopflow.com/?m=0`

Buscar en la página (Ctrl+F): `var Streams`

Buscar una URL de este formato en el código:
```
http://201.217.246.42:44310/Live/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/telefe.playlist.m3u8
```

Copiar el hash MD5 (la cadena de 32 caracteres hexadecimales).

## Paso 3 — Actualizar el token en ChocopopService.ts

Abrir el archivo:
```
src/services/ChocopopService.ts
```

Buscar y reemplazar la línea:
```typescript
const LAST_KNOWN_TOKEN = 'a8a0dc318cc5a076f84bea2206893142';
```

Reemplazar el hash con el nuevo token encontrado en el paso 2.

## Paso 4 — Limpiar la caché

El servicio cachea los canales por 6 horas. Para forzar una actualización inmediata, abrir `ChocopopService.ts` y cambiar temporalmente la versión de caché:

```typescript
const CACHE_KEY = 'chocopopstreams_v2';
// Cambiar a:
const CACHE_KEY = 'chocopopstreams_v3';
```

Esto invalida la caché de todos los usuarios en la próxima apertura de la app.

## Paso 5 — Verificar

1. Compilar y correr la app en el emulador o dispositivo
2. Ir al tab "En Vivo" en el Home
3. Verificar que los canales cargan correctamente
4. Si todo funciona, hacer commit con el mensaje: `fix: update chocopoptoken to [nuevo_token_primeros_8_chars...]`

## Notas

- El scraper dinámico (`ChocopopService.ts`) intenta extraer el token automáticamente del HTML del sitio. Si el scraper funciona, no hace falta actualización manual.
- El scraper falla si el sitio cambia su estructura HTML o si las medidas anti-scraping lo bloquean.
- Si el relay IP también cambió (no solo el token), buscar en el HTML: `http://` seguido de la nueva IP.
