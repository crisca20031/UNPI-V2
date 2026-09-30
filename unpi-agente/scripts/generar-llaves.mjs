// ============================================================================
// scripts/generar-llaves.mjs
// ----------------------------------------------------------------------------
// Crea el PAR DE LLAVES de encriptación que WhatsApp Flows necesita:
//   - llave PÚBLICA  -> se la entregas a Meta (puede ser vista por cualquiera)
//   - llave PRIVADA  -> se queda SOLO en tu servidor (variable de entorno)
//
// Cómo usarlo (en la carpeta del proyecto):
//   npm run generar-llaves
// ============================================================================

import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const lector = createInterface({ input: process.stdin, output: process.stdout });
const frase = (
  await lector.question(
    "Inventa una FRASE SECRETA para proteger la llave privada (mínimo 8 caracteres, anótala):\n> ",
  )
).trim();
lector.close();

if (frase.length < 8) {
  console.error("\n❌ La frase debe tener al menos 8 caracteres. Vuelve a ejecutar el comando.");
  process.exit(1);
}

// Llaves RSA de 2048 bits (lo que exige Meta).
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: frase },
});

mkdirSync("llaves", { recursive: true });
writeFileSync("llaves/clave-publica.pem", publicKey);
writeFileSync("llaves/clave-privada.pem", privateKey);

// La llave privada en UNA sola línea (los saltos de línea se escriben como \n).
const privadaEnUnaLinea = privateKey.trim().replace(/\r?\n/g, "\\n");
const paraEnv =
  `WHATSAPP_FLOW_PRIVATE_KEY="${privadaEnUnaLinea}"\n` +
  `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE=${frase}\n`;
writeFileSync("llaves/para-pegar-en-env.txt", paraEnv);

console.log(`
✅ Listo. Se crearon 3 archivos en la carpeta "llaves/":

  1) llaves/clave-publica.pem        -> ESTA se sube a Meta (paso 4 del README).
  2) llaves/clave-privada.pem        -> NO la compartas con nadie.
  3) llaves/para-pegar-en-env.txt    -> las 2 líneas que van en tu .env.local / hosting.

La carpeta "llaves/" está ignorada por git: no se sube a GitHub por accidente.
Guarda una copia de seguridad de "clave-privada.pem" y de tu frase secreta
en un lugar seguro (gestor de contraseñas). Si las pierdes, hay que generar
llaves nuevas y volver a subir la pública.
`);
