param()
$jsonText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($jsonText)) { exit 0 }
try { $o = $jsonText | ConvertFrom-Json -Depth 20 } catch { exit 0 }

$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss\Z')
$month = (Get-Date).ToUniversalTime().ToString('yyyy-MM')
$today = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dir = Join-Path $repoRoot (Join-Path 'docs' (Join-Path 'diary' $month))
$diaryFile = Join-Path $dir "$today.md"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if (-not (Test-Path -LiteralPath $diaryFile)) {
  @(
    "# Diary â€” $today"
    ''
  ) | Set-Content -LiteralPath $diaryFile -Encoding utf8
}

$persona = $env:CLAUDE_AGENT_NAME
if (-not $persona) { $persona = $env:CURSOR_AGENT_NAME }
if (-not $persona) { $persona = $env:CLINE_AGENT_NAME }
if (-not $persona) { $persona = 'unknown' }

$tool = 'start'
if ($o.PSObject.Properties['tool_name'] -and $o.tool_name) { $tool = [string]$o.tool_name }
elseif ($o.PSObject.Properties['hook_event_name'] -and $o.hook_event_name) { $tool = [string]$o.hook_event_name }

$branch = '-'
try {
  $b = (& git branch --show-current 2>$null | Out-String).Trim()
  if ($b) { $branch = $b }
} catch { }

$story = ''
if ($branch -ne '-') {
  $m = [regex]::Match($branch, '[A-Z]+-\d+')
  if ($m.Success) { $story = $m.Value }
}

$hookEvent = ''
if ($o.PSObject.Properties['hook_event_name'] -and $o.hook_event_name) {
  $hookEvent = [string]$o.hook_event_name
}

$line = $null
switch ($hookEvent) {
  'SessionStart' {
    $line = "- $now | $persona | [start] branch=$branch story=$story"
  }
  'PostToolUse' {
    if ($tool -in 'Write', 'Edit', 'Bash') {
      $fp = ''
      if ($null -ne $o.tool_input) {
        $ti = $o.tool_input
        if ($ti.PSObject.Properties['file_path'] -and $ti.file_path) { $fp = [string]$ti.file_path }
        elseif ($ti.PSObject.Properties['path'] -and $ti.path) { $fp = [string]$ti.path }
      }
      $cmd = ''
      if ($null -ne $o.tool_input -and $o.tool_input.PSObject.Properties['command'] -and $o.tool_input.command) {
        $cmd = [string]$o.tool_input.command
      }
      if ($cmd.Length -gt 80) { $cmd = $cmd.Substring(0, 80) }
      $summary = if ($fp) { $fp } else { $cmd }
      $line = "- $now | $persona | $tool | $summary"
    }
  }
  'Stop' {
    $line = "- $now | $persona | [stop] branch=$branch"
  }
}

if ($line) { Add-Content -LiteralPath $diaryFile -Value $line -Encoding utf8 }
exit 0
