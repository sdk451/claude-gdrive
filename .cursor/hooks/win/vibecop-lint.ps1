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
