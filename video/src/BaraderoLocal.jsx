import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AZUL_CLARO, BLANCO, fontFamily } from "./marca";
import { Cta, Fondo, Palabras, useCortina, useEntrada, useEscala } from "./lib/anim";

export const BaraderoLocal = ({ slogan, subtitulo, cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const escala = useEscala();
  const cortina = useCortina(6, 14);

  // El logo entra con rebote y después flota apenas, para que la escena no se congele.
  const entra = useEntrada(0, { damping: 11, mass: 0.7 });
  const flote = Math.sin((frame / fps) * 1.6) * 6 * escala;

  // La línea de acento se dibuja de adentro hacia afuera.
  const linea = useEntrada(20, { damping: 200 });

  // El subtítulo pasa de desenfocado a nítido: lee más "terminado" que un fade solo.
  const sub = interpolate(frame, [30, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <Fondo
      style={{
        fontFamily,
        opacity: cortina,
        flexDirection: "column",
        gap: 40 * escala,
        textAlign: "center",
        padding: 80 * escala,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{
          width: 260 * escala,
          // El logo original es azul sobre transparente: se invierte a blanco para el fondo oscuro.
          filter: `brightness(0) invert(1) drop-shadow(0 ${18 * escala}px ${34 * escala}px rgba(0,0,0,0.45))`,
          opacity: entra,
          transform: `translateY(${interpolate(entra, [0, 1], [60 * escala, 0]) + flote}px) scale(${interpolate(entra, [0, 1], [0.7, 1])})`,
        }}
      />

      <div
        style={{
          width: 120 * escala,
          height: 4 * escala,
          borderRadius: 4,
          background: AZUL_CLARO,
          transform: `scaleX(${linea})`,
          opacity: 0.9,
        }}
      />

      <Palabras
        texto={slogan}
        delay={14}
        style={{
          color: BLANCO,
          fontSize: 96 * escala,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: -2 * escala,
        }}
      />

      <p
        style={{
          margin: 0,
          color: "rgba(255,255,255,0.82)",
          fontSize: 38 * escala,
          fontWeight: 500,
          maxWidth: 900 * escala,
          opacity: sub,
          filter: `blur(${interpolate(sub, [0, 1], [10, 0])}px)`,
          transform: `translateY(${interpolate(sub, [0, 1], [18 * escala, 0])}px)`,
        }}
      >
        {subtitulo}
      </p>

      {cta ? <Cta texto={cta} delay={58} /> : null}
    </Fondo>
  );
};
