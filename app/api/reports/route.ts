import { NextResponse } from 'next/server'
import { enforceRateLimitCustom } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'
import { evaluateAbusePolicy } from '@/lib/abuse/risk'
import { requireBearerCommunityUser } from '@/lib/server/requireCommunityUser'
import {
  OFFER_REPORT_TYPES,
  assessOfferReportText,
  offerReportRateIdentity,
  type OfferReportType,
} from '@/lib/reports/offerReportContract'
import { recordOfferReportMetric } from '@/lib/reports/reportMetrics'

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(request: Request) {
  recordOfferReportMetric('report_attempt')
  try {
    const authResult = await requireBearerCommunityUser(request)
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error, code: authResult.code ?? 'REPORT_UNAUTHORIZED' },
        { status: authResult.status },
      )
    }
    const { user, supabase } = authResult
    const reporterId = user.id

    const body = await request.json().catch(() => ({}))
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null
    const reportType =
      typeof body?.reportType === 'string' && OFFER_REPORT_TYPES.includes(body.reportType as OfferReportType)
        ? (body.reportType as OfferReportType)
        : null
    const rawComment = typeof body?.comment === 'string' ? body.comment : ''

    if (!offerId || !isValidUuid(offerId)) {
      recordOfferReportMetric('report_validation_failed')
      return fail(400, 'REPORT_OFFER_NOT_FOUND', 'La oferta no es válida.')
    }
    if (!reportType) {
      recordOfferReportMetric('report_validation_failed')
      return fail(400, 'REPORT_INVALID_REASON', 'Elige un motivo de reporte.')
    }
    const text = assessOfferReportText(rawComment)
    if (!text.ok) {
      recordOfferReportMetric('report_validation_failed')
      return fail(400, text.code, text.message)
    }

    const abuse = evaluateAbusePolicy({
      action: 'report',
      accountCreatedAt: user.created_at,
    })
    if (!abuse.allow) {
      return NextResponse.json({ error: abuse.message, code: abuse.code }, { status: 403 })
    }

    const { data: targetOffer } = await supabase
      .from('offers')
      .select('id, created_by')
      .eq('id', offerId)
      .maybeSingle()
    if (!targetOffer) {
      recordOfferReportMetric('report_validation_failed')
      return fail(404, 'REPORT_OFFER_NOT_FOUND', 'No encontramos esa oferta.')
    }

    const selfReport = evaluateAbusePolicy({
      action: 'report',
      isSelfTarget: (targetOffer as { created_by?: string } | null)?.created_by === reporterId,
    })
    if (!selfReport.allow) {
      return NextResponse.json({ error: selfReport.message, code: selfReport.code }, { status: 403 })
    }

    const { data: existing } = await supabase
      .from('offer_reports')
      .select('id')
      .eq('offer_id', offerId)
      .eq('reporter_id', reporterId)
      .maybeSingle()
    if (existing) {
      recordOfferReportMetric('report_duplicate')
      return fail(409, 'REPORT_DUPLICATE', 'Ya reportaste esta oferta.')
    }

    const rl = await enforceRateLimitCustom(offerReportRateIdentity(reporterId), 'reports')
    if (!rl.success) {
      if (rl.code === 'rate_limit_backend_unavailable') {
        recordOfferReportMetric('report_rate_limit_error')
        return fail(
          503,
          'REPORT_RATE_LIMIT_UNAVAILABLE',
          'No pudimos comprobar el límite de reportes. Intenta de nuevo en un momento.',
        )
      }
      recordOfferReportMetric('report_rate_limited')
      return fail(
        429,
        'REPORT_RATE_LIMITED',
        'Has alcanzado el límite temporal de reportes. Intenta nuevamente más tarde.',
      )
    }

    const { error } = await supabase.from('offer_reports').insert({
      offer_id: offerId,
      reporter_id: reporterId,
      report_type: reportType,
      comment: text.comment,
    })

    if (error) {
      console.error('[reports] insert failed:', error.message)
      return NextResponse.json({ error: 'Error al enviar el reporte' }, { status: 500 })
    }

    recordOfferReportMetric('report_accepted')

    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: reporterId,
      type: 'report_received',
      title: 'Reporte recibido',
      body: 'Recibimos tu reporte. Lo revisamos pronto.',
      link: null,
    })
    if (notifErr) console.error('[reports] notification insert failed:', notifErr.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reports] error:', e)
    return NextResponse.json({ error: 'Error al enviar el reporte' }, { status: 500 })
  }
}
