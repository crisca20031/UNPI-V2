// ============================================================================
// lib/bot.ts
// ----------------------------------------------------------------------------
// El "cerebro" del chat normal (todo lo que pasa FUERA del Flow):
//   - saludo de bienvenida + menú
//   - qué hacer cuando el paciente toca una opción del menú
//   - mensaje de confirmación cuando termina el Flow
//
// NO usa inteligencia artificial: son reglas fijas con datos de
// lib/servicios.ts (luego, Google Sheets).
// ============================================================================

import { randomInt } from "node:crypto";
import { ahoraEnColombia } from "./agenda";
import { validarCita } from "./flow-pantallas";
import { buscarCategoria } from "./servicios";
import {
  MENSAJE_BIENVENIDA,
  MENSAJE_CITA_NO_VALIDA,
  MENSAJE_ERROR_GENERAL,
  MENSAJE_NO_ENTENDI,
  MENSAJE_PROXIMAMENTE,
  TEXTO_MENU,
  textoConfirmacion,
  textoHorarios,
  textoServicios,
  textoUbicacion,
} from "./textos";
import {
  enviarBotones,
  enviarFlowAgendarCita,
  enviarListaCategorias,
  enviarMenuPrincipal,
  enviarTexto,
  ID_MENU,
  PREFIJO_CATEGORIA,
} from "./whatsapp-cloud-api";

// ----------------------------------------------------------------------------
// Forma de los mensajes que llegan de WhatsApp (solo lo que usamos)
// ----------------------------------------------------------------------------

export interface MensajeEntrante {
  /** Mensaje único (sirve para no procesar dos veces el mismo). */
  id: string;
  /** Número de WhatsApp de quien escribe, ej. "573001234567". */
  from: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    list_reply?: { id: string; title?: string };
    button_reply?: { id: string; title?: string };
    nfm_reply?: { response_json?: string };
  };
}

// ----------------------------------------------------------------------------
// Memoria corta (en la memoria del servidor)
// ----------------------------------------------------------------------------
// OJO: esto es temporal. Si el servidor se reinicia, se olvida. En el Prompt 2
// se guarda en Google Sheets. Mientras tanto, lo peor que puede pasar es que
// alguien reciba el saludo dos veces.

/** Mensajes ya procesados (WhatsApp a veces reenvía el mismo webhook). */
const mensajesVistos = new Map<string, number>();

/** Último día (en Colombia) en que saludamos a cada número. */
const saludadosHoy = new Map<string, string>();

const UNA_HORA_MS = 60 * 60 * 1000;

/** ¿Ya procesamos este mensaje? Si no, lo anota y devuelve false. */
function yaProcesado(id: string): boolean {
  const ahora = Date.now();
  for (const [clave, momento] of mensajesVistos) {
    if (ahora - momento > UNA_HORA_MS) mensajesVistos.delete(clave);
  }
  if (mensajesVistos.has(id)) return true;
  mensajesVistos.set(id, ahora);
  return false;
}

// ----------------------------------------------------------------------------
// Detección de saludos
// ----------------------------------------------------------------------------

/** Quita tildes, signos y mayúsculas: "¡Buenás Tardes!" -> "buenas tardes" */
function normalizar(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SALUDOS = /^(hola+|ola|buenas?|buenos dias|buen dia|buenas tardes|buenas noches|hey|holi+|saludos|que tal|hello|hi)\b/;

function esSaludo(textoNormalizado: string): boolean {
  return SALUDOS.test(textoNormalizado);
}

function esPedidoDeMenu(textoNormalizado: string): boolean {
  return textoNormalizado === "menu" || textoNormalizado === "inicio" || textoNormalizado === "opciones";
}

// ----------------------------------------------------------------------------
// Acciones
// ----------------------------------------------------------------------------

/** Saludo aprobado + menú de botones. */
async function darBienvenida(para: string): Promise<void> {
  saludadosHoy.set(para, ahoraEnColombia().fecha);
  await enviarTexto(para, MENSAJE_BIENVENIDA);
  await enviarMenuPrincipal(para, TEXTO_MENU);
}

/** Botones que acompañan a las respuestas informativas. */
const BOTONES_SIGUIENTES = [
  { id: ID_MENU.agendar, titulo: "📅 Agendar cita" },
  { id: ID_MENU.menu, titulo: "🏠 Menú principal" },
];

/** El paciente tocó una opción del menú o un botón. */
async function manejarOpcion(para: string, id: string): Promise<void> {
  saludadosHoy.set(para, ahoraEnColombia().fecha);

  // Categorías de "Ver servicios y precios"
  if (id.startsWith(PREFIJO_CATEGORIA)) {
    const categoria = buscarCategoria(id.slice(PREFIJO_CATEGORIA.length));
    if (!categoria) return enviarMenuPrincipal(para, TEXTO_MENU);
    return enviarBotones(para, textoServicios(categoria), [
      { id: ID_MENU.agendar, titulo: "📅 Agendar cita" },
      { id: ID_MENU.servicios, titulo: "💉 Otra categoría" },
      { id: ID_MENU.menu, titulo: "🏠 Menú principal" },
    ]);
  }

  switch (id) {
    case ID_MENU.agendar:
      return enviarFlowAgendarCita(para);
    case ID_MENU.servicios:
      return enviarListaCategorias(para);
    case ID_MENU.horarios:
      return enviarBotones(para, textoHorarios(), BOTONES_SIGUIENTES);
    case ID_MENU.ubicacion:
      return enviarBotones(para, textoUbicacion(), BOTONES_SIGUIENTES);
    case ID_MENU.cancelar:
    case ID_MENU.humano:
      return enviarTexto(para, MENSAJE_PROXIMAMENTE);
    case ID_MENU.menu:
      return enviarMenuPrincipal(para, TEXTO_MENU);
    default:
      return enviarMenuPrincipal(para, TEXTO_MENU);
  }
}

/** El paciente escribió texto libre (o mandó una foto, audio, etc.). */
async function manejarTexto(para: string, texto: string): Promise<void> {
  const limpio = normalizar(texto);
  const yaSaludadoHoy = saludadosHoy.get(para) === ahoraEnColombia().fecha;

  // "hola", "buenas"... o cualquier mensaje en la primera interacción del día.
  if (esSaludo(limpio) || !yaSaludadoHoy) return darBienvenida(para);

  if (esPedidoDeMenu(limpio)) return enviarMenuPrincipal(para, TEXTO_MENU);

  await enviarTexto(para, MENSAJE_NO_ENTENDI);
  await enviarMenuPrincipal(para, TEXTO_MENU);
}

/**
 * El paciente terminó el Flow: confirmamos la cita en el chat normal.
 * `respuestaJson` trae lo que mandó el Flow: servicio, fecha, hora, nombre, teléfono.
 */
async function confirmarCita(para: string, respuestaJson: string | undefined): Promise<void> {
  let datos: Record<string, unknown> = {};
  try {
    datos = JSON.parse(respuestaJson ?? "{}") as Record<string, unknown>;
  } catch {
    console.error("[bot] El Flow devolvió un JSON ilegible");
  }

  // Volvemos a validar todo: nunca confiamos ciegamente en lo que llega.
  const resultado = validarCita(datos);
  if (!resultado.ok) {
    console.warn("[bot] Cita rechazada al confirmar:", resultado.error);
    await enviarTexto(para, MENSAJE_CITA_NO_VALIDA);
    return;
  }
  const { cita } = resultado;
  const reserva = randomInt(100000, 1000000); // número de 6 dígitos

  // Hasta el Prompt 2 (Google Sheets) la cita NO se guarda en ningún lado,
  // salvo en este registro del servidor. Búscalo por "CITA_CONFIRMADA".
  console.log(
    "[CITA_CONFIRMADA]",
    JSON.stringify({
      reserva,
      whatsapp: para,
      servicio: cita.servicio.nombre,
      categoria: cita.categoriaNombre,
      precio: cita.servicio.precio,
      fecha: cita.fecha,
      hora: cita.hora,
      paciente: cita.nombre,
      telefono: cita.telefono,
    }),
  );

  await enviarTexto(
    para,
    textoConfirmacion({
      reserva,
      servicio: cita.servicio.nombre,
      fecha: cita.fecha,
      hora: cita.hora,
      paciente: cita.nombre,
      precio: cita.servicio.precio,
    }),
  );
}

// ----------------------------------------------------------------------------
// Punto de entrada
// ----------------------------------------------------------------------------

/** Procesa UN mensaje que llegó por WhatsApp. Nunca lanza errores hacia afuera. */
export async function procesarMensaje(mensaje: MensajeEntrante): Promise<void> {
  if (yaProcesado(mensaje.id)) return;

  try {
    if (mensaje.type === "interactive" && mensaje.interactive) {
      const { interactive } = mensaje;
      if (interactive.nfm_reply) {
        // Terminó el WhatsApp Flow.
        return await confirmarCita(mensaje.from, interactive.nfm_reply.response_json);
      }
      const id = interactive.list_reply?.id ?? interactive.button_reply?.id;
      if (id) return await manejarOpcion(mensaje.from, id);
    }

    // Texto, o cualquier otra cosa (foto, audio, sticker...): tratamos como "sin contexto".
    await manejarTexto(mensaje.from, mensaje.type === "text" ? (mensaje.text?.body ?? "") : "");
  } catch (error) {
    console.error("[bot] Error procesando mensaje:", error);
    try {
      await enviarTexto(mensaje.from, MENSAJE_ERROR_GENERAL);
    } catch (errorAlAvisar) {
      console.error("[bot] Tampoco se pudo avisar del error:", errorAlAvisar);
    }
  }
}
