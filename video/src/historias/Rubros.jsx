import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AZUL_CLARO, BLANCO, RUBROS, fontFamily } from "../marca";
import { Fondo, Palabras, useCortina, useEscala } from "../lib/anim";

// Martes — el catálogo por rubro. Los nombres salen de RUBROS (js/nav-utils.js).
export const Rubros = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const escala = useEscala();
  const cortina = useCortina();

  const cierre = interpolate(frame, [168, 186], [0, 1], {
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
        gap: 60 * escala,
        padding: 70 * escala,
        textAlign: "center",
      }}
    >
      <Palabras
        texto={"Todo Baradero\nen un solo lugar"}
        delay={6}
        style={{
          color: BLANCO,
          fontSize: 82 * escala,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -1.5 * escala,
        }}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 18 * escala,
          maxWidth: 900 * escala,
        }}
      >
        {RUBROS.map((rubro, i) => {
          // Cascada: cada chip entra 4 frames después del anterior.
          const p = spring({
            frame: frame - 40 - i * 4,
            fps,
            config: { damping: 13, mass: 0.4 },
          });
          return (
            <span
              key={rubro}
              style={{
                padding: `${16 * escala}px ${30 * escala}px`,
                borderRadius: 999,
                border: `${2 * escala}px solid rgba(255,255,255,0.35)`,
                background: "rgba(255,255,255,0.12)",
                color: BLANCO,
                fontSize: 34 * escala,
                fontWeight: 600,
                opacity: p,
                transform: `scale(${interpolate(p, [0, 1], [0.5, 1])})`,
              }}
            >
              {rubro}
            </span>
          );
        })}
      </div>

      <p
        style={{
          margin: 0,
          color: AZUL_CLARO,
          fontSize: 44 * escala,
          fontWeight: 700,
          opacity: cierre,
          transform: `translateY(${interpolate(cierre, [0, 1], [24 * escala, 0])}px)`,
        }}
      >
        {RUBROS.length} rubros, un solo carrito.
      </p>
    </Fondo>
  );
};
