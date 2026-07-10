# browser-scripts

A collection of random browser scripts to enhance various websites.

# Tampermonkey Script (bblf-enhancer.js)

This is a tampermonkey script that will improve the experience on the Big Brother Live Feeds page.

## Features
* Add number hotkeys for switching cameras (1-5)
* Watch for video error messages and reload page
* Extended Watch: Watch for 'Still watching' or 'Timeout' messages and click or reload page
* Hides P+ controls and show video scrubber
* Auto-switch to Quad cam at startup (optional)
* Auto unmute and maximize volume (optional)

Any of these features are optional by changing the settings in the script.

** Warning: this will run custom javascript and modify the way some things work on the Paramount+ Live Feeds page temporarily, and may cause issues navigating or using the page. You can disable it in Tampermonkey by toggling the script off. A page refresh may be required. **

## Install instructions:

1. Install the [Tampermonkey extension](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) in your browser.

2. **You will need to allow User Scripts to run in the extension settings**. In your browser, find your Extension Settings, click on Details for Tampermonkey. Scroll to Allow User Scripts and toggle it on.

2. In the Tampermonkey dashboard, click Utilities, and copy the following url into the Import from URL box:

    `https://raw.githubusercontent.com/liquid8d/browser-scripts/refs/heads/main/bblf-enhancer.js`

3. Click the Install button, then Install again.

4. With the script installed, visit the [Big Brother](https://www.paramountplus.com/shows/big_brother/) P+ page, and select a Live Feed camera.

5. With the video loaded, ensure the script is enabled by clicking the Tampermonkey button in your extensions bar (usually the top-right of the browser, accessed by clicking the puzzle piece icon) and look for BBLF Enhancer on. Toggle it on if it is not already.

To disable the script at any time, toggle BBLF Enhancer script off in Tampermonkey, and refresh the page.

# Stylebot CSS (bblf-enhancer.css)

This is some custom CSS to clean up the Live TV interface on Paramount+ when watching Big Brother Live Feeds.

** Warning: this will modify the display of the Paramount+ Live TV, and may cause issues navigating or using the page. You can disable it in Stylebot by toggling it off to return to normal. A page refresh may be required. **

## Features
* Removes the header/footer to make video fill the page
* Removes the Live TV menu
* (optional) hide the video controls

## Install instructions:

1. Install the [Stylebot extension](https://chromewebstore.google.com/detail/stylebot/oiaejidbmkiecgbjeifoejpgmdaleoha) in your browser.

2. Click the Stylebot icon in your browser extensions bar (usually the top-right of the browser, accessed by clicking the puzzle piece icon - you can pin Stylebot for easier access), then click Options

3. Go to Styles, Add a new style...

4. In Enter URL... box, type:

    `https://www.paramountplus.com/live-tv/stream/big_brother/*`

5. In the code box, copy and paste the css provided here:

    `https://raw.githubusercontent.com/liquid8d/browser-scripts/refs/heads/main/bblf-enhancer.css`

6. Click the Save button.

7. If you don't even want the controls to display, comment the controls-manager css.

## Post Install
Go to the Big Brother page and pick a Live Feed camera: 

`https://www.paramountplus.com/shows/big_brother/`

If the css is applied correctly, you should now only see video on the live tv channels for Big Brother, and menus and overlays will be hidden.

**This CSS hides the Live TV menu, how do I switch cameras?!**

* Click the Stylebot extension icon to disable the CSS
* Access the Live Feed thumbnails on the Big Brother page
* Bookmark each camera url directly and change that way


