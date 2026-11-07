# Vim for Google Docs

A Chrome extension that adds a small set of Vim keybinds to Google Docs, plus relative line numbers and a `:N` line jump.

## Install
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open any Google Doc (reload it if it was already open).

Click the extension icon any time to see the full list of commands.

## Keybinds
| Key | Action |
|---|---|
| `h j k l` / `H J K L` | left, down, up, right (counts work: `5j`) |
| `w` `b` `e` | next word, previous word, end of word |
| `0` `$` | start / end of line |
| `gg` / `G` | top / bottom of document |
| `i` `a` `I` `A` | insert (at cursor, after cursor, line start, line end) |
| `o` / `O` | new line below / above |
| `v` / `V` | visual / visual line |
| `Esc` | back to Normal mode |
| `d` `c` `y` + motion | delete, change, yank (`dd`, `cc`, `yy` for whole lines) |
| `p` | paste |
| `u` | undo |
| `r` / `Ctrl+R` | redo |
| `:42` + Enter | go to line 42 |
| `:+5` / `:-5` + Enter | move 5 lines down / up |

Backspace works in every mode. Ctrl/Cmd/Alt shortcuts (Ctrl+C, Ctrl+V, Ctrl+Shift+V, Ctrl+Y ...) are never intercepted.

The left gutter shows absolute line numbers (current line in bold). The mode shows in the bottom right.

## Notes
- Motions are sent to Docs as synthetic key presses, so they behave like the arrow/Home/End keys in Docs.
- If Docs changes its internal markup, the gutter may need adjusting (`src/gutter.js`).
