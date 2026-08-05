import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { AZUL_CLARO, BLANCO, CIERRE, fontFamily } from "../marca";
import { Cta, Fondo, Palabras, useCortina, useEntrada, useEscala } from "../lib/anim";

// Espacio de coordenadas del trazado (se multiplica por `escala` al pintar).
const LIENZO = { w: 900, h: 420 };
const P0 = { x: 90, y: 330 }; // comercio
const P1 = { x: 450, y: 40 }; // control de la curva
const P2 = { x: 810, y: 330 }; // tu casa

// Bézier cuadrática: da la posición del pin en cualquier punto del recorrido.
const puntoEnCurva = (t) => ({
  x: (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x,
  y: (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y,
});

const Marcador = ({ punto, etiqueta, delay }) => {
  const escala = useEscala();
  const p = useEntrada(delay, { damping: 12, mass: 0.4 });

  return (
    <div
      style={{
        position: "absolute",
        left: punto.x * escala,
        top: punto.y * escala,
        transform: `translate(-50%, -50%) scale(${p})`,
      }}
    >
      <div
        style={{
          width: 26 * escala,
          height: 26 * escala,
          borderRadius: "50%",
          background: BLANCO,
          boxShadow: `0 0 0 ${8 * escala}px rgba(255,255,255,0.2)`,
        }}
      />
      {/* La etiqueta va bien debajo del punto: si no, el pin que llega la tapa. */}
      <span
        style={{
          position: "absolute",
          top: 46 * escala,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.9)",
          fontSize: 28 * escala,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {etiqueta}
      </span>
    </div>
  );
};

// Jueves — entrega. Retiro en local + envío dentro de Baradero (decisión de producto).
export const Envio = () => {
  const frame = useCurrentFrame();
  const escala = useEscala();
  const cortina = useCortina();

  // El recorrido se dibuja entre los frames 50 y 130.
  const recorrido = interpolate(frame, [50, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const pin = puntoEnCurva(recorrido);
  const trazado = `M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`;

  return (
    <Fondo
      style={{
        fontFamily,
        opacity: cortina,
        flexDirection: "column",
        justifyContent: "center",
        gap: 40 * escala,
        padding: 70 * escala,
        textAlign: "center",
      }}
    >
      <Palabras
        texto={"Te lo llevamos"}
        delay={6}
        style={{
          color: BLANCO,
          fontSize: 88 * escala,
          fontWeight: 800,
          letterSpacing: -1.5 * escala,
        }}
      />

      <div style={{ position: "relative", width: LIENZO.w * escala, height: LIENZO.h * escala }}>
        <svg
          width={LIENZO.w * escala}
          height={LIENZO.h * escala}
          viewBox={`0 0 ${LIENZO.w} ${LIENZO.h}`}
        >
          {/* Guía punteada completa, tenue. */}
          <path
            d={trazado}
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={5}
            strokeDasharray="14 16"
            strokeLinecap="round"
          />
          {/* Trazo sólido que avanza. pathLength=1 permite animar el avance como fracción. */}
          <path
            d={trazado}
            fill="none"
            stroke={AZUL_CLARO}
            strokeWidth={7}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - recorrido}
          />
        </svg>

        <Marcador punto={P0} etiqueta="El comercio" delay={20} />
        <Marcador punto={P2} etiqueta="Tu casa" delay={30} />

        {/* El pin de marca hace el viaje. */}
        <Img
          src={staticFile("logo.png")}
          style={{
            position: "absolute",
            left: pin.x * escala,
            top: pin.y * escala,
            width: 78 * escala,
            transform: "translate(-50%, -85%)",
            filter: `brightness(0) invert(1) drop-shadow(0 ${8 * escala}px ${16 * escala}px rgba(0,0,0,0.5))`,
            opacity: interpolate(frame, [44, 52], [0, 1], { extrapolateLeft: "clamp" }),
          }}
        />
      </div>

      <p
        style={{
          margin: 0,
          color: "rgba(255,255,255,0.85)",
          fontSize: 40 * escala,
          fontWeight: 500,
          maxWidth: 820 * escala,
          opacity: interpolate(frame, [132, 148], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Envío en Baradero o retiro en el local.
      </p>

      <Cta texto={CIERRE} delay={160} />
    </Fondo>
  );
};
