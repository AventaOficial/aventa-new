import type { Metadata } from 'next';
import Link from 'next/link';
import {
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_PAYOUT_CENTS,
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_PAYOUT_HOLD_DAYS,
  COMMISSION_REQUIRED_OFFERS,
  COMMISSION_TERMS_VERSION,
} from '@/lib/commissions/constants';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | AVENTA',
  description:
    'Términos de uso de AVENTA: comunidad de ofertas, afiliados, programa de comisiones a creadores y reglas de la plataforma.',
};

function mxnFromCents(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function TermsPage() {
  const creatorSharePct = (COMMISSION_DEFAULT_CREATOR_SHARE_BPS / 100).toFixed(0);
  const minPayout = mxnFromCents(COMMISSION_MIN_PAYOUT_CENTS);

  return (
    <main className="min-h-screen pb-24 md:pb-0 md:pl-28 bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-16 space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Última actualización: 14 de agosto de 2026 · Versión del programa de comisiones:{' '}
            <span className="font-mono text-xs">{COMMISSION_TERMS_VERSION}</span>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Estos Términos y Condiciones regulan el acceso y uso de la plataforma AVENTA,
            disponible en <span className="font-medium">aventaofertas.com</span>. Al usar la
            plataforma, el usuario acepta íntegramente lo aquí dispuesto.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Este documento tiene finalidad informativa general y no sustituye asesoría legal
            profesional. Si necesitas una opinión jurídica específica, consulta con un
            abogado en tu jurisdicción.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. Naturaleza del servicio</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA es una plataforma comunitaria de cazadores de ofertas que permite a los
            usuarios descubrir, compartir y votar oportunidades de compra publicadas por la
            comunidad.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              AVENTA <span className="font-semibold">no vende productos ni servicios</span> al
              público. La plataforma únicamente muestra información sobre ofertas
              disponibles en tiendas y sitios externos.
            </li>
            <li>
              Los enlaces, precios, disponibilidad y condiciones de las ofertas pertenecen a
              los comercios externos correspondientes. Pueden cambiar sin previo aviso.
            </li>
            <li>
              AVENTA actúa como <span className="font-semibold">intermediario informativo</span>
              : no es parte del contrato de compraventa entre el usuario y la tienda externa.
            </li>
            <li>
              El ranking de ofertas se basa en votos y señales de la comunidad. El ranking{' '}
              <span className="font-semibold">no se vende ni se compra</span>. El contenido
              patrocinado, si existiera, se identificará de forma distinta al ranking orgánico.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Registro, cuenta y edad</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Algunas funcionalidades (por ejemplo, publicar ofertas, votar, comentar o
            guardar favoritos) requieren crear una cuenta de usuario mediante correo
            electrónico y contraseña, o acceso con Google a través de Supabase.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              El usuario se compromete a proporcionar información veraz y a mantenerla
              actualizada.
            </li>
            <li>
              El usuario es responsable de la confidencialidad de sus credenciales y del uso
              que se haga de su cuenta. Cualquier actividad realizada desde su cuenta se
              presumirá realizada por él.
            </li>
            <li>
              <span className="font-medium">Edad:</span> el uso general de la plataforma está
              pensado para personas con capacidad legal suficiente. Para participar en el{' '}
              <span className="font-semibold">programa de comisiones</span> (sección 8) el
              usuario debe ser mayor de <span className="font-semibold">18 años</span> y estar
              en condiciones de aportar datos fiscales y bancarios válidos en México (o los
              que en el futuro se requieran en otros países).
            </li>
            <li>
              AVENTA se reserva el derecho de suspender o cancelar cuentas que incumplan
              estos Términos o que muestren actividad sospechosa o abusiva.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Contenido generado por usuarios (UGC)</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Las ofertas, comentarios, reportes y demás contenido publicados en AVENTA son
            responsabilidad exclusiva de los usuarios que los generan.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              El usuario declara que cuenta con los derechos necesarios para publicar el
              contenido que aporte y se compromete a que dicho contenido no infringe derechos
              de terceros ni disposiciones legales aplicables.
            </li>
            <li>
              AVENTA no revisa ni aprueba de forma previa todo el contenido, pero cuenta con
              mecanismos de moderación y reportes para actuar sobre contenido que incumpla
              estas reglas.
            </li>
            <li>
              Al publicar contenido en AVENTA, el usuario otorga a la plataforma una licencia
              no exclusiva, mundial, gratuita y revocable para mostrar, almacenar, indexar y
              reproducir dicho contenido dentro de la comunidad y en materiales relacionados
              con la promoción de la propia plataforma.
            </li>
            <li>
              <span className="font-medium">Propiedad intelectual de terceros:</span> si un
              titular de derechos considera que un contenido infringe su marca, obra u otros
              derechos, puede notificarlo a{' '}
              <a
                href="mailto:aventasoportelegal@gmail.com"
                className="text-violet-600 dark:text-violet-400 hover:underline"
              >
                aventasoportelegal@gmail.com
              </a>{' '}
              con identificación del contenido y fundamento. AVENTA podrá retirar u ocultar
              el material de buena fe tras revisión razonable.
            </li>
            <li>
              El usuario indemnizará y mantendrá indemne a AVENTA frente a reclamaciones de
              terceros derivadas del contenido que él publique o de su uso indebido de la
              plataforma, en la medida permitida por la ley.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Reemplazo de enlaces y afiliación</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para sostener la plataforma, AVENTA puede utilizar sistemas de afiliación y
            tracking de rendimiento de enlaces (por ejemplo, Amazon Associates, Mercado Libre
            Afiliados u otros programas equivalentes).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Los enlaces que los usuarios compartan hacia tiendas o productos externos
              pueden ser modificados o reemplazados por enlaces de afiliación o tracking
              generados por AVENTA, siempre con el objetivo de dirigir al mismo destino o a
              uno equivalente en la tienda de origen.
            </li>
            <li>
              El uso de enlaces afiliados no modifica el precio final que el usuario paga en
              la tienda externa.
            </li>
            <li>
              AVENTA puede recibir comisiones o compensaciones económicas por compras
              realizadas a través de dichos enlaces. El usuario acepta esta práctica como
              parte del modelo de negocio de la plataforma.
            </li>
            <li>
              En la interfaz se informa de esta práctica mediante avisos de transparencia
              (por ejemplo en el pie de página y en{' '}
              <Link href="/comisiones" className="text-violet-600 dark:text-violet-400 hover:underline">
                /comisiones
              </Link>
              ). El detalle del tratamiento de datos está en la{' '}
              <Link href="/privacy" className="text-violet-600 dark:text-violet-400 hover:underline">
                Política de Privacidad
              </Link>
              .
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            5. Prohibición de enlaces afiliados propios y spam
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para proteger la calidad de la comunidad y evitar abuso, el usuario se obliga a
            no utilizar AVENTA como plataforma de promoción afiliada propia no autorizada o
            spam.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              No se permite publicar enlaces afiliados propios ni enlaces cuyo principal
              objetivo sea obtener beneficios económicos para el propio usuario sin
              autorización expresa de AVENTA (salvo el programa de comisiones de la sección 8,
              operado bajo las reglas de la plataforma).
            </li>
            <li>
              No se permite el envío masivo de contenido repetitivo, enlaces de baja calidad
              o publicidad encubierta.
            </li>
            <li>
              El incumplimiento puede derivar en eliminación de contenido, pérdida de
              reputación interna, exclusión del programa de comisiones, suspensión temporal o
              definitiva de la cuenta.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Moderación y reportes</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA cuenta con herramientas internas de reportes, moderación y reputación
            para mantener la calidad del contenido.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Los usuarios pueden reportar ofertas que consideren falsas, expiradas,
              engañosas, spam o que violen estos Términos.
            </li>
            <li>
              El equipo de moderación puede, a su solo criterio, aprobar, rechazar, ocultar
              o eliminar ofertas, comentarios y cuentas, así como ajustar parámetros de
              reputación interna.
            </li>
            <li>
              AVENTA no está obligada a justificar públicamente cada acción de moderación,
              pero procurará actuar de buena fe y priorizando la seguridad de la comunidad.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">7. Sistema de reputación</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            La plataforma puede asignar métricas internas de reputación a los usuarios (por
            ejemplo, ofertas aprobadas, comentarios u otros indicadores).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Esta reputación es una herramienta interna para moderación, privilegios de
              publicación y peso de voto. <span className="font-semibold">No constituye</span>{' '}
              certificación profesional, comercial ni financiera, ni determina por sí sola el
              monto de un pago.
            </li>
            <li>
              AVENTA puede ajustar los criterios y algoritmos de reputación en cualquier
              momento sin obligación de publicar detalles técnicos exhaustivos.
            </li>
          </ul>
        </section>

        <section className="space-y-3" id="comisiones">
          <h2 className="text-xl font-semibold">
            8. Programa de comisiones para creadores
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA puede ofrecer un programa opcional de participación económica para
            usuarios que publican ofertas de calidad. El programa solo genera obligaciones de
            pago cuando está{' '}
            <span className="font-semibold">anunciado como activo</span> por canales oficiales
            y el usuario ha aceptado expresamente esta sección en su cuenta. Mientras el
            programa no esté activo, la plataforma puede seguir siendo gratuita para la
            comunidad y no existe derecho a liquidación.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Resumen orientativo (detalle operativo también en{' '}
            <Link href="/comisiones" className="text-violet-600 dark:text-violet-400 hover:underline">
              /comisiones
            </Link>
            ):
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Elegibilidad (candado de calidad):</span> al menos{' '}
              <span className="font-semibold">
                {COMMISSION_REQUIRED_OFFERS} ofertas
              </span>{' '}
              en estado aprobado o publicado, cada una con al menos{' '}
              <span className="font-semibold">
                {COMMISSION_MIN_UPVOTES_PER_OFFER} votos positivos
              </span>
              ; mayoría de edad (18+); aceptación expresa de esta versión de términos; y
              datos fiscales/bancarios válidos cuando se solicite el pago (nombre legal, RFC y
              CLABE en México, u otros datos equivalentes). Cumplir el umbral de votos{' '}
              <span className="font-semibold">no genera</span> por sí solo un pago fijo ni un
              ingreso garantizado.
            </li>
            <li>
              <span className="font-medium">Base del pago:</span> cuando el programa esté
              activo, el creador elegible podrá recibir aproximadamente el{' '}
              <span className="font-semibold">{creatorSharePct}%</span> de las{' '}
              <span className="font-semibold">
                comisiones de afiliado confirmadas por la red
              </span>{' '}
              (por ejemplo Amazon o Mercado Libre) que resulten{' '}
              <span className="font-semibold">atribuibles</span> a su cuenta mediante
              tracking tag / identificador de creador u oferta, según los reportes e
              importaciones internas de AVENTA. No se pagan clics, votos ni estimaciones
              aisladas.
            </li>
            <li>
              <span className="font-medium">No atribuible:</span> las comisiones de afiliado
              que no puedan vincularse de forma razonable a un creador (sin tag, tráfico
              genérico de plataforma u otros casos){' '}
              <span className="font-semibold">no generan pago individual</span> y permanecen
              en la economía de la plataforma.
            </li>
            <li>
              <span className="font-medium">Confirmado, pendiente y void:</span> “confirmado”
              significa registrado internamente como comisión de red en estado usable para
              reparto (p. ej. accrued/paid en el ledger). “Pendiente” es una asignación aún
              no liquidada. “Void” es anulación total o parcial por devoluciones,
              inconsistencias de red, fraude, error o incumplimiento. AVENTA puede auditar y
              ajustar montos antes o después del cálculo del periodo.
            </li>
            <li>
              <span className="font-medium">Retención (hold):</span> de forma orientativa,
              AVENTA puede retener liquidaciones alrededor de{' '}
              <span className="font-semibold">{COMMISSION_PAYOUT_HOLD_DAYS} días</span> tras
              el cierre del periodo relevante, para absorber cancelaciones o devoluciones de
              las redes de afiliados. Los plazos exactos pueden ajustarse según cada red.
            </li>
            <li>
              <span className="font-medium">Mínimo de pago:</span> salvo que se comunique otro
              umbral, el mínimo orientativo de transferencia es{' '}
              <span className="font-semibold">{minPayout}</span>. Si el saldo a pagar no
              alcanza el mínimo, puede acumularse para un periodo posterior o quedar pendiente
              hasta reunir el umbral, según la operación del programa.
            </li>
            <li>
              <span className="font-medium">Método de pago:</span> en la etapa actual los pagos
              se procesan de forma <span className="font-semibold">manual</span> (p. ej. SPEI
              a CLABE) tras revisión administrativa. No hay retiro instantáneo automático.
            </li>
            <li>
              <span className="font-medium">Fiscalidad:</span> cualquier liquidación está
              sujeta a la normativa fiscal aplicable, a la posible retención de impuestos y a
              la solicitud de datos o comprobantes (incluida información para CFDI u otras
              obligaciones). El tratamiento concreto puede requerir validación contable; el
              usuario es responsable de sus propias obligaciones fiscales.
            </li>
            <li>
              <span className="font-medium">Naturaleza de la relación:</span> la participación
              en el programa <span className="font-semibold">no crea</span> relación laboral,
              de sociedad ni de mandato irrevocable. Es un programa discrecional de
              participación en comisiones de afiliado sujetas a fondos reales, elegibilidad y
              reglas vigentes.
            </li>
            <li>
              <span className="font-medium">Modificación y suspensión:</span> AVENTA puede
              modificar porcentajes, umbrales, calendarios o suspender el programa con aviso
              razonable. Los cambios materiales de esta sección pueden exigir una nueva
              aceptación (nueva versión). La mera publicación de ofertas o el cumplimiento de
              umbrales numéricos <span className="font-semibold">no garantiza</span>{' '}
              remuneración.
            </li>
            <li>
              <span className="font-medium">Cumplimiento de programas de terceros:</span> el
              creador no debe realizar prácticas prohibidas por los términos de Amazon
              Associates, Mercado Libre Afiliados u otras redes (incluyendo, sin limitar,
              cookie stuffing, incentivos ilícitos al clic, o auto-compra destinada a
              generarse comisión). El incumplimiento puede anular pagos y cerrar la cuenta.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">9. Conductas prohibidas</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Sin limitar otras conductas abusivas, se prohíbe expresamente:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Manipular votos de forma artificial (cuentas falsas, granjas de votos, colusión).</li>
            <li>Crear múltiples cuentas para eludir suspensiones o distorsionar métricas.</li>
            <li>
              Automatizar el envío de ofertas, votos, comentarios o clics outbound sin
              autorización expresa.
            </li>
            <li>
              Click fraud o cualquier práctica destinada a inflar artificialmente métricas de
              impacto o comisiones.
            </li>
            <li>
              <span className="font-medium">Self-dealing:</span> comprar a través del propio
              enlace afiliado / tag con el fin principal de generarse comisión a sí mismo, o
              coordinar compras fingidas con terceros para el mismo fin.
            </li>
            <li>
              Usar un mismo RFC en múltiples cuentas de creador para eludir controles, o
              aportar datos fiscales/bancarios de terceros sin autorización.
            </li>
            <li>
              Intentar acceder de forma no autorizada a sistemas, bases de datos o cuentas de
              otros usuarios.
            </li>
            <li>
              Publicar contenido ilegal, difamatorio, discriminatorio, violento, sexualmente
              explícito o que infrinja derechos de propiedad intelectual o de terceros.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Ante indicios de fraude, AVENTA puede congelar saldos, marcar asignaciones como
            void, exigir verificación adicional y/o banear la cuenta, sin perjuicio de otras
            acciones legales.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">10. Limitación de responsabilidad</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA no garantiza la exactitud, vigencia ni disponibilidad permanente de las
            ofertas publicadas por la comunidad.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Las decisiones de compra basadas en ofertas vistas en la plataforma son
              responsabilidad exclusiva de cada usuario.
            </li>
            <li>
              AVENTA no responde por pérdidas económicas, daños indirectos, lucro cesante ni
              perjuicios derivados de ofertas expiradas, erróneas, incompletas o no
              disponibles en la tienda externa, en la medida permitida por la ley.
            </li>
            <li>
              AVENTA no es parte de la relación contractual entre el usuario y la tienda
              externa. Reclamaciones de compra (entrega, garantía, devoluciones, facturación)
              deben dirigirse al comercio correspondiente.
            </li>
            <li>
              Los montos de comisiones dependen de reportes de redes de afiliados externas;
              retrasos, ajustes o cancelaciones de esas redes pueden afectar liquidaciones.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">11. Terminación y eliminación de cuentas</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            El usuario puede dejar de usar la plataforma en cualquier momento y, cuando los
            mecanismos lo permitan, solicitar la eliminación de su cuenta.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              AVENTA puede suspender, limitar o cancelar cuentas que incumplan estos
              Términos, que generen riesgo para la seguridad o que muestren patrones de abuso.
            </li>
            <li>
              Incluso tras la terminación, AVENTA puede conservar ciertos datos el tiempo
              razonable para seguridad, prevención de fraude, resolución de disputas,
              obligaciones fiscales o legales, conforme a la Política de Privacidad.
            </li>
            <li>
              Saldos del programa de comisiones pendientes pueden revisarse, retenerse o
              anularse según elegibilidad, fraude y estado del programa al momento de la
              terminación.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">12. Legislación aplicable y jurisdicción</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En la medida en que la ley lo permita, estos Términos y cualquier controversia
            relacionada con el uso de AVENTA se interpretarán de conformidad con las leyes
            aplicables en los Estados Unidos Mexicanos.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Sin perjuicio de mecanismos amistosos de resolución de conflictos, las partes se
            someten a los tribunales competentes conforme a la ley mexicana, renunciando, en
            lo posible, a cualquier otro fuero que pudiera corresponderles por razón de su
            domicilio presente o futuro.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">13. Cambios a estos Términos</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA puede modificar estos Términos y Condiciones en cualquier momento. La
            versión vigente estará siempre disponible en{' '}
            <span className="font-medium">https://aventaofertas.com/terms</span>.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Cuando los cambios sean relevantes —en especial los del programa de comisiones—
            se procurará comunicarlo mediante avisos en la plataforma o por los medios de
            contacto disponibles. El uso continuado tras la publicación de cambios implica la
            aceptación de los nuevos términos generales; la participación en el programa de
            comisiones puede exigir aceptación expresa de la nueva versión en el perfil.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Contacto legal:{' '}
            <a
              href="mailto:aventasoportelegal@gmail.com"
              className="text-violet-600 dark:text-violet-400 hover:underline"
            >
              aventasoportelegal@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
