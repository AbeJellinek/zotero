/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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

/*const { E10SUtils } = ChromeUtils.import(
	"resource://gre/modules/E10SUtils.jsm"
);*/

var browser;

window.addEventListener("load", /*async */function() {
	ensureBrowserType('content');
	
	/*
	browser.setAttribute("remote", "true");
	//browser.setAttribute("remoteType", E10SUtils.EXTENSION_REMOTE_TYPE);
	
	await new Promise((resolve) => {
		browser.addEventListener("XULFrameLoaderCreated", () => resolve());
	});
	*/
	
	/*browser.messageManager.loadFrameScript(
		'chrome://zotero/content/standalone/basicViewerContent.js',
		false
	);*/
	//browser.docShellIsActive = false;

	// Load URI passed in as nsISupports .data via openWindow()
	loadURI(window.arguments[0]);
}, false);

window.addEventListener("keypress", function (event) {
	// Cmd-R/Ctrl-R (with or without Shift) to reload
	if (((Zotero.isMac && event.metaKey && !event.ctrlKey)
			|| (!Zotero.isMac && event.ctrlKey))
			&& !event.altKey && event.which == 114) {
		browser.reloadWithFlags(browser.webNavigation.LOAD_FLAGS_BYPASS_CACHE);
	}
});

// Handle <label class="text-link />
window.addEventListener("click", function (event) {
	if (event.originalTarget.localName == 'label'
			&& event.originalTarget.classList.contains('text-link')) {
		Zotero.launchURL(event.originalTarget.getAttribute('href'));
	}
});

function ensureBrowserType(type) {
	let oldBrowser = browser;
	if (!oldBrowser || oldBrowser.getAttribute('type') != type) {
		browser = document.createXULElement('browser');
		let attrs = {
			type,
			flex: 1,
			remote: false,
			maychangeremoteness: true,
			disableglobalhistory: true,
		};
		for (let [attr, value] of Object.entries(attrs)) {
			browser.setAttribute(attr, value);
		}
		if (oldBrowser) {
			oldBrowser.replaceWith(browser);
		}
		else {
			document.querySelector('#appcontent').append(browser);
		}
		browser.addEventListener('pagetitlechanged', () => {
			document.title = browser.contentTitle || browser.currentURI.spec;
		});
		return browser;
	}
	else {
		return oldBrowser;
	}
}

function loadURI(uri) {
	// The zotero protocol handler will not load in a type="content" browser
	// As a temporary fix, replace the browser with one of the correct type if necessary
	// (The type attribute can't be changed after the browser is created)
	ensureBrowserType(uri.startsWith('zotero:') ? 'chrome' : 'content').loadURI(
		uri,
		{
			triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
		}
	);
}
