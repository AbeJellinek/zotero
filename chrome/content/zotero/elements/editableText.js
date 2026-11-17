/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2020 Corporation for Digital Scholarship
					 Vienna, Virginia, USA
					 https://www.zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

"use strict";

{
	const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

	const lazy = {};
	XPCOMUtils.defineLazyPreferenceGetter(
		lazy,
		"BIDI_BROWSER_UI",
		"bidi.browser.ui",
		false
	);

	// Max time (ms) and distance (CSS px) between two taps of a double tap
	const DOUBLE_TAP_DELAY = 400;
	const DOUBLE_TAP_SLOP = 25;

	class EditableText extends XULElementBase {
		_input;

		_ignoredWindowInactiveBlur = false;

		_focusMousedownEvent = false;

		// Touchscreen text selection. Dragging a finger scrolls, so text is selected with
		// the same gestures as in the reader: a long press on a word selects it (a long press
		// on the selection or off a word opens the context menu), and a double tap followed
		// by a drag selects words. Dragging after either extends the selection by words.
		static _lastTouchTap = null;

		_touchSelection = null;

		_touchSelectionAnchor = null;

		static observedAttributes = [
			'multiline',
			'readonly',
			'placeholder',
			'aria-label',
			'aria-labelledby',
			'value',
			'nowrap',
			'autocomplete',
			'min-lines',
			'max-lines',
			'dir'
		];
		
		static get _textMeasurementSpan() {
			let span = document.createElement('span');
			span.style.position = 'absolute';
			span.style.visibility = 'hidden';
			span.style.whiteSpace = 'pre';
			document.documentElement.append(span);

			window.addEventListener('unload', () => {
				span.remove();
			});

			// Replace the getter with a value
			Object.defineProperty(this, '_textMeasurementSpan', {
				value: span
			});
			return span;
		}

		/**
		 * A single ResizeObserver shared by every EditableText in the document.
		 * When inputs resize, recompute the 'overflowing' state for all affected
		 * fields at once, batching layout reads before writes:
		 * toggling 'overflowing' makes the layout dirty, and measuring the width
		 * requires a clean layout, so interleaving the two would force a reflow
		 * per measurement, which adds up to multiple seconds of layout
		 * calculations on outlier items with thousands of creators.
		 *
		 * See {@link #batchSizeToContent()}.
		 */
		static _resizeObserver = new ResizeObserver((entries) => {
			let editableTexts = entries
				.map(entry => entry.target.closest('editable-text'))
				.filter(editableText => editableText?._input);
			// Read phase: measure everything first
			let overflowing = editableTexts.map(editableText => editableText._isOverflowing());
			// Write phase: apply the class changes in one batch
			for (let i = 0; i < editableTexts.length; i++) {
				editableTexts[i].classList.toggle('overflowing', overflowing[i]);
			}
		});

		get noWrap() {
			return this.hasAttribute('nowrap');
		}
		
		set noWrap(noWrap) {
			this.toggleAttribute('nowrap', noWrap);
		}

		get minLines() {
			return this.getAttribute('min-lines') || 0;
		}

		get maxLines() {
			return this.getAttribute('max-lines') || 0;
		}

		get multiline() {
			return this.hasAttribute('multiline');
		}
		
		set multiline(multiline) {
			this.toggleAttribute('multiline', multiline);
		}
		
		get readOnly() {
			return this.hasAttribute('readonly');
		}
		
		set readOnly(readOnly) {
			this.toggleAttribute('readonly', readOnly);
		}

		get placeholder() {
			return this.getAttribute('placeholder') || '';
		}
		
		set placeholder(placeholder) {
			this.setAttribute('placeholder', placeholder || '');
		}
		
		get ariaLabel() {
			return this.getAttribute('aria-label') || '';
		}

		get ariaLabelledBy() {
			return this.getAttribute('aria-labelledby') || '';
		}
		
		set ariaLabel(ariaLabel) {
			this.setAttribute('aria-label', ariaLabel);
		}
		
		get value() {
			return this.getAttribute('value') || '';
		}
		
		set value(value) {
			this.setAttribute('value', value || '');
		}
		
		get values() {
			return this._values ? this._values : [this.value];
		}
		
		set values(values) {
			this._values = values;
		}
		
		get initialValue() {
			return this._input?.dataset.initialValue ?? '';
		}
		
		set initialValue(initialValue) {
			this._input.dataset.initialValue = initialValue ?? '';
		}
		
		get autocomplete() {
			let val = this.getAttribute('autocomplete');
			try {
				let props = JSON.parse(val);
				if (typeof props === 'object') {
					return props;
				}
			}
			catch {
				// Ignore
			}
			return null;
		}
		
		set autocomplete(val) {
			if (val) {
				this.setAttribute('autocomplete', JSON.stringify(val));
			}
			else {
				this.removeAttribute('autocomplete');
			}
		}
		
		get dir() {
			return this.getAttribute('dir');
		}
		
		set dir(dir) {
			this.setAttribute('dir', dir);
		}
		
		get ref() {
			return this._input;
		}

		get multipleValues() {
			return this.hasAttribute('multiple-values');
		}
		
		set multipleValues(multipleValues) {
			this.toggleAttribute('multiple-values', !!multipleValues);
		}
		
		// true if the value is unchanged since the last blur event. Relevant for batch editing.
		get cancelled() {
			return this.hasAttribute('cancelled');
		}

		set cancelled(cancelled) {
			this.toggleAttribute('cancelled', !!cancelled);
		}

		_resetTextDirection() {
			this._input?.removeAttribute('dir');
		}
		
		_getContentWidth() {
			let span = this.constructor._textMeasurementSpan;
			let { font, paddingLeft, paddingRight, borderLeftWidth, borderRightWidth } = getComputedStyle(this._input);
			span.style.font = font;
			span.textContent = this.value || this.placeholder;
			return span.getBoundingClientRect().width
				+ parseFloat(paddingLeft)
				+ parseFloat(paddingRight)
				+ parseFloat(borderLeftWidth)
				+ parseFloat(borderRightWidth);
		}
		
		sizeToContent = () => {
			this.style.maxWidth = this._getContentWidth() + 'px';
		};

		/**
		 * Size multiple elements to their content in a single batch.
		 *
		 * sizeToContent() reads layout and then updates layout styles.
		 * Calling it once per element interleaves those reads and writes,
		 * forcing a full synchronous reflow on every call. That's extremely
		 * slow, especially if it occurs in a loop that also adds new elements
		 * to the DOM on each iteration, as in the InfoBox.
		 * Measuring everything first and only then applying the widths collapses
		 * that to a single reflow regardless of how many elements are sized.
		 *
		 * @param {EditableText[]} elements
		 */
		static batchSizeToContent(elements) {
			elements = [...elements];
			let widths = elements.map(el => el._getContentWidth());
			for (let i = 0; i < elements.length; i++) {
				elements[i].style.maxWidth = widths[i] + 'px';
			}
		}
		
		attributeChangedCallback(name) {
			if (name === 'value' || name === 'dir') {
				this._resetTextDirection();
			}
			this.render();
		}

		init() {
			this.render();
		}

		destroy() {
			// Stop the shared observer from holding a reference to our input
			if (this._input) {
				EditableText._resizeObserver.unobserve(this._input);
			}
		}

		render() {
			let autocompleteParams = this.autocomplete;
			let autocompleteEnabled = !this.multiline && !!autocompleteParams;
			if (!this._input
					|| (this._input.hasAttribute('autocomplete')) !== autocompleteEnabled
					|| this._input.tagName !== (this.noWrap ? 'input' : 'textarea')) {
				let input;
				let inputTagName = this.noWrap ? 'input' : 'textarea';
				if (autocompleteEnabled) {
					input = document.createElement(inputTagName, { is: `autocomplete-${inputTagName}` });
				}
				else {
					input = document.createElement(inputTagName);
				}
				input.rows = 1;
				input.classList.add('input');
				input.toggleAttribute("no-native", true);
				input.addEventListener('input', this._handleInput);
				input.addEventListener('change', this._handleChange);
				input.addEventListener('focus', this._handleFocus);
				input.addEventListener('blur', this._handleBlur);
				input.addEventListener('keydown', this._handleKeyDown);
				input.addEventListener('mousedown', this._handleMouseDown);
				input.addEventListener('touchstart', this._handleTouchStart, { passive: true });
				input.addEventListener('touchmove', this._handleTouchMove, { passive: false });
				input.addEventListener('touchend', this._handleTouchEnd, { passive: false });
				input.addEventListener('touchcancel', this._handleTouchCancel);
				input.addEventListener('contextmenu', this._handleContextMenu);
				input.addEventListener('dragover', this._handleDragOver);
				input.addEventListener('drop', this._handleDrop);
				if (autocompleteEnabled) {
					// Even through this may run multiple times on editable-text, the listener
					// is added only once because we pass the reference to the same exact function.
					this.addEventListener('keydown', this._captureAutocompleteKeydown, true);
				}
				else {
					this.removeEventListener('keydown', this._captureAutocompleteKeydown, true);
				}
				
				let oldInput = this._input;
				let focused = this.focused;
				let selectionStart = this._input?.selectionStart;
				let selectionEnd = this._input?.selectionEnd;
				let selectionDirection = this._input?.selectionDirection;
				
				if (focused) {
					input.dataset.initialValue = this._input?.dataset.initialValue;
				}
				if (this._input) {
					this._input.replaceWith(input);
				}
				else {
					this.append(input);
				}
				this._input = input;
				
				if (focused) {
					this._input.focus();
				}
				if (selectionStart !== undefined && selectionEnd !== undefined) {
					this._input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
				}
				
				if (oldInput) {
					EditableText._resizeObserver.unobserve(oldInput);
				}
				// Only nowrap fields can overflow horizontally; textareas wrap
				if (this.noWrap) {
					EditableText._resizeObserver.observe(this._input);
				}
			}
			this._input.readOnly = this.readOnly;
			this._input.removeAttribute('tabindex');
			// Read-only multiple-values fields are focusable (for keyboard access) but
			// can't be edited, so keep their "Multiple" placeholder visible while focused.
			// Editable fields clear it on focus (see _handleFocus), so don't reset it here.
			if (!(this.multipleValues && this.focused && !this.readOnly)) {
				this._input.placeholder = this.placeholder;
			}

			if (this._input.tagName == "textarea") {
				// Reset to initial state
				this.style.removeProperty("--min-visible-lines");
				this.style.removeProperty("--max-visible-lines");
				// Set how tall the textarea can/must be
				if (this.minLines > 0) {
					this.style.setProperty("--min-visible-lines", this.minLines);
				}
				if (this.maxLines > 0) {
					this.style.setProperty("--max-visible-lines", this.maxLines);
				}
				
				// Calculate line-height in ems so we don't need to recalculate if font-size changes
				// TODO: Revisit once we can use the css 'lh' unit (fx >=120)
				let { lineHeight, fontSize } = getComputedStyle(this._input);
				let lineHeightRelative = parseFloat(lineHeight) / parseFloat(fontSize);
				if (isNaN(lineHeightRelative)) {
					this.style.setProperty('--line-height', '2ex');
				}
				else {
					this.style.setProperty('--line-height', lineHeightRelative + 'em');
				}
			}

			if (this.ariaLabel.length) {
				this._input.setAttribute('aria-label', this.ariaLabel);
			}
			if (this.ariaLabelledBy.length) {
				this._input.setAttribute('aria-labelledby', this.ariaLabelledBy);
			}
			this._input.value = this.value;
			
			// The actual input node can disappear if the component is moved
			if (this.childElementCount == 0) {
				this.replaceChildren(this._input);
			}

			if (autocompleteEnabled) {
				this._input.setAttribute('autocomplete', 'on');
				this._input.setAttribute('autocompletepopup', autocompleteParams.popup || '');
				this._input.setAttribute('autocompletesearch', autocompleteParams.search || '');
				delete autocompleteParams.popup;
				delete autocompleteParams.search;
				Object.assign(this._input, autocompleteParams);
				
				this._input.onTextEntered = () => {
					if (this.onTextEntered) {
						return this.onTextEntered();
					}
					return false;
				};
			}

			// Set text direction automatically if user has enabled bidi utilities
			if ((!this._input.dir || this._input.dir === 'auto') && lazy.BIDI_BROWSER_UI) {
				// If we haven't already guessed (or been given) a direction,
				// see if we can guess from the text
				if (!this.dir) {
					switch (window.windowUtils.getDirectionFromText(this._input.value)) {
						case Ci.nsIDOMWindowUtils.DIRECTION_RTL:
							this.dir = 'rtl';
							break;
						case Ci.nsIDOMWindowUtils.DIRECTION_LTR:
							this.dir = 'ltr';
							break;
						case Ci.nsIDOMWindowUtils.DIRECTION_NOT_SET:
						default:
							this.dir = 'auto';
							break;
					}
				}
				// If all we have is 'auto' but the input has no text, use the
				// app locale
				if (this.dir === 'auto' && !this._input.value) {
					this._input.dir = Zotero.dir;
				}
				// Otherwise, use the direction we guessed/were given
				else {
					this._input.dir = this.dir;
				}
			}
		}
		
		_handleInput = () => {
			if (!this.multiline) {
				this._input.value = this._input.value.replace(/\n/g, ' ');
			}
			this.setAttribute('value', this._input.value);
		};
		
		_handleChange = (event) => {
			if (Services.focus.activeWindow !== window) {
				event.stopPropagation();
			}
			this.setAttribute('value', this._input.value);
		};
		
		_handleFocus = () => {
			// If the last blur was ignored because it was caused by the window becoming inactive,
			// ignore this focus event as well
			if (this._ignoredWindowInactiveBlur) {
				this._ignoredWindowInactiveBlur = false;
				return;
			}
			
			this.cancelled = false;
			this._clearValue = false;

			let valueBeforeFocus = this.value;
			this.dispatchEvent(new CustomEvent('focus'));
			let valueAfterFocus = this.value;
			this.classList.add("focused");
			
			// Select all text if focused via keyboard
			if (!this._focusMousedownEvent) {
				this.select();
			}
			// Fix the cursor position if value or text alignment changed on mouse focus
			else if (valueBeforeFocus !== valueAfterFocus || getComputedStyle(this._input).direction !== Zotero.dir) {
				let pos = document.caretPositionFromPoint(this._focusMousedownEvent.clientX, this._focusMousedownEvent.clientY);
				if (pos.offsetNode === this._input) {
					this._input.selectionStart = this._input.selectionEnd = pos.offset;
				}
			}

			if (!('initialValue' in this._input.dataset)) {
				this._input.dataset.initialValue = this.value;
			}
			
			if (this.multipleValues) {
				if (!this.readOnly) {
					this._input.placeholder = '';
				}
				this._input.value = '';
				if (this._input.mController) {
					this._input.mController.startSearch("");
				}
			}
		};
		
		_handleBlur = () => {
			// Ignore this blur if it was caused by the window becoming inactive (see above)
			if (Services.focus.activeWindow !== window) {
				this._ignoredWindowInactiveBlur = true;
				return;
			}

			if (this.multipleValues) {
				if (this.cancelled || (this._input.value === '' && !this._clearValue)) {
					this.value = '';
					this.placeholder = Zotero.getString('item-pane-batch-editing-multiple-values-placeholder');
					this.cancelled = true;
				}
			}
			
			this.dispatchEvent(new Event('blur'));
			this._resetStateAfterBlur();
		};
		
		_resetStateAfterBlur() {
			this._ignoredWindowInactiveBlur = false;
			this._clearValue = false;
			this._focusMousedownEvent = null;
			this.classList.remove('focused');
			this._input.scrollLeft = 0;
			this._input.setSelectionRange(0, 0);
			delete this._input.dataset.initialValue;
		}

		_handleKeyDown = (event) => {
			if (event.key === 'Enter') {
				if (this.multiline === event.shiftKey) {
					event.preventDefault();
					this._input.blur();
				}
				// Do not let out shift-enter event on multiline, since it should never do
				// anything but add a linebreak to textarea
				if (this.multiline && !event.shiftKey) {
					event.stopPropagation();
				}
			}
			else if (event.key === 'Escape') {
				if (this.multipleValues) {
					this.cancelled = true;
				}
				else {
					let initialValue = this._input.dataset.initialValue ?? '';
					this.setAttribute('value', initialValue);
					this._input.value = initialValue;
				}
				this._input.blur();
			}
		};

		_captureAutocompleteKeydown = (event) => {
			// On Enter or Escape, mozilla stops propagation of the event which may interfere with out handling
			// of the focus. E.g. the event should be allowed to reach itemDetails from itemBox so that focus
			// can be moved to the itemTree or the reader.
			// https://searchfox.org/mozilla-central/source/toolkit/content/widgets/autocomplete-input.js#564
			// To avoid it, capture Enter and Escape keydown events and handle them without stopping propagation.
			if (this._input.autocomplete !== "on" || !["Enter", "Escape"].includes(event.key)) return;
			event.preventDefault();
			if (event.key == "Enter") {
				this._input.handleEnter();
			}
			else if (event.key == "Escape") {
				this._input.mController.handleEscape();
			}
		};
		
		_handleMouseDown = (event) => {
			// Prevent a right-click from focusing the input when unfocused
			if (event.button === 2 && document.activeElement !== this._input) {
				event.preventDefault();
			}
			else {
				this._focusMousedownEvent = event;
			}
		};
		
		_handleTouchStart = (event) => {
			let touch = event.touches.length === 1 && event.touches[0];
			let lastTap = EditableText._lastTouchTap;
			EditableText._lastTouchTap = null;
			if (!touch) {
				this._touchSelection = null;
				return;
			}
			let doubleTap = !!lastTap
				&& event.timeStamp - lastTap.time <= DOUBLE_TAP_DELAY
				&& Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) <= DOUBLE_TAP_SLOP;
			this._touchSelection = {
				mode: doubleTap ? 'doubleTap' : 'none',
				x: touch.clientX,
				y: touch.clientY,
				moved: false
			};
		};

		_handleTouchMove = (event) => {
			let state = this._touchSelection;
			let touch = event.touches[0];
			if (!state || !touch) {
				return;
			}
			// Dragging after a double tap selects words, starting from the tapped one
			if (state.mode === 'doubleTap') {
				state.mode = this._startTouchWordSelection(state.x, state.y) ? 'selecting' : 'none';
			}
			if (state.mode === 'selecting') {
				// Keep the drag from scrolling
				event.preventDefault();
				this._extendTouchWordSelection(touch.clientX, touch.clientY);
				return;
			}
			if (Math.hypot(touch.clientX - state.x, touch.clientY - state.y) > DOUBLE_TAP_SLOP) {
				state.moved = true;
			}
		};

		_handleTouchEnd = (event) => {
			let state = this._touchSelection;
			this._touchSelection = null;
			if (!state) {
				return;
			}
			if (state.mode === 'selecting') {
				// Don't let the compatibility mouse events for lifting the finger collapse the selection
				event.preventDefault();
				return;
			}
			if (state.mode === 'none' && !state.moved && !event.touches.length) {
				EditableText._lastTouchTap = { x: state.x, y: state.y, time: event.timeStamp };
			}
		};

		_handleTouchCancel = () => {
			this._touchSelection = null;
		};

		_handleContextMenu = (event) => {
			// A long press with a finger fires contextmenu with the main button
			let state = this._touchSelection;
			if (!state || event.pointerType !== 'touch' || event.button !== 0) {
				return;
			}
			let input = this._input;
			if (this.focused && input.selectionStart !== input.selectionEnd) {
				let offset = this._getTouchOffset(event.clientX, event.clientY);
				if (offset !== null && offset >= input.selectionStart && offset <= input.selectionEnd) {
					// Over the selection: show the context menu
					return;
				}
			}
			if (!this._startTouchWordSelection(event.clientX, event.clientY)) {
				return;
			}
			state.mode = 'selecting';
			// Don't show any context menu (including the item box's)
			event.preventDefault();
			event.stopPropagation();
		};

		/**
		 * Select the word at the given client coordinates, focusing the field if necessary
		 *
		 * @return {Boolean} - Whether a word was selected
		 */
		_startTouchWordSelection(x, y) {
			let input = this._input;
			if (!this.focused) {
				// Focus as if clicked at the point, rather than selecting everything as when
				// focusing via the keyboard (the value can change on focus, so offsets have to
				// be determined afterwards)
				this._focusMousedownEvent = { clientX: x, clientY: y };
				input.focus();
			}
			let offset = this._getTouchOffset(x, y);
			let word = offset !== null && this._getWordAt(offset);
			if (!word?.isWordLike) {
				return false;
			}
			this._touchSelectionAnchor = [word.start, word.end];
			input.setSelectionRange(word.start, word.end);
			return true;
		}

		_extendTouchWordSelection(x, y) {
			let input = this._input;
			let offset = this._getTouchOffset(x, y);
			// Past the field: extend to the start or end
			if (offset === null) {
				let rect = input.getBoundingClientRect();
				if (y < rect.top || x < rect.left) {
					offset = 0;
				}
				else if (y > rect.bottom || x > rect.right) {
					offset = input.value.length;
				}
				else {
					return;
				}
			}
			let [anchorStart, anchorEnd] = this._touchSelectionAnchor;
			let word = this._getWordAt(offset);
			if (word && word.start < anchorStart) {
				input.setSelectionRange(word.start, anchorEnd, 'backward');
			}
			else {
				input.setSelectionRange(anchorStart, Math.max(word?.end ?? offset, anchorEnd), 'forward');
			}
		}

		_getTouchOffset(x, y) {
			let pos = document.caretPositionFromPoint(x, y);
			return pos?.offsetNode === this._input ? pos.offset : null;
		}

		/**
		 * @return {{ start: Number, end: Number, isWordLike: Boolean } | null}
		 */
		_getWordAt(offset) {
			let value = this._input.value;
			if (!value) {
				return null;
			}
			let segments = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value);
			let segment = segments.containing(Math.min(offset, value.length - 1));
			// A point on the right half of a word's last character gives the offset after it
			if (!segment.isWordLike && offset > 0) {
				let previous = segments.containing(offset - 1);
				if (previous.isWordLike) {
					segment = previous;
				}
			}
			return {
				start: segment.index,
				end: segment.index + segment.segment.length,
				isWordLike: !!segment.isWordLike
			};
		}

		_handleDragOver = (event) => {
			// If the input is not focused, override the default drop behavior
			if ((document.activeElement !== this._input || Services.focus.activeWindow !== window)
					&& !this.readOnly
					&& event.dataTransfer.getData('text/plain')) {
				event.preventDefault();
				event.dataTransfer.dropEffect = 'copy';
			}
		};
		
		_handleDrop = (event) => {
			// If the input is not focused, replace its entire value with the dropped text
			// Otherwise, the normal drop effect takes place and the text is inserted at the cursor
			if ((document.activeElement !== this._input || Services.focus.activeWindow !== window)
					&& !this.readOnly
					&& event.dataTransfer.getData('text/plain')) {
				event.preventDefault();
				document.activeElement?.blur();
				// Wait a tick to work around an apparent Firefox bug where the cursor stays inside the old
				// input even though the new input becomes visually focused
				setTimeout(() => {
					this.focus();
					this._input.value = event.dataTransfer.getData('text/plain');
					this._handleInput();
				});
			}
		};
		
		_isOverflowing() {
			// Very small floating-point-error allowance
			const EPSILON = 0.001;
			return (
				// We're overflowing if the field can scroll at least a pixel
				this._input.scrollLeftMax > 0
				// But sometimes it can scroll a *sub*pixel, and every single
				// scroll size-related method, including privileged JS hacks,
				// rounds scroll-related values to the nearest int.
				// If integer math puts us within a pixel of overflow,
				// rerun the calculations using exact floating-point values
				|| (
					Math.abs(this._input.scrollWidth - this._input.clientWidth) <= 1
					&& this._getContentWidth() > this._input.getBoundingClientRect().width + EPSILON
				)
			);
		}

		focus(options) {
			// If the window isn't active, the focus event won't fire yet,
			// so store the initial value now
			if (this._input && Services.focus.activeWindow !== window && !('initialValue' in this._input.dataset)) {
				this._input.dataset.initialValue = this._input.value;
			}
			this._input?.focus(options);
		}
		
		blur() {
			this._input?.blur();
			
			// This is a programmatic blur, so reset our state even if the
			// window is inactive
			this._resetStateAfterBlur();
		}
		
		get focused() {
			return this._input && document.activeElement === this._input;
		}
		
		select() {
			this._input.setSelectionRange(0, this._input.value.length, "backward");
		}
	}
	customElements.define("editable-text", EditableText);
	
	document.addEventListener('contextmenu', (event) => {
		if (event.defaultPrevented
				|| !event.target.closest('editable-text')
				|| document.activeElement && event.target.contains(document.activeElement)) {
			return;
		}
		
		event.preventDefault();
		
		let editableText = event.target.closest('editable-text');
		let menupopup = document.getElementById('zotero-editable-text-menu');
		if (!menupopup) {
			menupopup = document.createXULElement('menupopup');
			menupopup.id = 'zotero-editable-text-menu';
			
			let popupset = document.querySelector('popupset');
			if (!popupset) {
				popupset = document.createXULElement('popupset');
				document.documentElement.append(popupset);
			}
			popupset.append(menupopup);
		}

		menupopup.addEventListener('popupshowing', () => {
			Zotero.Utilities.Internal.updateEditContextMenu(menupopup, editableText);
		}, { once: true });
		menupopup.openPopupAtScreen(event.screenX + 1, event.screenY + 1, true);
	});
}
