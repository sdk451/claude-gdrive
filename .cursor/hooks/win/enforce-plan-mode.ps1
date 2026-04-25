param()
$jsonText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($jsonText)) { exit 0 }
try { $o = $jsonText | ConvertFrom-Json -Depth 20 } catch { exit 0 }

$branch = ''
try {
  $branch = (& git branch --show-current 2>$null) | Out-String
  $branch = $branch.Trim()
} catch { $branch = '' }
if (-not $branch) { exit 0 }

$m = [regex]::Match($branch, '[A-Z]+-\d+')
if (-not $m.Success) { exit 0 }
$storyId = $m.Value

$file = ''
if ($null -ne $o.tool_input) {
  $ti = $o.tool_input
  if ($ti.PSObject.Properties['file_path'] -and $ti.file_path) { $file = [string]$ti.file_path }
  elseif ($ti.PSObject.Properties['path'] -and $ti.path) { $file = [string]$ti.path }
}
if (-not $file) { exit 0 }

$norm = $file -replace '\\', '/'
if ($norm -match '^(docs/|tests/)' -or $norm -match '/(docs|tests)/') { exit 0 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$design = Join-Path $repoRoot (Join-Path 'docs' (Join-Path 'designs' "$storyId.md"))
if (-not (Test-Path -LiteralPath $design)) {
  $reason = "No docs/designs/$storyId.md exists. Run the Planner agent first."
  [pscustomobject]@{
    hookSpecificOutput = [pscustomobject]@{
      hookEventName              = 'PreToolUse'
      permissionDecision         = 'deny'
      permissionDecisionReason   = $reason
    }
  } | ConvertTo-Json -Compress -Depth 6
}
exit 0
