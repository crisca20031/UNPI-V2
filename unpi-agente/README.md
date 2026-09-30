# 💙 UNPI Y TUS VACUNAS — Agente de WhatsApp

Asistente de WhatsApp para el consultorio de pediatría, neonatología y vacunación
**UNPI Y TUS VACUNAS** (Garzón, Huila). Número del bot: **321 352 4712**.

- Usa **WhatsApp Cloud API de Meta directamente** (sin Twilio ni YCloud).
- El agendamiento de citas es un **WhatsApp Flow** (formulario nativo que se abre dentro del mismo chat).
- Todo lo demás son **mensajes simples de lista y botones**.
- **No usa inteligencia artificial**: todo son reglas fijas con datos de `lib/servicios.ts`
  (en el "Prompt 2" esos datos pasarán a Google Sheets).

---

## 📚 Contenido

1. [Qué hace el bot](#1-qué-hace-el-bot)
2. [Mapa de archivos](#2-mapa-de-archivos)
3. [Antes de empezar: lo que necesitas](#3-antes-de-empezar-lo-que-necesitas)
4. [Paso a paso para dejarlo funcionando](#4-paso-a-paso-para-dejarlo-funcionando)
   - [Paso 1. Generar las llaves de encriptación](#paso-1-generar-las-llaves-de-encriptación)
   - [Paso 2. Publicar el servidor en internet](#paso-2-publicar-el-servidor-en-internet-vercel)
   - [Paso 3. Conectar el chat (webhook)](#paso-3-conectar-el-chat-webhook)
   - [Paso 4. Subir la llave pública a Meta](#paso-4-subir-la-llave-pública-a-meta)
   - [Paso 5. Crear el Flow y subir su JSON](#paso-5-crear-el-flow-y-subir-su-json)
   - [Paso 6. Conectar el Flow con tu servidor (endpoint)](#paso-6-conectar-el-flow-con-tu-servidor-endpoint)
   - [Paso 7. Probar](#paso-7-probar-en-modo-borrador)
   - [Paso 8. Publicar el Flow](#paso-8-publicar-el-flow)
5. [Cómo cambiar precios, servicios u horarios](#5-cómo-cambiar-precios-servicios-u-horarios)
6. [Cómo funciona el Flow por dentro](#6-cómo-funciona-el-flow-por-dentro-opcional)
7. [Limitaciones actuales](#7-limitaciones-actuales-hasta-el-prompt-2)
8. [Problemas frecuentes](#8-problemas-frecuentes)

---

## 1. Qué hace el bot

| El paciente… | El bot… |
|---|---|
| Escribe "hola", "buenas" o cualquier cosa en su primera interacción del día | Envía el mensaje de bienvenida aprobado + el menú de lista |
| Toca **📅 Agendar cita** | Envía un mensaje con el botón que abre el **Flow** (6 pantallas) |
| Toca **💉 Servicios y precios** | Lista de las 3 categorías → al elegir una, sus servicios con precio |
| Toca **🕐 Horarios de atención** | Responde con el horario fijo |
| Toca **📍 Ubicación** | Responde con la dirección |
| Toca **❌ Cancelar una cita** o **🗣️ Hablar con alguien** | "Esta función se agrega en el siguiente paso" |
| Termina el Flow y toca **Confirmar cita** | Mensaje "✅ Cita confirmada" en el chat normal con número de reserva |

**Pantallas del Flow:** Categoría → Servicio (con precio) → Fecha (14 días sin domingos) →
Hora (franjas de 10, 15 o 30 min según el servicio) → Datos del paciente (teléfono pre-llenado) → Confirmación.

> Nota: WhatsApp limita los títulos de las filas del menú a 24 caracteres. Por eso la opción
> "💉 Ver servicios y precios" aparece como **"💉 Servicios y precios"** (con la descripción
> "Ver servicios y precios" debajo). Las demás opciones quedaron con el texto exacto.

---

## 2. Mapa de archivos

| Archivo | Para qué sirve |
|---|---|
| `app/api/whatsapp/route.ts` | **Webhook del chat.** Recibe saludos, toques de menú/botones y la respuesta del Flow terminado. |
| `app/api/whatsapp-flow/route.ts` | **Endpoint del Flow.** Las pantallas dinámicas (la 2 depende de la 1, la 4 de la 3…). |
| `lib/whatsapp-cloud-api.ts` | Funciones para enviar mensajes, listas, botones y disparar el Flow. |
| `lib/servicios.ts` | **Servicios, precios, duraciones, horarios y dirección.** Aquí editas los datos. |
| `lib/flow-encryption.ts` | Encriptación/desencriptación que exige WhatsApp Flows. |
| `.env.local.example` | Lista de variables secretas que debes llenar. |
| `flows/agendar-cita.json` | El JSON del Flow que se sube a Meta (Paso 5). |
| `lib/textos.ts` | Todos los mensajes del bot (incluido el saludo aprobado). |
| `lib/agenda.ts` | Cálculo de días y horas disponibles (hora de Colombia). |
| `lib/flow-pantallas.ts` | Qué pantalla muestra el Flow en cada paso, y validación de la cita. |
| `lib/bot.ts` | Lógica del chat: saludo, menú, botones, confirmación. |
| `scripts/generar-llaves.mjs` | Genera el par de llaves de encriptación (Paso 1). |

---

## 3. Antes de empezar: lo que necesitas

1. **Una cuenta de Meta Business** (business.facebook.com) con la empresa **verificada**
   (Meta lo exige para enviar Flows).
2. **Una app de Meta para desarrolladores** (developers.facebook.com → Mis apps → Crear app →
   tipo *Empresa*) con el producto **WhatsApp** agregado.
3. El **número 321 352 4712 registrado en WhatsApp Cloud API** dentro de esa cuenta.
   Como es un celular dedicado solo al bot, no debe estar usándose a la vez en la app normal de
   WhatsApp (salvo que uses la función de coexistencia de Meta).
4. **Node.js 20 o superior** instalado en tu computador (nodejs.org, versión LTS).
5. Una cuenta gratuita en **GitHub** y otra en **Vercel** (vercel.com) para publicar el servidor.
   Cualquier otro hosting sirve si entrega HTTPS con certificado válido.

### Datos que vas a recolectar (anótalos en un lugar seguro)

| Variable | Dónde se obtiene |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | developers.facebook.com → tu app → **WhatsApp → Configuración de la API** → "Identificador de número de teléfono" |
| `WHATSAPP_CLOUD_API_TOKEN` | business.facebook.com → **Configuración del negocio → Usuarios → Usuarios del sistema** → crea uno (rol *Administrador*) → **Agregar activos** (tu app y tu cuenta de WhatsApp, control total) → **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Este token **no vence**. |
| `WHATSAPP_APP_SECRET` | developers.facebook.com → tu app → **Configuración → Básica** → "Clave secreta de la app" → *Mostrar* |
| `WHATSAPP_VERIFY_TOKEN` | La inventas tú (ej. `unpi-verificacion-2026`). Debe ser la misma en Vercel y en Meta. |
| `WHATSAPP_FLOW_ID` | Se obtiene en el Paso 5 |
| `WHATSAPP_FLOW_PRIVATE_KEY` y `..._PASSPHRASE` | Se obtienen en el Paso 1 |

> 🔒 **Nunca** pegues tokens ni llaves en chats, correos o capturas. Si se filtra uno,
> genera uno nuevo en Meta.

---

## 4. Paso a paso para dejarlo funcionando

### Paso 1. Generar las llaves de encriptación

**¿Por qué?** WhatsApp Flows exige que todo lo que viaja entre el formulario y tu servidor
vaya encriptado. Para eso se usa un **par de llaves**:

- 🔓 **Llave pública**: se la das a Meta. Sirve para *cerrar* los mensajes; no es secreta.
- 🔑 **Llave privada**: se queda **solo en tu servidor**. Sirve para *abrirlos*. Es secreta.
  Además va protegida con una **frase secreta** que tú inventas.

**Cómo hacerlo** (en una terminal, dentro de la carpeta `unpi-agente`):

```bash
npm install          # solo la primera vez
npm run generar-llaves
```

1. Te pedirá una **frase secreta** (mínimo 8 caracteres). Invéntala y **anótala**.
2. Se crea la carpeta `llaves/` con tres archivos:
   - `clave-publica.pem` → la usarás en el Paso 4.
   - `clave-privada.pem` → **no la compartas**.
   - `para-pegar-en-env.txt` → dos líneas listas para pegar como variables de entorno.

**¿Dónde guardo la llave privada de forma segura?**

- ✅ En **variables de entorno** del servidor: `WHATSAPP_FLOW_PRIVATE_KEY` y
  `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE` (las dos líneas de `para-pegar-en-env.txt`).
  - En tu computador: copia `.env.local.example` como `.env.local` y pega ahí los valores.
  - En Vercel: *Project → Settings → Environment Variables* (Paso 2).
- ✅ Una copia de seguridad de `clave-privada.pem` y de la frase en un **gestor de contraseñas**.
- ❌ **Nunca** dentro del código, ni en GitHub, ni en WhatsApp/correo.
  (El proyecto ya ignora `.env*` y `llaves/` en git para que no se suban por accidente.)

> Si alguna vez pierdes la llave privada, no pasa nada grave: generas un par nuevo,
> actualizas las variables y repites el Paso 4.

<details>
<summary>¿Prefieres usar OpenSSL directamente? (equivalente, opcional)</summary>

```bash
openssl genrsa -des3 -out private.pem 2048
openssl rsa -in private.pem -outform PEM -pubout -out public.pem
```
Para pasar `private.pem` a una sola línea (formato de variable de entorno):
```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem
```
</details>

### Paso 2. Publicar el servidor en internet (Vercel)

Meta necesita una dirección pública con **HTTPS** para hablar con tu bot.

1. Sube este repositorio a GitHub (ya está en `crisca20031/UNPI-V2`).
2. En vercel.com → **Add New → Project** → importa el repositorio.
3. ⚠️ En **Root Directory** escribe `unpi-agente` (el proyecto vive en esa subcarpeta).
4. En **Environment Variables** agrega todas las de `.env.local.example`:
   `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
   `WHATSAPP_FLOW_PRIVATE_KEY`, `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE`, `WHATSAPP_APP_SECRET`
   y (más adelante, Paso 5) `WHATSAPP_FLOW_ID`.
   - Para `WHATSAPP_FLOW_PRIVATE_KEY` pega el valor **sin las comillas** que rodean la línea en
     `para-pegar-en-env.txt`.
5. **Deploy**. Vercel te da una dirección como `https://unpi-agente.vercel.app`
   (más adelante puedes conectar tu propio dominio).
6. Comprueba que vive abriendo en el navegador:
   - `https://TU-DOMINIO/api/whatsapp-flow` → debe decir *"Endpoint del Flow de UNPI activo ✅"*.

> Cada vez que cambies una variable de entorno en Vercel, debes hacer **Redeploy** para que aplique.

### Paso 3. Conectar el chat (webhook)

1. developers.facebook.com → tu app → **WhatsApp → Configuración**.
2. En **Webhook** pulsa **Editar**:
   - **URL de devolución de llamada:** `https://TU-DOMINIO/api/whatsapp`
   - **Token de verificación:** el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
3. Pulsa **Verificar y guardar** (si falla: revisa que el Paso 2 esté desplegado y que el token coincida).
4. En **Campos del webhook → Administrar**, suscríbete a **`messages`**
   (y, si quieres alertas de salud del Flow, también a **`flows`**).
5. Asegúrate de que tu app esté suscrita a tu cuenta de WhatsApp Business (en *Configuración de la API*
   normalmente ya aparece así).

### Paso 4. Subir la llave pública a Meta

Meta necesita tu **llave pública** asociada al número del bot. Desde la terminal, en la carpeta
`unpi-agente` (reemplaza `TU_NUMERO_ID` y `TU_TOKEN`):

```bash
curl -X POST "https://graph.facebook.com/v23.0/TU_NUMERO_ID/whatsapp_business_encryption" \
  -H "Authorization: Bearer TU_TOKEN" \
  --data-urlencode "business_public_key@llaves/clave-publica.pem"
```

Respuesta esperada: `{"success":true}`.

Para comprobarlo:

```bash
curl "https://graph.facebook.com/v23.0/TU_NUMERO_ID/whatsapp_business_encryption" \
  -H "Authorization: Bearer TU_TOKEN"
```
Debe mostrar `"business_public_key_signature_status": "VALID"`.

> En Windows 10/11 puedes usar `curl.exe` en PowerShell o Git Bash.
> Hay que repetir este paso si vuelves a registrar el número o generas llaves nuevas.

### Paso 5. Crear el Flow y subir su JSON

**¿Qué es el JSON del Flow?** Es la "receta" del formulario: qué pantallas tiene, en qué orden
y qué componentes usa (botones de selección, lista desplegable, campos de texto…).
Ya está generado en **`flows/agendar-cita.json`** con las 6 pantallas pedidas.
Usa el formato oficial *Flow JSON* versión `6.3` y `data_api_version` `3.0`.

1. Entra a **business.facebook.com** → menú **Todas las herramientas** → **WhatsApp Manager**
   (elige la cuenta de WhatsApp Business de UNPI).
2. En el menú izquierdo: **Herramientas de la cuenta → Flows**.
3. Pulsa **Crear flow**. Escribe el nombre (ej. `agendar_cita_unpi`), elige la categoría
   (ej. *Reservas de citas / Appointment booking*) y empieza **desde cero** (plantilla vacía).
4. Se abre el **constructor** (*Flow Builder*). Cambia a la vista **JSON** (pestaña/editor de código).
5. **Borra todo** lo que hay y **pega** el contenido completo de `flows/agendar-cita.json`.
6. Pulsa **Guardar**. Si hay errores de validación, aparecen debajo del editor
   (cópialos tal cual y pídeme ayuda).
7. Anota el **ID del Flow** (número largo) que aparece en la lista de Flows. Es tu `WHATSAPP_FLOW_ID`:
   agrégalo en Vercel (y `.env.local`) y haz **Redeploy**.

> El JSON **no tiene precios ni servicios escritos a mano**. Las opciones de cada pantalla llegan
> desde `lib/servicios.ts`. Por eso, cuando cambies precios, **no hay que volver a subir el JSON**.

### Paso 6. Conectar el Flow con tu servidor (endpoint)

**¿Qué es el endpoint?** Es la dirección de tu servidor que recibe las elecciones del paciente y
responde con la siguiente pantalla. En este proyecto es
**`app/api/whatsapp-flow/route.ts`**, y su dirección pública es:

```
https://TU-DOMINIO/api/whatsapp-flow
```

Lo que hace en cada toque de "Continuar":
1. Recibe el mensaje **encriptado** de WhatsApp.
2. Lo **desencripta** con tu llave privada (`lib/flow-encryption.ts`).
3. Decide la siguiente pantalla (`lib/flow-pantallas.ts`): p. ej. si elegiste
   "Vacunación pediátrica", devuelve la Pantalla 2 con esos servicios y sus precios.
4. **Encripta** la respuesta y la devuelve.
5. También responde los "chequeos de salud" (`ping`) que Meta hace cada tanto.

**Cómo configurarlo en Meta:**

1. En el Flow Builder, abre la configuración del endpoint (botón/sección **Endpoint** o
   **Configurar endpoint**; en algunas versiones aparece tras guardar un JSON con `data_api_version`).
2. **URI del endpoint:** `https://TU-DOMINIO/api/whatsapp-flow`
3. **Conecta tu app de Meta** (la misma cuya "Clave secreta" pusiste en `WHATSAPP_APP_SECRET`).
   Así Meta firma cada petición y tu servidor comprueba que es auténtica.
4. Pulsa el botón de **verificar/probar el endpoint** (health check). Debe salir en verde.
   - Si sale **error 421**: la llave privada de Vercel no corresponde a la pública del Paso 4
     (o falta redeploy).
   - Si sale **error 432**: `WHATSAPP_APP_SECRET` no es el de la app conectada.

> Los textos exactos de los botones de Meta cambian con frecuencia. Si no encuentras uno,
> guíate por la idea: "poner la URL del endpoint y conectar la app".

### Paso 7. Probar (en modo borrador)

Un Flow recién creado está en **borrador**. Para probarlo sin publicarlo:

1. En Vercel agrega `WHATSAPP_FLOW_MODE=draft` y haz **Redeploy**.
2. Desde un WhatsApp con rol en tu cuenta de Meta (administrador/probador), escríbele "hola" al
   **321 352 4712**.
3. Toca **📅 Agendar cita** → **Agendar cita** (botón del Flow) y recorre las 6 pantallas.
4. Al confirmar, debe llegar el mensaje **✅ Cita confirmada**.
5. También puedes usar la **vista previa** del constructor de Flows para ver las pantallas
   (con datos de ejemplo).

Si algo falla, revisa los **Logs** del proyecto en Vercel: los errores salen con prefijos
`[flow]`, `[bot]` o `[whatsapp]`.

### Paso 8. Publicar el Flow

Cuando todo funcione bien:

1. En el Flow Builder pulsa **Publicar** y confirma.
   ⚠️ **Un Flow publicado ya no se puede editar.** Si después necesitas cambiar pantallas,
   crea una copia (*Duplicar/Clonar*), edítala, pruébala, publícala y actualiza `WHATSAPP_FLOW_ID`.
   (Cambiar precios o servicios **no** requiere esto.)
2. En Vercel **borra** `WHATSAPP_FLOW_MODE` (o déjala vacía) y haz **Redeploy**
   para que el bot envíe la versión publicada.
3. Prueba desde un número cualquiera (no administrador) para confirmar que ya está abierto al público.

---

## 5. Cómo cambiar precios, servicios u horarios

Todo está en **`lib/servicios.ts`** (hasta que en el Prompt 2 pase a Google Sheets):

- **Cambiar un precio:** busca el servicio y cambia `precio: 250000` (sin puntos).
- **Agregar un servicio:** copia una línea `{ id: ..., nombre: ..., precio: ..., duracionMin: ... }`
  dentro de la categoría (el `id` debe ser único).
- **Agregar una categoría nueva:** copia un bloque completo de categoría dentro de `CATEGORIAS`.
  Aparece sola en el Flow y en "Servicios y precios".
- **Horarios:** edita `HORARIO_SEMANAL` (un arreglo vacío `[]` = cerrado).
- **Cuántos días se ofrecen:** `DIAS_A_MOSTRAR` (hoy 14).

Límites de WhatsApp a tener en cuenta: máximo **20 categorías**, máximo **20 servicios por categoría**
(botones de selección del Flow) y títulos de menú de máximo **24 caracteres** (`tituloMenu`).

Después de editar, haz commit/push; Vercel vuelve a publicar solo.

---

## 6. Cómo funciona el Flow por dentro (opcional)

```
Paciente toca "Agendar cita"
  → bot envía mensaje-Flow (flow_action = data_exchange, flow_token = "<teléfono>.<aleatorio>")
  → Paciente abre el Flow  ─► endpoint recibe INIT ─► responde pantalla CATEGORIA
  → Elige categoría        ─► endpoint ─► pantalla SERVICIO (servicios + precio de esa categoría)
  → Elige servicio         ─► endpoint ─► pantalla FECHA    (14 días sin domingos, según duración)
  → Elige día              ─► endpoint ─► pantalla HORA     (franjas de 10/15/30 min)
  → Elige hora             ─► endpoint ─► pantalla DATOS    (teléfono pre-llenado, editable)
  → Escribe nombre         ─► endpoint valida ─► pantalla CONFIRMACION (resumen)
  → "Confirmar cita"       ─► el Flow se cierra y WhatsApp avisa al webhook (/api/whatsapp)
  → bot vuelve a validar todo y envía "✅ Cita confirmada" en el chat normal
```

- **Duración → franjas:** consultas 30 min, vacunas 15 min, certificado 10 min.
- **Seguridad:** el servidor nunca confía en lo que manda el teléfono: cada paso revalida servicio,
  fecha, hora, nombre y teléfono, y el precio siempre se calcula en el servidor.
- **Hoy mismo:** se ocultan las horas que ya pasaron más 60 minutos de margen (`ANTICIPACION_MIN`).
- **Zona horaria:** siempre hora de Colombia (`America/Bogota`).

---

## 7. Limitaciones actuales (hasta el Prompt 2)

- 📝 **Las citas todavía no se guardan en ninguna base de datos.** Solo quedan en el chat del paciente y
  en los *logs* del servidor (línea `[CITA_CONFIRMADA] {...}` en los Logs de Vercel). No se revisa si una
  hora ya fue tomada por otra persona: eso llega con Google Sheets.
- 🧠 La "memoria" del saludo diario y el filtro de mensajes duplicados viven en la memoria del servidor;
  si se reinicia, se olvidan (el peor caso: alguien recibe el saludo dos veces).
- ❌ **Cancelar una cita** y 🗣️ **Hablar con alguien** responden "Esta función se agrega en el siguiente paso".
- El Flow usa la versión `6.3` del formato JSON; Meta ya ofrece la `7.3`. No es necesario migrar ahora.

---

## 8. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Meta no verifica el webhook | Token distinto o proyecto sin desplegar | Revisa `WHATSAPP_VERIFY_TOKEN` en Vercel y Meta; redeploy |
| El bot no responde | Falta suscripción a `messages`, o token vencido/incorrecto | Paso 3; revisa Logs de Vercel |
| "Falta WHATSAPP_FLOW_ID" en logs | No agregaste el ID del Flow | Paso 5, punto 7 |
| El Flow dice "no se puede abrir" | Flow sin publicar y `WHATSAPP_FLOW_MODE` vacío (o al revés) | Paso 7 / Paso 8 |
| Endpoint da **421** | Llave privada ≠ llave pública subida, o frase incorrecta | Repite Pasos 1 y 4; redeploy |
| Endpoint da **432** | `WHATSAPP_APP_SECRET` incorrecto | Copia la clave de la app conectada al Flow |
| Error al leer la llave privada | Comillas o saltos de línea rotos al pegarla | Pega de nuevo `para-pegar-en-env.txt` (sin comillas en Vercel) |
| Las pantallas no muestran precios nuevos | Falta redeploy tras editar `servicios.ts` | Haz push y espera el deploy |

---

## 🧑‍💻 Para desarrollo local

```bash
npm install
cp .env.local.example .env.local     # y llena los valores
npm run dev                          # http://localhost:3000
npm run lint && npm run typecheck && npm run build
```

Para que Meta alcance tu computador durante pruebas necesitas un túnel HTTPS
(por ejemplo `npx cloudflared tunnel --url http://localhost:3000` o ngrok); usa esa URL en los Pasos 3 y 6.
