# Seguridad — Baradero Local

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad en Baradero Local (`proyectopdisc.vercel.app`), por favor
**no la publiques** y avisanos en privado:

- Desde el sitio: **Mi perfil → Soporte**, con el asunto "Seguridad".
- Si tenés acceso al repositorio: GitHub → pestaña *Security* → *Report a vulnerability*.

Incluí, si podés: qué encontraste, cómo reproducirlo y qué impacto creés que tiene.
No accedas, modifiques ni borres datos de otras personas más allá de lo mínimo para
demostrar el problema, y no hagas pruebas de denegación de servicio.

Qué te prometemos:

- Confirmar que lo recibimos dentro de los **3 días hábiles**.
- Contarte qué vamos a hacer y en qué plazo (crítico: en el día; alto: en una semana).
- Avisarte cuando esté resuelto y, si querés, darte el crédito.

## Para el equipo

- Política, controles y pendientes: [`docs/seguridad/HARDENING-SOC2-ISO27701.md`](docs/seguridad/HARDENING-SOC2-ISO27701.md)
- Qué hacer ante un incidente: [`docs/seguridad/RESPUESTA-INCIDENTES.md`](docs/seguridad/RESPUESTA-INCIDENTES.md)
- Nunca commitear secretos (service role key, tokens de Mercado Pago o de Jira). Si pasó,
  rotarlo primero y limpiar después.
