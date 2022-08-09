/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2006–2013 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
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

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/osfile.jsm");
import FilePicker from 'zotero/modules/filePicker';

Zotero_Preferences.General = {
	DEFAULT_OPENURL_RESOLVER: 'https://www.worldcat.org/registry/gateway',
	
	_openURLResolvers: null,

	init: function () {
		// JS-based strings
		var checkbox = document.getElementById('launchNonNativeFiles-checkbox');
		if (checkbox) {
			checkbox.label = Zotero.getString(
				'zotero.preferences.launchNonNativeFiles', Zotero.appName
			);
		}
		var menuitem = document.getElementById('fileHandler-internal');
		menuitem.setAttribute('label', Zotero.appName);

		// Set OpenURL resolver drop-down to last-known name
		if (Zotero.Prefs.get('openURL.resolver')) {
			let name = Zotero.Prefs.get('openURL.name');
			if (name) {
				document.getElementById('openurl-primary-popup').firstChild.setAttribute('label', name);
			}
		}
		
		this.refreshLocale();
		this.updateAutoRenameFilesUI();
		this._updateFileHandlerUI();
	},

	_getAutomaticLocaleMenuLabel: function () {
		return Zotero.getString(
			'zotero.preferences.locale.automaticWithLocale',
			Zotero.Locale.availableLocales[Zotero.locale] || Zotero.locale
		);
	},
	
	
	refreshLocale: function () {
		var autoLocaleName, currentValue;
		
		// If matching OS, get the name of the current locale
		if (Zotero.Prefs.get('intl.locale.requested', true) === '') {
			autoLocaleName = this._getAutomaticLocaleMenuLabel();
			currentValue = 'automatic';
		}
		// Otherwise get the name of the locale specified in the pref
		else {
			autoLocaleName = Zotero.getString('zotero.preferences.locale.automatic');
			currentValue = Zotero.locale;
		}
		
		// Populate menu
		var menu = document.getElementById('locale-menu');
		var menupopup = menu.firstChild;
		menupopup.textContent = '';
		// Show "Automatic (English)", "Automatic (Français)", etc.
		menu.appendItem(autoLocaleName, 'automatic');
		menu.menupopup.appendChild(document.createXULElement('menuseparator'));
		// Add all available locales
		for (let locale in Zotero.Locale.availableLocales) {
			menu.appendItem(Zotero.Locale.availableLocales[locale], locale);
		}
		menu.value = currentValue;
	},
	
	onLocaleChange: function () {
		var requestedLocale = Services.locale.requestedLocale;
		var menu = document.getElementById('locale-menu');
		
		if (menu.value == 'automatic') {
			// Changed if not already set to automatic (unless we have the automatic locale name,
			// meaning we just switched away to the same manual locale and back to automatic)
			var changed = requestedLocale
				&& requestedLocale == Zotero.locale
				&& menu.label != this._getAutomaticLocaleMenuLabel();
			Services.locale.requestedLocales = null;
		}
		else {
			// Changed if moving to a locale other than the current one
			var changed = requestedLocale != menu.value
			Services.locale.requestedLocales = [menu.value];
		}
		
		if (!changed) {
			return;
		}
		
		var ps = Services.prompt;
		var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
			+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING;
		var index = ps.confirmEx(null,
			Zotero.getString('general.restartRequired'),
			Zotero.getString('general.restartRequiredForChange', Zotero.appName),
			buttonFlags,
			Zotero.getString('general.restartNow'),
			Zotero.getString('general.restartLater'),
			null, null, {});
		
		if (index == 0) {
			Zotero.Utilities.Internal.quitZotero(true);
		}
	},
	
	updateAutoRenameFilesUI: function () {
		setTimeout(() => {
			document.getElementById('rename-linked-files').disabled = !Zotero.Prefs.get('autoRenameFiles');
		});
	},
	
	//
	// File handlers
	//
	chooseFileHandler: async function (type) {
		var pref = this._getFileHandlerPref(type);
		var currentPath = Zotero.Prefs.get(pref);
		
		var fp = new FilePicker();
		if (currentPath && currentPath != 'system') {
			fp.displayDirectory = OS.Path.dirname(currentPath);
		}
		fp.init(
			window,
			Zotero.getString('zotero.preferences.chooseApplication'),
			fp.modeOpen
		);
		fp.appendFilters(fp.filterApps);
		if (await fp.show() != fp.returnOK) {
			this._updateFileHandlerUI();
			return false;
		}
		this.setFileHandler(type, fp.file);
	},
	
	setFileHandler: function (type, handler) {
		var pref = this._getFileHandlerPref(type);
		Zotero.Prefs.set(pref, handler);
		this._updateFileHandlerUI();
	},
	
	_updateFileHandlerUI: function () {
		var handler = Zotero.Prefs.get('fileHandler.pdf');
		var menulist = document.getElementById('fileHandler-pdf');
		var customMenuItem = document.getElementById('fileHandler-custom');
		
		// System default
		if (handler == 'system') {
			customMenuItem.hidden = true;
			menulist.selectedIndex = 1;
		}
		// Custom handler
		else if (handler) {
			let icon;
			try {
				let urlspec = Zotero.File.pathToFileURI(handler);
				icon = "moz-icon://" + urlspec + "?size=16";
			}
			catch (e) {
				Zotero.logError(e);
			}
			
			let handlerFilename = OS.Path.basename(handler);
			if (Zotero.isMac) {
				handlerFilename = handlerFilename.replace(/\.app$/, '');
			}
			customMenuItem.setAttribute('label', handlerFilename);
			if (icon) {
				customMenuItem.className = 'menuitem-iconic';
				customMenuItem.setAttribute('image', icon);
			}
			else {
				customMenuItem.className = '';
			}
			customMenuItem.hidden = false;
			menulist.selectedIndex = 2;

			// There's almost certainly a better way to do this...
			// but why doesn't the icon just behave by default?
			menulist.shadowRoot.querySelector('[part="icon"]').style.height = '16px';
		}
		// Zotero
		else {
			let menuitem = document.getElementById('fileHandler-internal');
			menulist.selectedIndex = 0;
			customMenuItem.hidden = true;
		}
	},
	
	_getFileHandlerPref: function (type) {
		if (type != 'pdf') {
			throw new Error(`Unknown file type ${type}`);
		}
		return 'fileHandler.pdf';
	},

	handleOpenURLPopupShowing: async function (event) {
		if (event.target.id != 'openurl-primary-popup') {
			return;
		}
		if (!this._openURLResolvers) {
			let menupopup = document.getElementById('openurl-primary-popup');
			menupopup.firstChild.setAttribute('label', Zotero.getString('general.loading'));
			try {
				this._openURLResolvers = await Zotero.Utilities.Internal.OpenURL.getResolvers();
			}
			catch (e) {
				Zotero.logError(e);
				menupopup.firstChild.setAttribute('label', "Error loading resolvers");
				return;
			}
		}
		this.updateOpenURLResolversMenu();
	},
	
	
	updateOpenURLResolversMenu: function () {
		if (!this._openURLResolvers) {
			Zotero.debug("Resolvers not loaded -- not updating menu");
			return;
		}
		
		var currentResolver = Zotero.Prefs.get('openURL.resolver');
		
		var openURLMenu = document.getElementById('openurl-menu');
		var menupopup = openURLMenu.firstChild;
		menupopup.innerHTML = '';
		
		var defaultMenuItem = document.createXULElement('menuitem');
		defaultMenuItem.setAttribute('label', Zotero.getString('general.default'));
		defaultMenuItem.setAttribute('value', this.DEFAULT_OPENURL_RESOLVER);
		defaultMenuItem.setAttribute('type', 'checkbox');
		menupopup.appendChild(defaultMenuItem);
		
		var customMenuItem = document.createXULElement('menuitem');
		customMenuItem.setAttribute('label', Zotero.getString('general.custom'));
		customMenuItem.setAttribute('value', 'custom');
		customMenuItem.setAttribute('type', 'checkbox');
		menupopup.appendChild(customMenuItem);
		
		menupopup.appendChild(document.createXULElement('menuseparator'));
		
		var selectedName;
		var lastContinent;
		var lastCountry;
		var currentContinentPopup;
		var currentMenuPopup;
		for (let r of this._openURLResolvers) {
			// Create submenus for continents
			if (r.continent != lastContinent) {
				let menu = document.createXULElement('menu');
				menu.setAttribute('label', r.continent);
				openURLMenu.firstChild.appendChild(menu);
				
				currentContinentPopup = currentMenuPopup = document.createXULElement('menupopup');
				menu.appendChild(currentContinentPopup);
				lastContinent = r.continent;
			}
			if (r.country != lastCountry) {
				// If there's a country, create a submenu for it
				if (r.country) {
					let menu = document.createXULElement('menu');
					menu.setAttribute('label', r.country);
					currentContinentPopup.appendChild(menu);
					
					let menupopup = document.createXULElement('menupopup');
					menu.appendChild(menupopup);
					currentMenuPopup = menupopup;
				}
				// Otherwise use the continent popup
				else {
					currentMenuPopup = currentContinentPopup;
				}
				lastCountry = r.country;
			}
			let menuitem = document.createXULElement('menuitem');
			menuitem.setAttribute('label', r.name);
			menuitem.setAttribute('value', r.url);
			menuitem.setAttribute('type', 'checkbox');
			currentMenuPopup.appendChild(menuitem);
			var checked = r.url == Zotero.Prefs.get('openURL.resolver');
			menuitem.setAttribute('checked', checked);
			if (checked) {
				selectedName = r.name;
			}
		}
		
		// Default
		if (currentResolver == this.DEFAULT_OPENURL_RESOLVER) {
			openURLMenu.setAttribute('label', Zotero.getString('general.default'));
			defaultMenuItem.setAttribute('checked', true);
			Zotero.Prefs.clear('openURL.name');
		}
		else if (selectedName) {
			openURLMenu.setAttribute('label', selectedName);
			// If we found a match, update stored name
			Zotero.Prefs.set('openURL.name', selectedName);
		}
		// Custom
		else {
			openURLMenu.setAttribute('label', Zotero.getString('general.custom'));
			customMenuItem.setAttribute('checked', true);
			Zotero.Prefs.clear('openURL.name');
		}
	},
	
	
	handleOpenURLSelected: function (event) {
		event.stopPropagation();
		event.preventDefault();
		
		if (event.target.localName != 'menuitem') {
			Zotero.debug("Ignoring click on " + event.target.localName);
			return;
		}
		
		var openURLMenu = document.getElementById('openurl-menu');
		
		var openURLServerField = document.getElementById('openURLServerField');
		var openURLVersionMenu = document.getElementById('openURLVersionMenu');
		
		// Default
		if (event.target.value == this.DEFAULT_OPENURL_RESOLVER) {
			Zotero.Prefs.clear('openURL.name');
			Zotero.Prefs.clear('openURL.resolver');
			Zotero.Prefs.clear('openURL.version');
			openURLServerField.value = this.DEFAULT_OPENURL_RESOLVER;
		}
		// If "Custom" selected, clear URL field
		else if (event.target.value == "custom") {
			Zotero.Prefs.clear('openURL.name');
			Zotero.Prefs.set('openURL.resolver', '');
			Zotero.Prefs.clear('openURL.version');
			openURLServerField.value = '';
			openURLServerField.focus();
		}
		else {
			Zotero.Prefs.set('openURL.name', openURLServerField.value = event.target.label);
			Zotero.Prefs.set('openURL.resolver', openURLServerField.value = event.target.value);
			Zotero.Prefs.set('openURL.version', openURLVersionMenu.value = "1.0");
		}
		
		openURLMenu.firstChild.hidePopup();
		
		setTimeout(() => {
			this.updateOpenURLResolversMenu();
		});
	},
	
	onOpenURLCustomized: function () {
		setTimeout(() => {
			this.updateOpenURLResolversMenu();
		});
	}
}
