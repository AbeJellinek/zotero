/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
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
	class Sticky extends XULElementBase {
		get scrollParentSelector() {
			return this.getAttribute('scroll-parent') || '.zotero-view-item-main';
		}
		
		set scrollParentSelector(selector) {
			this.setAttribute('scroll-parent', selector);
		}
		
		get scrollParent() {
			return this.closest(this.scrollParentSelector);
		}
		
		get box() {
			return this.querySelector(':scope > :not(.replacement)');
		}
		
		init() {
			let replacement = document.createElement('div');
			replacement.classList.add('replacement');
			replacement.hidden = true;
			this._replacement = replacement;
			this.append(replacement);
			
			let intersectionObserver = new IntersectionObserver(([{ target, intersectionRatio }]) => {
				let scrollParent = this.scrollParent;
				let box = this.box;
				
				let stuck = scrollParent && box
					&& box.getBoundingClientRect().top <= this.scrollParent.getBoundingClientRect().top
					&& (target === this.box || intersectionRatio < 1);
				this._setStuck(stuck);
			}, { threshold: 1 });

			// Attach the observer now, and reattach it if the child is added/replaced
			intersectionObserver.observe(replacement);
			if (this.box) {
				intersectionObserver.observe(this.box);
			}
			new MutationObserver(() => {
				intersectionObserver.disconnect();
				intersectionObserver.observe(replacement);
				if (this.box) {
					intersectionObserver.observe(this.box);
				}
			}).observe(this, { childList: true });

			// An element with position: fixed will eat wheel events, so dispatch them
			// to the parent manually
			this.addEventListener('wheel', (event) => {
				this.parentElement.dispatchEvent(new WheelEvent('wheel', event));
			});
		}
		
		_setStuck(stuck) {
			this.classList.toggle('stuck', stuck);
			this._replacement.hidden = !stuck;
			if (stuck) {
				this._replacement.style.height = `${this.box.offsetHeight || this.box.getBoundingClientRect().height}px`;
			}
		}
	}

	customElements.define("sticky", Sticky);
}
