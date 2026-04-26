# Google Drive search (`q`) for this connector

This project’s MCP tool **`search_files`** forwards your string to Google Drive **`files.list`** as the **`q`** query parameter. Getting `q` right is what makes search predictable.

## Canonical documentation

Use Google’s guide as the source of truth for operators and field names (Google updates details over time):

<https://developers.google.com/drive/api/guides/search-files>

## Minimal mental model

- **`q` is a single string** composed of one or more **clauses** combined with **`and`**, **`or`**, and **`not`** (case-sensitive keywords).
- **String values** use **single quotes**. If the value itself contains a single quote, **escape** it as **`\'`** inside the quoted string.
- **Field operators** include **`contains`**, **`=`**, **`!=`**, **`<`**, **`<=`**, **`>`**, **`>=`**, **`in`**, and more per Google’s doc.

## High-signal examples (illustrative)

Match a spreadsheet by MIME type:

```txt
mimeType = 'application/vnd.google-apps.spreadsheet'
```

Match a human-readable name substring:

```txt
name contains 'quarterly'
```

Combine clauses:

```txt
name contains 'report' and mimeType = 'application/vnd.google-apps.document'
```

Exclude trashed items (often what you want for “active” files):

```txt
name contains 'invoice' and trashed = false
```

## Relationship to other tools

- **`list_folder`** lists immediate children of a folder using a fixed parent query; you usually **do not** hand-craft the `'folderId' in parents` clause for that tool.
- **`search_files`** is the right tool when you need **full Drive query expressiveness** via **`q`**.

## Practical tips

- Prefer **narrow clauses** (`mimeType`, `name`, time fields) over huge `fullText` scans when you can.
- If results look “empty”, verify **shared drive** / **My Drive** context and whether files are **trashed** or in a **different account** than the OAuth session.
