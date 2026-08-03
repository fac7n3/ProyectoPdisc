# Contexto de Marketing de Producto

**Document version:** v1
**Última actualización:** 2026-08-03

## Resumen del producto
**Frase:** Comprá local, recibí en casa.
**Qué hace (2-3 frases):** Baradero Local es el marketplace de comercio de proximidad de la ciudad de Baradero (Argentina). Conecta a vecinos que quieren comprar online con los comercios reales de su propia ciudad — almacén, panadería, verdulería, carnicería, farmacia, ferretería y otros 14 rubros — con pago por Mercado Pago o transferencia, y entrega dentro de Baradero (envío o retiro en el local). Cada vendedor se valida con CUIT y aprobación manual de un admin antes de poder vender.
**Categoría de producto (la "góndola" en la que competimos):** Comercio de proximidad / "el almacén de tu barrio, online" — explícitamente NO "tienda online genérica" ni "marketplace nacional". Esta distinción de categoría es la decisión de posicionamiento central del proyecto (ver Diferenciación): si el producto se deja leer como "e-commerce" a secas, compite en catálogo/precio/velocidad de envío contra jugadores que siempre van a ganar esa comparación.
**Tipo de producto:** Marketplace de dos lados (cliente vecino ↔ vendedor comerciante), con rol admin para aprobación de vendedores y rol repartidor planeado.
**Modelo de negocio y precios:** Precios en pesos argentinos enteros (sin centavos) en todo el sistema. Pago vía Mercado Pago (Checkout Pro) o transferencia con comprobante. Envío dentro de Baradero o retiro en el comercio. (Modelo de comisión/monetización de la plataforma en sí: a definir — no hay decisión tomada todavía sobre cobro a vendedores, se documenta cuando exista.)

## Público objetivo
**Tipo de "empresa" (rubros del catálogo):** Comercios reales y físicos de Baradero, de los 14 rubros ya definidos: Almacén, Panadería, Verdulería, Carnicería, Lácteos, Bebidas, Kiosco, Limpieza, Farmacia, Ferretería, Tecnología, Ropa, Deportes, Mascotas.
**Quién decide/usa (lado vendedor):** el dueño o encargado del comercio — valida su identidad con CUIT y espera aprobación manual de un admin antes de poder publicar.
**Caso de uso principal:** un vecino de Baradero quiere la comodidad de comprar online (sin salir de casa, sin ir hasta el comercio) pero sin renunciar a comprarle a gente real de su propia ciudad — no a un depósito o un algoritmo nacional que no conoce el barrio.
**Trabajos que el producto resuelve ("jobs to be done"):**
- Comprarle productos frescos/cotidianos a comercios de Baradero sin salir de casa, con confianza de que hay un comercio real y conocido detrás.
- Para el comerciante: vender online sin quedar a merced de una plataforma grande que no conoce su barrio ni a sus clientes, y sin tener que armar su propia tienda desde cero.
- Encontrar en un solo lugar la oferta dispersa de los comercios del pueblo (hoy resuelto informalmente por WhatsApp, boca en boca o yendo físicamente).
**Casos de uso / escenarios específicos:**
- Se acabó el pan o la verdura y no querés salir de casa → pedís y te llega el mismo día dentro de Baradero.
- Un comercio nuevo del pueblo quiere vender online pero no tiene tiempo ni conocimiento técnico para armar su propia tienda → se registra, carga catálogo, y depende de la aprobación del admin (CUIT + validación manual) para empezar a vender.
- Preferís pagar por Mercado Pago o transferencia antes que manejar efectivo en la puerta.
- Preferís retirar vos mismo en el local en vez de esperar el envío.

## Personas
Marketplace de dos lados — no aplica el formato B2B de comprador/champion/decisor. Se documentan las dos personas reales del sistema.

| Persona | Rol en el sistema | Le importa | Su problema/fricción hoy | Valor que le prometemos |
|---------|-------------------|------------|---------------------------|--------------------------|
| **Vecino comprador** (`cliente`) | Navega el catálogo, arma el carrito, paga (Mercado Pago o transferencia), elige envío o retiro | Comodidad de comprar sin salir de casa, pero sin perder la cercanía de comprarle a gente conocida del pueblo; precio justo; que el pedido llegue bien y a tiempo | Hoy resuelve esto yendo físicamente al comercio, por WhatsApp informal, o recurriendo a MercadoLibre/apps nacionales de delivery a falta de una alternativa digital local — ninguna de esas opciones combina "online" con "es de acá" | Comprarle a los comercios reales de Baradero, con la comodidad de una compra online y la confianza de que hay un vecino (no un depósito lejano) preparando el pedido |
| **Comerciante vendedor** (`vendedor`) | Se registra, carga CUIT, espera aprobación manual del admin, publica catálogo, gestiona pedidos y estados de envío | Vender online sin depender de una plataforma grande que le cobra caro, no conoce su rubro ni a sus clientes, y lo compite contra el país entero; que la plataforma le traiga clientes de su propia ciudad | Hoy no tiene canal online propio, o si lo tiene es una plataforma nacional genérica donde compite con catálogo infinito y no tiene forma de destacar que es "el de la esquina" | Un canal de venta online hecho para comercios de Baradero, donde ser un negocio real y verificado (CUIT + aprobación manual) es una ventaja visible, no un trámite invisible de back-office |
| **Admin** (rol de soporte, no de audiencia de marketing) | Aprueba manualmente a los vendedores nuevos, valida CUIT, modera la plataforma | Que solo entren comercios reales y verificados, no cuentas falsas | — | — (rol operativo, no target de mensajes de marketing) |

## Problemas y puntos de dolor
**Problema central:** el vecino de Baradero quiere la comodidad de comprar online, pero la única oferta digital real disponible hoy (MercadoLibre, apps nacionales de delivery) no tiene ninguna conexión con su ciudad — no sabe quién le vende, no hay cara ni barrio detrás del producto, y el dinero no se queda en el pueblo. La alternativa sin plataforma es literalmente caminar hasta el comercio.
**Por qué las alternativas se quedan cortas:**
- MercadoLibre / apps nacionales de delivery: catálogo enorme y logística eficiente, pero el vendedor es anónimo, no hay identidad de barrio, y no hay ninguna garantía de que le estés comprando a alguien de Baradero.
- Ir físicamente al comercio: mantiene la relación de confianza y cercanía, pero no tiene la comodidad de comprar desde casa ni de pagar online.
- WhatsApp / boca en boca (lo que hoy usan muchos comercios chicos): funciona, pero no escala, no tiene catálogo navegable, no tiene checkout ni pago integrado, y depende de que el vecino ya conozca al comerciante.
**Qué le cuesta (tiempo/plata/oportunidad):**
- Al vecino: tiempo (viajes al comercio), o resignarse a comprarle a una plataforma sin identidad local cuando quiere hacerlo online.
- Al comerciante: ventas perdidas frente a comercios que sí lograron subirse a alguna plataforma (aunque sea genérica), y dependencia de canales informales (WhatsApp) que no escalan ni transmiten profesionalismo.
**Tensión emocional:** para el vecino, la sensación de "elegir la opción cómoda pero traicionar al comercio de siempre" — comprar en MercadoLibre se siente un poco como no comprarle al vecino. Para el comerciante, la ansiedad de quedar afuera de la migración a lo digital sin tener ni el tiempo ni el conocimiento técnico para resolverlo solo, y el temor a que una plataforma grande no lo trate como comercio real sino como un proveedor más entre miles.

## Panorama competitivo
**Directo:** no existe hoy un competidor directo real (otra plataforma de e-commerce hiperlocal específica de Baradero). El "directo" es, en rigor, la ausencia de alternativa digital local — cualquier comercio que hoy vende algo online en Baradero lo hace por WhatsApp o redes sociales sueltas, sin catálogo ni checkout.
**Secundario (mismo problema, solución distinta):** MercadoLibre y las apps nacionales de delivery. Resuelven "quiero comprar sin salir de casa" pero no resuelven "quiero comprarle a mi ciudad" — catálogo anónimo, sin cara, sin barrio, logística que no distingue Baradero de cualquier otro punto del mapa.
**Indirecto (enfoque en conflicto):** ir personalmente al comercio de siempre. Resuelve la confianza y la cercanía perfectamente, pero renuncia por completo a la comodidad online — es la opción que Baradero Local busca no reemplazar sino complementar.
**Dónde se quedan cortos los grandes:** no pueden (ni les conviene) construir identidad barrio por barrio, ciudad por ciudad — su ventaja es la escala nacional, exactamente lo que los vuelve incapaces de ofrecer lo que Baradero Local sí puede: que el vendedor sea alguien verificado y real de tu propia ciudad, y que el dinero y el envío no salgan de Baradero.

## Diferenciación
**Diferenciadores clave (lo que las alternativas no tienen):**
- Cada vendedor es un comercio real de Baradero, validado con CUIT y aprobado a mano por un admin — no autoservicio anónimo.
- El envío no sale de la ciudad: es Baradero para Baradero, con opción de retiro en el propio local.
- Rubros pensados para comercio de barrio real (almacén, verdulería, carnicería, panadería, kiosco...), no catálogo genérico de cualquier cosa.
- El manifiesto de marca no es un eslogan vacío, es la propuesta de valor literal: "conectamos vecinos" en vez de "conectamos personas lejanas".
**Cómo lo resolvemos distinto:** en vez de competir por catálogo infinito o velocidad de envío nacional (terreno donde MercadoLibre y las apps de delivery siempre ganan), competimos por cercanía y confianza verificada — un círculo mucho más chico, pero uno que ningún jugador nacional puede replicar ciudad por ciudad sin perder su ventaja de escala.
**Por qué eso es mejor:** el vecino sabe exactamente a quién le está comprando y que ese comercio existe físicamente a unas cuadras; el comerciante gana un canal digital sin perder su identidad ni quedar diluido entre miles de vendedores anónimos.
**Por qué eligen Baradero Local en vez de la alternativa:**
- El vecino: porque quiere la comodidad de comprar online sin resignar la relación con su ciudad — Baradero Local es la única opción digital que ofrece ambas cosas a la vez.
- El comerciante: porque quiere vender online sin depender de una plataforma que no lo conoce ni le da ninguna ventaja por ser un comercio real y local — acá la verificación (CUIT + aprobación manual) es justamente lo que lo distingue, no un trámite invisible.
**Nota de posicionamiento (panel de marketing, ver Changelog):** el error de categoría a evitar es dejarse leer como "e-commerce genérico". En esa categoría el comprador compara catálogo/precio/velocidad y ahí siempre pierde contra MercadoLibre. La categoría real es "comercio de proximidad" — tiene que nombrarse así en el hero y en cada rubro, y demostrarse en cada ficha de producto (comercio + barrio/distancia de origen), no quedar aislada en el footer.

## Objeciones y anti-persona
| Objeción | Respuesta |
|----------|-----------|
| "¿Para qué voy a usar esto si ya tengo MercadoLibre?" | MercadoLibre no te dice quién te vende ni de dónde sale tu pedido. Acá cada comercio es real, está en Baradero, y fue aprobado a mano — el envío ni siquiera sale de la ciudad. |
| "¿Y si el comercio no me despacha bien / es trucho?" | Cada vendedor pasa por validación de CUIT y aprobación manual de un admin antes de poder publicar — no es una cuenta que cualquiera abre sola. |
| "Prefiero ir directo al local, ya lo conozco." | Baradero Local no reemplaza esa relación, la extiende: seguís comprándole al mismo comercio de siempre, solo que ahora también podés hacerlo desde casa y pagar online. |
| (vendedor) "No tengo tiempo/conocimiento para vender online." | El registro y la carga de catálogo son simples, y la aprobación del admin se ocupa de la parte de confianza — no hace falta que el comerciante arme nada desde cero. |
| (vendedor) "¿Por qué no uso directamente MercadoLibre o Instagram?" | Porque ahí compite contra todo el país por atención y precio. Acá su ventaja — ser un comercio conocido y cercano — es justamente lo que la plataforma pone en primer plano. |

**Anti-persona (a quién NO le sirve):**
- Alguien que busca el catálogo más barato o más amplio posible sin importarle el origen del producto — esa persona está mejor servida por MercadoLibre o una app nacional de delivery, y no es el foco de Baradero Local.
- Un comercio que no tiene CUIT o no quiere pasar por validación/aprobación manual — el modelo depende de esa verificación, no es una plataforma de autoservicio sin control.
- Alguien que vive fuera de Baradero o busca envíos a otras ciudades — el alcance es intencionalmente hiperlocal, no nacional.

## Dinámica de cambio (push/pull/habit/anxiety)
**Push (qué los aleja de la solución actual):** el vecino se cansa de elegir entre salir físicamente a comprar o resignarse a una plataforma nacional sin identidad local cuando quiere comodidad online. El comerciante se cansa de ver que compradores potenciales se le van a plataformas grandes o a comercios vecinos que sí lograron algún tipo de presencia digital (aunque sea informal por WhatsApp).
**Pull (qué los atrae a Baradero Local):** la promesa concreta de "comprá local, recibí en casa" — comodidad online sin perder la cercanía con comercios reales y conocidos de su propia ciudad; para el comerciante, un canal digital pensado para su tamaño y su barrio, no para competir contra todo el país.
**Habit (qué los mantiene con el enfoque actual):** la costumbre de resolver todo por WhatsApp o yendo directo al local (funciona, es conocido, no requiere aprender nada nuevo); del lado comprador, la costumbre instalada de abrir MercadoLibre por default para cualquier compra online, aunque no sea la mejor opción para productos de proximidad.
**Anxiety (qué les preocupa de cambiar):** el vecino puede dudar de si el comercio realmente va a cumplir con tiempo y calidad de envío al comprar por una plataforma nueva y todavía chica. El comerciante puede dudar de si vale la pena el esfuerzo de cargar catálogo y aprender un sistema nuevo si la base de compradores todavía es chica (riesgo típico de marketplace de dos lados en etapa temprana, agravado hoy porque el catálogo real recién está arrancando — ver Estado actual en Objetivos).

## Lenguaje del cliente
**Cómo describen el problema (verbatim/estimado, a validar con entrevistas reales cuando haya usuarios):**
- "Quiero comprarle al almacén de la esquina pero no tengo ganas de salir."
- "No sé si en internet le compro a alguien de acá o a cualquiera."
**Cómo describen la solución:**
- "El almacén de tu barrio, online."
- "Comprá local, recibí en casa."
**Frases ya validadas en el sitio (no reemplazar, es la base de copy vigente):**
- Tagline hero (home): *"Comprá local, recibí en casa"*
- Subtítulo hero: *"Productos frescos de los comercios de Baradero directo a tu puerta."*
- Manifiesto de footer: *"Mientras otras plataformas conectan personas lejanas, nosotros conectamos vecinos."*
**Palabras/frases a usar:** local, vecino, tu barrio, comercio de Baradero, cerca tuyo, comercio real, verificado, tu ciudad, de acá.
**Palabras/frases a evitar:** "tienda online" (a secas, sin calificar), "marketplace" (como categoría hacia el cliente final), "plataforma de e-commerce", cualquier lenguaje que suene a escala nacional o abstracción corporativa ("usuarios", "consumidores", "experiencia de compra omnicanal").
**Glosario:**
| Término | Significado |
|---------|-------------|
| Cliente | Vecino de Baradero que compra en la plataforma |
| Vendedor | Comerciante local, validado con CUIT y aprobado manualmente por un admin |
| Repartidor | Rol planeado (no lanzado) para gestionar entregas dentro de Baradero |
| Admin | Rol que aprueba manualmente a los vendedores nuevos y modera la plataforma |
| Retiro en local | Alternativa al envío: el cliente retira su pedido directamente en el comercio |
| Comercio de proximidad | La categoría real del producto — no "e-commerce genérico", ver Diferenciación |

## Voz de marca
**Tono:** cálido, vecinal, directo — nunca corporativo ni distante. El riesgo explícito a evitar (marcado por feedback real de un usuario) es sonar como "inmobiliaria o app de viajes": esas categorías venden confianza abstracta y distancia; Baradero Local vende cercanía concreta.
**Estilo de comunicación:** simple y concreto, con nombres propios en vez de abstracciones de sistema — preferir "Almacén Don Raúl ya te está preparando el pedido" antes que "Tu pedido fue actualizado a estado SHIPPED". Cuando se hable de estados de pedido de cara al cliente, contarlos como algo que le pasa a una persona, no como una etiqueta técnica.
**Personalidad de marca (síntesis del panel — April Dunford, Seth Godin, Byron Sharp, Rory Sutherland):** cercana, vecinal, confiable, con carácter propio, orgullosa de ser chica y de Baradero — nunca prolija al punto de volverse anónima o genérica.
**Sistema visual (fuente de verdad: `Assets/styles/styles.css`, ya en producción — no reinventar):**
- Paleta: `--primary-color #3f85ba` (azul medio, CTAs/topbar), `--primary-light #78b4eb` (superficies), `--primary-dark #284175` (énfasis), `--primary-hover #1f3460` (hover/estados activos). Recomendación del panel (Byron Sharp): fijar `#284175` como color ancla único y consistente en logo/CTA/topbar en todas las plataformas (sitio, redes, video) — es el tono más oscuro y memorizable de la paleta, y no debería rotar.
- Tipografía del sitio: `--font-main` = pila de sistema encabezada por Segoe UI; `--font-serif` = Georgia, como acento editorial en headlines de login.
- Botones tipo píldora (radius 1.25–1.75rem), cards con radius 1rem, iconos FontAwesome.
- Logo real: `Assets/images/Logos/logoazulpng.png` (azul sobre transparente). Regla de inversión ya resuelta en el video (ver abajo): azul sobre fondo claro, blanco invertido sobre fondo oscuro — documentar como norma fija del sistema, no como decisión ad hoc por pieza.
- `Assets/images/brand/` existe pero está vacía. Advertencia explícita del panel (Seth Godin): cuando se sienta la presión de llenarla, evitar fotos de stock genéricas (manos con cajas de cartón, familias sonriendo recibiendo delivery) — esa textura es la de una inmobiliaria vendiendo confianza abstracta, exactamente lo que Baradero Local necesita evitar. Preferir el hueco vacío, o el lenguaje ilustrado/animado que ya funciona en el video de Remotion, hasta tener fotos reales de comercios reales de Baradero. Prueba rápida antes de subir cualquier imagen: "¿esto podría ser el sitio de cualquier otro pueblo del país?" — si la respuesta es sí, no sirve.
- Colores semánticos de estado de pedido (pending/paid/shipped/ready_for_pickup/completed/cancelled): **no existen todavía**, es una extensión pendiente de diseño. Recomendación del panel: evitar el semáforo genérico rojo/amarillo/verde de cualquier dashboard — resolverlo dentro de la propia paleta azul (`--primary-light` para "en curso", `--primary-dark` para "listo") más un único acento cálido nuevo para "cancelado", para que hasta el estado de un pedido se sienta propio de esta marca.
**Sistema de video (Remotion, `video/`, funcional, no versionado en git todavía):**
- `video/src/marca.js` espeja los tokens de CSS: `AZUL #284175`, `AZUL_MEDIO #3f85ba`, `AZUL_CLARO #78b4eb`, `AZUL_PROFUNDO #1f3460`, `BLANCO #ffffff`.
- Usa la fuente **Inter** (vía `@remotion/google-fonts`) en vez de Segoe UI/Georgia — decisión intencional y correcta, no una inconsistencia a corregir: Remotion renderiza server-side y necesita una fuente embebible que no dependa de estar instalada en el sistema; Inter es geométrica-humanista y armoniza visualmente con Segoe UI sin depender de fuentes de sistema.
- Formato `HISTORIA` = 1080×1920 @ 30fps (historias de Instagram). Composiciones en `Root.jsx`: `BaraderoLocal` (1920×1080, spot horizontal) y `BaraderoLocalVertical` (1080×1920), mismo componente `BaraderoLocal.jsx`.
- Patrón `AGENDA`: una historia de Instagram por día de semana (Lunes-Carrito, Martes-Rubros, Miércoles-ComoFunciona, Jueves-Envío, Viernes-Vendedores), ~7-8s cada una. Recomendación del panel (Byron Sharp): esta cadencia semanal es en sí misma un activo de marca — construye disponibilidad mental por frecuencia repetida, no hace falta reinventar el formato cada semana.
- `video/src/lib/anim.jsx` define el lenguaje de movimiento reutilizable: `useEscala()` (escala sobre el lado menor, sirve en horizontal y vertical), `useEntrada()` (entrada elástica vía spring), `useCortina()` (fundido de escena), fondo con degradado radial que respira + Ken Burns leve + barrido de luz + viñeta (siempre en tonos AZUL/AZUL_MEDIO/AZUL_PROFUNDO), CTA en píldora blanca con texto AZUL_PROFUNDO que "late" una vez, y texto que sube palabra por palabra en cascada.
- `CIERRE` = "Próximamente" en `marca.js`, a propósito (el sitio todavía no se anuncia públicamente). **Cuando se lance de verdad, cambiar esa única constante** — idealmente al remate verbal fijo recomendado por el panel: "conectamos vecinos", en el mismo lugar donde hoy cierra "Próximamente", para que se vuelva la firma de cierre de todos los videos.
- **No tocar** `BaraderoLocal.jsx` ni `video/src/historias/*.jsx` — ya funcionan. Cambios en `marca.js` son aditivos únicamente (agregar tokens que falten, mejorar comentarios), nunca reescribir escenas existentes.

## Puntos de prueba
**Métricas:** no hay tracción real que citar todavía — el sistema corre hoy con 14 comercios y ~56 productos de **datos semilla** (seed), no comercios reales cargados por sus dueños. No usar estas cifras como prueba social ("14 comercios ya venden con nosotros" sería falso); se pueden usar como propuesta de valor ("14 rubros cubiertos, listo para que tu comercio sea el próximo") pero no como tracción.
**Clientes/comercios destacados:** ninguno todavía — pendiente de F11-06 (carga de comercios reales, ver Objetivos).
**Testimonios:** ninguno todavía.
**Temas de valor y su respaldo (lo único verificable hoy es el diseño del producto, no el uso real):**
| Tema | Respaldo |
|------|----------|
| Cada vendedor es un comercio real, no anónimo | Flujo de registro exige CUIT + aprobación manual de un admin antes de poder publicar |
| El envío no sale de Baradero | Opciones de entrega limitadas a envío dentro de la ciudad o retiro en el local |
| Cobertura real de rubros del pueblo | 14 rubros ya definidos y cargados en el catálogo (Almacén, Panadería, Verdulería, Carnicería, Lácteos, Bebidas, Kiosco, Limpieza, Farmacia, Ferretería, Tecnología, Ropa, Deportes, Mascotas) |
| Pago simple y conocido | Integración real con Mercado Pago (Checkout Pro) + transferencia con comprobante |

**Recomendación del panel (Rory Sutherland) para convertir esto en prueba real cuando haya vendedores reales:** exponer la verificación (CUIT + aprobación manual) como insignia visible ("verificado por Baradero Local") en cada perfil de vendedor, en vez de dejarla como trámite invisible de back-office — es la señal de compromiso más fuerte que el negocio tiene y hoy nadie la ve. Cuando entren los primeros comercios reales, considerar lanzarlos como grupo "fundador" (curado, no exhaustivo) en vez de disimular que el catálogo es chico.

## Objetivos
**Objetivo de negocio:** lanzamiento real del marketplace en Baradero — no es un proyecto académico ni una demo. El roadmap del producto (M1-M11 completos, Fase 12 casi completa salvo facturación/AFIP, fuera de alcance) ya está en etapa de pulido pre-lanzamiento, no de construcción inicial.
**Acción de conversión clave:**
- Lado cliente: completar una primera compra (agregar al carrito → pagar con Mercado Pago o transferencia → recibir o retirar).
- Lado vendedor: completar el registro y pasar la aprobación manual del admin para empezar a publicar productos.
**Métricas actuales:** ninguna de uso real todavía. Estado real del catálogo: 14 comercios / ~56 productos son datos de seed, no hay comercios reales cargados (pendiente F11-06). Nadie tiene el rol `admin` asignado todavía en producción — bloqueante operativo antes de poder aprobar vendedores reales con una cuenta real. Dominio propio pendiente de compra (hoy corre en `proyectopdisc.vercel.app`, F11-04). Notificaciones por Email/WhatsApp bloqueadas por falta de credenciales de proveedor externo (F8-02/F8-03).

## Changelog
*Newest first. One line per revision: what changed and why.*
- v1 (2026-08-03) — Documento inicial, redactado a partir del contexto de negocio real (copy validado del sitio, sistema visual de `styles.css`, sistema de video Remotion en `video/`) y del análisis del panel de marketing (April Dunford, Seth Godin, Byron Sharp, Rory Sutherland) sobre categoría, diferenciación y voz de marca.
