/**
 * image-crop-utils.js — cuentas del editor de encuadre de fotos (sin DOM).
 * Baradero Local
 *
 * El marco tiene un tamaño fijo (frameW x frameH, en px de pantalla) y la foto
 * se mueve y agranda por detrás. Con zoom 1 la foto justo cubre el marco, así
 * que nunca queda un borde vacío.
 */

/** Escala (px de pantalla por px de la foto) con la que la foto cubre el marco. */
export function coverScale(nw, nh, frameW, frameH, zoom = 1) {
  return Math.max(frameW / nw, frameH / nh) * zoom;
}

/** Deja el desplazamiento (esquina de la foto respecto del marco) dentro de lo que cubre el marco. */
export function clampOffset(offset, nw, nh, frameW, frameH, scale) {
  const minX = Math.min(0, frameW - nw * scale);
  const minY = Math.min(0, frameH - nh * scale);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/** Recuadro de la foto original (en px de la foto) que queda dentro del marco. */
export function sourceRect(offset, scale, frameW, frameH) {
  return { sx: (0 - offset.x) / scale, sy: (0 - offset.y) / scale, sw: frameW / scale, sh: frameH / scale };
}

/** Tamaño del archivo de salida: lo que tenía el recorte, sin pasar de maxSide por el lado largo. */
export function outputSize(sw, sh, maxSide = 1600) {
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
}
