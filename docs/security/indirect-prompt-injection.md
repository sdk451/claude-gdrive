# Indirect prompt injection and Drive-backed MCP tools

## Threat model

**Indirect prompt injection** is when **untrusted content** (for example text inside a Google Doc, a comment, or a file name returned from Drive) is shaped to **manipulate the model** into taking **harmful actions** through connected tools: creating or overwriting files, moving data, or widening sharing in ways the user did not intend.

This connector treats **all Drive content and metadata as untrusted input** until the human has clearly approved a specific action. That aligns with Google’s guidance for Drive-backed MCP surfaces ([Configure the Drive MCP server](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server)) and with **`docs/prd.md` §8**.

## Mitigations we implement

### 1. Tool annotations (`tools/list`)

Per the project **constitution** (principle 5), mutating tools advertise **`destructiveHint: true`** so MCP hosts can require **explicit user confirmation** before invocation:

| Tool          | `destructiveHint` | Rationale                                     |
| ------------- | ----------------- | --------------------------------------------- |
| `create_file` | `true`            | Creates or uploads new user-visible state.    |
| `update_file` | `true`            | Renames, retargets MIME, or replaces bytes.   |
| `move_file`   | `true`            | Changes parentage / exposure via folder tree. |
| `share_file`  | `true`            | Grants or revokes ACLs; high blast radius.    |

Read-oriented tools (for example `search_files`, `read_file_content`) **must not** set `destructiveHint: true`. **`list_folder`** additionally sets **`readOnlyHint: true`**.

### 2. Least-privilege OAuth

Default scope is **`drive.file`** (per constitution and `docs/architecture.md`): the connector only sees files the app or user opened through the connector where possible, shrinking what untrusted content can reference.

### 3. Operator practices

- **Review tool calls** in client UIs that show pending confirmations for `destructiveHint` tools.
- **Monitor** structured logs (`docs/observability.md`) for unusual spikes in mutating tool usage.
- **Educate end users** not to paste untrusted Drive links into trusted workflows without inspection.

## Related docs

- `docs/architecture.md` — **Security model**
- `docs/prd.md` §8 — **Risks and mitigations**
- `docs/constitution.md` — **Principle 5** (untrusted Drive input + annotations)
