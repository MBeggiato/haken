# Haken

A keyboard-friendly, three-pane workspace for `todo.txt` files. Built with Svelte 5, strict TypeScript, Vite, Tailwind CSS and Node.js. User sign-in is provided by a Pocket ID OIDC server; task data remains in separate local files per account.

## Get started

Requires Node.js 22.12+ and npm. The dev and start scripts load `.env` from the project root when it exists; shell environment variables take precedence.

```sh
npm install
cp .env.example .env
# Edit .env with your Pocket ID details
npm run dev
```

Configure Pocket ID as described below, then open **http://127.0.0.1:3000** and choose **Sign in with Pocket ID**. The first account to sign in receives a copy of the existing root-level task files and notes, if present. Later accounts start with empty workspaces.

The first start creates empty `data/todo.txt`, `data/done.txt`, `data/inbox.txt` and a `data/notes/` directory. Existing files are never seeded or replaced. To try the example, **before starting with a fresh data directory**:

```sh
mkdir -p data/notes
cp -n examples/todo.txt data/todo.txt
cp -n examples/launch.md data/notes/launch.md
npm run dev
```

Build and run the production version:

```sh
npm run build
npm start
```

`npm start` serves the built frontend and API from the same Node process. Keep development dependencies installed: the backend is run with `tsx`. `NODE_ENV=production` selects production serving; the npm start script sets it on POSIX systems. On Windows, set the environment variable using your shell before running `npx tsx server/index.ts`.

## Configuration

Set these values in `.env` (copy `.env.example` to get started) or in the process environment. Keep `.env` private; it is ignored by Git.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POCKETID_ISSUER` | — | Pocket ID base URL, such as `https://id.example.com` |
| `POCKETID_CLIENT_ID` | — | OIDC client ID |
| `POCKETID_CLIENT_SECRET` | — | OIDC client secret |
| `POCKETID_REDIRECT_URI` | — | Exact callback URL, such as `https://tasks.example.com/auth/callback` |
| `POCKETID_ALLOWED_EMAILS` | All Pocket ID users | Optional comma-separated email allowlist |
| `DATA_DIR` | `./data` | Root containing isolated `users/<opaque-id>/` directories |
| `TODO_DIR`, `TODO_FILE`, `DONE_FILE`, `INBOX_FILE`, `NOTES_DIR` | Legacy paths | Existing single-user files copied to the first account at first login |
| `HOST` | `127.0.0.1` | Listening interface |
| `PORT` | `3000` | HTTP port |
| `COOKIE_SECURE` | Enabled in production | Set `false` only for local HTTP development |

In Pocket ID, register Haken as a confidential OIDC client and add the exact redirect URI. The first account to sign in gets the old workspace copied into `DATA_DIR/users/<opaque-id>/`; original files are retained. Subsequent accounts get separate task, notes, and image directories. Set `POCKETID_ALLOWED_EMAILS` to restrict which Pocket ID accounts may use Haken. Without it, any account that can authenticate to this Pocket ID instance can sign in. Use HTTPS in production. Theme, density, sort, metadata visibility, threshold visibility and saved searches persist separately in browser local storage.

## Features

- Lossless parsing/serialization: original raw lines, unknown tokens, blank lines and mixed line endings are retained. Individual task edits do not normalize unrelated lines.
- Priorities A–Z, creation/completion dates, multiple projects and contexts, arbitrary metadata, `due:`, `rec:`, `t:` and `note:`.
- Structured description, priority, tags, due-date, threshold, note and recurrence editing, plus a raw source-line editor. Dates in the task prefix can be edited directly in the source line.
- Create, complete/reopen, edit, duplicate, delete, select, bulk complete/delete, reorder, and up to 50 undo steps. Select one row and choose file-order sorting with no grouping to move it up/down in the physical file.
- Archive all completed tasks into `done.txt`; browse, restore and delete archived tasks. Undo is available for archive changes too.
- Inbox capture and selected-task import into the main file.
- Search, combined project/context/priority/due/completion filters; saved text searches; priority sorting (A first or Z first), due-date sorting (soonest or latest first), creation/file sorting; priority/project/context/due-status grouping. Priority sorting automatically groups tasks by priority, with unprioritized tasks last. Multiple-tag tasks are grouped by their first project or context.
- Sidebar views for all tasks, Kanban, inbox, today, upcoming, completed, archive, projects, contexts and saved searches.
- Counts, keyboard navigation, searchable command palette, light/dark themes, compact/comfortable density, responsive layout and collapsible task details.
- Quick add saves immediately on Enter or Add. Recognized phrases such as `tomorrow`, `next Friday`, `every month on the first`, and `high priority` are converted directly into todo.txt metadata.
- Linked Markdown notes can be created, previewed, and edited from task details. Relative `.md` paths resolve under `NOTES_DIR`, including nested directories. Traversal and symlink escapes are rejected; note saves also check revisions, and preview HTML is sanitized.
- Automatic external-file refresh every 1.5 seconds. Open drafts retain their original revision; saving a stale draft fails visibly. Copy a stale draft before closing it, review the refreshed file, and reapply your change.

### Kanban

Open **Kanban** in the sidebar or choose **Go to Kanban** in the command palette. The board shows main-file tasks in three columns: **To do**, **In progress**, and **Done**. Focus a card and press `h` / `l` to move it one lane left or right; use `j` / `k` to move between cards. Search, filters, sorting within each column, selection, bulk actions, details and undo work on the same tasks as the list. On narrow screens, columns stack vertically.

Drag a card into another column, or use its **Status** dropdown with a keyboard or touchscreen. Moving a card saves immediately through the same revision checks and undo history as other task edits. A drag started before an external change is rejected rather than applied to a potentially different line.

- Unmarked incomplete tasks appear in To do, without rewriting existing files. In progress uses `kanban:doing`; moving back to To do writes `kanban:todo`.
- Done uses the standard `x` completion prefix and date. Moving out of Done reopens the task. Completed tasks remain in `todo.txt` until archived; archive and inbox files are not part of the board.
- Completing a recurring task creates its successor in To do, whether completed from the board or list. Reopening does not remove that successor; Undo reverses accidental completion and its generated task together.
- Unknown `kanban:` values appear in To do and remain untouched until a move to another column replaces that field. Other metadata is preserved. A same-column move is a no-op.

Columns are fixed. Dragging changes status, not file order or card ordering within a column; use the sorting menu, or the list’s move buttons for physical file order. No extra dependencies or board database are needed.

### Search and recurrence semantics

Search terms are combined with AND and matched case-insensitively. `due:+1w` means due **on or before** one week from today, including overdue tasks; `due:-3d` means due on or before three days ago. Combine these with `+project`, `@context` or text. Saved searches store the text query; dropdown filters are not included.

Recurrence syntax is `rec:[+]N{d,b,w,m,y}`, for positive intervals up to 10,000. Strict (`+`) recurrence starts from the old valid due date; relative recurrence starts from completion day. Missing or invalid due dates fall back to completion day. Completion creates a new active occurrence and retains the completed one. Invalid recurrence strings are preserved and do not generate a new occurrence.

Month/year arithmetic clamps to the last valid day (January 31 → February 28/29). It does not remember an original month-end anchor for subsequent occurrences. Business days exclude Saturday/Sunday, not holidays. A valid threshold's offset from the old due date is retained on the next occurrence. Dates use the server's local calendar for completion and the browser's local calendar for UI search/preview; keep device time zones aligned.

Reopening a completed recurring task does not delete its generated successor; use Undo immediately if completion was accidental. Priorities and creation dates remain on completed tasks. Duplicate creates an incomplete copy, retaining its metadata and creation date.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `j` / `k` | Navigate the visible task list |
| `h` / `l` on Kanban | Move the focused card one lane left / right |
| `n` | Focus task capture |
| `Shift+s` (`S`) | Cycle priority A→Z, priority Z→A, due soonest→latest, due latest→soonest |
| `e` / `Enter` | Open the focused task in the keyboard editor |
| `x` | Complete/reopen focused task |
| `d d` | Delete focused task (600 ms chord, confirmation dialog) |
| `/` | Focus search |
| `u` | Undo |
| `?` | Shortcut help |
| `z` / `Esc` | Enter / exit Zen mode |
| `Ctrl/⌘+K`, `Ctrl/⌘+P`, or `:` | Open and focus the command palette |
| `↑` / `↓`, `Enter`, `Esc` | Move through, run, or close palette actions |
| `g` | Open persistent view-selection mode |
| `j` / `k`, arrows | Move through view, project, or context selection |
| `1`–`9`, or `Enter` | Jump to an item, or open the selection |
| `Esc`, `Ctrl+[`, `q`, or `:q` + `Enter` | Abort view selection |
| View switcher | Tab to the native view selector and choose a view by name |
| `Esc` | Close dialog/details, clear selection |

Shortcuts do not run inside text inputs, textareas, selects or editable controls. `S` cycles through the four priority and due-date sort directions; priority sorts also group rows under priority headings. Dialogs use native modal focus handling. The command palette takes focus when it opens; type to filter, use Up/Down to choose an action, Enter to run it, and Escape to close. Press `g` to enter persistent view-selection mode. It remains open until you select a view or quit with `Esc`, `Ctrl+[`, `q`, or `:q` followed by Enter. Use `j`/`k`, arrow keys, `1`–`9`, or Enter to switch. The native view switcher also works with the keyboard.

### Project and context scopes

Click a project or context in the sidebar, or press uppercase `P` / `C` to open its persistent picker. Use `j`/`k` or arrows to browse, `1`–`9` to jump, and Enter to open a scope. The pickers also accept `:q`, Esc, or Ctrl+[ to cancel. The command palette includes `Open project: +name` and `Open context: @name` actions.

A project scope (`+name`) and context scope (`@name`) can be active together. Choose a context while viewing a project to narrow to their intersection, or choose a project while viewing a context. In either picker, item `0` clears only that dimension and keeps the other scope. Press Esc or choose **Clear project and context filters** in the command palette (`:clear`) to clear both. The header reports active and completed totals for the combined scope; search and filters narrow the visible tasks without removing it. Sidebar counts reflect the other active scope dimension. Projects and contexts remain metadata on the existing todo.txt lines; scopes do not create separate task files.

### Task notes

From task details or the keyboard editor, press `O` to create or open a Markdown note; `o` opens an existing linked note. Notes are separate `.md` files under the configured notes directory and the task line stores a relative `note:` path. Use `Ctrl/⌘+Alt+P` to switch between Edit and Preview; Save changes persists the task link and note. In Edit mode, paste or drop PNG, JPEG, WebP, or GIF images, or choose **Insert image** (`Ctrl/⌘+Alt+M`). Images up to 12 MB are stored alongside notes, and Markdown links use relative paths. Markdown preview is sanitized before rendering.

### Keyboard task editor

Navigate with `j` / `k`, then press **`e`** to open a popup with one source-line input. Enter on a focused task title also opens it. The detail panel has an **Open keyboard editor** button. The editor starts in **Normal** mode: typing commands does not insert them into the task.

| In the popup | Action |
| --- | --- |
| `i` / `I` | Insert at cursor / beginning of line |
| `a` / `A` | Insert after cursor / end of line |
| `Esc` in Insert mode | Return to Normal mode |
| `h` / `l`, arrows | Move left / right |
| `w` / `b` | Move by whitespace-separated words |
| `0` / `$`, Home / End | Move to beginning / last character |
| `x` / Delete | Delete the character under the cursor |
| `u` / `Ctrl+r` | Undo / redo a draft edit |
| `Ctrl/⌘+z`, `Ctrl/⌘+Shift+z` | Undo / redo in Normal or Insert mode |
| `R` | Rename task text while preserving metadata |
| `r` | Reschedule |
| `p` | Change priority |
| `+` | Edit all projects |
| `@` or `c` | Edit all contexts |
| `?` | Toggle shortcut help |
| `Enter` in Normal mode | Save and close |
| `Ctrl/⌘+Enter` | Apply the active field, save and close from any mode |

Rename, reschedule, priority, projects and contexts reuse the **same input** as a temporary field prompt. Rename changes only the task text, preserving metadata. Enter applies the field to the draft; Esc cancels that field. Nothing is written to disk until Save. In Insert mode, ordinary letters and symbols are text, not shortcuts.

- **Reschedule:** type `2026-12-01`, `today`, `tomorrow`, `+3d`, `-1w`, `+1m`, etc. Signed offsets start from the current valid due date, or today when there is none. `b` skips weekends. Blank or `-` removes the due date. Thresholds are unchanged.
- **Priority:** enter A–Z (case insensitive); blank or `-` removes it.
- **Projects/contexts:** edit the preselected, space-separated list to add or remove tags. Prefixes are optional. Tab completes a nonempty final name from existing tags; after the trailing space, Tab resumes normal focus navigation. Blank or `-` clears the list.
- **Cancel:** Esc returns from a field or Insert mode to Normal. Esc in Normal closes an unchanged draft or asks to discard changes: `y` discards; `n` or Esc keeps editing.

Focus returns to the task after save/cancel so `j`, `k`, and `e` can continue the review. Global task shortcuts pause while the popup is open. Undo inside the popup affects only its draft (up to 100 changes); the workspace's existing undo reverses a saved edit. Closing or refreshing with unsaved edits is guarded. A file-revision conflict leaves the draft open with an inline error; copy it, close, and reopen the refreshed task to retry.

This is a focused Vim-style editing subset, not a full Vim emulator: counts, operators such as `dw`/`ciw`, registers, visual mode, macros and Ex commands are not implemented. No editor dependency was added.

## Mobile capture and security

Build first, then expose the production server on a trusted LAN:

```sh
npm run build
HOST=0.0.0.0 npm start
```

Open `http://YOUR-LAN-IP:3000/capture` on your phone and enter the token from the terminal. Capture is a compact responsive page that writes to `inbox.txt`. The same token grants full workspace access; it is not a restricted capture-only credential. All API reads and writes require the token. Writes require JSON, and cross-origin browser requests are rejected. Development task/note paths are denied by Vite's filesystem serving configuration; use the production server for LAN access.

**HTTP does not encrypt the token or your task content.** Do not expose this server to the public internet or an untrusted network. Use an HTTPS reverse proxy or trusted encrypted tunnel if needed. There is no multi-user access model, rate limiting, or token revocation UI. Restart with a new token to revoke sessions. The UI requires an active server; capture is not an offline PWA and does not queue submissions.

## File integrity and recovery

- API mutations are synchronous within one process. A `.web.lock` directory managed by `proper-lockfile` prevents a second app instance from using the same configured main path. Its heartbeat refreshes every 2 seconds. Normal exits release it; after a crash, retry after 10 seconds and the expired lock is reclaimed automatically. Do not delete a live lock. Empty lock **files** from older versions require a one-time removal after confirming the old server has stopped.
- Every operation checks a SHA-256 revision of all three task files. A stale request returns HTTP 409, without applying its edit. External changes invalidate undo history.
- Writes use an adjacent temporary file, `fsync`, then rename. Existing file permission bits are retained; new files default to owner read/write. Treat task files as UTF-8. Do not configure different paths to the same inode, or use task-file symlinks/hard links: atomic replacement intentionally replaces the path entry and does not preserve link relationships.
- Cross-file moves write the destination before removing source tasks. A private `<todo-file>.transaction.json` stores complete before/after contents until the operation finishes. A partial failure leaves recovery copies and blocks subsequent writes/startup. This is a recovery journal, not a full filesystem transaction.
- **Recovery:** stop the server; inspect the journal and current files; reconcile external edits with its `before`/`after` snapshots into the configured files; keep a copy of the journal until satisfied; then remove the journal and restart (allow 10 seconds for a crashed server’s lock to expire). Recovery is manual to avoid overwriting external work. Journals contain private task text.
- **Concurrency limit:** independent editors do not share the app's lock. Revision checks catch observed changes, but no portable atomic compare-and-swap exists for arbitrary filesystem writers. An external write in the tiny final check/rename window can still race. Avoid simultaneous writes from another app during a save; use backups for valuable data. Parent-directory metadata is not fsynced, so power-loss durability depends on the filesystem.
- Undo is in memory, up to 50 operations across all task files. It resets on restart or external file changes. Notes and preferences are outside task undo. Delete removes tasks from the text files; in-memory undo and transient recovery snapshots may retain them until cleared.

## Project structure

```text
src/
  App.svelte               Workspace state, filters and keyboard routing
  app.css                  Responsive layout and theme/density tokens
  components/              Sidebar, list, editor, capture, dialogs, settings
  lib/todo.ts              Parser, serializer, metadata edits, dates, recurrence, NLP
  lib/kanban.ts            Board columns and task transitions
  lib/editor.ts            Keyboard-editor field changes and rescheduling
  lib/types.ts             Shared contracts
  lib/state.svelte.ts       API state, preferences and mutation handling
server/
  index.ts                 Token-protected HTTP API and Vite/production serving
  store.ts                 Line-preserving persistence, revision checks, journal, undo
  notes.ts                 Confined note access and revision checks
  lock.ts                  Heartbeat lock acquisition and crash recovery
tests/                     Parser, recurrence, file operations, notes and HTTP tests
scripts/browser-check.ts   Dependency-free Chromium/CDP smoke test
examples/                  Example task file and linked Markdown note
```

## Verification

```sh
npm test          # Node test runner through tsx; temporary files under .test-data
npm run check     # Svelte diagnostics and strict TypeScript checks
npm run build     # Checks followed by production frontend build
# Optional, requires a local Chromium installation and an existing build:
node --import tsx scripts/browser-check.ts
# CHROMIUM=/path/to/chromium overrides /usr/bin/chromium
```

Automated tests cover raw round trips, priorities, dates, metadata, recurrence, month/leap boundaries, task modifications, archiving/restoring, inbox, 50-step undo, empty files, line endings, persistence, external changes, interrupted-transaction refusal, note traversal/symlink protection, API authentication, validation, cross-origin rejection and development file exposure, Kanban transitions, recurrence reset, undo, invalid columns and stale drags.

The optional browser smoke test exercises login, quick task creation, editing, completion, undo, search, command palette, themes, Kanban status menus, simulated drag/drop events, filtering, stale-drag rejection, keyboard-editor modes, metadata shortcuts, draft undo/discard, focus return, external-edit conflicts, mobile layout and mobile capture. It saves desktop/mobile screenshots under `.test-data/`. It uses a fresh isolated test directory and never operates on configured personal task files.

## Deliberate limits

There is no drag-and-drop file reorder (use move buttons), automatic journal recovery, QR code, offline mobile queue or PWA installation. Natural-language parsing is a small documented grammar, not general English understanding. File locations are operator-controlled, and preferences/saved searches are browser-local. Notes are Markdown files with sanitized preview and explicit save. Task drafts require explicit Save; successful operations persist immediately.

Browser smoke coverage is Chromium only, not exhaustive accessibility or cross-browser certification. No power-loss, network-filesystem or hostile concurrent-writer stress testing is claimed.

Format reference: [official todo.txt specification](https://raw.githubusercontent.com/todotxt/todo.txt/refs/heads/master/README.md).

