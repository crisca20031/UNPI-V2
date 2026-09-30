// ============================================================================
// lib/whatsapp-cloud-api.ts
// ----------------------------------------------------------------------------
// Funciones para ENVIAR mensajes por WhatsApp Cloud API (Meta), directamente,
// sin intermediarios (ni Twilio ni YCloud).
//
// Aquí están: texto simple, menú de lista, botones, y el disparo del Flow.
// Ninguna usa inteligencia artificial.
// ============================================================================

import { randomBytes } from "node:crypto";
import { obtenerCategorias } from "./servicios";

/** Versión de la API de Meta (Graph API) que usamos. */
const GRAPH_VERSION = "v23.0";

// ----------------------------------------------------------------------------
// IDs de las opciones del menú. Son "etiquetas internas": cuando el paciente
// toca una opción, WhatsApp nos devuelve este id para saber qué eligió.
// ----------------------------------------------------------------------------
export const ID_MENU = {
  agendar: "menu_agendar",
  servicios: "menu_servicios",
  horarios: "menu_horarios",
  ubicacion: "menu_ubicacion",
  cancelar: "menu_cancelar",
  humano: "menu_humano",
  /** Botón "Menú principal". */
  menu: "menu_principal",
} as const;

/** Prefijo de los ids de las categorías en la lista de servicios. */
export const PREFIJO_CATEGORIA = "cat_";

// ----------------------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------------------

/** Corta un texto para que respete el límite de WhatsApp (agrega "…"). */
function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : texto.slice(0, maximo - 1) + "…";
}

/** Lee las variables de entorno necesarias para enviar mensajes. */
function credenciales(): { token: string; numeroId: string } {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numeroId) {
    throw new Error(
      "Faltan WHATSAPP_CLOUD_API_TOKEN o WHATSAPP_PHONE_NUMBER_ID en las variables de entorno",
    );
  }
  return { token, numeroId };
}

/** Envía cualquier mensaje a la API de Meta. Si falla, lanza un error con el detalle. */
async function enviar(para: string, cuerpo: Record<string, unknown>): Promise<void> {
  const { token, numeroId } = credenciales();
  const respuesta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${numeroId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: para,
      ...cuerpo,
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`WhatsApp respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}

// ----------------------------------------------------------------------------
// Mensajes
// ----------------------------------------------------------------------------

/** Mensaje de texto simple. */
export async function enviarTexto(para: string, texto: string): Promise<void> {
  await enviar(para, { type: "text", text: { body: texto, preview_url: false } });
}

/** Mensaje con hasta 3 botones de respuesta rápida (títulos de máximo 20 caracteres). */
export async function enviarBotones(
  para: string,
  texto: string,
  botones: Array<{ id: string; titulo: string }>,
): Promise<void> {
  await enviar(para, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      action: {
        buttons: botones.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: recortar(b.titulo, 20) },
        })),
      },
    },
  });
}

/** Lista desplegable nativa de WhatsApp (máximo 10 filas). */
async function enviarLista(
  para: string,
  texto: string,
  textoBoton: string,
  tituloSeccion: string,
  filas: Array<{ id: string; titulo: string; descripcion?: string }>,
): Promise<void> {
  await enviar(para, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: texto },
      action: {
        button: recortar(textoBoton, 20),
        sections: [
          {
            title: recortar(tituloSeccion, 24),
            rows: filas.slice(0, 10).map((f) => ({
              id: f.id,
              title: recortar(f.titulo, 24),
              ...(f.descripcion ? { description: recortar(f.descripcion, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** El menú principal (lista nativa, sin IA). */
export async function enviarMenuPrincipal(para: string, texto: string): Promise<void> {
  await enviarLista(para, texto, "Ver opciones", "Menú principal", [
    { id: ID_MENU.agendar, titulo: "📅 Agendar cita", descripcion: "Reserva en pocos toques" },
    // Nota: WhatsApp limita el título a 24 caracteres; por eso no cabe "Ver" aquí.
    { id: ID_MENU.servicios, titulo: "💉 Servicios y precios", descripcion: "Ver servicios y precios" },
    { id: ID_MENU.horarios, titulo: "🕐 Horarios de atención", descripcion: "Días y horas en que atendemos" },
    { id: ID_MENU.ubicacion, titulo: "📍 Ubicación", descripcion: "Cómo llegar al consultorio" },
    { id: ID_MENU.cancelar, titulo: "❌ Cancelar una cita", descripcion: "Cancela una cita agendada" },
    { id: ID_MENU.humano, titulo: "🗣️ Hablar con alguien", descripcion: "Te atiende una persona del equipo" },
  ]);
}

/** Lista con las categorías de servicios (se arma sola desde lib/servicios.ts). */
export async function enviarListaCategorias(para: string): Promise<void> {
  await enviarLista(
    para,
    "¿De qué categoría quieres ver los precios? 💉",
    "Ver categorías",
    "Categorías",
    obtenerCategorias().map((c) => ({
      id: PREFIJO_CATEGORIA + c.id,
      titulo: c.tituloMenu,
      descripcion: c.descripcion,
    })),
  );
}

/**
 * Abre el WhatsApp Flow de "Agendar cita" dentro del mismo chat.
 *
 * - El `flow_token` es como un "número de sesión". Le metemos el teléfono de
 *   quien escribe para poder pre-llenar el campo Teléfono (Pantalla 5).
 * - `flow_action: "data_exchange"` hace que al abrir el Flow se llame a nuestro
 *   endpoint (app/api/whatsapp-flow/route.ts) para pedirle la Pantalla 1.
 */
export async function enviarFlowAgendarCita(para: string): Promise<void> {
  const flowId = process.env.WHATSAPP_FLOW_ID;
  if (!flowId) {
    throw new Error("Falta WHATSAPP_FLOW_ID (el número del Flow que creaste en Meta)");
  }
  const flowToken = `${para}.${randomBytes(6).toString("hex")}`;

  await enviar(para, {
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Agenda tu cita aquí mismo, en pocos toques 💙" },
      footer: { text: "UNPI Y TUS VACUNAS" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: flowId,
          flow_cta: "Agendar cita",
          flow_token: flowToken,
          flow_action: "data_exchange",
          // "draft" sirve para probar el Flow antes de publicarlo.
          mode: process.env.WHATSAPP_FLOW_MODE === "draft" ? "draft" : "published",
        },
      },
    },
  });
}
