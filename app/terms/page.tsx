import type { Metadata } from 'next';
import Link from 'next/link';
import AppShell from '@/app/AppShell';
import LegalBackLink from '@/app/components/LegalBackLink';
import { TERMS_LAST_UPDATED } from '@/lib/legal/constants';
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_PAYOUT_CENTS,
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
  REWARDS_TERMS_VERSION,
} from '@/lib/rewards/config';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | AVENTA',
  description:
    'Términos de uso de AVENTA: comunidad de ofertas, afiliados, Programa de Recompensas y reglas de la plataforma.',
};

function mxnFromCents(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function TermsPage() {
  const creatorSharePct = (REWARDS_CREATOR_SHARE_BPS / 100).toFixed(0);
  const minPayout = mxnFromCents(REWARDS_MIN_PAYOUT_CENTS);

  return (
    <AppShell>
    <main className="min-h-screen pb-24 md:pb-0 bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-8 md:pt-12 pb-16 space-y-10">
        <LegalBackLink />
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Última actualización: {TERMS_LAST_UPDATED} · Versión del Programa de Recompensas:{' '}
            <span className="font-mono text-xs">{REWARDS_TERMS_VERSION}</span>
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
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Los datos de identificación fiscal del responsable (razón social, RFC y domicilio)
            se publicarán en esta sección cuando se formalice la operación comercial y, en su
            caso, se active el Programa de Recompensas. Mientras tanto, el contacto oficial es{' '}
            <a
              href="mailto:aventasoportelegal@gmail.com"
              className="text-violet-600 dark:text-violet-400 hover:underline"
            >
              aventasoportelegal@gmail.com
            </a>
            .
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
              Las compras se realizan directamente con el comercio correspondiente.
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
              Al registrarse, el usuario debe aceptar expresamente estos Términos y la{' '}
              <Link href="/privacy" className="text-violet-600 dark:text-violet-400 hover:underline">
                Política de Privacidad
              </Link>
              .
            </li>
            <li>
              El usuario es responsable de la confidencialidad de sus credenciales y del uso
              que se haga de su cuenta. Cualquier actividad realizada desde su cuenta se
              presumirá realizada por él.
            </li>
            <li>
              <span className="font-medium">Edad:</span> el uso general de la plataforma está
              pensado para personas con capacidad legal suficiente. Para participar en el{' '}
              <span className="font-semibold">Programa de Recompensas</span> (sección 8) el
              usuario debe ser mayor de <span className="font-semibold">18 años</span> y estar
              en condiciones de aportar datos fiscales y bancarios válidos cuando AVENTA los
              solicite para un pago (nombre legal, RFC y CLABE en México, u otros datos
              equivalentes).
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
              generados por <span className="font-semibold">AVENTA</span>, siempre con el
              objetivo de dirigir al mismo destino o a uno equivalente en la tienda de origen.
            </li>
            <li>
              El usuario que publica una oferta{' '}
              <span className="font-semibold">no es afiliado</span> de Amazon, Mercado Libre
              ni de las demás tiendas por el solo hecho de compartir una oferta en AVENTA.
              AVENTA opera con sus propias relaciones y enlaces de afiliación.
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
              (por ejemplo en el pie de página, en el feed y en{' '}
              <Link href="/comisiones" className="text-violet-600 dark:text-violet-400 hover:underline">
                Programa de Recompensas
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
              autorización expresa de AVENTA (salvo el Programa de Recompensas de la sección 8,
              operado bajo las reglas de la plataforma).
            </li>
            <li>
              No se permite el envío masivo de contenido repetitivo, enlaces de baja calidad
              o publicidad encubierta.
            </li>
            <li>
              El incumplimiento puede derivar en eliminación de contenido, pérdida de
              reputación interna, exclusión del Programa de Recompensas, suspensión temporal o
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
              monto de una recompensa.
            </li>
            <li>
              AVENTA puede ajustar los criterios y algoritmos de reputación en cualquier
              momento sin obligación de publicar detalles técnicos exhaustivos.
            </li>
          </ul>
        </section>

        <section className="space-y-3" id="comisiones">
          <h2 className="text-xl font-semibold">
            8. Programa de Recompensas para creadores
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA puede ofrecer un <span className="font-semibold">Programa de Recompensas</span>{' '}
            opcional para usuarios que publican ofertas de calidad. Es un programa interno de
            AVENTA, distinto de cualquier programa de afiliados de tiendas externas. El
            programa solo genera obligaciones de pago cuando está{' '}
            <span className="font-semibold">anunciado como activo</span> por canales oficiales.
            Mientras el programa no esté activo, la plataforma puede seguir siendo gratuita para
            la comunidad y no existe derecho a liquidación ni recompensa monetaria.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Resumen orientativo (detalle operativo también en{' '}
            <Link href="/comisiones" className="text-violet-600 dark:text-violet-400 hover:underline">
              Programa de Recompensas
            </Link>
            ):
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Modelo económico:</span> cuando alguien compra en
              una tienda externa mediante un enlace de afiliado de AVENTA, la red de afiliados
              puede confirmar una <span className="font-semibold">comisión</span> para AVENTA.
              AVENTA puede otorgar al creador elegible una{' '}
              <span className="font-semibold">recompensa interna</span> equivalente aproximadamente
              al <span className="font-semibold">{creatorSharePct}%</span> de esa comisión
              atribuible. AVENTA conserva el resto (operación, impuestos, chargebacks y
              producto). La recompensa <span className="font-semibold">no es</span> una comisión
              de afiliado del creador ante la tienda.
            </li>
            <li>
              <span className="font-medium">Elegibilidad (desbloqueo):</span> al menos{' '}
              <span className="font-semibold">
                {REWARDS_REQUIRED_APPROVED_OFFERS} ofertas
              </span>{' '}
              en estado aprobado o publicado, y al menos{' '}
              <span className="font-semibold">
                {REWARDS_REQUIRED_POSITIVE_VOTES} votos positivos acumulados
              </span>{' '}
              (suma entre todas las ofertas del usuario). Cumplir estos umbrales{' '}
              <span className="font-semibold">no garantiza</span> recompensa monetaria si no
              existe comisión real atribuible.
            </li>
            <li>
              <span className="font-medium">Oferta de Bienvenida:</span> tras desbloquear el
              programa, el creador elige <span className="font-semibold">una única</span> oferta
              de sus primeras {REWARDS_REQUIRED_APPROVED_OFFERS} como Oferta de Bienvenida.
              Solo esa oferta —y las ofertas elegibles creadas después del desbloqueo— pueden
              participar en recompensas según las reglas operativas de AVENTA.
            </li>
            <li>
              <span className="font-medium">Base de la recompensa:</span> no se pagan clics,
              votos ni estimaciones aisladas. La recompensa depende de una{' '}
              <span className="font-semibold">comisión de afiliado confirmada por la red</span>{' '}
              (por ejemplo Amazon o Mercado Libre) que resulte{' '}
              <span className="font-semibold">atribuible</span> a la oferta del creador según
              los reportes e importaciones internas de AVENTA.
            </li>
            <li>
              <span className="font-medium">No atribuible:</span> comisiones que no puedan
              vincularse de forma razonable a un creador u oferta{' '}
              <span className="font-semibold">no generan recompensa individual</span>. En
              algunas redes (p. ej. Mercado Libre) la atribución puede requerir revisión manual.
            </li>
            <li>
              <span className="font-medium">Estados y validación:</span> las recompensas pueden
              pasar por periodos de validación (p. ej. estado VALIDATING), quedar disponibles
              (AVAILABLE), pagarse (PAID), cancelarse (CANCELLED) o revertirse (REVERSED) según
              fraude, devoluciones, chargebacks o problemas de atribución.
            </li>
            <li>
              <span className="font-medium">Retención (hold):</span> de forma orientativa,
              AVENTA puede retener recompensas alrededor de{' '}
              <span className="font-semibold">{REWARDS_HOLD_DAYS} días</span> antes de marcarlas
              como disponibles, para absorber cancelaciones o devoluciones de las redes de
              afiliados.
            </li>
            <li>
              <span className="font-medium">Mínimo de pago:</span> salvo que se comunique otro
              umbral, el mínimo orientativo de transferencia es{' '}
              <span className="font-semibold">{minPayout}</span>. Si el saldo no alcanza el
              mínimo, puede acumularse para un periodo posterior.
            </li>
            <li>
              <span className="font-medium">Método de pago:</span> cuando el programa esté
              activo, los pagos se procesan de forma{' '}
              <span className="font-semibold">manual</span> (p. ej. SPEI) tras revisión
              administrativa. AVENTA puede solicitar datos fiscales y bancarios antes de pagar.
            </li>
            <li>
              <span className="font-medium">Fiscalidad:</span> cualquier liquidación está
              sujeta a la normativa fiscal aplicable. El tratamiento concreto puede requerir
              validación contable; el usuario es responsable de sus propias obligaciones
              fiscales.
            </li>
            <li>
              <span className="font-medium">Naturaleza de la relación:</span> la participación
              en el programa <span className="font-semibold">no crea</span> relación laboral,
              de sociedad ni de mandato irrevocable. Es un programa discrecional sujeto a
              fondos reales, elegibilidad y reglas vigentes.
            </li>
            <li>
              <span className="font-medium">Modificación y suspensión:</span> AVENTA puede
              modificar porcentajes, umbrales, calendarios o suspender el programa con aviso
              razonable. Los cambios materiales pueden exigir una nueva aceptación. La mera
              publicación de ofertas o el cumplimiento de umbrales numéricos{' '}
              <span className="font-semibold">no garantiza</span> remuneración.
            </li>
            <li>
              <span className="font-medium">Cumplimiento de programas de terceros:</span> el
              creador no debe realizar prácticas prohibidas por los términos de Amazon
              Associates, Mercado Libre Afiliados u otras redes (incluyendo cookie stuffing,
              incentivos ilícitos al clic o auto-compra destinada a generarse recompensa). El
              incumplimiento puede anular recompensas y cerrar la cuenta.
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
              impacto o recompensas.
            </li>
            <li>
              <span className="font-medium">Self-dealing:</span> comprar a través del propio
              enlace con el fin principal de generarse recompensa a sí mismo, o coordinar
              compras fingidas con terceros para el mismo fin.
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
            Ante indicios de fraude, AVENTA puede congelar saldos, cancelar o revertir
            recompensas, exigir verificación adicional y/o banear la cuenta, sin perjuicio de
            otras acciones legales.
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
              Las recompensas dependen de reportes de redes de afiliados externas; retrasos,
              ajustes o cancelaciones de esas redes pueden afectar liquidaciones.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">11. Terminación y eliminación de cuentas</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            El usuario puede dejar de usar la plataforma en cualquier momento y solicitar la
            eliminación de su cuenta desde{' '}
            <Link href="/settings" className="text-violet-600 dark:text-violet-400 hover:underline">
              Configuración
            </Link>{' '}
            o escribiendo a aventasoportelegal@gmail.com.
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
              Saldos del Programa de Recompensas pendientes pueden revisarse, retenerse o
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
            Cuando los cambios sean relevantes —en especial los del Programa de Recompensas—
            se procurará comunicarlo mediante avisos en la plataforma o por los medios de
            contacto disponibles. El uso continuado tras la publicación de cambios implica la
            aceptación de los nuevos términos generales; la participación en el programa puede
            exigir aceptación expresa de la nueva versión.
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
    </AppShell>
  );
}
