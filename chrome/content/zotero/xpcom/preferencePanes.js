/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2022 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
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

/**
 * Manages preference panes.
 */
Zotero.PreferencePanes = {
	builtInPanes: Object.freeze([
		{
			id: 'zotero-prefpane-general',
			label: 'zotero.preferences.prefpane.general',
			image: 'chrome://zotero/skin/prefs-general.png',
			src: 'chrome://zotero/content/preferences/preferences_general.xhtml',
			scripts: ['chrome://zotero/content/preferences/preferences_general.js'],
			defaultXUL: true,
		},
		{
			id: 'zotero-prefpane-sync',
			label: 'zotero.preferences.prefpane.sync',
			image: 'chrome://zotero/skin/prefs-sync.png',
			src: 'chrome://zotero/content/preferences/preferences_sync.xhtml',
			scripts: ['chrome://zotero/content/preferences/preferences_sync.js'],
			defaultXUL: true,
		},
		{
			id: 'zotero-prefpane-export',
			label: 'zotero.preferences.prefpane.export',
			image: 'chrome://zotero/skin/prefs-export.png',
			src: 'chrome://zotero/content/preferences/preferences_export.xhtml',
			scripts: ['chrome://zotero/content/preferences/preferences_export.js'],
			defaultXUL: true,
		},
		{
			id: 'zotero-prefpane-cite',
			label: 'zotero.preferences.prefpane.cite',
			image: 'chrome://zotero/skin/prefs-styles.png',
			src: 'chrome://zotero/content/preferences/preferences_cite.xhtml',
			scripts: ['chrome://zotero/content/preferences/preferences_cite.js'],
			defaultXUL: true,
		},
		{
			id: 'zotero-prefpane-advanced',
			label: 'zotero.preferences.prefpane.advanced',
			image: 'chrome://zotero/skin/prefs-advanced.png',
			src: 'chrome://zotero/content/preferences/preferences_advanced.xhtml',
			scripts: ['chrome://zotero/content/preferences/preferences_advanced.js'],
			defaultXUL: true,
		},
		{
			id: 'zotero-subpane-reset-sync',
			parent: 'zotero-prefpane-sync',
			label: 'zotero.preferences.subpane.resetSync',
			src: 'chrome://zotero/content/preferences/preferences_sync_reset.xhtml',
			scripts: ['chrome://zotero/content/preferences/preferences_sync.js'],
			defaultXUL: true,
		}
	]),

	pluginPanes: [],

	/**
	 * Register a pane to be displayed in the preferences. The pane XHTML (`src`)
	 * is loaded as a fragment, not a full document, with XUL as the default
	 * namespace and (X)HTML tags available under `html:`.
	 *
	 * The pane will be unregistered automatically when the registering plugin
	 * shuts down.
	 *
	 * @param {Object} options
	 * @param {String} options.id Represents the pane and must be unique
	 * @param {String} options.pluginID ID of the plugin registering the pane
	 * @param {String} [options.parent] ID of parent pane (if provided, pane is hidden from the sidebar)
	 * @param {String} [options.label] Displayed as the pane's label in the sidebar.
	 * 		If not provided, the plugin's name is used
	 * @param {String} [options.image] URI of an icon to be displayed in the navigation sidebar.
	 * 		If not provided, the plugin's icon (from manifest.json) is used
	 * @param {String} options.src URI of an XHTML fragment
	 * @param {String[]} [options.extraDTD] Array of URIs of DTD files to use for parsing the XHTML fragment
	 * @param {String[]} [options.scripts] Array of URIs of scripts to load along with the pane
	 * @return {Promise<void>}
	 */
	register: async function (options) {
		if (!options.id || !options.pluginID || !options.src) {
			throw new Error('id, pluginID, and src must be provided');
		}
		if (this.builtInPanes.some(p => p.id === options.id)
			|| this.pluginPanes.some(p => p.id === options.id)) {
			throw new Error(`Pane with ID ${options.id} already registered`);
		}

		let addPaneOptions = {
			id: options.id,
			pluginID: options.pluginID,
			parent: options.parent,
			rawLabel: options.label || await Zotero.Plugins.getName(options.pluginID),
			image: options.image || await Zotero.Plugins.getIconURI(options.pluginID, 24),
			src: options.src,
			extraDTD: options.extraDTD,
			scripts: options.scripts,
			defaultXUL: false,
		};

		this.pluginPanes.push(addPaneOptions);
		Zotero.debug(`Plugin ${options.pluginID} registered preference pane ${options.id} ("${addPaneOptions.rawLabel}")`);
		this._refreshPreferences();
		this._ensureObserverAdded();
	},

	/**
	 * Called automatically on plugin shutdown.
	 *
	 * @param {String} id
	 */
	unregister: function (id) {
		this.pluginPanes = this.pluginPanes.filter(p => p.id !== id);
		this._refreshPreferences();
	},
	
	_refreshPreferences() {
		for (let win of Services.wm.getEnumerator("zotero:pref")) {
			win.Zotero_Preferences.initPanes();
		}
	},
	
	_ensureObserverAdded() {
		if (this._observerAdded) {
			return;
		}
		
		Zotero.Plugins.addObserver({
			shutdown({ id: pluginID }) {
				let beforeLength = this.pluginPanes.length;
				this.pluginPanes = this.pluginPanes.filter(pane => pane.pluginID !== pluginID);
				if (this.pluginPanes.length !== beforeLength) {
					Zotero.debug(`Preference panes registered by plugin ${pluginID} unregistered due to shutdown`);
					this._refreshPreferences();
				}
			}
		});
		this._observerAdded = true;
	}
};
