// ============================================================================
// lib/flow-pantallas.ts
// ----------------------------------------------------------------------------
// El "cerebro" del Flow de Agendar cita. Decide qué pantalla mostrar y con qué
// datos cada vez que el paciente toca "Continuar".
//
// Pantallas (mismos nombres que en flows/agendar-cita.json):
//   CATEGORIA → SERVICIO → FECHA → HORA → DATOS → CONFIRMACION
//
// Regla de oro: NUNCA confiamos en lo que manda el teléfono del paciente.
// Cada paso vuelve a validar contra lib/servicios.ts y lib/agenda.ts.
// Sin IA: todo son reglas fijas.
// ============================================================================

import {
  diasDisponibles,
  fechaEsReservable,
  formatearFechaCorta,
  formatearFechaLarga,
  formatearHora,
  franjasDelDia,
  horaEsReservable,
  ahoraEnColombia,
  sumarDias,
} from "./agenda";
import type { PeticionFlow } from "./flow-encryption";
import {
  buscarCategoria,
  buscarServicio,
  formatearPrecio,
  obtenerCategorias,
  type Servicio,
} from "./servicios";

/** Respuesta que el endpoint devuelve al Flow (antes de encriptarla). */
export interface RespuestaFlow {
  screen?: string;
  data: Record<string, unknown>;
}

/** Una opción de lista dentro del Flow (radio buttons / desplegable). */
interface Opcion {
  id: string;
  title: string;
  description?: string;
}

/** Límite de WhatsApp: máximo 20 opciones en los botones de selección (radio). */
const MAX_OPCIONES_RADIO = 20;

// ----------------------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------------------

/** Lee un campo de texto del Flow de forma segura ("" si no existe). */
function texto(datos: Record<string, unknown> | undefined, clave: string): string {
  const valor = datos?.[clave];
  return typeof valor === "string" ? valor.trim() : "";
}

/** Solo dígitos: "+57 (321) 352-4712" -> "573213524712" */
function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Saca el teléfono del flow_token (lo armamos como "<telefono>.<aleatorio>")
 * y lo deja en formato colombiano de 10 dígitos si empieza por 57.
 */
function telefonoDesdeToken(flowToken: string | undefined): string {
  const digitos = soloDigitos((flowToken ?? "").split(".")[0] ?? "");
  return digitos.length === 12 && digitos.startsWith("57") ? digitos.slice(2) : digitos;
}

/** Mensaje de error que WhatsApp muestra como aviso rojo, conservando la pantalla. */
function conError(respuesta: RespuestaFlow, mensaje: string): RespuestaFlow {
  return { screen: respuesta.screen, data: { ...respuesta.data, error_message: mensaje } };
}

/** "Hexavalente" + "$250.000 · 15 min" para mostrar el precio en cada opción. */
function opcionServicio(s: Servicio): Opcion {
  return {
    id: s.id,
    title: s.nombre,
    description: `Valor: ${formatearPrecio(s.precio)} · ${s.duracionMin} min`,
  };
}

// ----------------------------------------------------------------------------
// Construcción de cada pantalla
// ----------------------------------------------------------------------------

/** Pantalla 1: categorías. */
function pantallaCategoria(telefono: string): RespuestaFlow {
  return {
    screen: "CATEGORIA",
    data: {
      categorias: obtenerCategorias().map((c) => ({
        id: c.id,
        title: c.nombre,
        description: c.descripcion ?? "",
      })),
      telefono,
    },
  };
}

/** Pantalla 2: servicios de la categoría elegida (con precio). */
function pantallaServicio(categoriaId: string, telefono: string): RespuestaFlow {
  const categoria = buscarCategoria(categoriaId);
  if (!categoria) return conError(pantallaCategoria(telefono), "Elige una categoría para continuar");

  if (categoria.servicios.length > MAX_OPCIONES_RADIO) {
    console.warn(
      `[flow] La categoría "${categoria.nombre}" tiene más de ${MAX_OPCIONES_RADIO} servicios; solo se muestran los primeros ${MAX_OPCIONES_RADIO}.`,
    );
  }
  return {
    screen: "SERVICIO",
    data: {
      servicios: categoria.servicios.slice(0, MAX_OPCIONES_RADIO).map(opcionServicio),
      categoria: categoria.id,
      categoria_nombre: categoria.nombre,
      telefono,
    },
  };
}

/** Pantalla 3: próximos días disponibles (sin domingos). */
function pantallaFecha(servicioId: string, telefono: string): RespuestaFlow {
  const encontrado = buscarServicio(servicioId);
  if (!encontrado) return conError(pantallaCategoria(telefono), "Ese servicio ya no está disponible");

  const { servicio } = encontrado;
  const hoy = ahoraEnColombia().fecha;
  const manana = sumarDias(hoy, 1);
  return {
    screen: "FECHA",
    data: {
      fechas: diasDisponibles(servicio.duracionMin).map((f) => ({
        id: f,
        title: formatearFechaCorta(f),
        description: f === hoy ? "Hoy" : f === manana ? "Mañana" : "",
      })),
      servicio: servicio.id,
      servicio_resumen: `${servicio.nombre} · ${formatearPrecio(servicio.precio)}`,
      telefono,
    },
  };
}

/** Pantalla 4: horas libres del día elegido. */
function pantallaHora(servicioId: string, fecha: string, telefono: string): RespuestaFlow {
  const encontrado = buscarServicio(servicioId);
  if (!encontrado) return conError(pantallaCategoria(telefono), "Ese servicio ya no está disponible");

  const { servicio } = encontrado;
  const horas = franjasDelDia(fecha, servicio.duracionMin);
  return {
    screen: "HORA",
    data: {
      // Por ahora se muestran TODAS las franjas. En el Prompt 2 aquí se
      // filtran las que ya estén ocupadas según Google Sheets.
      horas: horas.map((h) => ({ id: h, title: formatearHora(h) })),
      servicio: servicio.id,
      fecha,
      fecha_texto: formatearFechaLarga(fecha),
      telefono,
    },
  };
}

/** Pantalla 5: datos del paciente (el teléfono llega pre-llenado). */
function pantallaDatos(
  servicioId: string,
  fecha: string,
  hora: string,
  telefono: string,
  nombre = "",
): RespuestaFlow {
  return {
    screen: "DATOS",
    data: {
      servicio: servicioId,
      fecha,
      hora,
      telefono,
      // Si hubo un error, devolvemos lo que el paciente ya había escrito.
      nombre,
      resumen_cita: `${formatearFechaLarga(fecha)} · ${formatearHora(hora)}`,
    },
  };
}

/** Pantalla 6: resumen para confirmar (pantalla final). */
function pantallaConfirmacion(cita: CitaValidada): RespuestaFlow {
  return {
    screen: "CONFIRMACION",
    data: {
      // Estos 5 se reenvían al bot cuando el paciente toca "Confirmar cita".
      servicio: cita.servicio.id,
      fecha: cita.fecha,
      hora: cita.hora,
      nombre: cita.nombre,
      telefono: cita.telefono,
      // Estos son solo para mostrar el resumen en pantalla.
      linea_servicio: `💉 Servicio: ${cita.servicio.nombre}`,
      linea_valor: `💰 Valor: ${formatearPrecio(cita.servicio.precio)}`,
      linea_fecha: `📅 Fecha: ${formatearFechaLarga(cita.fecha)}`,
      linea_hora: `🕐 Hora: ${formatearHora(cita.hora)}`,
      linea_paciente: `👤 Paciente: ${cita.nombre}`,
      linea_telefono: `📞 Teléfono: ${cita.telefono}`,
    },
  };
}

// ----------------------------------------------------------------------------
// Validación de la cita completa (se usa en el paso 5→6 y al confirmar)
// ----------------------------------------------------------------------------

export interface CitaValidada {
  servicio: Servicio;
  categoriaNombre: string;
  /** "AAAA-MM-DD" */
  fecha: string;
  /** "HH:MM" */
  hora: string;
  nombre: string;
  /** Solo dígitos. */
  telefono: string;
}

export type ResultadoValidacion =
  | { ok: true; cita: CitaValidada }
  | { ok: false; error: string; pantalla: "SERVICIO" | "FECHA" | "HORA" | "DATOS" };

/** Revisa que TODOS los datos de la cita sean reales y sigan disponibles. */
export function validarCita(entrada: Record<string, unknown> | undefined): ResultadoValidacion {
  const encontrado = buscarServicio(texto(entrada, "servicio"));
  if (!encontrado) {
    return { ok: false, error: "Ese servicio ya no está disponible", pantalla: "SERVICIO" };
  }
  const { servicio, categoria } = encontrado;

  const fecha = texto(entrada, "fecha");
  if (!fechaEsReservable(fecha, servicio.duracionMin)) {
    return { ok: false, error: "Ese día ya no está disponible. Elige otro, por favor", pantalla: "FECHA" };
  }

  const hora = texto(entrada, "hora");
  if (!horaEsReservable(fecha, hora, servicio.duracionMin)) {
    return { ok: false, error: "Esa hora ya no está disponible. Elige otra, por favor", pantalla: "HORA" };
  }

  // Nombre: mínimo nombre + apellido, solo letras y signos normales de un nombre.
  const nombre = texto(entrada, "nombre").replace(/\s+/g, " ");
  if (nombre.length < 5 || nombre.length > 80 || nombre.split(" ").length < 2) {
    return { ok: false, error: "Escribe el nombre y el apellido del paciente", pantalla: "DATOS" };
  }
  if (!/^[\p{L}\p{M}'.\- ]+$/u.test(nombre)) {
    return { ok: false, error: "El nombre solo puede llevar letras", pantalla: "DATOS" };
  }

  const telefono = soloDigitos(texto(entrada, "telefono"));
  if (telefono.length < 7 || telefono.length > 15) {
    return { ok: false, error: "Escribe un número de teléfono válido", pantalla: "DATOS" };
  }

  return {
    ok: true,
    cita: { servicio, categoriaNombre: categoria.nombre, fecha, hora, nombre, telefono },
  };
}

// ----------------------------------------------------------------------------
// Punto de entrada: decide qué responder a cada petición del Flow
// ----------------------------------------------------------------------------

export function procesarPeticionFlow(peticion: PeticionFlow): RespuestaFlow {
  // 1) Chequeo de salud: Meta pregunta cada tanto "¿sigues vivo?".
  if (peticion.action === "ping") {
    return { data: { status: "active" } };
  }

  // 2) Meta avisa que una de nuestras respuestas tenía un error.
  if (peticion.action === "error_notification") {
    console.error("[flow] Meta reportó un error:", JSON.stringify(peticion.data));
    return { data: { acknowledged: true } };
  }

  const telefonoToken = telefonoDesdeToken(peticion.flow_token);

  // 3) Se abrió el Flow (o el paciente volvió atrás): mostramos la Pantalla 1.
  if (peticion.action === "INIT" || peticion.action === "BACK") {
    return pantallaCategoria(telefonoToken);
  }

  if (peticion.action !== "data_exchange") {
    return { data: { error_message: "Acción no soportada" } };
  }

  // 4) El paciente tocó "Continuar": según la pantalla en que estaba, mostramos la siguiente.
  const datos = peticion.data;
  const telefono = texto(datos, "telefono") || telefonoToken;

  switch (peticion.screen) {
    case "CATEGORIA": {
      const categoria = texto(datos, "categoria");
      if (!buscarCategoria(categoria)) {
        return conError(pantallaCategoria(telefono), "Elige una categoría para continuar");
      }
      return pantallaServicio(categoria, telefono);
    }

    case "SERVICIO": {
      const categoria = buscarCategoria(texto(datos, "categoria"));
      const servicioId = texto(datos, "servicio");
      // El servicio debe pertenecer a la categoría elegida.
      if (!categoria || !categoria.servicios.some((s) => s.id === servicioId)) {
        return conError(pantallaServicio(texto(datos, "categoria"), telefono), "Elige un servicio para continuar");
      }
      return pantallaFecha(servicioId, telefono);
    }

    case "FECHA": {
      const servicioId = texto(datos, "servicio");
      const fecha = texto(datos, "fecha");
      const encontrado = buscarServicio(servicioId);
      if (!encontrado) return conError(pantallaCategoria(telefono), "Ese servicio ya no está disponible");
      if (!fechaEsReservable(fecha, encontrado.servicio.duracionMin)) {
        return conError(pantallaFecha(servicioId, telefono), "Elige un día de la lista para continuar");
      }
      return pantallaHora(servicioId, fecha, telefono);
    }

    case "HORA": {
      const servicioId = texto(datos, "servicio");
      const fecha = texto(datos, "fecha");
      const hora = texto(datos, "hora");
      const encontrado = buscarServicio(servicioId);
      if (!encontrado) return conError(pantallaCategoria(telefono), "Ese servicio ya no está disponible");
      if (!horaEsReservable(fecha, hora, encontrado.servicio.duracionMin)) {
        return conError(pantallaHora(servicioId, fecha, telefono), "Esa hora ya no está disponible. Elige otra");
      }
      return pantallaDatos(servicioId, fecha, hora, telefono);
    }

    case "DATOS": {
      const resultado = validarCita(datos);
      if (!resultado.ok) {
        const servicioId = texto(datos, "servicio");
        const fecha = texto(datos, "fecha");
        const hora = texto(datos, "hora");
        // Devolvemos al paciente a la pantalla donde está el problema.
        switch (resultado.pantalla) {
          case "SERVICIO":
            return conError(pantallaCategoria(telefono), resultado.error);
          case "FECHA":
            return conError(pantallaFecha(servicioId, telefono), resultado.error);
          case "HORA":
            return conError(pantallaHora(servicioId, fecha, telefono), resultado.error);
          default:
            return conError(
              pantallaDatos(servicioId, fecha, hora, telefono, texto(datos, "nombre")),
              resultado.error,
            );
        }
      }
      return pantallaConfirmacion(resultado.cita);
    }

    default:
      return { data: { error_message: "Pantalla desconocida" } };
  }
}
