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
