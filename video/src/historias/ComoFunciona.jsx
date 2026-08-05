import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AZUL_PROFUNDO, BLANCO, fontFamily } from "../marca";
import { Fondo, Palabras, useCortina, useEscala } from "../lib/anim";

// Miércoles — los tres pasos reales del flujo (medios de pago y entrega según CLAUDE.md).
// Cada paso entra en una sola línea a 40px: no alargar sin volver a mirar el render.
const PASOS = [
  "Elegís de los comercios de Baradero",
  "Pagás con Mercado Pago o transferencia",
  "Retirás en el local o te lo enviamos",
];

const Paso = ({ numero, texto, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const escala = useEscala();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.5 } });
  // El paso vigente queda al 100%; los anteriores bajan apenas, sin llegar a leerse
  // como deshabilitados.
  const vigente = interpolate(frame, [delay, delay + 12, delay + 46, delay + 58], [1, 1, 1, 0.78], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28 * escala,
        textAlign: "left",
        opacity: p * vigente,
        transform: `translateX(${interpolate(p, [0, 1], [-70 * escala, 0])}px)`,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 92 * escala,
          height: 92 * escala,
          borderRadius: "50%",
          background: BLANCO,
          color: AZUL_PROFUNDO,
          fontSize: 48 * escala,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 ${10 * escala}px ${24 * escala}px rgba(0,0,0,0.3)`,
        }}
      >
        {numero}
      </div>
      <span
        style={{
          color: BLANCO,
          fontSize: 40 * escala,
          fontWeight: 600,
          lineHeight: 1.25,
          maxWidth: 800 * escala,
        }}
      >
        {texto}
      </span>
    </div>
  );
};

export const ComoFunciona = () => {
  const escala = useEscala();
  const cortina = useCortina();

  return (
    <Fondo
      style={{
        fontFamily,
        opacity: cortina,
        flexDirection: "column",
        justifyContent: "center",
        gap: 70 * escala,
        padding: 80 * escala,
      }}
    >
      <Palabras
        texto={"Comprar es\nasí de simple"}
        delay={6}
        style={{
          color: BLANCO,
          fontSize: 78 * escala,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -1.5 * escala,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 46 * escala }}>
        {PASOS.map((texto, i) => (
          <Paso key={i} numero={i + 1} texto={texto} delay={38 + i * 34} />
        ))}
      </div>
    </Fondo>
  );
};
