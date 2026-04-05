import { useEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function thresholdStatus(value, greenMax, amberMax) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'amber'
  const n = Number(value)
  if (n <= greenMax) return 'green'
  if (n <= amberMax) return 'amber'
  return 'red'
}

function thresholdMinStatus(value, redMin, amberMin) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'amber'
  const n = Number(value)
  if (n < redMin) return 'red'
  if (n < amberMin) return 'amber'
  return 'green'
}

function booleanStatus(value) {
  if (value === null || value === undefined) return 'amber'
  return value ? 'green' : 'red'
}

function toStatusFromPosture(posture) {
  if (posture === 'critical') return 'red'
  if (posture === 'warning' || posture === 'partial') return 'amber'
  return 'green'
}

function Attestation() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await clientsApi.getAttestationSummary()
        if (active) setData(response.data)
      } catch (err) {
        if (active) setError(err?.response?.data?.detail || err?.message || 'Failed to load attestation')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const sources = data?.sources || {}
  const sourceSummary = sources?.summary || {}
  const sidecarSummary = data?.sidecars?.summary || {}
  const sidecars = data?.sidecars?.services || {}
  const evidence = data?.evidence || {}
  const security = data?.security || {}
  const remediation = security?.remediation || {}
  const actionable = remediation?.actionable || {}
  const runtime = data?.runtime || {}
  const wireguard = data?.wireguard || {}
  const auth = data?.auth || {}
  const cloud = data?.cloud || {}

  const sourceCoverage = sourceSummary?.total > 0 ? (sourceSummary.available / sourceSummary.total) * 100 : null
  const sidecarCoverage = sidecarSummary?.total > 0 ? (sidecarSummary.healthy / sidecarSummary.total) * 100 : null
  const wgCoverage = Number(wireguard?.configured_peers || 0) > 0
    ? (Number(wireguard?.connected_peers || 0) / Number(wireguard?.configured_peers || 1)) * 100
    : null

  const coreCards = useMemo(() => {
    const cards = [{
      key: 'source-coverage',
      title: 'SOURCE COVERAGE',
      value: `${sourceSummary?.available || 0}/${sourceSummary?.total || 0}`,
      hint: `coverage ${formatNumber(sourceCoverage, 0)}%`,
      status: thresholdMinStatus(sourceCoverage, 80, 100),
      progressPercent: sourceCoverage,
      importance: 'Attestation is only as strong as evidence-source availability.',
    },
    {
      key: 'sidecar-health',
      title: 'SIDECAR HEALTH',
      value: `${sidecarSummary?.healthy || 0}/${sidecarSummary?.total || 0}`,
      hint: `${sidecarSummary?.percent_healthy || 0}% healthy`,
      status: thresholdMinStatus(sidecarCoverage, 80, 100),
      progressPercent: sidecarCoverage,
      importance: 'Sensor health determines trust confidence in runtime claims.',
    },
    {
      key: 'artifact-coverage',
      title: 'ARTIFACT COVERAGE',
      value: `${evidence?.combined?.available || 0}/${evidence?.combined?.total || 0}`,
      hint: `${evidence?.combined?.percent || 0}% complete`,
      status: thresholdMinStatus(evidence?.combined?.percent, 80, 100),
      progressPercent: evidence?.combined?.percent,
      importance: 'SBOM and scan completeness anchors supply-chain assurance.',
    },
    {
      key: 'critical-findings',
      title: 'ACTIONABLE CRITICAL',
      value: formatNumber(actionable?.critical, 0),
      hint: `high ${formatNumber(actionable?.high, 0)} | total ${formatNumber(actionable?.total, 0)}`,
      status: thresholdStatus(actionable?.critical, 0, 1),
      importance: 'Critical unresolved findings indicate immediate exposure risk.',
    },
    {
      key: 'link-state',
      title: 'MONITOR LINK STATE',
      value: wireguard?.is_up ? 'UP' : 'DOWN',
      hint: `${formatNumber(wireguard?.connected_peers, 0)}/${formatNumber(wireguard?.configured_peers, 0)} peers`,
      status: booleanStatus(wireguard?.is_up),
      importance: 'Secure link availability is a foundational mission gate.',
    },
    {
      key: 'connection-readiness',
      title: 'CONNECTION READINESS',
      value: wgCoverage === null ? '-' : `${wgCoverage.toFixed(0)}%`,
      hint: `rx ${formatNumber(wireguard?.transfer_rx, 0)} | tx ${formatNumber(wireguard?.transfer_tx, 0)}`,
      status: thresholdMinStatus(wgCoverage, 50, 100),
      progressPercent: wgCoverage,
      importance: 'Quantifies live secure-session participation versus configured roster.',
    },
    {
      key: 'auth-protection',
      title: 'AUTH LOCKOUT WINDOW',
      value: `${formatNumber(auth?.auth_fail_block_seconds, 0)}s`,
      hint: `${formatNumber(auth?.auth_fail_rate_limit_per_minute, 0)}/min fail threshold`,
      status: Number(auth?.auth_fail_block_seconds || 0) >= 120 ? 'green' : 'amber',
      importance: 'Brute-force resistance supports sustained secure operations.',
    },
    {
      key: 'runtime-uptime',
      title: 'API UPTIME',
      value: `${formatNumber((Number(runtime?.uptime_seconds || 0) / 3600), 1)}h`,
      hint: `${runtime?.platform || '-'} | py ${runtime?.python_version || '-'}`,
      status: thresholdMinStatus(runtime?.uptime_seconds, 600, 3600),
      importance: 'Runtime stability reduces incident churn and trust degradation.',
    },
    {
      key: 'host-capacity',
      title: 'HOST CAPACITY',
      value: `${formatNumber(runtime?.cpu_count, 0)} cores`,
      hint: `${formatNumber(runtime?.memory_total_mb, 0)} MB RAM`,
      status: Number(runtime?.cpu_count || 0) >= 2 ? 'green' : 'amber',
      importance: 'Capacity posture informs expected resilience under peak load.',
    },
    {
      key: 'cloud-provider',
      title: 'CLOUD CONTEXT',
      value: cloud?.provider || 'local',
      hint: `imdsv2 ${cloud?.imdsv2_required ? 'required' : 'unknown'}`,
      status: cloud?.provider === 'aws' ? (cloud?.imdsv2_required ? 'green' : 'amber') : 'green',
      importance: 'Cloud metadata hardening directly impacts identity exposure risk.',
    },
    {
      key: 'trivy-freshness',
      title: 'THREAT INTEL FRESHNESS',
      value: `${formatNumber(sidecars?.trivy_server?.db_age_hours, 1)}h`,
      hint: `next ${sidecars?.trivy_server?.db_next_update || '-'}`,
      status: thresholdStatus(sidecars?.trivy_server?.db_age_hours, 24, 72),
      importance: 'Vulnerability intelligence age affects remediation confidence.',
    },
  ]

    if (loading) {
      cards.unshift({
        key: 'state-loading',
        title: 'PAGE STATE',
        value: 'LOADING',
        hint: 'collecting attestation summary payload',
        status: 'amber',
        importance: 'Attestation probes and evidence are currently refreshing.',
      })
    }

    if (error) {
      cards.unshift({
        key: 'state-error',
        title: 'ATTESTATION FEED',
        value: 'DEGRADED',
        hint: error,
        status: 'red',
        importance: 'Attestation summary endpoint returned an error condition.',
      })
    }

    return cards
  }, [
    sourceSummary?.available,
    sourceSummary?.total,
    sourceCoverage,
    sidecarSummary?.healthy,
    sidecarSummary?.total,
    sidecarSummary?.percent_healthy,
    sidecarCoverage,
    evidence?.combined?.available,
    evidence?.combined?.total,
    evidence?.combined?.percent,
    actionable?.critical,
    actionable?.high,
    actionable?.total,
    wireguard?.is_up,
    wireguard?.connected_peers,
    wireguard?.configured_peers,
    wireguard?.transfer_rx,
    wireguard?.transfer_tx,
    wgCoverage,
    auth?.auth_fail_block_seconds,
    auth?.auth_fail_rate_limit_per_minute,
    runtime?.uptime_seconds,
    runtime?.platform,
    runtime?.python_version,
    runtime?.cpu_count,
    runtime?.memory_total_mb,
    cloud?.provider,
    cloud?.imdsv2_required,
    sidecars?.trivy_server?.db_age_hours,
    sidecars?.trivy_server?.db_next_update,
    error,
    loading,
  ])

  const remediationCards = useMemo(() => ([
    {
      key: 'rem-affected',
      title: 'AFFECTED FINDINGS',
      value: formatNumber(remediation?.status?.affected, 0),
      hint: 'still open in current reports',
      status: thresholdStatus(remediation?.status?.affected, 0, 10),
    },
    {
      key: 'rem-fixed',
      title: 'FIXED FINDINGS',
      value: formatNumber(remediation?.status?.fixed, 0),
      hint: 'resolved by version or patch updates',
      status: thresholdMinStatus(remediation?.status?.fixed, 1, 5),
    },
    {
      key: 'rem-other',
      title: 'OTHER FINDINGS',
      value: formatNumber(remediation?.status?.other, 0),
      hint: 'accepted / informational / unknown state',
      status: thresholdStatus(remediation?.status?.other, 5, 20),
    },
    {
      key: 'upgradeable-total',
      title: 'UPGRADEABLE',
      value: formatNumber(remediation?.upgradeable?.total, 0),
      hint: `high ${formatNumber(remediation?.upgradeable?.high, 0)} | critical ${formatNumber(remediation?.upgradeable?.critical, 0)}`,
      status: thresholdStatus(remediation?.upgradeable?.critical, 0, 1),
    },
    {
      key: 'patch-unpatched',
      title: 'PATCHABLE UNPATCHED',
      value: formatNumber(remediation?.patch_available_unpatched?.total, 0),
      hint: `high ${formatNumber(remediation?.patch_available_unpatched?.high, 0)} | critical ${formatNumber(remediation?.patch_available_unpatched?.critical, 0)}`,
      status: thresholdStatus(remediation?.patch_available_unpatched?.critical, 0, 1),
    },
    {
      key: 'no-patch',
      title: 'NO PATCH AVAILABLE',
      value: formatNumber(remediation?.no_patch_available?.total, 0),
      hint: `high ${formatNumber(remediation?.no_patch_available?.high, 0)} | critical ${formatNumber(remediation?.no_patch_available?.critical, 0)}`,
      status: thresholdStatus(remediation?.no_patch_available?.critical, 0, 1),
    },
  ]), [remediation])

  const sourceCards = useMemo(() => (sources?.probes || []).map((probe) => ({
    key: `probe-${probe.id}`,
    title: `SOURCE ${String(probe.id || '-').toUpperCase()}`,
    value: probe.available ? 'UP' : 'DOWN',
    hint: `${probe.category || '-'} | ${probe.mode || 'http'} | status ${probe.status_code || '-'}`,
    status: probe.available ? 'green' : 'red',
    importance: probe.error || probe.url,
    progressPercent: probe.available ? 100 : 0,
  })), [sources?.probes])

  const assetCards = useMemo(() => (security?.assets || []).map((asset) => ({
    key: `asset-${asset.id}`,
    title: `ASSET ${String(asset.name || asset.id || '-').toUpperCase()}`,
    value: `${formatNumber(asset.vulnerabilities, 0)} vulns`,
    hint: `critical ${formatNumber(asset.critical, 0)} | high ${formatNumber(asset.high, 0)} | sbom ${formatNumber(asset.sbom_components, 0)}`,
    status: toStatusFromPosture(asset.posture),
    importance: `scan ${asset.scan_present ? 'present' : 'missing'} | sbom ${asset.sbom_present ? 'present' : 'missing'}`,
  })), [security?.assets])

  const sidecarCards = useMemo(() => Object.entries(sidecars).map(([name, payload]) => {
    const value = payload?.available ? 'ONLINE' : 'OFFLINE'
    const keyMetric = payload?.status
      || payload?.version
      || payload?.up
      || payload?.num_backends
      || payload?.containers_running
      || payload?.go_goroutines
      || payload?.db_age_hours
      || '-'

    return {
      key: `sidecar-${name}`,
      title: `SIDECAR ${String(name).toUpperCase()}`,
      value,
      hint: `healthy ${payload?.healthy ? 'yes' : 'no'} | metric ${String(keyMetric)}`,
      status: payload?.healthy ? 'green' : payload?.available ? 'amber' : 'red',
      importance: payload?.available ? 'runtime sidecar telemetry available' : 'sidecar telemetry unavailable',
      progressPercent: payload?.healthy ? 100 : payload?.available ? 50 : 0,
    }
  }), [sidecars])

  return (
    <Box>
      <DenseGrid>
        <DenseSection title="Core Posture" subtitle={`assurance slab | generated ${data?.generated_at ? new Date(data.generated_at).toLocaleString() : '-'}`} colSpan={3} rowSpan={1}>
          <DenseCards>
            {coreCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Remediation Matrix" subtitle="patchability and actionability cards" colSpan={3} rowSpan={1}>
          <DenseCards>
            {remediationCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Source Probe Cards" subtitle="every attested source endpoint" colSpan={3} rowSpan={1}>
          <DenseCards>
            {sourceCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Asset Cards" subtitle="security asset posture cards" colSpan={3} rowSpan={1}>
          <DenseCards>
            {assetCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Sidecar Cards" subtitle="runtime health and key sidecar metrics" colSpan={3} rowSpan={1}>
          <DenseCards>
            {sidecarCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent}
              />
            ))}
          </DenseCards>
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Attestation
