# Tests de las Edge Functions

La función de `supabase/functions/` borra cuentas: hasta el 2026-09-16 no
tenía ni un test. Estos corren con el
`node` que ya usa el proyecto, sin Deno, sin Supabase levantado y sin red.

```bash
node supabase/functions/_tests/delete-account.test.mjs
# o junto con el resto de los tests del proyecto:
npm test
```

## Cómo funciona

`load-edge.mjs` lee el `index.ts` de la función, le saca el `import` de
`jsr:@supabase/supabase-js` (que solo resuelve en Deno), lo transpila con
`typescript` y lo corre en un `vm` con `Deno`, `createClient` y `fetch`
stubbeados. Se queda con el handler que la función le pasa a `Deno.serve`, así
que lo que se prueba es **el archivo real que se despliega**, no una copia.

`fake-supabase.mjs` es un Supabase en memoria: implementa lo justo del query
builder que usan estas funciones (`select`/`update`/`eq`/`neq`/`in`/`limit`/
`maybeSingle`/`single`/`rpc`) sobre arrays de objetos comunes. Cada test le
pasa las filas que quiere y después revisa cómo quedaron.

## Por qué está en `_tests/`

El CLI de Supabase ignora las carpetas que empiezan con `_` al desplegar
(la misma convención de `_shared`), así que nada de esto viaja a producción.

## Nota

Los tests ejercitan el handler con stubs: no reemplazan probar una baja real
antes de lanzar.
