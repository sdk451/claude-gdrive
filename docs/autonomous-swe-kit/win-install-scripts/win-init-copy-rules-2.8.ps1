# Copilot variant: mirror Cursor rules into .github/instructions/
$base = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$inst = Join-Path $base '.github\instructions'
New-Item -ItemType Directory -Force -Path $inst | Out-Null

Copy-Item -LiteralPath (Join-Path $base '.cursor\rules\40-serena.mdc') `
  -Destination (Join-Path $inst '40-serena.instructions.md') -Force

Copy-Item -LiteralPath (Join-Path $base '.cursor\rules\41-memory.mdc') `
  -Destination (Join-Path $inst '41-memory.instructions.md') -Force

# Prepend Copilot front-matter (applyTo, etc.) — placeholder like bash `true`
foreach ($f in Get-ChildItem -LiteralPath $inst -Filter '*.instructions.md' -File) {
  # TODO: prepend YAML when you lock applyTo — see GitHub Copilot instructions docs
}