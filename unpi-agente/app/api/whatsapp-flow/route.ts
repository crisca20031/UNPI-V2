// ============================================================================
// app/api/whatsapp-flow/route.ts
// ----------------------------------------------------------------------------
// El "Flow Endpoint": el servidor con el que habla el formulario de Agendar
// cita mientras el paciente lo llena. Cada vez que toca "Continuar", WhatsApp
// nos envía (encriptado) lo que eligió y nosotros respondemos (encriptado) con
// la siguiente pantalla y sus datos:
//
//   Pantalla 2 depende de la 1 (servicios de la categoría elegida)
//   Pantalla 3 depende de la 2 (días según la duración del servicio)
//   Pantalla 4 depende de la 3 (horas del día elegido)
//
// URL final (la que pegas en Meta → Flow → "Endpoint URI"):
//   https://TU-DOMINIO.com/api/whatsapp-flow
// ============================================================================

import {
  desencriptarPeticion,
  encriptarRespuesta,
  ErrorDesencriptado,
  firmaEsValida,
  type CuerpoEncriptado,
} from "@/lib/flow-encryption";
import { procesarPeticionFlow } from "@/lib/flow-pantallas";

/** GET: solo para comprobar desde el navegador que la ruta está viva. */
export async function GET(): Promise<Response> {
  return new Response("Endpoint del Flow de UNPI activo ✅", { status: 200 });
}

/** POST: aquí llegan las peticiones (encriptadas) del Flow. */
export async function POST(request: Request): Promise<Response> {
  const cuerpoCrudo = await request.text();

  // Seguridad: comprobamos que la petición viene de Meta (código 432 = firma inválida).
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    if (!firmaEsValida(cuerpoCrudo, request.headers.get("x-hub-signature-256"), appSecret)) {
      return new Response("Firma inválida", { status: 432 });
    }
  } else {
    console.warn("[flow] WHATSAPP_APP_SECRET no está configurado: no se verifica la firma de Meta");
  }

  let cuerpo: CuerpoEncriptado;
  try {
    cuerpo = JSON.parse(cuerpoCrudo) as CuerpoEncriptado;
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  try {
    const { peticion, claveAes, vectorInicial } = desencriptarPeticion(cuerpo);
    const respuesta = procesarPeticionFlow(peticion);

    // La respuesta va encriptada y como TEXTO plano (no como JSON).
    return new Response(encriptarRespuesta(respuesta, claveAes, vectorInicial), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    if (error instanceof ErrorDesencriptado) {
      // 421 le dice a WhatsApp: "no pude desencriptar, vuelve a bajar mi llave pública".
      console.error("[flow] Error de desencriptado:", error.message);
      return new Response("No se pudo desencriptar", { status: 421 });
    }
    console.error("[flow] Error inesperado:", error);
    return new Response("Error interno", { status: 500 });
  }
}
