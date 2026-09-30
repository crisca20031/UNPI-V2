// ============================================================================
// lib/servicios.ts
// ----------------------------------------------------------------------------
// AQUÍ VIVEN TODOS LOS SERVICIOS, PRECIOS Y HORARIOS del consultorio.
//
// ¿Quieres cambiar un precio o agregar un servicio? Solo edita ESTE archivo.
// Nada más en el proyecto tiene precios escritos a mano.
//
// (En el "Prompt 2" este archivo se reemplazará por una lectura de Google
// Sheets. Por eso todo el resto del código pide los datos a través de las
// funciones de abajo y nunca lee las listas directamente.)
// ============================================================================

/** Un servicio que se puede agendar. */
export interface Servicio {
  /** Identificador único y estable (no lo cambies si ya hay citas guardadas). */
  id: string;
  /** Nombre que ve el paciente. */
  nombre: string;
  /** Precio en pesos colombianos (COP), sin puntos. Ej: 250000 */
  precio: number;
  /** Cuánto dura la atención, en minutos. Define el tamaño de las franjas. */
  duracionMin: number;
}

/** Un grupo de servicios (aparece en la Pantalla 1 del Flow). */
export interface Categoria {
  id: string;
  nombre: string;
  /** Nombre corto para las listas de WhatsApp (máximo 24 caracteres). */
  tituloMenu: string;
  /** Texto corto que se muestra debajo del nombre (opcional). */
  descripcion?: string;
  servicios: Servicio[];
}

// Duraciones estándar (las usamos abajo para no repetir números).
const CONSULTA = 30; // minutos
const VACUNA = 15; // minutos
const CERTIFICADO = 10; // minutos

/**
 * LISTA MAESTRA DE CATEGORÍAS Y SERVICIOS.
 * Para agregar una categoría nueva: copia un bloque completo { ... } y
 * cámbiale el id, el nombre y los servicios. Aparecerá sola en el Flow.
 */
export const CATEGORIAS: Categoria[] = [
  {
    id: "consultas",
    nombre: "Consultas y certificados",
    tituloMenu: "Consultas y certificados",
    descripcion: "Pediatría, neonatología y certificados",
    servicios: [
      { id: "consulta-neonatal", nombre: "Consulta neonatal", precio: 200000, duracionMin: CONSULTA },
      { id: "consulta-pediatrica", nombre: "Consulta pediátrica", precio: 190000, duracionMin: CONSULTA },
      { id: "crecimiento-desarrollo", nombre: "Crecimiento y desarrollo", precio: 150000, duracionMin: CONSULTA },
      { id: "certificado-estudio", nombre: "Certificado de estudio", precio: 20000, duracionMin: CERTIFICADO },
    ],
  },
  {
    id: "vacunacion-pediatrica",
    nombre: "Vacunación pediátrica (niños)",
    tituloMenu: "Vacunas pediátricas",
    descripcion: "Esquema de vacunas para niños",
    servicios: [
      { id: "ped-hexavalente", nombre: "Hexavalente", precio: 250000, duracionMin: VACUNA },
      { id: "ped-neumococo-15", nombre: "Neumococo 15 valencias", precio: 250000, duracionMin: VACUNA },
      { id: "ped-rotavirus", nombre: "Rotavirus", precio: 300000, duracionMin: VACUNA },
      { id: "ped-triple-viral-varicela", nombre: "Triple viral + varicela", precio: 320000, duracionMin: VACUNA },
      { id: "ped-hepatitis-a", nombre: "Hepatitis A", precio: 200000, duracionMin: VACUNA },
      { id: "ped-fiebre-amarilla", nombre: "Fiebre amarilla", precio: 140000, duracionMin: VACUNA },
      { id: "ped-influenza", nombre: "Influenza", precio: 70000, duracionMin: VACUNA },
      { id: "ped-meningococo-a", nombre: "Meningococo A", precio: 250000, duracionMin: VACUNA },
      { id: "ped-meningococo-b", nombre: "Meningococo B", precio: 620000, duracionMin: VACUNA },
      { id: "ped-dpt-polio", nombre: "DPT + Polio", precio: 200000, duracionMin: VACUNA },
    ],
  },
  {
    id: "vacunacion-adultos",
    nombre: "Vacunación adultos",
    tituloMenu: "Vacunas de adultos",
    descripcion: "Vacunas para adultos",
    servicios: [
      { id: "adu-hepatitis-b", nombre: "Hepatitis B", precio: 30000, duracionMin: VACUNA },
      { id: "adu-antitetanica", nombre: "Antitetánica", precio: 24000, duracionMin: VACUNA },
      { id: "adu-influenza", nombre: "Influenza", precio: 45000, duracionMin: VACUNA },
      { id: "adu-fiebre-amarilla", nombre: "Fiebre amarilla", precio: 140000, duracionMin: VACUNA },
      { id: "adu-triple-viral", nombre: "Triple viral", precio: 160000, duracionMin: VACUNA },
      { id: "adu-varicela", nombre: "Varicela", precio: 190000, duracionMin: VACUNA },
      { id: "adu-neumococo", nombre: "Neumococo", precio: 250000, duracionMin: VACUNA },
      { id: "adu-meningococo", nombre: "Meningococo", precio: 250000, duracionMin: VACUNA },
      { id: "adu-hepatitis-a", nombre: "Hepatitis A", precio: 200000, duracionMin: VACUNA },
      { id: "adu-dpta", nombre: "DPTA", precio: 150000, duracionMin: VACUNA },
      { id: "adu-herpes-zoster", nombre: "Herpes zóster", precio: 950000, duracionMin: VACUNA },
      { id: "adu-vph-gardasil-9", nombre: "VPH Gardasil 9", precio: 656000, duracionMin: VACUNA },
    ],
  },
];

// ----------------------------------------------------------------------------
// HORARIOS DE ATENCIÓN
// ----------------------------------------------------------------------------

/** Un tramo de atención, en formato 24 horas "HH:MM". */
export interface Tramo {
  desde: string;
  hasta: string;
}

/**
 * Horario por día de la semana. Clave: 0 = domingo, 1 = lunes ... 6 = sábado.
 * Un arreglo vacío [] significa "cerrado" (el día no aparece en el Flow).
 */
export const HORARIO_SEMANAL: Record<number, Tramo[]> = {
  0: [], // Domingo: cerrado
  1: [
    { desde: "08:00", hasta: "12:00" },
    { desde: "14:00", hasta: "17:00" },
  ], // Lunes
  2: [
    { desde: "08:00", hasta: "12:00" },
    { desde: "14:00", hasta: "18:00" },
  ], // Martes
  3: [
    { desde: "08:00", hasta: "12:00" },
    { desde: "14:00", hasta: "18:00" },
  ], // Miércoles
  4: [
    { desde: "08:00", hasta: "12:00" },
    { desde: "14:00", hasta: "18:00" },
  ], // Jueves
  5: [
    { desde: "08:00", hasta: "12:00" },
    { desde: "14:00", hasta: "17:00" },
  ], // Viernes
  6: [{ desde: "08:00", hasta: "12:00" }], // Sábado
};

/** Cuántos días disponibles se muestran en la Pantalla 3. */
export const DIAS_A_MOSTRAR = 14;

/** Margen mínimo (en minutos) entre "ahora" y una cita del mismo día. */
export const ANTICIPACION_MIN = 60;

/** Dirección del consultorio. */
export const DIRECCION =
  "Centro Comercial Paseo del Rosario, Carrera 11 y 12 entre calles 7 y 8, tercer piso, local 3-005, Garzón, Huila";

// ----------------------------------------------------------------------------
// FUNCIONES DE CONSULTA (el resto del proyecto usa SOLO estas)
// ----------------------------------------------------------------------------

/** Devuelve todas las categorías. */
export function obtenerCategorias(): Categoria[] {
  return CATEGORIAS;
}

/** Busca una categoría por su id. */
export function buscarCategoria(id: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.id === id);
}

/** Busca un servicio (en cualquier categoría) por su id. */
export function buscarServicio(
  id: string,
): { servicio: Servicio; categoria: Categoria } | undefined {
  for (const categoria of CATEGORIAS) {
    const servicio = categoria.servicios.find((s) => s.id === id);
    if (servicio) return { servicio, categoria };
  }
  return undefined;
}

/** Convierte 250000 en "$250.000" (formato colombiano con puntos). */
export function formatearPrecio(precio: number): string {
  return "$" + precio.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
