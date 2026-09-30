// ============================================================================
// app/api/whatsapp/route.ts
// ----------------------------------------------------------------------------
// Puerta de entrada del chat de WhatsApp ("webhook"). Meta llama aquí cada vez
// que alguien le escribe al bot. Recibe:
//   - saludos y texto libre
//   - toques en el menú y en los botones
//   - la respuesta del Flow ya terminado (cuando confirman la cita)
//
// URL final (la que pegas en Meta → Webhook → "URL de devolución de llamada"):
//   https://TU-DOMINIO.com/api/whatsapp
// ============================================================================

import { after } from "next/server";
import { procesarMensaje, type MensajeEntrante } from "@/lib/bot";
import { firmaEsValida } from "@/lib/flow-encryption";

/** Forma mínima del aviso que envía Meta. */
interface AvisoWhatsApp {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: MensajeEntrante[];
      };
    }>;
  }>;
}

/**
 * GET: verificación inicial. Cuando configuras el webhook en Meta, este
 * pregunta "¿es tuya esta URL?" y debemos devolver el código (challenge)
 * si el token secreto coincide con WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(request: Request): Promise<Response> {
  const parametros = new URL(request.url).searchParams;
  const modo = parametros.get("hub.mode");
  const token = parametros.get("hub.verify_token");
  const reto = parametros.get("hub.challenge");

  const tokenEsperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (modo === "subscribe" && tokenEsperado && token === tokenEsperado && reto) {
    return new Response(reto, { status: 200 });
  }
  return new Response("Verificación rechazada", { status: 403 });
}

/** POST: llegan los mensajes de los pacientes. */
export async function POST(request: Request): Promise<Response> {
  const cuerpoCrudo = await request.text();

  // Seguridad: comprobamos que el aviso de verdad viene de Meta.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    if (!firmaEsValida(cuerpoCrudo, request.headers.get("x-hub-signature-256"), appSecret)) {
      return new Response("Firma inválida", { status: 401 });
    }
  } else {
    console.warn("[whatsapp] WHATSAPP_APP_SECRET no está configurado: no se verifica la firma de Meta");
  }

  let aviso: AvisoWhatsApp;
  try {
    aviso = JSON.parse(cuerpoCrudo) as AvisoWhatsApp;
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const mensajes = (aviso.entry ?? [])
    .flatMap((entrada) => entrada.changes ?? [])
    .flatMap((cambio) => cambio.value?.messages ?? []);

  // Respondemos 200 YA (Meta exige rapidez) y procesamos los mensajes después.
  if (mensajes.length > 0) {
    after(async () => {
      for (const mensaje of mensajes) {
        await procesarMensaje(mensaje);
      }
    });
  }
  return new Response("ok", { status: 200 });
}
