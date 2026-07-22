import { getGoogleAccessToken } from './token'

// Encode a resource path by encoding individual segments, preserving slashes
export function encodePathPreservingSlashes(resourceName: string): string {
  return String(resourceName || '')
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
}

export class GoogleMeetClientImpl {
  private businessId: string
  constructor(businessId: string) {
    this.businessId = businessId
  }

  async hasMeetReadScope(): Promise<boolean> {
    const { scope } = await getGoogleAccessToken(this.businessId)
    const scopes = (scope || '').split(/[\s,]+/)
    return scopes.includes('https://www.googleapis.com/auth/meetings.space.readonly')
  }

  private async authHeaders() {
    const { accessToken } = await getGoogleAccessToken(this.businessId)
    return { Authorization: `Bearer ${accessToken}` }
  }

  async resolveSpaceNameFromMeetingCode(meetingCode: string): Promise<string | null> {
    const headers = await this.authHeaders()
    const res = await fetch(`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetingCode)}`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.name === 'string' ? data.name : null
  }

  async listConferenceRecordsBySpace(spaceName: string, opts: { start?: string; end?: string }): Promise<Array<{ name: string; startTime?: string; endTime?: string }>> {
    const headers = await this.authHeaders()
    const filters: string[] = []
    if (spaceName) filters.push(`space.name = \"${spaceName}\"`)
    if (opts.start && opts.end) filters.push(`start_time>=\"${opts.start}\" AND start_time<=\"${opts.end}\"`)
    const filter = filters.join(' AND ')
    const out: Array<{ name: string; startTime?: string; endTime?: string }> = []
    let pageToken: string | undefined
    do {
      const url = new URL('https://meet.googleapis.com/v2/conferenceRecords')
      if (filter) url.searchParams.set('filter', filter)
      url.searchParams.set('pageSize', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await fetch(url.toString(), { headers })
      console.log('[MEET DIAG] api.conferenceRecords.status=%d pageToken=%s', res.status, pageToken || 'none')
      if (!res.ok) break
      const data = await res.json()
      const list = Array.isArray(data?.conferenceRecords) ? data.conferenceRecords : []
      for (const cr of list) out.push({ name: cr?.name, startTime: cr?.startTime, endTime: cr?.endTime })
      pageToken = data?.nextPageToken || undefined
    } while (pageToken)
    console.log('[MEET DIAG] api.conferenceRecords.total=%d', out.length)
    return out
  }

  async listTranscripts(conferenceRecordName: string): Promise<Array<{ name: string; state?: string; startTime?: string; endTime?: string }>> {
    const headers = await this.authHeaders()
    const out: Array<{ name: string; state?: string; startTime?: string; endTime?: string }> = []
    let pageToken: string | undefined
    do {
      const path = encodePathPreservingSlashes(conferenceRecordName)
      const url = new URL(`https://meet.googleapis.com/v2/${path}/transcripts`)
      url.searchParams.set('pageSize', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      console.log('[MEET DIAG] api.transcripts.requestUrl=%s', url.toString())
      const res = await fetch(url.toString(), { headers })
      console.log('[MEET DIAG] api.transcripts.status=%d pageToken=%s', res.status, pageToken || 'none')
      if (!res.ok) {
        try {
          const err = await res.json().catch(() => null)
          const ge = err?.error
          console.log('[MEET DIAG] api.transcripts.error code=%s status=%s message=%s', ge?.code || 'n/a', ge?.status || 'n/a', ge?.message || 'n/a')
        } catch {}
        break
      }
      const data = await res.json()
      const list = Array.isArray(data?.transcripts) ? data.transcripts : []
      for (const t of list) out.push({ name: t?.name, state: t?.state, startTime: t?.startTime, endTime: t?.endTime })
      pageToken = data?.nextPageToken || undefined
    } while (pageToken)
    console.log('[MEET DIAG] api.transcripts.total=%d', out.length)
    return out
  }

  async listTranscriptEntries(transcriptName: string, pageSize = 100, pageToken?: string): Promise<{ entries: Array<{ startTime?: string; endTime?: string; text?: string; participant?: { displayName?: string } }>; nextPageToken?: string | null }>{
    const headers = await this.authHeaders()
    const path = encodePathPreservingSlashes(transcriptName)
    const url = new URL(`https://meet.googleapis.com/v2/${path}/entries`)
    url.searchParams.set('pageSize', String(Math.min(100, Math.max(1, pageSize))))
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    console.log('[MEET DIAG] api.entries.requestUrl=%s', url.toString())
    const res = await fetch(url.toString(), { headers })
    console.log('[MEET DIAG] api.entries.status=%d pageToken=%s', res.status, pageToken || 'none')
    if (!res.ok) {
      try {
        const err = await res.json().catch(() => null)
        const ge = err?.error
        console.log('[MEET DIAG] api.entries.error code=%s status=%s message=%s', ge?.code || 'n/a', ge?.status || 'n/a', ge?.message || 'n/a')
      } catch {}
      return { entries: [], nextPageToken: null }
    }
    const data = await res.json()
    const entries = Array.isArray(data?.transcriptEntries) ? data.transcriptEntries : []
    console.log('[MEET DIAG] api.entries.count=%d nextToken=%s', entries.length, data?.nextPageToken || 'none')
    return { entries, nextPageToken: data?.nextPageToken || null }
  }
}
