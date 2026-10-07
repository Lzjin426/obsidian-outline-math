/* Render formulas inside Obsidian's existing outline; never edit note files.
 * Obsidian 1.14.4 disables MathJax delimiter scanning. Use its conversion API.
 * cachedHeadingDom is private: validate its shape and fail safely if it changes.
 */
const { Plugin, loadMathJax, renderMath, finishRenderMath } = require("obsidian");

const PANEL_SELECTOR = '.workspace-leaf-content[data-type="outline"]';
const DEBOUNCE_MS = 100;
const TAG = "[Outline Math]";

function escaped(text, index) {
	let count = 0;
	while (index > 0 && text[--index] === "\\") count++;
	return count % 2 === 1;
}

/** Paired math, excluding escaped dollars and inline code. */
function splitMath(text) {
	const parts = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (escaped(text, i)) continue;
		if (text[i] === String.fromCharCode(96)) {
			let end = i + 1;
			while (text[end] === text[i]) end++;
			const marker = text.slice(i, end);
			let close = text.indexOf(marker, end);
			while (close >= 0 && (text[close - 1] === text[i] || text[close + marker.length] === text[i])) {
				close = text.indexOf(marker, close + marker.length);
			}
			i = close < 0 ? end - 1 : close + marker.length - 1;
			continue;
		}
		if (text[i] !== "$") continue;
		const width = text[i + 1] === "$" ? 2 : 1;
		const begin = i + width;
		if (!text[begin] || /\s/.test(text[begin])) {
			i += width - 1;
			continue;
		}
		let close = begin;
		for (; close < text.length; close++) {
			if (text[close] !== "$" || escaped(text, close)) continue;
			const size = text[close + 1] === "$" ? 2 : 1;
			if (size !== width) { close += size - 1; continue; }
			if (/\s/.test(text[close - 1]) || (width === 1 && /\d/.test(text[close + 1] || ""))) continue;
			break;
		}
		if (close >= text.length || close === begin) { i += width - 1; continue; }
		parts.push({ type: "text", value: text.slice(start, i) });
		parts.push({ type: "math", value: text.slice(begin, close) });
		start = close + width;
		i = start - 1;
	}
	parts.push({ type: "text", value: text.slice(start) });
	return parts;
}

/** Keep native Markdown-normalized text; skip ambiguous formula positions. */
function displayParts(raw, plain) {
	const parts = splitMath(raw);
	const formulas = parts.filter((part) => part.type === "math");
	if (!formulas.length) return null;
	if (parts.map((part) => part.value).join("") === plain) return parts;
	for (const source of new Set(formulas.map((part) => part.value))) {
		const expected = formulas.filter((part) => part.value === source).length;
		if (plain.split(source).length - 1 !== expected) return null;
	}
	const result = [];
	let offset = 0;
	for (const formula of formulas) {
		const index = plain.indexOf(formula.value, offset);
		if (index < 0) return null;
		result.push({ type: "text", value: plain.slice(offset, index) }, formula);
		offset = index + formula.value.length;
	}
	result.push({ type: "text", value: plain.slice(offset) });
	return result;
}

module.exports = class OutlineMathPlugin extends Plugin {
	static splitMath = splitMath;
	static displayParts = displayParts;

	onload() {
		this.stopped = false;
		this.pending = null;
		this.running = false;
		this.rerun = false;
		this.mathReady = null;
		this.rendered = new Map();
		this.observers = new Map();
		this.styles = new Map();
		this.warnings = new Set();
		for (const event of ["layout-change", "active-leaf-change", "file-open"]) {
			this.registerEvent(this.app.workspace.on(event, () => this.scheduleRender()));
		}
		this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRender()));
		this.app.workspace.onLayoutReady(() => this.scheduleRender());
		this.refreshObservers();
	}

	getViews() {
		return this.app.workspace.getLeavesOfType("outline").map((leaf) => leaf.view);
	}

	refreshObservers() {
		const documents = new Set([document]);
		for (const view of this.getViews()) {
			if (view.containerEl?.ownerDocument) documents.add(view.containerEl.ownerDocument);
		}
		for (const [doc, observer] of this.observers) {
			if (!documents.has(doc)) {
				observer.disconnect();
				this.observers.delete(doc);
				this.styles.get(doc)?.remove();
				this.styles.delete(doc);
			}
		}
		for (const doc of documents) {
			if (this.observers.has(doc) || !doc.body) continue;
			const observer = new doc.defaultView.MutationObserver((records) => {
				if (records.some((record) => this.touchesOutline(record))) this.scheduleRender();
			});
			observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
			this.observers.set(doc, observer);
		}
	}

	touchesOutline(record) {
		const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
		if (target?.closest(PANEL_SELECTOR)) return true;
		return [...record.addedNodes].some((node) => node.nodeType === 1 &&
			(node.matches(PANEL_SELECTOR) || node.querySelector(PANEL_SELECTOR)));
	}

	scheduleRender() {
		if (this.stopped) return;
		clearTimeout(this.pending);
		this.pending = setTimeout(() => { this.pending = null; void this.render(); }, DEBOUNCE_MS);
	}

	warn(key, message, error) {
		if (this.warnings.has(key)) return;
		this.warnings.add(key);
		console.warn(TAG, message, error || "");
	}

	owns(element, state) {
		const nodes = [...element.childNodes];
		return nodes.length === state.nodes.length && nodes.every((node, i) => node === state.nodes[i]);
	}

	restore(element) {
		const state = this.rendered.get(element);
		if (!state) return false;
		const owned = this.owns(element, state);
		if (owned) element.replaceChildren(...state.original);
		this.rendered.delete(element);
		return owned;
	}

	// finishRenderMath flushes into the main document. Popout panes need the
	// same stylesheet; leave any stylesheet already managed by Obsidian alone.
	syncStyles() {
		const source = document.getElementById("MJX-CHTML-styles");
		if (!source) return;
		for (const doc of this.observers.keys()) {
			if (doc === document) continue;
			let style = this.styles.get(doc);
			if (!style || !style.isConnected) {
				if (doc.getElementById(source.id)) continue;
				style = doc.head.appendChild(source.cloneNode(true));
				this.styles.set(doc, style);
			} else if (style.textContent !== source.textContent) style.textContent = source.textContent;
		}
	}

	async render() {
		if (this.stopped) return;
		if (this.running) { this.rerun = true; return; }
		this.running = true;
		try {
			this.refreshObservers();
			// The outline's own items retain exact source headings, even when
			// pinned to another file or when several headings have identical text.
			if (!this.mathReady) this.mathReady = loadMathJax();
			await this.mathReady;
			if (this.stopped) return;
			const seen = new Set();
			const changed = new Map();
			for (const view of this.getViews()) {
				if (!Array.isArray(view.cachedHeadingDom)) {
					this.warn("outline-api", "原生大纲结构不兼容，已跳过。请检查 Obsidian 版本。");
					continue;
				}
				for (const item of view.cachedHeadingDom) {
					const element = item.innerEl;
					const raw = item.heading?.heading;
					const plain = item.headingText;
					if (!element || typeof raw !== "string" || typeof plain !== "string") continue;
					seen.add(element);
					if (view.searchQuery || !raw.includes("$")) {
						if (this.restore(element)) changed.set(item, view);
						continue;
					}
					if (!element.isConnected || !view.contentEl?.contains(element)) continue;
					const previous = this.rendered.get(element);
					if (previous?.raw === raw && previous.plain === plain && this.owns(element, previous)) continue;
					if (this.restore(element)) changed.set(item, view);
					if (element.textContent !== plain) continue; // Preserve other plugins' custom labels.
					const parts = displayParts(raw, plain);
					if (!parts) {
						if (splitMath(raw).some((part) => part.type === "math")) {
							this.warn("heading:" + raw, "公式无法准确对应大纲文字，已保留原文：" + raw);
						}
						continue;
					}
					try {
						const fragment = element.ownerDocument.createDocumentFragment();
						for (const part of parts) {
							if (part.type === "text") fragment.appendChild(element.ownerDocument.createTextNode(part.value));
							else {
								const formula = renderMath(part.value, false);
								formula.style.pointerEvents = "none";
								fragment.appendChild(formula);
								if (formula.querySelector('[data-mjx-error], mjx-merror')) {
									this.warn("tex:" + part.value, "公式含有 MathJax 错误：" + part.value);
								}
							}
						}
						const original = [...element.childNodes];
						element.replaceChildren(fragment);
						this.rendered.set(element, { raw, plain, original, nodes: [...element.childNodes] });
						changed.set(item, view);
					} catch (error) {
						this.warn("render:" + raw, "公式渲染失败，已保留原文：" + raw, error);
					}
				}
			}
			for (const element of this.rendered.keys()) if (!seen.has(element)) this.restore(element);
			if (changed.size) {
				await finishRenderMath();
				if (!this.stopped) {
					this.syncStyles();
					for (const [item, view] of changed) view.tree?.infinityScroll?.invalidate?.(item);
				}
			}
		} catch (error) {
			this.mathReady = null;
			this.warn("engine", "公式引擎加载或样式更新失败。", error);
		} finally {
			this.running = false;
			if (this.rerun) { this.rerun = false; this.scheduleRender(); }
		}
	}

	onunload() {
		this.stopped = true;
		clearTimeout(this.pending);
		for (const observer of this.observers.values()) observer.disconnect();
		this.observers.clear();
		for (const style of this.styles.values()) style.remove();
		this.styles.clear();
		for (const element of this.rendered.keys()) this.restore(element);
		for (const view of this.getViews()) view.tree?.infinityScroll?.queueCompute?.();
	}
};
