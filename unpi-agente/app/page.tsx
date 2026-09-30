// Página de inicio: solo confirma que el servidor del bot está encendido.
// Los pacientes nunca ven esta página; hablan con el bot por WhatsApp.
export default function Inicio() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">UNPI Y TUS VACUNAS 💙</h1>
      <p className="text-zinc-600">Asistente de WhatsApp activo.</p>
    </main>
  );
}
