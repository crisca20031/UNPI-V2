// ============================================================================
// lib/flow-encryption.ts
// ----------------------------------------------------------------------------
// WhatsApp Flows exige que TODA la comunicación con tu servidor (el "endpoint")
// vaya encriptada. Este archivo hace dos trabajos:
//
//   1) DESENCRIPTAR lo que WhatsApp te envía.
//   2) ENCRIPTAR lo que tú le respondes.
//
// Cómo funciona (versión simple):
//   - WhatsApp inventa una clave temporal (AES) para cada mensaje.
//   - La guarda dentro de un "sobre" cerrado con tu LLAVE PÚBLICA.
//   - Solo tu LLAVE PRIVADA puede abrir el sobre → obtienes la clave temporal.
//   - Con esa clave abres el mensaje, y con la misma clave cierras tu respuesta.
//
// No necesitas modificar este archivo. La llave privada NUNCA se escribe aquí:
// se lee de variables de entorno (WHATSAPP_FLOW_PRIVATE_KEY y su frase secreta).
//
// Referencia oficial (Meta):
// developers.facebook.com → WhatsApp → Flows → "Implement endpoints for Flows"
// ============================================================================

import {
  constants,
  createDecipheriv,
  createCipheriv,
  createPrivateKey,
  privateDecrypt,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

/** Lo que WhatsApp envía (todo viene encriptado y en base64). */
export interface CuerpoEncriptado {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

/** Mensaje ya desencriptado que envía el Flow. */
export interface PeticionFlow {
  version?: string;
  /** "INIT" (se abre el Flow), "data_exchange" (se toca un botón), "BACK", "ping" o "error_notification". */
  action: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

/** Resultado de desencriptar: el mensaje + lo necesario para encriptar la respuesta. */
export interface PeticionDesencriptada {
  peticion: PeticionFlow;
  claveAes: Buffer;
  vectorInicial: Buffer;
}

/** Error especial: no pudimos desencriptar. El endpoint debe responder HTTP 421. */
export class ErrorDesencriptado extends Error {}

/** Longitud (en bytes) de la "etiqueta de autenticidad" de AES-GCM. */
const LONGITUD_ETIQUETA = 16;

/**
 * Lee la llave privada desde la variable de entorno.
 * En los paneles de hosting (Vercel, etc.) los saltos de línea a veces se
 * guardan como el texto "\n"; aquí los convertimos de vuelta a saltos reales.
 */
function leerLlavePrivada() {
  const pem = process.env.WHATSAPP_FLOW_PRIVATE_KEY;
  if (!pem) {
    throw new Error("Falta la variable de entorno WHATSAPP_FLOW_PRIVATE_KEY");
  }
  const pemLimpio = pem
    .trim()
    .replace(/^["']|["']$/g, "") // quita comillas si las pegaron
    .replace(/\\n/g, "\n"); // "\n" escrito como texto -> salto de línea real

  return createPrivateKey({
    key: pemLimpio,
    format: "pem",
    // Si creaste la llave con frase secreta, va aquí. Si no, queda vacío.
    passphrase: process.env.WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE || undefined,
  });
}

/** Desencripta la petición que llega de WhatsApp. */
export function desencriptarPeticion(cuerpo: CuerpoEncriptado): PeticionDesencriptada {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = cuerpo;
  if (!encrypted_aes_key || !encrypted_flow_data || !initial_vector) {
    throw new ErrorDesencriptado("Faltan campos encriptados en la petición");
  }

  let claveAes: Buffer;
  try {
    // Paso 1: abrir el "sobre" con la llave privada para obtener la clave AES.
    claveAes = privateDecrypt(
      {
        key: leerLlavePrivada(),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encrypted_aes_key, "base64"),
    );
  } catch (error) {
    // Lo más común: la llave privada no corresponde a la pública que subiste.
    throw new ErrorDesencriptado(
      `No se pudo abrir la clave AES (¿llave privada/frase incorrecta?): ${(error as Error).message}`,
    );
  }

  try {
    // Paso 2: abrir el mensaje con la clave AES.
    const datos = Buffer.from(encrypted_flow_data, "base64");
    const vectorInicial = Buffer.from(initial_vector, "base64");
    const mensaje = datos.subarray(0, -LONGITUD_ETIQUETA);
    const etiqueta = datos.subarray(-LONGITUD_ETIQUETA);

    const descifrador = createDecipheriv("aes-128-gcm", claveAes, vectorInicial);
    descifrador.setAuthTag(etiqueta);
    const texto = Buffer.concat([descifrador.update(mensaje), descifrador.final()]).toString("utf-8");

    return { peticion: JSON.parse(texto) as PeticionFlow, claveAes, vectorInicial };
  } catch (error) {
    throw new ErrorDesencriptado(`No se pudo desencriptar el mensaje: ${(error as Error).message}`);
  }
}

/**
 * Encripta nuestra respuesta. WhatsApp pide usar la MISMA clave AES pero con
 * el vector inicial "invertido" (cada bit cambia: 0↔1). Devuelve texto base64,
 * que se envía como texto plano (no como JSON).
 */
export function encriptarRespuesta(
  respuesta: unknown,
  claveAes: Buffer,
  vectorInicial: Buffer,
): string {
  const vectorInvertido = Buffer.from(vectorInicial.map((byte) => byte ^ 0xff));
  const cifrador = createCipheriv("aes-128-gcm", claveAes, vectorInvertido);
  return Buffer.concat([
    cifrador.update(JSON.stringify(respuesta), "utf-8"),
    cifrador.final(),
    cifrador.getAuthTag(),
  ]).toString("base64");
}

/**
 * Comprueba que la petición de verdad viene de Meta.
 * Meta firma el cuerpo con el "App Secret" de tu app y manda la firma en el
 * encabezado X-Hub-Signature-256 (formato "sha256=...").
 */
export function firmaEsValida(
  cuerpoCrudo: string,
  encabezadoFirma: string | null,
  appSecret: string,
): boolean {
  if (!encabezadoFirma?.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", appSecret).update(cuerpoCrudo, "utf-8").digest();
  const recibida = Buffer.from(encabezadoFirma.slice("sha256=".length), "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}
