// ============================================================================
// lib/textos.ts
// ----------------------------------------------------------------------------
// TODOS los mensajes que el bot escribe, en un solo lugar.
// Tono: cercano pero correcto, tutea, emojis con moderación (👋 💉 💙).
// ============================================================================

import { formatearFechaLarga, formatearHora } from "./agenda";
import {
  DIRECCION,
  formatearPrecio,
  HORARIO_SEMANAL,
  type Categoria,
  type Servicio,
} from "./servicios";

/**
 * ⚠️ MENSAJE DE BIENVENIDA — YA APROBADO POR EL NEGOCIO.
 * No lo cambies (ni una coma) sin autorización.
 */
export const MENSAJE_BIENVENIDA =
  "¡Hola! 👋 Soy el asistente de UNPI Y TUS VACUNAS, en Garzón. ¿Ya sabes si el carné de vacunación de tu hijo/a está completo? Muchas familias descubren que falta alguna al revisarlo con nosotros. Puedo ayudarte a agendar una cita, ver nuestros servicios o consultar precios. ¿Por dónde empezamos?";

/** Texto que acompaña al menú de opciones. */
export const TEXTO_MENU = "Elige una opción del menú 👇";

/** Respuesta a "Cancelar una cita" y "Hablar con alguien" (por ahora). */
export const MENSAJE_PROXIMAMENTE = "Esta función se agrega en el siguiente paso";

/** Cuando escriben algo que no entendemos y ya los saludamos hoy. */
export const MENSAJE_NO_ENTENDI =
  "No logré entender tu mensaje 😅. Usa las opciones del menú y te ayudo enseguida 💙";

/** Cuando algo falla por nuestro lado. */
export const MENSAJE_ERROR_GENERAL =
  "Ups, algo no salió como esperaba 😕. Intenta de nuevo en un momento o escríbenos \"hola\" para volver al menú.";

/** Cuando el Flow llega con datos que ya no son válidos (ej. la hora se ocupó). */
export const MENSAJE_CITA_NO_VALIDA =
  "No pude confirmar tu cita porque algún dato ya no está disponible 😕. ¿Intentamos de nuevo? Toca \"📅 Agendar cita\" en el menú.";

// ----------------------------------------------------------------------------
// Horarios y ubicación
// ----------------------------------------------------------------------------

/** "08:00" -> "8:00 am" (reutiliza el formateador de agenda). */
function h(hhmm: string): string {
  return formatearHora(hhmm);
}

/** Arma el texto del horario a partir de HORARIO_SEMANAL. */
export function textoHorarios(): string {
  const nombres: Array<[number, string]> = [
    [1, "Lunes"],
    [2, "Martes"],
    [3, "Miércoles"],
    [4, "Jueves"],
    [5, "Viernes"],
    [6, "Sábado"],
    [0, "Domingo"],
  ];
  const lineas = nombres.map(([dia, nombre]) => {
    const tramos = HORARIO_SEMANAL[dia] ?? [];
    if (tramos.length === 0) return `• ${nombre}: cerrado`;
    return `• ${nombre}: ${tramos.map((t) => `${h(t.desde)} - ${h(t.hasta)}`).join(" y ")}`;
  });
  return ["🕐 *Horarios de atención*", "", ...lineas, "", "¿Te agendo una cita? 💙"].join("\n");
}

/** Texto de la dirección. */
export function textoUbicacion(): string {
  return `📍 *Nuestra ubicación*\n\n${DIRECCION}.\n\nTe esperamos 💙`;
}

// ----------------------------------------------------------------------------
// Servicios y precios
// ----------------------------------------------------------------------------

/** Lista de servicios de una categoría, con precio, en un mensaje de texto. */
export function textoServicios(categoria: Categoria): string {
  const lineas = categoria.servicios.map(
    (s: Servicio) => `• ${s.nombre} — ${formatearPrecio(s.precio)}`,
  );
  return [`💉 *${categoria.nombre}*`, "", ...lineas, "", "¿Quieres agendar alguno? 💙"].join("\n");
}

// ----------------------------------------------------------------------------
// Confirmación de la cita (se envía en el chat normal, fuera del Flow)
// ----------------------------------------------------------------------------

export interface DatosConfirmacion {
  reserva: number;
  servicio: string;
  /** Fecha "AAAA-MM-DD". */
  fecha: string;
  /** Hora "HH:MM". */
  hora: string;
  paciente: string;
  precio: number;
}

export function textoConfirmacion(d: DatosConfirmacion): string {
  return [
    "✅ Cita confirmada",
    `📋 Reserva #${d.reserva}`,
    `💉 Servicio: ${d.servicio}`,
    `📅 Fecha: ${formatearFechaLarga(d.fecha)}`,
    `🕐 Hora: ${formatearHora(d.hora)}`,
    `👤 Paciente: ${d.paciente}`,
    `💰 Valor: ${formatearPrecio(d.precio)}`,
    "",
    `📍 Te esperamos en: ${DIRECCION}.`,
    "",
    "Cualquier otra duda, aquí estamos 💙",
  ].join("\n");
}
