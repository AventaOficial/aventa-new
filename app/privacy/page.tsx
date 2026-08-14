import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidad | AVENTA',
  description:
    'Aviso de privacidad de AVENTA: datos de cuenta, actividad, afiliados y datos fiscales del programa de comisiones (LFPDPPP).',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0 md:pl-28 bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-16 space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Política de Privacidad
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Última actualización: 14 de agosto de 2026
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Este documento describe cómo AVENTA recopila, usa, protege y comparte los datos
            personales relacionados con la plataforma de comunidad de cazadores de ofertas
            disponible en <span className="font-medium">aventaofertas.com</span>. Actúa como
            aviso de privacidad de referencia en México.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Este texto tiene carácter informativo y no constituye asesoría legal. Si necesitas
            una opinión jurídica formal sobre tu caso concreto, consulta con un abogado en
            tu jurisdicción.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">1. Identidad del responsable</h2>
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            A efectos de esta Política, el responsable del tratamiento de los datos personales
            es la persona física o moral que determina los fines y medios de tratamiento bajo
            la marca AVENTA.
          </p>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 text-sm leading-relaxed">
            <p className="font-medium text-gray-900 dark:text-gray-100">Responsable:</p>
            <p className="text-gray-700 dark:text-gray-300">
              AVENTA (comunidad de cazadores de ofertas)
            </p>
            <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">
              Correo de contacto (incluye derechos ARCO):
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              <a
                href="mailto:aventasoportelegal@gmail.com"
                className="text-violet-600 dark:text-violet-400 hover:underline"
              >
                aventasoportelegal@gmail.com
              </a>
            </p>
            <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">País de referencia:</p>
            <p className="text-gray-700 dark:text-gray-300">Estados Unidos Mexicanos (México)</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Nota: este texto busca alinearse con la Ley Federal de Protección de Datos
            Personales en Posesión de los Particulares (LFPDPPP) en México, sin reemplazar
            asesoría legal profesional. Si en el futuro AVENTA opera como persona moral
            distinta, se actualizarán razón social y domicilio fiscal en este aviso.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Datos personales que recopilamos</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En AVENTA se tratan distintos tipos de datos personales, agrupados así:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Datos de cuenta y perfil:</span> correo electrónico,
              nombre visible o display_name, avatar, ID interna de usuario, fecha de creación
              de la cuenta, y en su caso slug público o etiquetas de liderazgo / tracking
              asociadas al perfil.
            </li>
            <li>
              <span className="font-medium">Contenido generado por el usuario:</span> ofertas,
              títulos, descripciones, enlaces, imágenes, comentarios, reportes, votos,
              favoritos y cualquier otro contenido que el usuario decida compartir.
            </li>
            <li>
              <span className="font-medium">Datos de actividad:</span> votos, favoritos,
              ofertas creadas, eventos de interacción (
              <span className="font-mono text-xs">view</span>,{' '}
              <span className="font-mono text-xs">outbound</span>,{' '}
              <span className="font-mono text-xs">share</span>, etc.), métricas derivadas y
              reputación interna.
            </li>
            <li>
              <span className="font-medium">Datos técnicos:</span> dirección IP (seguridad y
              rate limiting), identificadores de sesión, tipo de navegador, sistema operativo,
              idioma, zona horaria, URLs visitadas dentro de la app, y cookies o tecnologías
              similares necesarias para el funcionamiento.
            </li>
            <li>
              <span className="font-medium">
                Datos fiscales y de pago (solo si participas en el programa de comisiones):
              </span>{' '}
              <span className="font-semibold">nombre legal</span>,{' '}
              <span className="font-semibold">RFC</span>,{' '}
              <span className="font-semibold">CLABE</span> u otros datos bancarios equivalentes,
              fecha de actualización de esos datos, versión y fecha de aceptación de los
              términos del programa, y registros operativos de liquidación (montos,
              periodos, estados pending/paid/void y referencias de transferencia). Estos
              datos <span className="font-semibold">no</span> se muestran en el perfil público.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En principio, AVENTA no busca tratar categorías especiales de datos personales
            (datos sensibles en sentido estricto de la LFPDPPP). Cualquier información
            sensible que un usuario decida publicar será considerada información que él mismo
            ha hecho manifiestamente pública bajo su responsabilidad. Los datos fiscales y
            bancarios se tratan con acceso restringido (personal autorizado / roles
            administrativos) por su alto impacto operativo.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Finalidades del tratamiento de datos</h2>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            3.1 Finalidades necesarias para la prestación del servicio
          </h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Permitir el registro, inicio de sesión y autenticación de usuarios.</li>
            <li>
              Mostrar ofertas, votos, favoritos, comentarios y perfiles dentro de la
              comunidad.
            </li>
            <li>
              Operar ranking, relevancia y reputación interna para ordenar y moderar
              contenido.
            </li>
            <li>
              Registrar eventos de interacción (vistas, clics hacia tiendas, compartidos)
              para medir rendimiento y mejorar la experiencia.
            </li>
            <li>
              Aplicar seguridad y prevención de abuso (rate limiting, detección de patrones
              anómalos, protección contra spam o fraude).
            </li>
            <li>
              Atender soporte, reportes de contenido y ejercicio de derechos relacionados
              con datos personales.
            </li>
          </ul>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            3.2 Finalidades adicionales / programa de comisiones
          </h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Elaborar estadísticas agregadas sobre uso de la plataforma (categorías,
              tiendas, ofertas).
            </li>
            <li>
              Enviar comunicaciones informativas o de novedades, con opción de baja cuando
              la ley lo requiera.
            </li>
            <li>
              Si participas en el programa de comisiones para creadores: validar elegibilidad
              e identidad operativa; calcular y liquidar pagos; prevenir fraude (incluido
              control de RFC duplicado); conservar evidencia de aceptación de términos y de
              transferencias; y cumplir obligaciones fiscales o regulatorias aplicables. El
              fundamento incluye tu consentimiento al activar el programa y la ejecución de
              la relación descrita en los{' '}
              <Link href="/terms#comisiones" className="text-violet-600 dark:text-violet-400 hover:underline">
                Términos (sección 8)
              </Link>
              .
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA <span className="font-semibold">no vende</span> datos personales a terceros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Enlaces de afiliados y reemplazo de enlaces</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA es una comunidad de ofertas, no una tienda. Algunas ofertas pueden
            redirigir a sitios externos mediante enlaces de afiliación o con parámetros de
            tracking.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              La plataforma puede utilizar enlaces afiliados propios hacia tiendas externas
              (por ejemplo Amazon Associates, Mercado Libre Afiliados u otros).
            </li>
            <li>
              Los enlaces aportados por usuarios pueden reemplazarse por enlaces equivalentes
              generados por AVENTA, sin modificar el precio final en la tienda externa.
            </li>
            <li>
              AVENTA puede recibir una comisión por compras realizadas a través de dichos
              enlaces. Esta posible comisión no cambia el precio que paga el comprador ni
              implica relación contractual directa entre AVENTA y el comprador.
            </li>
            <li>
              Las redes de afiliados pueden registrar cookies o identificadores en sus
              propios sitios conforme a sus políticas; AVENTA no controla esas cookies de
              terceros en la tienda destino.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">5. Cookies y tecnologías similares</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA utiliza cookies y tecnologías similares para:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Mantener sesiones de usuario y preferencias (como tema claro/oscuro).</li>
            <li>
              Recordar ciertos estados de la interfaz (onboarding, banners cerrados, etc.).
            </li>
            <li>
              Medir uso interno (vistas y clics) mediante eventos en la propia base de datos.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En el momento de redactar esta política, AVENTA no utiliza de forma central
            herramientas externas de analítica o publicidad basadas en cookies de terceros
            (por ejemplo redes publicitarias). Si se incorporan, se actualizará este
            documento y, cuando sea necesario, se recabará el consentimiento
            correspondiente. El aviso de cookies en la interfaz enlaza a esta Política.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Servicios de terceros</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para operar la plataforma, AVENTA se apoya en proveedores que tratan datos por
            cuenta del responsable:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Supabase:</span> base de datos y autenticación
              (incluido login con Google), perfiles, ofertas, votos, comentarios, eventos y,
              cuando aplique, datos fiscales del programa de comisiones.
            </li>
            <li>
              <span className="font-medium">Vercel:</span> hosting y despliegue de la
              aplicación web (Next.js).
            </li>
            <li>
              <span className="font-medium">Upstash Redis:</span> rate limiting y protección
              frente a abuso.
            </li>
            <li>
              <span className="font-medium">Proveedores de almacenamiento de imágenes</span>{' '}
              u otros recursos estáticos, cuando corresponda.
            </li>
            <li>
              <span className="font-medium">Instituciones de pago / banca</span> (p. ej.
              transferencias SPEI): solo los datos necesarios para ejecutar un pago a un
              creador (CLABE, nombre, monto, referencia), cuando exista liquidación.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Estos proveedores tratan los datos según las instrucciones de AVENTA y conforme
            a sus propios términos y políticas. Pueden realizar transferencias
            internacionales de datos (p. ej. hacia Estados Unidos u otros países donde
            tengan infraestructura).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">7. Seguridad y control de acceso</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA implementa medidas técnicas y organizativas razonables para proteger los
            datos personales. Entre otras:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Mecanismos de Supabase: autenticación y políticas de seguridad a nivel de
              filas (RLS) en tablas sensibles, con acceso privilegiado limitado a roles de
              servidor / administración.
            </li>
            <li>
              Los datos fiscales (RFC, CLABE, nombre legal) no forman parte de las vistas
              públicas de perfil; el acceso operativo está restringido a personal autorizado
              para liquidaciones y antifraude.
            </li>
            <li>
              Rate limiting (Redis/Upstash) para reducir abuso de APIs y ataques
              automatizados.
            </li>
            <li>
              Registro de eventos y logs operativos para investigar incidentes y aplicar
              moderación.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Ningún sistema es totalmente invulnerable. No es posible garantizar seguridad
            absoluta frente a todos los escenarios de ataque. Ante un incidente relevante se
            procurará actuar conforme a la legislación aplicable.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">8. Retención de datos y eliminación de cuentas</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Conservamos los datos personales mientras la cuenta esté activa y mientras sea
            necesario para las finalidades de esta Política.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              El usuario puede solicitar la eliminación de su cuenta por los mecanismos
              disponibles o escribiendo a aventasoportelegal@gmail.com.
            </li>
            <li>
              Tras la eliminación, ciertos datos pueden mantenerse bloqueados el tiempo
              razonable para obligaciones legales, disputas, prevención de fraude o
              derechos de AVENTA.
            </li>
            <li>
              <span className="font-medium">Datos fiscales y de pagos:</span> pueden
              conservarse el plazo necesario para obligaciones fiscales, comprobación de
              transferencias y defensa ante reclamos de pago, incluso si el usuario deja el
              programa, cuando la ley o la prudencia operativa lo requieran.
            </li>
            <li>
              Contenido público (ofertas o comentarios) puede permanecer anonimizado o
              agregado cuando sea técnicamente razonable y legalmente permitido.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">9. Derechos de los usuarios (ARCO)</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Las personas titulares pueden ejercer, en los términos de la legislación
            aplicable, los derechos de Acceso, Rectificación, Cancelación y Oposición
            (ARCO).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Acceso:</span> conocer qué datos se tienen y cómo
              se tratan.
            </li>
            <li>
              <span className="font-medium">Rectificación:</span> corregir datos inexactos o
              incompletos (incluido RFC/CLABE vía mecanismos del programa o soporte).
            </li>
            <li>
              <span className="font-medium">Cancelación:</span> solicitar eliminación cuando
              los datos no se requieran para las finalidades indicadas o haya concluido la
              relación, sin perjuicio de retenciones legales.
            </li>
            <li>
              <span className="font-medium">Oposición:</span> oponerse al tratamiento para
              finalidades específicas cuando la ley lo permita.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para ejercer estos derechos, envía una solicitud a{' '}
            <a
              href="mailto:aventasoportelegal@gmail.com"
              className="text-violet-600 dark:text-violet-400 hover:underline"
            >
              aventasoportelegal@gmail.com
            </a>{' '}
            incluyendo: nombre completo, medio de contacto, descripción clara del derecho y,
            en su caso, documentación que acredite identidad o representación.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA procurará responder en un plazo máximo de 20 días hábiles desde la
            recepción, en línea con plazos de referencia de la legislación mexicana. Si la
            solicitud no procede, se informarán los motivos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">10. Transferencias de datos</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA no vende datos personales a terceros. Las transferencias se limitan a:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Proveedores encargados del tratamiento (Supabase, Vercel, Upstash,
              almacenamiento, y en su caso banca/pago) únicamente para prestar el servicio.
            </li>
            <li>
              Autoridades competentes cuando lo exija una norma o una orden debidamente
              fundada.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">11. Cambios a esta Política</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA puede actualizar esta Política de Privacidad en cualquier momento para
            reflejar cambios en la plataforma, en los tratamientos o en la normativa
            aplicable.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Cuando haya cambios relevantes (en especial sobre datos fiscales o nuevos
            terceros de analítica/publicidad), se procurará notificarlo mediante avisos en
            la plataforma o por los medios de contacto disponibles. La versión vigente estará
            en <span className="font-medium">https://aventaofertas.com/privacy</span>.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Ver también:{' '}
            <Link href="/terms" className="text-violet-600 dark:text-violet-400 hover:underline">
              Términos y Condiciones
            </Link>{' '}
            y{' '}
            <Link href="/comisiones" className="text-violet-600 dark:text-violet-400 hover:underline">
              Programa de comisiones
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
