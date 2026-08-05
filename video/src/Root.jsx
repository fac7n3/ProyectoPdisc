import "./index.css";
import { Composition } from "remotion";
import { BaraderoLocal } from "./BaraderoLocal";
import { Carrito } from "./historias/Carrito";
import { Rubros } from "./historias/Rubros";
import { ComoFunciona } from "./historias/ComoFunciona";
import { Envio } from "./historias/Envio";
import { Vendedores } from "./historias/Vendedores";
import { CIERRE, HISTORIA } from "./marca";

// Copy tomado del sitio: hero de pages/home.html y subtítulo del navbar.
const marca = {
  slogan: "Comprá local,\nrecibí en casa",
  subtitulo: "Baradero, más cerca que nunca.",
};

// Una historia por día de la semana. Instagram vertical; la duración la fija
// el último elemento que entra en cada escena (7-8s).
const AGENDA = [
  { id: "01-Lunes-Carrito", component: Carrito, durationInFrames: 240 },
  { id: "02-Martes-Rubros", component: Rubros, durationInFrames: 210 },
  { id: "03-Miercoles-ComoFunciona", component: ComoFunciona, durationInFrames: 210 },
  { id: "04-Jueves-Envio", component: Envio, durationInFrames: 240 },
  { id: "05-Viernes-Vendedores", component: Vendedores, durationInFrames: 240 },
];

export const RemotionRoot = () => {
  return (
    <>
      {/* Spot de marca. npx remotion render BaraderoLocal out/baradero-local.mp4 */}
      <Composition
        id="BaraderoLocal"
        component={BaraderoLocal}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ...marca, cta: CIERRE }}
      />
      <Composition
        id="BaraderoLocalVertical"
        component={BaraderoLocal}
        durationInFrames={150}
        {...HISTORIA}
        defaultProps={{ ...marca, cta: CIERRE }}
      />

      {AGENDA.map(({ id, component, durationInFrames }) => (
        <Composition
          key={id}
          id={id}
          component={component}
          durationInFrames={durationInFrames}
          {...HISTORIA}
        />
      ))}
    </>
  );
};
