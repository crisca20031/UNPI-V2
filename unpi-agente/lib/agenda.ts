// ============================================================================
// lib/agenda.ts
// ----------------------------------------------------------------------------
// Cálculo de DÍAS y HORAS disponibles para agendar (Pantallas 3 y 4 del Flow).
//
// - Usa la hora de Colombia (America/Bogota, UTC-5, sin horario de verano).
// - Todas las fechas viajan como texto "AAAA-MM-DD" y las horas como "HH:MM"
//   (formato 24 horas). Solo al mostrarlas al paciente se convierten a texto
//   bonito ("Jueves 1 de octubre", "2:30 pm").
// - Por ahora NO mira Google Sheets: muestra todas las franjas posibles.
//   En el Prompt 2 se filtran las que ya estén ocupadas.
// ============================================================================

import { ANTICIPACION_MIN, DIAS_A_MOSTRAR, HORARIO_SEMANAL } from "./servicios";

const ZONA_HORARIA = "America/Bogota";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Pone la primera letra en mayúscula. */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Rellena con ceros: 5 -> "05". */
function dosDigitos(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "HH:MM" -> minutos desde la medianoche. Ej: "08:30" -> 510 */
function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutos desde la medianoche -> "HH:MM". Ej: 510 -> "08:30" */
function deMinutos(total: number): string {
  return `${dosDigitos(Math.floor(total / 60))}:${dosDigitos(total % 60)}`;
}

/** Fecha y hora actuales en Colombia. */
export function ahoraEnColombia(): { fecha: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

/** Convierte "AAAA-MM-DD" en un Date fijo al mediodía UTC (evita errores de zona). */
function aFecha(fecha: string): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

/** Suma (o resta) días a una fecha "AAAA-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const f = aFecha(fecha);
  f.setUTCDate(f.getUTCDate() + dias);
  return `${f.getUTCFullYear()}-${dosDigitos(f.getUTCMonth() + 1)}-${dosDigitos(f.getUTCDate())}`;
}

/** Día de la semana: 0 = domingo ... 6 = sábado. */
export function diaDeLaSemana(fecha: string): number {
  return aFecha(fecha).getUTCDay();
}

/** ¿El texto tiene forma de fecha "AAAA-MM-DD" y es una fecha real? */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  return sumarDias(fecha, 0) === fecha;
}

/** "2026-10-01" -> "Jueves 1 de octubre" */
export function formatearFechaCorta(fecha: string): string {
  const f = aFecha(fecha);
  return capitalizar(`${DIAS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`);
}

/** "2026-10-01" -> "Jueves 1 de octubre de 2026" */
export function formatearFechaLarga(fecha: string): string {
  return `${formatearFechaCorta(fecha)} de ${aFecha(fecha).getUTCFullYear()}`;
}

/** "14:30" -> "2:30 pm"  |  "08:00" -> "8:00 am"  |  "12:00" -> "12:00 m" (mediodía) */
export function formatearHora(hhmm: string): string {
  const minutos = aMinutos(hhmm);
  if (minutos === 12 * 60) return "12:00 m";
  const h24 = Math.floor(minutos / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${dosDigitos(minutos % 60)} ${h24 < 12 ? "am" : "pm"}`;
}

/**
 * Todas las horas de inicio posibles de un día, según la duración del servicio.
 * Ej: consulta de 30 min el lunes -> 08:00, 08:30 ... 11:30, 14:00 ... 16:30
 *
 * Si el día es HOY, se quitan las horas que ya pasaron (más el margen
 * ANTICIPACION_MIN, para que nadie agende "para dentro de 5 minutos").
 */
export function franjasDelDia(fecha: string, duracionMin: number): string[] {
  const tramos = HORARIO_SEMANAL[diaDeLaSemana(fecha)] ?? [];
  const ahora = ahoraEnColombia();
  const franjas: string[] = [];

  for (const tramo of tramos) {
    const fin = aMinutos(tramo.hasta);
    // La cita debe TERMINAR antes (o justo al) cerrar el tramo.
    for (let inicio = aMinutos(tramo.desde); inicio + duracionMin <= fin; inicio += duracionMin) {
      if (fecha < ahora.fecha) continue; // día pasado
      if (fecha === ahora.fecha && inicio < ahora.minutos + ANTICIPACION_MIN) continue;
      franjas.push(deMinutos(inicio));
    }
  }
  return franjas;
}

/**
 * Los próximos días con al menos una franja libre (se saltan los domingos
 * porque no tienen horario). Devuelve máximo DIAS_A_MOSTRAR fechas.
 */
export function diasDisponibles(duracionMin: number): string[] {
  const dias: string[] = [];
  let fecha = ahoraEnColombia().fecha;
  // Límite de seguridad: nunca buscamos más de 60 días hacia adelante.
  for (let i = 0; i < 60 && dias.length < DIAS_A_MOSTRAR; i++) {
    if (franjasDelDia(fecha, duracionMin).length > 0) dias.push(fecha);
    fecha = sumarDias(fecha, 1);
  }
  return dias;
}

/** ¿Esta fecha está entre los días que ofrecemos para este servicio? */
export function fechaEsReservable(fecha: string, duracionMin: number): boolean {
  return esFechaValida(fecha) && diasDisponibles(duracionMin).includes(fecha);
}

/** ¿Esta hora existe (y sigue disponible) ese día para este servicio? */
export function horaEsReservable(fecha: string, hora: string, duracionMin: number): boolean {
  return esFechaValida(fecha) && franjasDelDia(fecha, duracionMin).includes(hora);
}
