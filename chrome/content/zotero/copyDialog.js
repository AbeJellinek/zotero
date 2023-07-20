import ItemTree from 'zotero/itemTree';

let io = window.arguments[0];

let Zotero_Copy_Dialog = {
	items: [],
	targetLibraryID: null,
	childNoteItems: [],
	childFileAttachmentItems: [],
	childLinkAttachmentItems: [],
	linkedItemsInTargetLibrary: new Map(),
	overwriteExistingItems: true,

	// Outputs
	includeAnnotations: true,
	includeTags: true,
	excludedItemIDs: new Set(),
	
	itemsView: null,

	async doLoad() {
		this.items = [...io.items];
		this.targetLibraryID = io.targetLibraryID;
		this.includeAnnotations = io.includeAnnotations;
		this.includeTags = io.includeTags;
		
		if (io.excludedItemIDs) {
			for (let id of io.excludedItemIDs) {
				this.excludedItemIDs.add(id);
			}
		}
		
		document.addEventListener('dialogaccept', () => this.onAccept());
		
		for (let item of this.items) {
			if (!item.isNote()) {
				for (let id of item.getNotes(false)) {
					let child = Zotero.Items.get(id);
					this.childNoteItems.push(child);
					if (!io.includeNotes) {
						this.excludedItemIDs.add(id);
					}
					
					let linkedChild = await child.getLinkedItem(this.targetLibraryID, true);
					if (linkedChild && !linkedChild.deleted && !(linkedChild.parentItem?.deleted)) {
						this.linkedItemsInTargetLibrary.set(id, linkedChild);
					}
				}
			}
			if (!item.isAttachment()) {
				for (let id of item.getAttachments(false)) {
					let child = Zotero.Items.get(id);
					if (child.isFileAttachment()) {
						this.childFileAttachmentItems.push(child);
						if (!io.includeFiles) {
							this.excludedItemIDs.add(id);
						}
					}
					// This is currently always true if isFileAttachment() is not, but we should check explicitly
					// in case that ever changes
					else if (child.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
						this.childLinkAttachmentItems.push(child);
						if (!io.includeLinks) {
							this.excludedItemIDs.add(id);
						}
					}
					
					let linkedChild = await child.getLinkedItem(this.targetLibraryID, true);
					if (linkedChild && !linkedChild.deleted && !(linkedChild.parentItem?.deleted)) {
						this.linkedItemsInTargetLibrary.set(id, linkedChild);
					}
				}
			}
			
			let linkedItem = await item.getLinkedItem(this.targetLibraryID, true);
			if (linkedItem && !linkedItem.deleted) {
				this.linkedItemsInTargetLibrary.set(item.id, linkedItem);
			}
		}
		
		let overwriteExistingItemsCheckbox = document.getElementById('overwrite-existing-items-checkbox');
		overwriteExistingItemsCheckbox.addEventListener('command', () => {
			this.overwriteExistingItems = overwriteExistingItemsCheckbox.checked;
			for (let itemID of this.linkedItemsInTargetLibrary.keys()) {
				this.setExcluded(Zotero.Items.get(itemID), !this.overwriteExistingItems);
			}
			this.updateUI();
		});
		
		let toggleByTypeButton = document.getElementById('toggle-by-type');
		toggleByTypeButton.label = Zotero.getString('copyDialog.selectByType');
		let toggleByTypePanel = document.getElementById('toggle-by-type-panel');
		toggleByTypeButton.addEventListener('command', () => {
			toggleByTypePanel.openPopup(toggleByTypeButton, 'after_start', 0, 0, false, false);
		});

		let toggleSelected = document.getElementById('toggle-selected');
		toggleSelected.addEventListener('command', () => {
			this.toggleSelectedItems();
		});
		
		let treeContainer = document.getElementById('zotero-items-pane-content');
		treeContainer.addEventListener('keydown', (event) => {
			if (event.key == ' ') {
				event.stopPropagation();
				this.toggleSelectedItems();
			}
		}, true);

		let notesCheckbox = document.getElementById('notes-checkbox');
		notesCheckbox.addEventListener('change',
			() => this._updateItems(notesCheckbox, this.childNoteItems));
		
		let filesCheckbox = document.getElementById('files-checkbox');
		filesCheckbox.addEventListener('change',
			() => this._updateItems(filesCheckbox, this.childFileAttachmentItems));
		
		let childLinksCheckbox = document.getElementById('child-links-checkbox');
		childLinksCheckbox.addEventListener('change',
			() => this._updateItems(childLinksCheckbox, this.childLinkAttachmentItems));
		
		let annotationsCheckbox = document.getElementById('annotations-checkbox');
		annotationsCheckbox.addEventListener('change', (event) => {
			this.includeAnnotations = event.target.checked;
		});
		
		let tagsCheckbox = document.getElementById('tags-checkbox');
		tagsCheckbox.addEventListener('change', (event) => {
			this.includeTags = event.target.checked;
		});

		this.itemsView = await ItemTree.init(document.getElementById('zotero-items-tree'), {
			id: "items-tree",
			columns: [
				{
					dataKey: "title",
					primary: true,
					label: "itemFields.title",
					flex: 4,
				},
				{
					dataKey: "firstCreator",
					label: "zotero.items.creator_column",
					flex: 1,
				},
				{
					dataKey: "action",
					label: "copyDialog.action.columnLabel",
					flex: 1
				},
			],
			onSelectionChange: () => this.updateUI(),
			getExtraRowData: treeRow => this._getExtraRowData(treeRow),
		});
		
		let collectionTreeRow = Zotero.CollectionTreeRow.createMinimalRow({
			ref: null,
			getItems: async () => this.items
		});
		
		await this.itemsView.changeCollectionTreeRow(collectionTreeRow);
		this.itemsView.expandAllRows();
		this.updateUI();
	},

	doUnload() {
		this.itemsView?.unregister();
	},
	
	onAccept() {
		io.accepted = true;
		io.excludedItemIDs = this.excludedItemIDs;
		io.includeAnnotations = this.includeAnnotations;
		io.includeTags = this.includeTags;
	},
	
	setExcluded(item, excluded) {
		if (excluded) {
			let exclude = (id) => {
				this.excludedItemIDs.add(id);
				this.itemsView.invalidateCacheAndRedraw(id);
			};

			// No change
			if (this.excludedItemIDs.has(item.id)) {
				return;
			}
			exclude(item.id);
			// Exclude children too
			if (!item.isAttachment()) {
				for (let id of item.getAttachments(false)) {
					exclude(id);
				}
			}
			if (!item.isNote()) {
				for (let id of item.getNotes(false)) {
					exclude(id);
				}
			}
		}
		else {
			let unExclude = (id) => {
				this.excludedItemIDs.delete(id);
				this.itemsView.invalidateCacheAndRedraw(id);
			};

			// No change
			if (!this.excludedItemIDs.has(item.id)) {
				return;
			}
			// Can't include - would overwrite, but that's disabled
			if (!this.overwriteExistingItems && this._hasLinkedItemInTargetLibrary(item)) {
				return;
			}
			unExclude(item.id);
			// Include parent and children too
			if (item.parentItemID) {
				unExclude(item.parentItemID);
			}
			if (!item.isAttachment()) {
				for (let id of item.getAttachments(false)) {
					unExclude(id);
				}
			}
			if (!item.isNote()) {
				for (let id of item.getNotes(false)) {
					unExclude(id);
				}
			}
		}
	},

	toggleSelectedItems() {
		let selectedItems = this._keepAllowed(this.itemsView.getSelectedItems());
		let anyAreExcluded = selectedItems.some(item => this.excludedItemIDs.has(item.id));
		for (let item of selectedItems) {
			this.setExcluded(item, !anyAreExcluded);
		}
		this.updateUI();
	},
	
	updateUI() {
		this._updateButtons();
		this._updateCheckboxes();
	},

	_updateButtons() {
		if (!this.itemsView) return;
		
		let toggleSelected = document.getElementById('toggle-selected');
		let selectedItems = this._keepAllowed(this.itemsView.getSelectedItems());
		let anySelectedItemsAreExcluded = !selectedItems.length
			|| selectedItems.some(item => this.excludedItemIDs.has(item.id));
		toggleSelected.disabled = !selectedItems.length;
		toggleSelected.label = Zotero.getString(
			(anySelectedItemsAreExcluded ? 'copyDialog.selectItems' : 'copyDialog.deselectItems')
				+ (selectedItems.length > 1 ? '.multiple' : '')
		);
		
		// We can't just compare this.items.length and this.excludedItemIDs.size - this.excludedItemIDs includes child
		// items and this.items does not
		let allItemsAreExcluded = !this.items.filter(item => !this.excludedItemIDs.has(item.id)).length;
		document.querySelector('dialog').getButton('accept').disabled = allItemsAreExcluded;
	},
	
	_updateCheckboxes() {
		document.getElementById('overwrite-existing-items-checkbox').checked = this.overwriteExistingItems;
		this._updateCheckbox(
			document.getElementById('notes-checkbox'),
			this._keepAllowed(this.childNoteItems)
		);
		this._updateCheckbox(
			document.getElementById('files-checkbox'),
			this._keepAllowed(this.childFileAttachmentItems)
		);
		this._updateCheckbox(
			document.getElementById('child-links-checkbox'),
			this._keepAllowed(this.childLinkAttachmentItems)
		);
		document.getElementById('annotations-checkbox').checked = this.includeAnnotations;
		document.getElementById('tags-checkbox').checked = this.includeTags;
	},
	
	_updateCheckbox(checkbox, items) {
		let excluded = this._keepAllowed(items.filter(item => this.excludedItemIDs.has(item.id)));
		
		if (items.length == 0) {
			checkbox.checked = false;
			checkbox.indeterminate = false;
			checkbox.disabled = true;
			return;
		}
		checkbox.disabled = false;
		if (excluded.length == 0) {
			checkbox.checked = true;
			checkbox.indeterminate = false;
		}
		else if (excluded.length == items.length) {
			checkbox.checked = false;
			checkbox.indeterminate = false;
		}
		else {
			checkbox.checked = false;
			checkbox.indeterminate = true;
		}
	},
	
	_updateItems(checkbox, items) {
		for (let item of items) {
			this.setExcluded(item, !checkbox.checked);
		}
		this.updateUI();
	},
	
	_getExtraRowData(treeRow) {
		let id = treeRow.ref.id;
		let excluded = this.excludedItemIDs.has(id);
		let action;
		if (excluded) {
			action = Zotero.getString('copyDialog.action.skip');
		}
		// Explicitly check for only this item, not its parent
		else if (this.linkedItemsInTargetLibrary.has(id)) {
			action = treeRow.ref.isAttachment()
				? Zotero.getString('copyDialog.action.merge')
				: Zotero.getString('copyDialog.action.overwrite');
		}
		else {
			action = Zotero.getString('copyDialog.action.new');
		}
		
		return {
			contextRow: excluded,
			action
		};
	},
	
	_hasLinkedItemInTargetLibrary(item) {
		return this.linkedItemsInTargetLibrary.has(item.id)
			|| item.parentItemID && this.linkedItemsInTargetLibrary.has(item.parentItemID);
	},
	
	_keepAllowed(items) {
		if (this.overwriteExistingItems) {
			return items;
		}
		return items.filter(item => !this._hasLinkedItemInTargetLibrary(item));
	}
};

window.addEventListener('load', () => Zotero_Copy_Dialog.doLoad());
window.addEventListener('unload', () => Zotero_Copy_Dialog.doUnload());
