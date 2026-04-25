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
