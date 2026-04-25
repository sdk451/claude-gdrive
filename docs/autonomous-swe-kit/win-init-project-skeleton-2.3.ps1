# Docs tree
New-Item -ItemType Directory -Force -Path @(
  'docs\_seed', 'docs\designs', 'docs\tests', 'docs\patterns', 'docs\diary'
) | Out-Null

$docsMd = @(
  'brief', 'prd', 'architecture', 'tech-stack', 'ux', 'ux-principles',
  'constitution', 'backlog', 'design-system', 'test-strategy',
  'environments', 'observability'
)
foreach ($name in $docsMd) {
  New-Item -ItemType File -Force -Path "docs\$name.md" | Out-Null
}

# Agent and rules trees
New-Item -ItemType Directory -Force -Path @(
  '.claude\agents',
  '.cursor\rules', '.cursor\hooks', '.cursor\commands',
  '.cline\workflows',
  '.github\instructions', '.github\workflows'
) | Out-Null

New-Item -ItemType File -Force -Path 'AGENTS.md' | Out-Null

# Design system skeleton
New-Item -ItemType Directory -Force -Path @(
  'tokens\core', 'tokens\semantic', 'tokens\themes',
  'components\ui', 'components\primitives', 'components\blocks',
  'tests\unit', 'tests\api', 'tests\component', 'tests\e2e', 'tests\visual', 'tests\ux-flow',
  'scripts\hooks'
) | Out-Null

# Memory local index — gitignored
@(
  '.mempalace/'
  '.mcp-memory/'
  '.cursor/rules/30-personal.mdc'
) | Add-Content -Path .gitignore

git add -A
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git commit -m "chore: initial project skeleton"