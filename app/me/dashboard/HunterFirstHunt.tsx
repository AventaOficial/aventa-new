const STEPS = [
  {
    title: 'Qué es un cazador',
    detail: 'Comparte un precio útil. El perfil público, el nivel y los logros muestran esa contribución.',
  },
  {
    title: 'Qué hace buena una oferta',
    detail: 'Precio real, enlace del producto y datos que se pueden revisar. El mismo producto no cuenta como otra cacería.',
  },
  {
    title: 'Cómo enviar la primera',
    detail: 'El botón abre el envío de siempre. Antes de publicar verás si falta algo.',
  },
  {
    title: 'Qué ocurre después',
    detail: 'Queda en revisión. Si se aprueba, aparece en tu perfil. Si se rechaza, el motivo dice qué corregir y puedes reenviar.',
  },
] as const;

/** Pasos derivados de no tener ofertas. No se persisten. */
export default function HunterFirstHunt() {
  return (
    <ol aria-label="Tu primera cacería" className="space-y-2">
      {STEPS.map((step, index) => (
        <li key={step.title} className="rounded-2xl bg-white px-4 py-3 dark:bg-[#141414]">
          <p className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
            {index + 1}. {step.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{step.detail}</p>
        </li>
      ))}
    </ol>
  );
}
