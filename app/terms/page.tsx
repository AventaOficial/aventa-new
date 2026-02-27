import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | AVENTA',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0 md:pl-28 bg-[#F5F5F7] dark:bg-[#030712] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-16 space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Última actualización: 27 de febrero de 2026
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
              La función principal de AVENTA es facilitar que la comunidad comparta y valore
              ofertas. No existe obligación de publicar ni de mantener disponible ninguna
              oferta concreta.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Registro y cuenta de usuario</h2>
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
              AVENTA se reserva el derecho de suspender o cancelar cuentas que incumplan
              estos Términos o que muestren actividad sospechosa o abusiva.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Contenido generado por usuarios</h2>
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
              no exclusiva, mundial, gratuita y revocable para mostrar dicho contenido dentro
              de la comunidad y en materiales relacionados con la promoción de la propia
              plataforma.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            4. Reemplazo de enlaces y afiliación
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para sostener la plataforma, AVENTA puede utilizar sistemas de afiliación y
            tracking de rendimiento de enlaces.
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
              la tienda externa. En algunos casos, incluso puede implicar precios o
              beneficios promocionales especiales.
            </li>
            <li>
              AVENTA puede recibir comisiones o compensaciones económicas por compras
              realizadas a través de dichos enlaces. El usuario acepta esta práctica como
              parte del modelo de negocio de la plataforma.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            5. Prohibición de enlaces afiliados propios y spam
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Para proteger la calidad de la comunidad y evitar abuso, el usuario se obliga a
            no utilizar AVENTA como plataforma de promoción afiliada propia o spam.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              No se permite publicar enlaces afiliados propios ni enlaces cuyo principal
              objetivo sea obtener beneficios económicos para el propio usuario sin
              autorización expresa de AVENTA.
            </li>
            <li>
              No se permite el envío masivo de contenido repetitivo, enlaces de baja calidad
              o publicidad encubierta.
            </li>
            <li>
              El incumplimiento de estas reglas puede derivar en eliminación de contenido,
              pérdida de reputación interna, suspensión temporal o definitiva de la cuenta.
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
            La plataforma puede asignar métricas internas de reputación a los usuarios, por
            ejemplo, conteos de ofertas aprobadas, rechazadas u otros indicadores de
            participación.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Esta reputación es una herramienta interna para moderación y ranking, y no
              constituye una certificación profesional, comercial ni financiera del usuario.
            </li>
            <li>
              AVENTA puede ajustar los criterios y algoritmos de reputación en cualquier
              momento sin obligación de publicar detalles técnicos exhaustivos.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            8. Programas de recompensas o compensación futura
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA puede, en el futuro, implementar programas de recompensas o participación
            económica ligados al impacto de las ofertas compartidas por los usuarios.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Cualquier programa de este tipo estará sujeto a términos y condiciones
            adicionales, criterios de elegibilidad y validaciones de seguridad. La mención de
            esta posibilidad no constituye una promesa de pago ni una obligación actual de
            AVENTA de remunerar a los usuarios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">9. Conductas prohibidas</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Sin limitar otras conductas que puedan considerarse abusivas, se consideran
            prohibidas las siguientes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Manipular votos de forma artificial (por ejemplo, mediante cuentas falsas).</li>
            <li>Crear múltiples cuentas para eludir suspensiones o distorsionar métricas.</li>
            <li>
              Automatizar el envío de ofertas, votos, comentarios o clics outbound sin
              autorización expresa.
            </li>
            <li>
              Realizar click fraud o cualquier otra práctica destinada a inflar
              artificialmente métricas de impacto.
            </li>
            <li>
              Intentar acceder de forma no autorizada a sistemas, bases de datos o cuentas de
              otros usuarios.
            </li>
            <li>
              Realizar ingeniería inversa, descompilar o intentar obtener el código fuente de
              sistemas de la plataforma, salvo en los casos permitidos por la ley aplicable.
            </li>
            <li>
              Publicar contenido ilegal, difamatorio, discriminatorio, violento, sexualmente
              explícito o que infrinja derechos de propiedad intelectual o de terceros.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">10. Limitación de responsabilidad</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            AVENTA no garantiza la exactitud, vigencia ni disponibilidad permanente de las
            ofertas publicadas por la comunidad.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Las decisiones de compra que los usuarios tomen basadas en ofertas vistas en
              la plataforma son responsabilidad exclusiva de cada usuario.
            </li>
            <li>
              AVENTA no responde por pérdidas económicas, daños indirectos, lucro cesante ni
              ningún otro perjuicio derivado de ofertas que resulten expiradas, erróneas,
              incompletas o no disponibles en la tienda externa.
            </li>
            <li>
              AVENTA no es parte de la relación contractual entre el usuario y la tienda
              externa. Cualquier reclamación relacionada con la compra (entrega, garantía,
              devoluciones, facturación, etc.) debe dirigirse al comercio correspondiente.
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
              Términos, que generen riesgo para la seguridad de la plataforma o que muestren
              patrones de abuso.
            </li>
            <li>
              Incluso tras la terminación de una cuenta, AVENTA puede conservar ciertos datos
              por un tiempo razonable para fines de seguridad, prevención de fraude,
              resolución de disputas o cumplimiento de obligaciones legales, en los términos
              descritos en la Política de Privacidad.
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
            Sin perjuicio de otros mecanismos amistosos de resolución de conflictos, las
            partes se someten a los tribunales competentes del lugar que resulte aplicable
            conforme a la ley mexicana, renunciando, en lo posible, a cualquier otro fuero
            que pudiera corresponderles por razón de su domicilio presente o futuro.
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
            Cuando los cambios sean relevantes, se procurará comunicarlo a los usuarios
            mediante avisos en la plataforma o por los medios de contacto disponibles. El
            uso continuado de la plataforma tras la publicación de cambios implica la
            aceptación de los nuevos términos.
          </p>
        </section>
      </div>
    </main>
  );
}

