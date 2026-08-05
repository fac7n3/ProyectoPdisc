import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AZUL, AZUL_MEDIO, AZUL_PROFUNDO, BLANCO } from "../marca";

// Escala sobre el lado menor: la misma escena sirve en 16:9 y en vertical sin quedar chica.
export const useEscala = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
};

// Entrada elástica normalizada 0→1. `delay` en frames.
export const useEntrada = (delay = 0, config = { damping: 14, mass: 0.5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

// Fundido de entrada y salida de la escena completa, para poder encadenar historias.
export const useCortina = (framesEntrada = 8, framesSalida = 14) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return Math.min(
    interpolate(frame, [0, framesEntrada], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - framesSalida, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
};

// Fondo de marca: degradado radial que respira + barrido de luz + viñeta.
// Todo se calcula por frame (no hay transiciones CSS en un render cuadro a cuadro).
export const Fondo = ({ children, style }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const t = frame / fps;

  // Deriva lenta del centro del degradado: evita que la imagen se sienta congelada.
  const cx = 50 + Math.sin(t * 0.5) * 6;
  const cy = 34 + Math.cos(t * 0.4) * 5;
  // Zoom muy leve tipo Ken Burns.
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06]);

  // El barrido cruza una sola vez, en el primer tercio.
  const barrido = interpolate(frame, [0, durationInFrames * 0.45], [-0.6, 1.6], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: AZUL, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${zoom})`,
          background: `radial-gradient(circle at ${cx}% ${cy}%, ${AZUL_MEDIO} 0%, ${AZUL} 55%, ${AZUL_PROFUNDO} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.18,
          transform: `translateX(${barrido * width}px) rotate(14deg) scale(1.6)`,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)",
          width: width * 0.35,
        }}
      />
      {/* Viñeta: concentra la atención en el centro. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 45%, transparent 35%, rgba(12,25,50,0.55) 100%)",
        }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", ...style }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Píldora de cierre con la dirección del sitio. Late una vez al entrar para que enganche el ojo.
export const Cta = ({ texto, delay = 0 }) => {
  const frame = useCurrentFrame();
  const escala = useEscala();
  const entra = useEntrada(delay, { damping: 12, mass: 0.5 });
  const latido = 1 + Math.max(0, Math.sin((frame - delay - 14) / 6)) * 0.03;

  return (
    <div
      style={{
        marginTop: 16 * escala,
        padding: `${18 * escala}px ${40 * escala}px`,
        borderRadius: 999,
        background: BLANCO,
        color: AZUL_PROFUNDO,
        fontSize: 34 * escala,
        fontWeight: 700,
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
        boxShadow: `0 ${14 * escala}px ${30 * escala}px rgba(0,0,0,0.35)`,
        opacity: entra,
        transform: `translateY(${interpolate(entra, [0, 1], [40 * escala, 0])}px) scale(${entra * latido})`,
      }}
    >
      {texto}
    </div>
  );
};

// Texto que sube palabra por palabra desde detrás de una máscara.
// Es el recurso que más "producción" aporta frente a un fade plano.
export const Palabras = ({ texto, delay = 0, escalonado = 3, style, anchoLinea }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Cada línea del texto se enmascara aparte para que el salto de línea sea intencional.
  const lineas = texto.split("\n");
  let indice = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", ...style }}>
      {lineas.map((linea, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0.28em",
            maxWidth: anchoLinea,
          }}
        >
          {linea.split(" ").map((palabra, j) => {
            const p = spring({
              frame: frame - delay - indice++ * escalonado,
              fps,
              config: { damping: 200 },
              durationInFrames: 18,
            });
            return (
              // overflow oculto = la máscara por la que asoma la palabra.
              <span key={j} style={{ overflow: "hidden", display: "inline-block" }}>
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${interpolate(p, [0, 1], [110, 0])}%)`,
                  }}
                >
                  {palabra}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
