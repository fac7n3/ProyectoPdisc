import { Easing, interpolate, useCurrentFrame } from "remotion";
import { AZUL_CLARO, AZUL_PROFUNDO, BLANCO, CIERRE, fontFamily } from "../marca";
import { Cta, Fondo, Palabras, useCortina, useEntrada, useEscala } from "../lib/anim";

// Lunes — el carrito que se llena. Rubros genéricos, sin packaging de marcas de terceros.
const ITEMS = ["Pan", "Leche", "Yerba", "Fiambre", "Verduras", "Fideos"];
const INICIO = 46; // frame en que entra el primer ítem
const CADA = 17; // frames entre ítems
const VUELO = 20; // duración del vuelo de cada ítem

// El ítem sale del costado, hace un arco y cae dentro del canasto.
const Item = ({ texto, delay, desdeIzquierda }) => {
  const frame = useCurrentFrame();
  const escala = useEscala();
  const t = interpolate(frame, [delay, delay + VUELO], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });

  if (frame < delay || t >= 1) return null;

  const x = interpolate(t, [0, 1], [desdeIzquierda ? -420 : 420, 0]) * escala;
  // Parábola: sube y vuelve a bajar hasta la boca del canasto.
  const y = (interpolate(t, [0, 1], [-40, 150]) - Math.sin(t * Math.PI) * 130) * escala;

  return (
    <div
      style={{
        position: "absolute",
        transform: `translate(${x}px, ${y}px) rotate(${interpolate(t, [0, 1], [desdeIzquierda ? -14 : 14, 0])}deg) scale(${interpolate(t, [0.75, 1], [1, 0.55], { extrapolateLeft: "clamp" })})`,
        padding: `${16 * escala}px ${34 * escala}px`,
        borderRadius: 999,
        background: BLANCO,
        color: AZUL_PROFUNDO,
        fontSize: 34 * escala,
        fontWeight: 700,
        whiteSpace: "nowrap",
        boxShadow: `0 ${10 * escala}px ${24 * escala}px rgba(0,0,0,0.3)`,
        opacity: interpolate(t, [0.85, 1], [1, 0], { extrapolateLeft: "clamp" }),
      }}
    >
      {texto}
    </div>
  );
};

export const Carrito = () => {
  const frame = useCurrentFrame();
  const escala = useEscala();
  const cortina = useCortina();
  const entraCarro = useEntrada(24, { damping: 12, mass: 0.6 });

  // Cuántos ítems ya cayeron adentro.
  const cargados = ITEMS.filter((_, i) => frame >= INICIO + i * CADA + VUELO).length;
  // El canasto pega un rebote cada vez que entra algo.
  const ultimoImpacto = INICIO + (cargados - 1) * CADA + VUELO;
  const rebote = cargados > 0 ? Math.max(0, 1 - (frame - ultimoImpacto) / 8) : 0;

  const cierre = interpolate(frame, [INICIO + ITEMS.length * CADA + 6, INICIO + ITEMS.length * CADA + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Fondo
      style={{
        fontFamily,
        opacity: cortina,
        flexDirection: "column",
        justifyContent: "center",
        gap: 70 * escala,
        padding: 70 * escala,
        textAlign: "center",
      }}
    >
      <Palabras
        texto={"Lo de tu barrio,\nen tu teléfono"}
        delay={6}
        style={{
          color: BLANCO,
          fontSize: 80 * escala,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -1.5 * escala,
        }}
      />

      {/* Zona de vuelo: los ítems se posicionan respecto del centro de este bloque. */}
      <div
        style={{
          position: "relative",
          width: 620 * escala,
          height: 380 * escala,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            opacity: entraCarro,
            transform: `translateY(${interpolate(entraCarro, [0, 1], [60 * escala, 0])}px) scale(${entraCarro * (1 + rebote * 0.06)})`,
          }}
        >
          <svg width={340 * escala} height={250 * escala} viewBox="0 0 120 88">
            {/* Manija y canasto del carrito. */}
            <path
              d="M6 8 H22 L34 50"
              fill="none"
              stroke={BLANCO}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M28 22 H108 L96 54 H38 Z"
              fill="rgba(255,255,255,0.14)"
              stroke={BLANCO}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="46" cy="70" r="7" fill={BLANCO} />
            <circle cx="88" cy="70" r="7" fill={BLANCO} />
          </svg>

          {/* Contador de ítems cargados. */}
          <div
            style={{
              position: "absolute",
              top: -18 * escala,
              right: -14 * escala,
              minWidth: 84 * escala,
              height: 84 * escala,
              padding: `0 ${10 * escala}px`,
              borderRadius: 999,
              background: AZUL_CLARO,
              color: AZUL_PROFUNDO,
              fontSize: 44 * escala,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 ${8 * escala}px ${20 * escala}px rgba(0,0,0,0.35)`,
              opacity: cargados > 0 ? 1 : 0,
              transform: `scale(${1 + rebote * 0.18})`,
            }}
          >
            {cargados}
          </div>
        </div>

        {ITEMS.map((texto, i) => (
          <Item
            key={texto}
            texto={texto}
            delay={INICIO + i * CADA}
            desdeIzquierda={i % 2 === 0}
          />
        ))}
      </div>

      <p
        style={{
          margin: 0,
          color: "rgba(255,255,255,0.88)",
          fontSize: 40 * escala,
          fontWeight: 600,
          maxWidth: 860 * escala,
          opacity: cierre,
          transform: `translateY(${interpolate(cierre, [0, 1], [22 * escala, 0])}px)`,
        }}
      >
        Un carrito, varios comercios de Baradero.
      </p>

      <Cta texto={CIERRE} delay={172} />
    </Fondo>
  );
};
