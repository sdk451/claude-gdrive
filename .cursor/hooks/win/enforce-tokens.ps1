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
