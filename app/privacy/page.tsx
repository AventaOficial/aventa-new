import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad | AVENTA',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0 md:pl-28 bg-[#F5F5F7] dark:bg-[#030712] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-16 space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Política de Privacidad
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Última actualización: 27 de febrero de 2026
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Este documento describe cómo AVENTA recopila, usa, protege y comparte los datos
            personales relacionados con la plataforma de comunidad de cazadores de ofertas
            disponible en <span className="font-medium">aventaofertas.com</span>.
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
            es la persona física o moral que determina los fines y medios de tratamiento.
          </p>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm leading-relaxed">
            <p className="font-medium text-gray-900 dark:text-gray-100">Responsable:</p>
            <p className="text-gray-700 dark:text-gray-300">
              AVENTA (comunidad de cazadores de ofertas)
            </p>
            <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">
              Correo de contacto:
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              <span className="italic">El titular del proyecto deberá indicar aquí un correo de contacto válido.</span>
            </p>
            <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">País de referencia:</p>
            <p className="text-gray-700 dark:text-gray-300">Estados Unidos Mexicanos (México)</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Nota: este texto está pensado para alinearse con la Ley Federal de Protección de
            Datos Personales en Posesión de los Particulares (LFPDPPP) en México, sin
            reemplazar asesoría legal profesional.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            2. Datos personales que recopilamos
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En AVENTA se tratan distintos tipos de datos personales, agrupados en las
            categorías siguientes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Datos de cuenta y perfil:</span> correo electrónico,
              nombre visible o display_name, avatar o imagen de perfil, ID interna de usuario
              en Supabase, fecha de creación de la cuenta.
            </li>
            <li>
              <span className="font-medium">Contenido generado por el usuario:</span> ofertas
              publicadas, títulos, descripciones, enlaces, imágenes asociadas a ofertas,
              comentarios, reportes enviados, votos, favoritos y cualquier otro contenido que
              el usuario decida compartir en la plataforma.
            </li>
            <li>
              <span className="font-medium">Datos de actividad:</span> votos realizados en
              ofertas, favoritos, ofertas creadas, eventos de interacción (por ejemplo
              <span className="font-mono text-xs mx-1">view</span>,
              <span className="font-mono text-xs mx-1">outbound</span>,
              <span className="font-mono text-xs mx-1">share</span>), métricas derivadas y
              reputación interna (por ejemplo, conteos de ofertas aprobadas o rechazadas).
            </li>
            <li>
              <span className="font-medium">Datos técnicos:</span> dirección IP (utilizada
              principalmente para seguridad y limitación de tasa), identificadores de sesión,
              tipo de navegador, sistema operativo, idioma, zona horaria, URLs visitadas dentro
              de la app, y cookies o tecnologías similares necesarias para el funcionamiento
              de la plataforma.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En principio, AVENTA no busca tratar categorías especiales de datos personales
            (datos sensibles). Cualquier información sensible que un usuario decida publicar
            en la plataforma será considerada como información que él mismo ha hecho
            manifiestamente pública bajo su responsabilidad.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            3. Finalidades del tratamiento de datos
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Tratamos los datos personales para las finalidades siguientes:
          </p>
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
              Operar los sistemas de ranking, relevancia y reputación interna para ordenar y
              moderar el contenido.
            </li>
            <li>
              Registrar eventos de interacción como vistas de ofertas, clics outbound hacia
              tiendas externas y compartidos con el fin de medir rendimiento y mejorar la
              experiencia.
            </li>
            <li>
              Aplicar mecanismos de seguridad y prevención de abuso como rate limiting,
              detección de patrones anómalos y protección contra spam o fraude.
            </li>
            <li>
              Atender solicitudes de soporte, reportes de contenido y ejercicio de derechos
              relacionados con datos personales.
            </li>
          </ul>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            3.2 Finalidades adicionales
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            De forma adicional, y siempre conforme a la legislación aplicable, los datos
            pueden utilizarse para:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Elaborar estadísticas agregadas sobre uso de la plataforma para entender qué
              categorías, tiendas u ofertas funcionan mejor.
            </li>
            <li>
              Enviar comunicaciones informativas o de novedades de la plataforma, siempre con
              opción de darse de baja cuando la ley lo requiera.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA <span className="font-semibold">no vende</span> datos personales a terceros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            4. Enlaces de afiliados y reemplazo de enlaces
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA es una comunidad de ofertas, no una tienda. Sin embargo, algunas ofertas
            pueden redirigir a sitios externos mediante enlaces de afiliación o enlaces con
            parámetros de tracking.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              La plataforma puede utilizar enlaces afiliados propios hacia tiendas externas
              (por ejemplo, programas de afiliados de comercios o marketplaces).
            </li>
            <li>
              Los enlaces aportados por los usuarios pueden ser reemplazados por enlaces
              equivalentes generados por AVENTA, sin modificar el precio final que ve el
              usuario en la tienda externa.
            </li>
            <li>
              AVENTA puede recibir una comisión por compras realizadas a través de dichos
              enlaces afiliados. Esta posible comisión no cambia el precio que paga el
              usuario ni implica relación contractual directa entre AVENTA y el comprador.
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
              Recordar ciertos estados de la interfaz (por ejemplo, onboarding mostrado o
              banners que el usuario haya cerrado).
            </li>
            <li>
              Medir el uso interno de la plataforma (por ejemplo, vistas de ofertas y
              clics outbound), a través de los eventos almacenados en la propia base de
              datos.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            En el momento de redactar esta política, AVENTA no utiliza herramientas externas
            de analítica o publicidad basadas en cookies de terceros. En caso de incorporarlas
            en el futuro, se actualizará este documento para informar de forma clara sobre
            dichas tecnologías y, cuando sea necesario, se recabará el consentimiento
            correspondiente.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Servicios de terceros</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para operar la plataforma, AVENTA se apoya en proveedores externos que tratan
            datos por cuenta del responsable:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Supabase:</span> proveedor de base de datos y
              servicios de autenticación (incluido login con Google y almacenamiento de
              perfiles, ofertas, votos, comentarios y eventos).
            </li>
            <li>
              <span className="font-medium">Vercel:</span> proveedor de hosting y despliegue
              de la aplicación web (Next.js).
            </li>
            <li>
              <span className="font-medium">Upstash Redis:</span> proveedor de almacenamiento
              clave-valor utilizado para aplicar limitación de tasa (rate limiting) y proteger
              la plataforma frente a abuso o ataques.
            </li>
            <li>
              <span className="font-medium">Proveedores de almacenamiento de imágenes y
              contenido estático:</span> cuando corresponda, para alojar imágenes asociadas a
              ofertas u otros recursos.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Estos proveedores tratan los datos según las instrucciones de AVENTA y conforme
            a sus propios términos de servicio y políticas de privacidad. Pueden realizar
            transferencias internacionales de datos, principalmente hacia Estados Unidos u
            otros países donde tengan su infraestructura.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">7. Seguridad y rate limiting</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA implementa medidas técnicas y organizativas razonables para proteger los
            datos personales contra accesos no autorizados, pérdida, destrucción o alteración.
            Entre otras:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Uso de mecanismos de seguridad provistos por Supabase, como políticas de seguridad
              a nivel de filas (RLS) y autenticación segura.
            </li>
            <li>
              Limitación de tasa (rate limiting) a través de Redis/Upstash para reducir el
              impacto de ataques automatizados, abuso de APIs o comportamiento malicioso.
            </li>
            <li>
              Registro de ciertos eventos y logs de seguridad para investigar incidentes y
              aplicar acciones de moderación.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Ningún sistema es totalmente invulnerable. Aunque se busca proteger la
            información, no es posible garantizar seguridad absoluta frente a todos los
            escenarios de ataque.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            8. Retención de datos y eliminación de cuentas
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Conservamos los datos personales mientras la cuenta de usuario esté activa y
            mientras sea necesario para las finalidades descritas en esta Política.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              El usuario puede solicitar la eliminación de su cuenta siguiendo los mecanismos
              disponibles en la plataforma o contactando al correo de soporte indicado.
            </li>
            <li>
              Tras la eliminación de la cuenta, ciertos datos pueden mantenerse bloqueados
              durante un tiempo razonable para cumplir obligaciones legales, resolver
              disputas, prevenir fraude o hacer valer derechos de AVENTA.
            </li>
            <li>
              Parte del contenido que el usuario haya hecho público (por ejemplo, ofertas o
              comentarios) puede permanecer de forma anonimizada o agregada cuando ello sea
              técnicamente razonable y legalmente permitido.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">9. Derechos de los usuarios (ARCO)</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Las personas titulares de datos personales pueden ejercer, en los términos de la
            legislación aplicable, los derechos de Acceso, Rectificación, Cancelación y
            Oposición (derechos ARCO).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <span className="font-medium">Acceso:</span> conocer qué datos personales se
              tienen y cómo se tratan.
            </li>
            <li>
              <span className="font-medium">Rectificación:</span> solicitar la corrección de
              datos inexactos o incompletos.
            </li>
            <li>
              <span className="font-medium">Cancelación:</span> solicitar la eliminación de
              datos cuando consideren que no se requieren para alguna de las finalidades
              indicadas o cuando haya concluido la relación con la plataforma.
            </li>
            <li>
              <span className="font-medium">Oposición:</span> oponerse al tratamiento de datos
              para finalidades específicas, en los casos en que la ley lo permita.
            </li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para ejercer estos derechos, el usuario deberá enviar una solicitud al correo de
            contacto indicado en la sección 1, incluyendo al menos: nombre completo, medio de
            contacto para respuesta, descripción clara del derecho que desea ejercer y, en su
            caso, documentación que acredite su identidad o representación.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA procurará responder a las solicitudes en un plazo máximo de 20 días
            hábiles desde su recepción, en línea con los plazos de referencia de la
            legislación mexicana aplicable. En caso de no ser procedente la solicitud se
            informarán los motivos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">10. Transferencias de datos</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA no vende datos personales a terceros. Las transferencias que se realizan
            se limitan a:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Proveedores que actúan como encargados del tratamiento (por ejemplo, Supabase,
              Vercel, Upstash y proveedores de almacenamiento), únicamente para prestar los
              servicios de infraestructura necesarios.
            </li>
            <li>
              Autoridades competentes cuando así lo exija una norma aplicable o una orden de
              autoridad debidamente fundada.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">11. Cambios a esta Política</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA puede actualizar esta Política de Privacidad en cualquier momento para
            reflejar cambios en la plataforma, en los tratamientos de datos o en la
            normativa aplicable.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Cuando se realicen cambios relevantes, se procurará notificarlo a los usuarios
            mediante avisos visibles en la plataforma o por los medios de contacto
            disponibles. La versión vigente estará siempre accesible en{' '}
            <span className="font-medium">https://aventaofertas.com/privacy</span>.
          </p>
        </section>
      </div>
    </main>
  );
}

