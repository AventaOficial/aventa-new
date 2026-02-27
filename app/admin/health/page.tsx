'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ALLOWED_EMAIL = 'jafetalonsovazquez@gmail.com'

type MetricRow = {
  date: string
  total_offers_created: number
  total_votes: number
  total_views: number
  total_outbound: number
  ctr: number | null
}

export default function HealthPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== ALLOWED_EMAIL) {
        router.push('/')
        setLoading(false)
        return
      }
      try {
        const { data } = await supabase
          .from('daily_system_metrics')
          .select('date, total_offers_created, total_votes, total_views, total_outbound, ctr')
          .order('date', { ascending: false })
          .limit(30)
        setMetrics((data ?? []) as MetricRow[])
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          System Health
        </h1>
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    total_offers_created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    total_votes
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    total_views
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    total_outbound
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    ctr
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {metrics.map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {row.date}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {row.total_offers_created}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {row.total_votes}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {row.total_views}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {row.total_outbound}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {row.ctr != null ? `${row.ctr.toFixed(2)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
