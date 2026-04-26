# OPTIONAL / LEGACY: generates PowerShell copies of hooks for host-only use.
# Canonical hooks for this kit are scripts/hooks/*.sh, invoked via
#   node .cursor/hooks/run-hook.cjs scripts/hooks/<name>.sh
# (see .cursor/hooks.json) — avoids Windows console pop-ups and keeps one bash source.
#
# Run from repo root:  powershell -File .\win-install-cursor-hooks.ps1

$ErrorActionPreference = 'Stop'
$Base = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$HooksDir = Join-Path $Base 'scripts\hooks'
New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null

# -- 1. Block dangerous commands ----------------------------------------------
Set-Content -LiteralPath (Join-Path $HooksDir 'block-dangerous.ps1') -Encoding utf8 -Value @'
param()
$jsonText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($jsonText)) { exit 0 }
try { $o = $jsonText | ConvertFrom-Json -Depth 20 } catch { exit 0 }
$cmd = ''
if ($null -ne $o.tool_input -and $o.tool_input.PSObject.Properties['command']) {
  $cmd = [string]$o.tool_input.command
}
$pattern = 'rm\s+-rf\s+/|git push\s+.*--force.*\smain|git push\s+.*-f.*\smain|\(\)\{:\|:&\};:'
if ($cmd -and [regex]::IsMatch($cmd, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
  $reason = "Blocked destructive command: $cmd"
  [pscustomobject]@{
    hookSpecificOutput = [pscustomobject]@{
      hookEventName              = 'PreToolUse'
      permissionDecision         = 'deny'
      permissionDecisionReason   = $reason
    }
  } | ConvertTo-Json -Compress -Depth 6
}
exit 0
'@

# -- 2. Enforce plan-mode -----------------------------------------------------
Set-Content -LiteralPath (Join-Path $HooksDir 'enforce-plan-mode.ps1') -Encoding utf8 -Value @'
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
'@

# -- 3. Enforce tokens -------------------------------------------------------
Set-Content -LiteralPath (Join-Path $HooksDir 'enforce-tokens.ps1') -Encoding utf8 -Value @'
param()
$jsonText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($jsonText)) { exit 0 }
try { $o = $jsonText | ConvertFrom-Json -Depth 20 } catch { exit 0 }

$file = ''
$content = ''
if ($null -ne $o.tool_input) {
  $ti = $o.tool_input
  if ($ti.PSObject.Properties['file_path'] -and $ti.file_path) { $file = [string]$ti.file_path }
  elseif ($ti.PSObject.Properties['path'] -and $ti.path) { $file = [string]$ti.path }
  if ($ti.PSObject.Properties['content'] -and $ti.content) { $content = [string]$ti.content }
  elseif ($ti.PSObject.Properties['new_string'] -and $ti.new_string) { $content = [string]$ti.new_string }
}
if (-not $file) { exit 0 }

$norm = $file -replace '\\', '/'
if ($norm -match '^(tokens/|generated/)' -or $norm -match '/(tokens|generated)/' -or
    $norm -match '/theme' -or $norm -match '(^|/)tailwind\.config' -or
    $norm -match '\.(test|spec)\.') { exit 0 }

$inComponent = $false
if ($norm -match '^(components/|app/)' -or $norm -match '/(components|app)/' -or
    $norm -match '^src/components/' -or $norm -match '^src/app/') { $inComponent = $true }
if (-not $inComponent) { exit 0 }

if (-not $content) { exit 0 }
$tokPat = '#[0-9a-fA-F]{3,8}\b|rgba?\(|\b[0-9]+px\b'
if ([regex]::IsMatch($content, $tokPat)) {
  $reason = 'Hex/rgb/pixel literals forbidden in component code. Use semantic tokens from tokens/semantic/.'
  [pscustomobject]@{
    hookSpecificOutput = [pscustomobject]@{
      hookEventName              = 'PreToolUse'
      permissionDecision         = 'deny'
      permissionDecisionReason   = $reason
    }
  } | ConvertTo-Json -Compress -Depth 6
}
exit 0
'@

# -- 4. vibecop + lint + format ---------------------------------------------
Set-Content -LiteralPath (Join-Path $HooksDir 'vibecop-lint.ps1') -Encoding utf8 -Value @'
param()
$jsonText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($jsonText)) { exit 0 }
try { $o = $jsonText | ConvertFrom-Json -Depth 20 } catch { exit 0 }

$file = ''
if ($null -ne $o.tool_input) {
  $ti = $o.tool_input
  if ($ti.PSObject.Properties['file_path'] -and $ti.file_path) { $file = [string]$ti.file_path }
  elseif ($ti.PSObject.Properties['path'] -and $ti.path) { $file = [string]$ti.path }
}
if (-not $file -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { exit 0 }

$ext = [System.IO.Path]::GetExtension($file).TrimStart('.').ToLowerInvariant()

$vibecop = Get-Command vibecop -ErrorAction SilentlyContinue
if ($vibecop) {
  try { & vibecop check $file 2>&1 | Select-Object -First 20 | ForEach-Object { $_.ToString() } } catch { }
}

$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
$npxExe = if ($npx) { $npx.Source } else { $null }

switch ($ext) {
  { $_ -in 'js', 'jsx', 'ts', 'tsx', 'json', 'css', 'md' } {
    if ($npxExe) {
      & $npxExe prettier --write $file 2>$null
      & $npxExe eslint --fix $file 2>$null
    }
  }
  'py' {
    $ruff = Get-Command ruff -ErrorAction SilentlyContinue
    if ($ruff) {
      & ruff check --fix $file 2>$null
      & ruff format $file 2>$null
    }
  }
  'go' {
    $gofmt = Get-Command gofmt -ErrorAction SilentlyContinue
    if ($gofmt) { & gofmt -w $file 2>$null }
  }
  'rs' {
    $rustfmt = Get-Command rustfmt -ErrorAction SilentlyContinue
    if ($rustfmt) { & rustfmt $file 2>$null }
  }
}
exit 0
'@

# -- 5. Verify completion promise -------------------------------------------
Set-Content -LiteralPath (Join-Path $HooksDir 'verify-completion-promise.ps1') -Encoding utf8 -Value @'
param()
$jsonText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($jsonText)) { exit 0 }
try { $o = $jsonText | ConvertFrom-Json -Depth 20 } catch { exit 0 }

$loop = 0
if ($o.PSObject.Properties['loop_count'] -and $null -ne $o.loop_count) {
  [int]$loop = $o.loop_count
}
$max = 30
if ($loop -ge $max) { Write-Output '{}'; exit 0 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repoRoot
try {
  $branch = ''
  try { $branch = (& git branch --show-current 2>$null | Out-String).Trim() } catch { }
  $storyId = ''
  if ($branch) {
    $m = [regex]::Match($branch, '[A-Z]+-\d+')
    if ($m.Success) { $storyId = $m.Value }
  }
  if (-not $storyId) { Write-Output '{}'; exit 0 }

  $targetsFile = Join-Path $repoRoot (Join-Path 'docs' (Join-Path 'tests' "$storyId-targets.txt"))
  $scratch = Join-Path $repoRoot (Join-Path '.cursor' 'scratchpad.md')

  $hasComplete = $false
  if (Test-Path -LiteralPath $scratch) {
    $hasComplete = Select-String -LiteralPath $scratch -Pattern 'STORY_COMPLETE' -Quiet
  }
  if (-not $hasComplete) {
    $msg = "Iteration $($loop + 1)/$max. Targeted tests from $targetsFile must all pass. Emit <promise>STORY_COMPLETE</promise> only when every one is green."
    [pscustomobject]@{ followup_message = $msg } | ConvertTo-Json -Compress -Depth 4
    exit 0
  }

  $ran = $false
  $ok = $false
  if (Test-Path -LiteralPath $targetsFile) {
    $psRunner = Join-Path $repoRoot (Join-Path 'scripts' 'run-targeted-tests.ps1')
    $shRunner = Join-Path $repoRoot (Join-Path 'scripts' 'run-targeted-tests.sh')
    if (Test-Path -LiteralPath $psRunner) {
      $ran = $true
      $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
      if ($pwsh) { & pwsh -NoProfile -File $psRunner $targetsFile }
      else { & powershell.exe -NoProfile -File $psRunner $targetsFile }
      if ($LASTEXITCODE -eq 0) { $ok = $true }
    }
    elseif (Test-Path -LiteralPath $shRunner) {
      $pf86 = "${env:ProgramFiles(x86)}\Git\bin\bash.exe"
      $gitBash = @(
        (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
        $pf86
      ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
      if ($gitBash) {
        $ran = $true
        & $gitBash -lc "cd `"$($repoRoot -replace '"','\"')`" && ./scripts/run-targeted-tests.sh `"$targetsFile`""
        if ($LASTEXITCODE -eq 0) { $ok = $true }
      }
    }
    if ($ran -and $ok) { Write-Output '{}'; exit 0 }
    if ($ran -and -not $ok) {
      $msg = "Iteration $($loop + 1)/$max. Targeted tests from $targetsFile must all pass. Emit <promise>STORY_COMPLETE</promise> only when every one is green."
      [pscustomobject]@{ followup_message = $msg } | ConvertTo-Json -Compress -Depth 4
      exit 0
    }
  }

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    & pnpm test --run 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Output '{}'; exit 0 }
  }

  $msg = "Iteration $($loop + 1)/$max. Targeted tests from $targetsFile must all pass. Emit <promise>STORY_COMPLETE</promise> only when every one is green."
  [pscustomobject]@{ followup_message = $msg } | ConvertTo-Json -Compress -Depth 4
}
finally {
  Pop-Location
}
exit 0
'@

# -- 6. Diary append ---------------------------------------------------------
Set-Content -LiteralPath (Join-Path $HooksDir 'diary-append.ps1') -Encoding utf8 -Value @'
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
    "# Diary — $today"
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
'@

Write-Host "Wrote PowerShell hooks to: $HooksDir"
Get-ChildItem -LiteralPath $HooksDir -Filter '*.ps1' | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host ""
Write-Host "Wire hooks.json to PowerShell 7+ or Windows PowerShell, e.g.:"
Write-Host '  pwsh -NoProfile -ExecutionPolicy Bypass -File "${workspaceFolder}/scripts/hooks/block-dangerous.ps1"'
Write-Host '  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${workspaceFolder}/scripts/hooks/block-dangerous.ps1"'
