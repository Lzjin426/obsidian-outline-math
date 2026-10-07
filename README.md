# Outline Math

Render LaTeX formulas inside Obsidian's **built-in Outline pane**. Keep your existing headings and outline navigation.

```markdown
## Pressure angle $\alpha$
### Effective clearance $\psi_{\mathrm{eff}}$
### A simple expression $x^2 + y^2$
```

The Outline pane displays the formulas instead of LaTeX source. Clicking a heading still navigates to the corresponding section.

## Requirements

- Obsidian desktop 1.14.4 or newer.
- The core **Outline** plugin must be enabled.
- Tested in Obsidian 1.14.4 on macOS. Mobile is not currently supported.

The plugin uses an internal structure of the native Outline pane. A future Obsidian update may require a plugin update. If the expected structure is unavailable, the plugin leaves the pane unchanged and logs a warning.

## Installation

This plugin has not yet been listed in the Obsidian Community directory.

### Manual installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/Lzjin426/obsidian-outline-math/releases/latest).
2. Create `.obsidian/plugins/outline-math/` inside your vault and place both files there.
3. Open **Settings → Community plugins**, reload the installed plugin list if needed, and enable **Outline Math**.
4. Open the built-in Outline pane and a note containing formulas in its headings.

You can also install the repository using [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Behavior

- Uses Obsidian's bundled MathJax engine.
- Renders paired `$...$` and `$$...$$` expressions inline to fit outline labels.
- Supports formulas without LaTeX commands, such as `$x^2$`.
- Uses each outline item's own heading source, including duplicate headings and panes pinned to different notes.
- Reapplies formulas when Obsidian rebuilds outline items.
- Keeps native text highlighting while outline search is active. Formulas return when search is cleared.
- Preserves original text if a formula cannot be matched safely to a formatted heading.
- Restores the original text when the plugin is disabled.

## Privacy

The plugin changes only the displayed outline labels. It does not modify note files, make network requests, collect telemetry, or require an account or payment. Formula rendering uses the MathJax engine already bundled with Obsidian.

Errors may be reported in the local developer console, including the affected heading or formula. These messages are not transmitted anywhere.

## Development and verification

`main.js` is both the readable source and the runtime file. There is no build step and no third-party runtime dependency. Check JavaScript syntax with:

```sh
node --check main.js
```

Manual smoke test:

1. Create a note using the example headings above.
2. Confirm the formulas render in the native Outline pane.
3. Click a formula heading and confirm navigation to that section.
4. Collapse and expand the outline, then confirm formulas remain visible.
5. Search within the outline, clear the search, and confirm formulas return.
6. Disable the plugin and confirm the original plain-text labels return.

The initial release was validated with 23 automated DOM and MathJax checks using Obsidian 1.14.4's bundled engine. Formula display, heading navigation, and collapse/expand were also checked in the actual desktop application. Real drag reordering and mobile behavior have not been verified.

## Troubleshooting

After manually updating the files, disable and re-enable Outline Math. Reloading the entire application is normally unnecessary.

If formulas do not render, verify that the native Outline pane is open, clear its search filter, and check the developer console for warnings starting with `[Outline Math]`. Include your Obsidian version when [reporting an issue](https://github.com/Lzjin426/obsidian-outline-math/issues).

## 中文说明

Outline Math 在 Obsidian 原生大纲中显示标题里的 LaTeX 公式，保留原生标题跳转和折叠功能，不改写笔记内容。

需要 Obsidian 桌面版 1.14.4 或更新版本，并启用核心插件“大纲”。目前已在 macOS 的 Obsidian 1.14.4 中验证；不支持移动端。由于使用了原生大纲的内部结构，未来 Obsidian 更新后可能需要同步调整插件。

从 Release 下载 `main.js` 和 `manifest.json`，放到仓库的 `.obsidian/plugins/outline-math/`，然后在“设置 → 第三方插件”启用。标题正常写成 `## 压力角 $\alpha$` 即可。搜索大纲时先显示原生文字高亮，清除搜索后恢复公式。

## License

[MIT](LICENSE). Copyright © 2026 Fullstop.

MathJax is provided by Obsidian and is not redistributed in this repository. This is an independent community plugin, not an official Obsidian plugin.
