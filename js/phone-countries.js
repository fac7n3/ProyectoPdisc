/**
 * Prefijos de país para el selector de característica del teléfono (A113:
 * "quiero la opción de característica de país, como en la mayoría de las
 * páginas"). Argentina va primero porque es el default: casi todos los
 * usuarios son de acá.
 *
 * ponytail: la lista no es exhaustiva y cada prefijo aparece una sola vez
 * (ej. +1 queda representado solo por Estados Unidos, no por Canadá ni el
 * Caribe) para que el valor del dropdown pueda ser el prefijo mismo, sin una
 * capa extra de ISO2 → prefijo. Si algún día hace falta distinguir países
 * que comparten prefijo, el upgrade es agregar `iso2` como value y resolver
 * el prefijo por separado.
 */
export const PHONE_COUNTRIES = [
  { iso2: "AR", name: "Argentina", dial: "+54" },
  { iso2: "UY", name: "Uruguay", dial: "+598" },
  { iso2: "CL", name: "Chile", dial: "+56" },
  { iso2: "BR", name: "Brasil", dial: "+55" },
  { iso2: "PY", name: "Paraguay", dial: "+595" },
  { iso2: "BO", name: "Bolivia", dial: "+591" },
  { iso2: "PE", name: "Perú", dial: "+51" },
  { iso2: "CO", name: "Colombia", dial: "+57" },
  { iso2: "VE", name: "Venezuela", dial: "+58" },
  { iso2: "EC", name: "Ecuador", dial: "+593" },
  { iso2: "MX", name: "México", dial: "+52" },
  { iso2: "PA", name: "Panamá", dial: "+507" },
  { iso2: "CR", name: "Costa Rica", dial: "+506" },
  { iso2: "GT", name: "Guatemala", dial: "+502" },
  { iso2: "HN", name: "Honduras", dial: "+504" },
  { iso2: "SV", name: "El Salvador", dial: "+503" },
  { iso2: "NI", name: "Nicaragua", dial: "+505" },
  { iso2: "CU", name: "Cuba", dial: "+53" },
  { iso2: "US", name: "Estados Unidos", dial: "+1" },
  { iso2: "ES", name: "España", dial: "+34" },
  { iso2: "IT", name: "Italia", dial: "+39" },
  { iso2: "FR", name: "Francia", dial: "+33" },
  { iso2: "DE", name: "Alemania", dial: "+49" },
  { iso2: "GB", name: "Reino Unido", dial: "+44" },
  { iso2: "PT", name: "Portugal", dial: "+351" },
  { iso2: "NL", name: "Países Bajos", dial: "+31" },
  { iso2: "BE", name: "Bélgica", dial: "+32" },
  { iso2: "CH", name: "Suiza", dial: "+41" },
  { iso2: "IE", name: "Irlanda", dial: "+353" },
  { iso2: "SE", name: "Suecia", dial: "+46" },
  { iso2: "NO", name: "Noruega", dial: "+47" },
  { iso2: "DK", name: "Dinamarca", dial: "+45" },
  { iso2: "PL", name: "Polonia", dial: "+48" },
  { iso2: "GR", name: "Grecia", dial: "+30" },
  { iso2: "TR", name: "Turquía", dial: "+90" },
  { iso2: "RU", name: "Rusia", dial: "+7" },
  { iso2: "IL", name: "Israel", dial: "+972" },
  { iso2: "AE", name: "Emiratos Árabes Unidos", dial: "+971" },
  { iso2: "ZA", name: "Sudáfrica", dial: "+27" },
  { iso2: "CN", name: "China", dial: "+86" },
  { iso2: "JP", name: "Japón", dial: "+81" },
  { iso2: "KR", name: "Corea del Sur", dial: "+82" },
  { iso2: "IN", name: "India", dial: "+91" },
  { iso2: "AU", name: "Australia", dial: "+61" },
  { iso2: "NZ", name: "Nueva Zelanda", dial: "+64" },
];

export const DEFAULT_PHONE_DIAL = "+54";

/** "AR" -> 🇦🇷. Se calcula, no hace falta guardar ni bajar imágenes. */
function flagEmoji(iso2) {
  return String.fromCodePoint(...[...iso2].map((c) => 127397 + c.charCodeAt(0)));
}

export const PHONE_COUNTRY_OPTIONS = PHONE_COUNTRIES.map((c) => ({
  value: c.dial,
  label: `${flagEmoji(c.iso2)} ${c.name} (${c.dial})`,
}));

/**
 * Separa un teléfono guardado en característica + número.
 * "+598 99123456" -> { dial: "+598", number: "99123456" }
 * "3329616554" (dato viejo, sin característica) -> { dial: "+54", number: "3329616554" }
 */
export function splitPhone(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\+\d{1,4})\s*(.*)$/);
  if (m && PHONE_COUNTRIES.some((c) => c.dial === m[1])) {
    return { dial: m[1], number: m[2] };
  }
  return { dial: DEFAULT_PHONE_DIAL, number: s };
}
