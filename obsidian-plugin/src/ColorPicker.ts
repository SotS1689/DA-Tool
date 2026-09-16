// A custom saturation/hue color picker popover, styled after the Style
// Settings plugin's picker (gradient box + hue slider + hex/rgb/hsl input),
// since Obsidian's own Setting.addColorPicker() only gives a native
// <input type="color"> swatch that opens the OS picker.

interface RGB { r: number; g: number; b: number }
interface HSV { h: number; s: number; v: number }

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): RGB {
	const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
	if (!m) return { r: 0, g: 0, b: 0 };
	return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(rgb: RGB): string {
	const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
	return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function rgbToHsv(rgb: RGB): HSV {
	const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = 60 * (((g - b) / d) % 6);
		else if (max === g) h = 60 * ((b - r) / d + 2);
		else h = 60 * ((r - g) / d + 4);
	}
	if (h < 0) h += 360;
	const s = max === 0 ? 0 : d / max;
	const v = max;
	return { h, s: s * 100, v: v * 100 };
}

function hsvToRgb(hsv: HSV): RGB {
	const h = hsv.h, s = hsv.s / 100, v = hsv.v / 100;
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let r = 0, g = 0, b = 0;
	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }
	return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
	const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = 60 * (((g - b) / d) % 6);
		else if (max === g) h = 60 * ((b - r) / d + 2);
		else h = 60 * ((r - g) / d + 4);
	}
	if (h < 0) h += 360;
	const l = (max + min) / 2;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): RGB {
	s /= 100; l /= 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0, g = 0, b = 0;
	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }
	return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

type Mode = "hex" | "rgb" | "hsl";

// Only one picker may be open at a time; opening another closes this one.
let activePickerClose: (() => void) | null = null;

// Opens the popover anchored under `anchorEl`. Calls `onSave` with the final
// hex color only if the user clicks Save; Cancel/outside-click/Escape leave
// the original color untouched.
export function openColorPickerPopover(anchorEl: HTMLElement, initialHex: string, onSave: (hex: string) => void): void {
	activePickerClose?.();

	// Obsidian supports popped-out windows, each with its own document/window.
	// Anchoring to the global `document`/`window` would place the popover in
	// whichever window this script happened to load in (the main window),
	// even when the settings modal that opened it lives in a different one.
	const doc = anchorEl.ownerDocument;
	const win = doc.defaultView ?? window;

	let hsv = rgbToHsv(hexToRgb(initialHex));
	let mode: Mode = "hex";

	const popover = doc.createElement("div");
	popover.className = "da-cp-popover";

	const svBox = popover.createDiv({ cls: "da-cp-sv" });
	const svThumb = svBox.createDiv({ cls: "da-cp-sv-thumb" });

	const hueSlider = popover.createDiv({ cls: "da-cp-hue" });
	const hueThumb = hueSlider.createDiv({ cls: "da-cp-hue-thumb" });

	const mainRow = popover.createDiv({ cls: "da-cp-main-row" });
	const swatches = mainRow.createDiv({ cls: "da-cp-swatches" });
	const circleSwatch = swatches.createDiv({ cls: "da-cp-circle" });
	const squareSwatch = swatches.createDiv({ cls: "da-cp-square" });

	const inputCol = mainRow.createDiv({ cls: "da-cp-input-col" });
	const textInput = inputCol.createEl("input", { cls: "da-cp-input", attr: { type: "text" } });
	const modeTabs = inputCol.createDiv({ cls: "da-cp-tabs" });
	const hexTab = modeTabs.createEl("button", { text: "HEX", cls: "da-cp-tab" });
	const rgbTab = modeTabs.createEl("button", { text: "RGB", cls: "da-cp-tab" });

	const actionsRow = popover.createDiv({ cls: "da-cp-actions" });
	const hslTab = actionsRow.createEl("button", { text: "HSL", cls: "da-cp-tab" });
	const saveBtn = actionsRow.createEl("button", { text: "Save", cls: "da-cp-btn da-cp-btn-save" });
	const cancelBtn = actionsRow.createEl("button", { text: "Cancel", cls: "da-cp-btn da-cp-btn-cancel" });

	doc.body.appendChild(popover);

	function currentRgb(): RGB {
		return hsvToRgb(hsv);
	}

	function formatForMode(): string {
		const rgb = currentRgb();
		if (mode === "hex") return rgbToHex(rgb);
		if (mode === "rgb") return `${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}`;
		const hsl = rgbToHsl(rgb);
		return `${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%`;
	}

	function render(): void {
		const rgb = currentRgb();
		const hex = rgbToHex(rgb);
		const hueRgb = hsvToRgb({ h: hsv.h, s: 100, v: 100 });
		const hueHex = rgbToHex(hueRgb);

		svBox.setCssStyles({ backgroundColor: hueHex });
		svThumb.setCssStyles({ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: hex });

		hueThumb.setCssStyles({ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueHex });

		circleSwatch.setCssStyles({ backgroundColor: hex });
		squareSwatch.setCssStyles({ backgroundColor: hex });

		hexTab.classList.toggle("da-cp-tab-active", mode === "hex");
		rgbTab.classList.toggle("da-cp-tab-active", mode === "rgb");
		hslTab.classList.toggle("da-cp-tab-active", mode === "hsl");

		textInput.value = formatForMode();
	}

	function setModeAndRender(newMode: Mode): void {
		mode = newMode;
		render();
	}

	function parseInput(): void {
		const raw = textInput.value.trim();
		if (mode === "hex") {
			const m = raw.match(/^#?([0-9a-f]{6})$/i);
			if (!m) return;
			hsv = rgbToHsv(hexToRgb(`#${m[1]}`));
		} else if (mode === "rgb") {
			const parts = raw.split(",").map(p => Number(p.trim()));
			if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return;
			hsv = rgbToHsv({ r: clamp(parts[0], 0, 255), g: clamp(parts[1], 0, 255), b: clamp(parts[2], 0, 255) });
		} else {
			const parts = raw.replace(/%/g, "").split(",").map(p => Number(p.trim()));
			if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return;
			hsv = rgbToHsv(hslToRgb(clamp(parts[0], 0, 360), clamp(parts[1], 0, 100), clamp(parts[2], 0, 100)));
		}
		render();
	}

	function dragSv(e: PointerEvent): void {
		const rect = svBox.getBoundingClientRect();
		const x = clamp(e.clientX - rect.left, 0, rect.width);
		const y = clamp(e.clientY - rect.top, 0, rect.height);
		hsv = { h: hsv.h, s: (x / rect.width) * 100, v: 100 - (y / rect.height) * 100 };
		render();
	}

	function dragHue(e: PointerEvent): void {
		const rect = hueSlider.getBoundingClientRect();
		const x = clamp(e.clientX - rect.left, 0, rect.width);
		hsv = { h: (x / rect.width) * 360, s: hsv.s, v: hsv.v };
		render();
	}

	function startDrag(onMove: (e: PointerEvent) => void) {
		return (e: PointerEvent) => {
			e.preventDefault();
			onMove(e);
			const move = (ev: PointerEvent) => onMove(ev);
			const up = () => {
				win.removeEventListener("pointermove", move);
				win.removeEventListener("pointerup", up);
			};
			win.addEventListener("pointermove", move);
			win.addEventListener("pointerup", up);
		};
	}

	svBox.addEventListener("pointerdown", startDrag(dragSv));
	hueSlider.addEventListener("pointerdown", startDrag(dragHue));

	hexTab.addEventListener("click", () => setModeAndRender("hex"));
	rgbTab.addEventListener("click", () => setModeAndRender("rgb"));
	hslTab.addEventListener("click", () => setModeAndRender("hsl"));

	textInput.addEventListener("change", parseInput);
	textInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") { e.preventDefault(); parseInput(); }
	});

	function close(): void {
		doc.removeEventListener("mousedown", onOutsideClick, true);
		doc.removeEventListener("keydown", onKeydown, true);
		popover.remove();
		if (activePickerClose === close) activePickerClose = null;
	}
	activePickerClose = close;

	function onOutsideClick(e: MouseEvent): void {
		if (!popover.contains(e.target as Node) && e.target !== anchorEl) close();
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === "Escape") { e.preventDefault(); close(); }
	}

	saveBtn.addEventListener("click", () => {
		onSave(rgbToHex(currentRgb()));
		close();
	});
	cancelBtn.addEventListener("click", () => close());

	// Deferred so the click that opened the popover doesn't immediately close it.
	win.setTimeout(() => {
		doc.addEventListener("mousedown", onOutsideClick, true);
		doc.addEventListener("keydown", onKeydown, true);
	}, 0);

	render();

	// Position under the anchor, clamped to the viewport.
	const anchorRect = anchorEl.getBoundingClientRect();
	popover.setCssStyles({ left: `${anchorRect.left}px`, top: `${anchorRect.bottom + 6}px` });
	win.requestAnimationFrame(() => {
		const r = popover.getBoundingClientRect();
		if (r.right > win.innerWidth) popover.setCssStyles({ left: `${Math.max(8, win.innerWidth - r.width - 8)}px` });
		if (r.bottom > win.innerHeight) popover.setCssStyles({ top: `${Math.max(8, anchorRect.top - r.height - 6)}px` });
	});
}
