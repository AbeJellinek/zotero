window.addEventListener('DOMContentLoaded', () => {
	// Don't need to depend on Zotero object here
	let isWin = AppConstants.platform == 'win';
	let isMac = AppConstants.platform == 'macosx';

	let redoKey = document.getElementById('key_redo');

	let fileQuitSeparator = document.getElementById('menu_fileQuitSeparatorNonMac');
	let fileQuitItemWin = document.getElementById('menu_fileQuitItemWin');
	let fileQuitItemUnix = document.getElementById('menu_fileQuitItemUnix');

	let editPreferencesSeparator = document.getElementById('menu_EditPreferencesSeparator');
	let editPreferencesItem = document.getElementById('menu_EditPreferencesItem');

	let applicationMenu = document.getElementById('mac_application_menu');
	let windowMenu = document.getElementById('windowMenu');
	let macKeyset = document.getElementById('macKeyset');

	if (isWin) {
		// Set behavior on Windows only
		if (redoKey) {
			redoKey.setAttribute('data-l10n-id', 'text-action-redo-shortcut');
			redoKey.setAttribute('modifiers', 'accel');
		}
	}
	else {
		// Set behavior on all non-Windows platforms
		if (redoKey) {
			redoKey.setAttribute('data-l10n-id', 'text-action-undo-shortcut');
			redoKey.setAttribute('modifiers', 'accel,shift');
		}
	}

	if (isMac) {
		// Set behavior on macOS only
		if (fileQuitSeparator) fileQuitSeparator.hidden = true;
		if (fileQuitItemWin) fileQuitItemWin.hidden = true;
		if (fileQuitItemUnix) fileQuitItemUnix.hidden = true;
		if (editPreferencesSeparator) editPreferencesSeparator.hidden = true;
		if (editPreferencesItem) editPreferencesItem.hidden = true;

		// Monkey-patch the toolbarbutton CE so it shows a native menu popup
		let MozToolbarbutton = customElements.get('toolbarbutton');
		if (MozToolbarbutton) {
			let originalRender = MozToolbarbutton.prototype.render;
			MozToolbarbutton.prototype.render = function () {
				originalRender.apply(this);
				if (!this._zoteroMouseDownListenerAdded) {
					this.addEventListener('mousedown', (event) => {
						if (!event.defaultPrevented
								&& !this.disabled
								&& this.getAttribute('nonnativepopup') != 'true'
								&& Zotero.Utilities.Internal.showNativeElementPopup(this)) {
							event.preventDefault();
						}
					});
					this._zoteroMouseDownListenerAdded = true;
				}
			};
		}
	}
	else {
		// Set behavior on all non-macOS platforms
		if (applicationMenu) applicationMenu.hidden = true;
		if (windowMenu) windowMenu.hidden = true;
		// DEBUG: This doesn't disable Ctrl-Q, which shouldn't be active on Windows
		// (fx102 follow-up to https://github.com/zotero/zotero/pull/3010)
		if (macKeyset) macKeyset.disabled = true;
		
		if (isWin) {
			fileQuitItemUnix.hidden = true;
		}
		else {
			fileQuitItemWin.hidden = true;
		}
	}
});
