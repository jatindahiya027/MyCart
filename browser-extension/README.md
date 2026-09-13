# MyCart browser extension

1. Start MyCart (the default address is `http://localhost:3027`).
2. Run `npm run extension:build` after changing the supported-site registry.
3. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this `browser-extension` folder.
4. Reload the extension from `chrome://extensions` after rebuilding it.
   Chrome caches extension icons, so use the circular reload button after an
   update. If the old placeholder remains, remove the unpacked extension and
   load this folder again.
5. On a supported product page, either:
   - click the MyCart extension icon and select **Track this product**, or
   - right-click and choose **Track this product in MyCart**.

The extension immediately shows a processing card in the bottom-right corner of
the store page. It replaces that card with the product image, name, and price
after saving, or with the exact error when scraping fails. Any open MyCart tab
refreshes its product list automatically.

The right-click menu is registered only for supported store hostnames. Opening
the extension popup on an unsupported site explains that the site is not
supported. The popup also links to the complete supported-websites directory.
Use the extension options page if MyCart runs at another address.
