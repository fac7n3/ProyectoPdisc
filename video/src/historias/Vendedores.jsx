import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AZUL_CLARO, BLANCO, fontFamily } from "../marca";
import { Cta, Fondo, Palabras, useCortina, useEscala } from "../lib/anim";

// Viernes — captación de comercios. Cada línea es una sección real del panel de vendedor
// (Publicaciones, Ventas, Pagos por confirmar, Envíos en curso).
const BENEFICIOS = [
  "Publicá tus productos con foto y stock",
  "Seguí tus ventas desde el panel",
  "Cobrá con Mercado Pago o transferencia",
  "Organizá los envíos y los retiros en el local",
];

const Beneficio = ({ texto, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const escala = useEscala();
  const p = spring({ frame: frame - delay, fps, config: { damping: 15, mass: 0.5 } });
  // El tilde se dibuja después de que aparece la fila.
  const tilde = interpolate(frame, [delay + 6, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26 * escala,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [40 * escala, 0])}px)`,
      }}
    >
      <svg
        width={56 * escala}
        height={56 * escala}
        viewBox="0 0 56 56"
        style={{ flexShrink: 0 }}
      >
        <circle cx="28" cy="28" r="26" fill="rgba(255,255,255,0.12)" stroke={AZUL_CLARO} strokeWidth="3" />
        <path
          d="M16 29 L25 38 L41 20"
          fill="none"
          stroke={BLANCO}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - tilde}
        />
      </svg>
      <span style={{ color: BLANCO, fontSize: 38 * escala, fontWeight: 600, lineHeight: 1.25 }}>
        {texto}
      </span>
    </div>
  );
};

export const Vendedores = () => {
  const escala = useEscala();
  const cortina = useCortina();

  return (
    <Fondo
      style={{
        fontFamily,
        opacity: cortina,
        flexDirection: "column",
        justifyContent: "center",
        gap: 60 * escala,
        padding: 80 * escala,
      }}
    >
      <Palabras
        texto={"¿Tenés un comercio\nen Baradero?"}
        delay={6}
        style={{
          color: BLANCO,
          fontSize: 76 * escala,
          fontWeight: 800,
          lineHeight: 1.12,
          letterSpacing: -1.5 * escala,
          textAlign: "center",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 40 * escala }}>
        {BENEFICIOS.map((texto, i) => (
          <Beneficio key={i} texto={texto} delay={40 + i * 26} />
        ))}
      </div>

      <Cta texto="Registrate como vendedor" delay={158} />
    </Fondo>
  );
};
