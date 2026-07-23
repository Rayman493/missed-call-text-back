$ErrorActionPreference = 'Stop'
$path = "src/components/calendar/EventDetailsModal.tsx"
$content = Get-Content -Raw -Encoding UTF8 $path

# Replace transcript error mapping to treat null/missing status as processing
$old = "setTranscriptError(j?.status === 'pending' ? 'Processing… Please try again later.' : 'Transcript unavailable.')"
$new = @"
const stat = (j && typeof j.status === 'string') ? j.status : null
if (stat === 'pending' || stat == null) {
  setTranscriptError('Processing… Please try again later.')
} else {
  setTranscriptError('Transcript unavailable.')
}
"@
$content = $content -replace [regex]::Escape($old), $new.Trim()

# Insert local status update after successful retry, before toast
$pattern = "(?m)^(\s*)onShowToast\?\('Processing started\. Refresh to see updates\.', 'info'\)"
$replacement = @"
`$1if (j && typeof j.status === 'string') {
`$1  setTranscriptStatus((j.status === 'available' || j.status === 'processed' || j.status === 'pending' || j.status === 'permission_required' || j.status === 'failed') ? j.status : null)
`$1  setTranscriptError(null)
`$1}
`$1onShowToast?('Processing started. Refresh to see updates.', 'info')
"@
$content = [regex]::Replace($content, $pattern, $replacement)

Set-Content -Value $content -Encoding UTF8 $path
Write-Output "Patched"
