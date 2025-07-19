// ==UserScript==
// @name         BBLF Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.34
// @description  Monitor for issues on the live feed page, reloading or starting video when necessary. Can autoload quad cam, add hotkeys, show video scrubber, and remap fullscreen button to only show video.
// @author       liquid8d
// @match        https://www.paramountplus.com/shows/big_brother/live_feed/stream/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=paramountplus.com
// @grant        GM_log

// ==/UserScript==
/*
v 1.34 (2025)
 - fix audio pan to split channels properly
 - hookwebaudio only to primary video in case it interferes with thumbs (thumbs have no audio anyways)
v 1.33 (2025)
 - added left/right audio balance hotkeys
v 1.32 (2025)
 - thumbs fix - hotkey cam switch shouldn't get stuck on thumbs
 - player quality is now checked (i.e quality fix will apply when clicking thumbs)
v 1.31 (2025)
 - add qualityFix option for those who were quality limited
v 1.3
 - now need to click start button to use (this forces user interaction with the page to ensure js executes)
 - add removeControls (hides P+ video controls and enables scrubber on video)
v 1.2
 - add extendedWatch
*/

(function() {
    'use strict';

    const hotkeys = [
        { key: 1, action: function() { switchCam(1) } },
        { key: 2, action: function() { switchCam(2) } },
        { key: 3, action: function() { switchCam(3) } },
        { key: 4, action: function() { switchCam(4) } },
        { key: 5, action: function() { switchCam(5) } },
        { key: 'q', action: function() { adjustChannel('left') } },
        { key: 'w', action: function() { adjustChannel('none') } },
        { key: 'e', action: function() { adjustChannel('right') } }
    ]

    // force allow up to 1080p resolution
    const qualityFix = true
    const preferredQuality = '1080p' // one of 1080p, 720p, 540p, 360p, 288p, 216p
    // force switch to quad cam on page load
    const autoQuadCam = true
    // remove P+ video controls and show built-in video controls allowing scrubbing
    const removeControls = true
    // hide chat and video thumbs on fullscreen
    const fullscreenVideoOnly = true
    // reload the page when an error is encountered
    const reloadOnError = true
    // keep watching if still watching is shown
    const extendedWatch = true
    // enable hotkeys
    const enableHotkeys = true
    // autostart video when page is loaded
    const forcePlay = true
    // delay before reloading the page on an error (secs * ms)
    const reloadDelay = 1 * 1000
    // frequency to check player status (secs * ms)
    const monitorInterval = 3 * 1000
    // max attempts to retry on failures before giving up
    const retryMaxAttempts = 10
    // reset the 'retry' attempts in the script, if it is no longer working
    const resetScript = false

    // DO NOT MODIFY AFTER HERE

    // current camera (only modified to verify quad cam switch)
    var camNum = 1
    // current attempts, will fail after retryMaxAttemps reached
    var attempts = 0
    // whether the fullscreen button has been remapped
    var fsButtonMapped = false
    // whether the P+ player controls have been removed
    var controlsRemoved = false
    // whether quality fix has been added
    var qualityFixed = false

    // audio control variables
    const audioCtx = new (window.AudioContext)();
    let domNodes = [];
    let audioNodes = [];
    let dir = 'none';

    if (localStorage.getItem('bblf_video_monitor_attempts')) attempts = (resetScript) ? 0 : parseInt(localStorage.getItem('bblf_video_monitor_attempts'))

    // NOTE: you might try just running startup instead of injectStartButton, there is a freezeup for me
    // startup()
    injectStartButton()

    function injectStartButton() {
        var startEl = document.createElement('input')
        startEl.id = 'bblf-enhance'
        startEl.type = 'button'
        startEl.value = 'Start BBLF Enhancer'
        startEl.style = 'position: relative; left: calc(50% - 80px); width: 160px; height: 48px; z-index: 99999; cursor: pointer;'
        startEl.addEventListener('click', startup)
        var mcplayerEl = document.getElementById('mcplayer')
        mcplayerEl.parentNode.insertBefore(startEl, mcplayerEl.nextSibling)
        mcplayerEl.appendChild(startEl)
        log('waiting for user to click start button')
    }

    function startup() {
        log('starting bblf enhancer')

        // remove start button
        const startEl = document.getElementById('bblf-enhance')
        if (startEl) startEl.parentNode.removeChild(startEl)

        // enable hotkeys
        if (enableHotkeys) {
            document.onkeydown = function(e) {
                for (var i = 0; i < hotkeys.length; i++) {
                    const hotkey = hotkeys[i].key.toString()
                    if (e.key === hotkey || e.code === hotkey) hotkeys[i].action()
                }
            }
        }
        // start watching video
        setInterval(() => {
            checkVideo();
        }, monitorInterval);
    }

    function updateQualities() {
        const video = document.querySelectorAll('video')[1]
        const player = video.player
        const playback = video.player.getAdapter('playback')
		if (player && playback && player.qualityCategory != preferredQuality || !qualityFixed) {
			playback.maxHeight = 1080
			playback.maxBitrate = 5000000
			playback.refreshQualities()
			player.qualityCategory = preferredQuality
			qualityFixed = true
		}
        audioCtx.resume();
    }

    function checkVideo() {
        if (fullscreenVideoOnly && !fsButtonMapped) {
            log('remapping fullscreen button')
            // remaps the fullscreen button to only fullscreen video skin
            const el = document.querySelector('button.btn-fullscreen')
            if (el) {
                el.onclick = function() {
                    if (document.fullscreenElement) {
                        document.exitFullscreen()
                    } else {
                        const player = document.querySelector('.aa-player-skin')
                        player.requestFullscreen()
                    }
                }
                fsButtonMapped = true
            } else {
                warn('can not remap fullscreen button, missing element')
            }
        }

        if (extendedWatch) {
            const countdownButton = document.querySelector('.stream-countdown-button')
            if (countdownButton) {
                log('found stream-countdown-button, clicking')
                countdownButton.click()
            }
            // watch for still watching element and restart
            const stillWatchingEl = document.querySelector('.timeout-panel-button-container')
            if (stillWatchingEl) {
                log('found timeout button, clicking')
                stillWatchingEl.click()
            }
        }

        if (attempts >= retryMaxAttempts) {
            warn('gave up, max attempts reached. Increase "maxAttempts" or set "resetScript" to true, then manually reload the page.')
            return
        }

        // check for smart tag error
        var errorEl = document.querySelector('.smart-tag-error-panel-content')
        if (errorEl) {
            warn('smart tag error found')
            if (reloadOnError) {
                // reload the page
                attempts += 1
                localStorage.setItem('bblf_video_monitor_attempts', attempts)
                setTimeout(function() { window.location.reload() }, reloadDelay)
            }
        } else {
            var startPanelEl = document.querySelector('.start-panel.show')
            if (startPanelEl) {
                warn('start panel is showing, click to start video.')
                var clickEl = document.querySelector('.start-panel-click-overlay')
                clickEl.click()
            } else {
                var videoEl = document.querySelector('.aa-player-skin .player-wrapper video')
                if (videoEl) {
					addNode(videoEl)
					if (videoEl.paused) {
                        if (forcePlay) {
                            // attempt to unpause video
                            info('video is available and paused, trying to force play (manual user intervention may be required)')
                            const el = document.getElementById('mcplayer')
                            el.click()
                            attempts += 1
                            localStorage.setItem('bblf_video_monitor_attempts', attempts)
                        } else {
                            // video is ok, but user doesn't want to forcePlay it
                            info('video is available and paused, "forcePlay" is not enabled')
                        }
                    } else {
                        if (autoQuadCam && camNum == 1) {
                            log('switching to quad cam')
                            switchCam(5)
                            camNum = 5
                        } else {
                            log('video is ready and playing.')
                            if (qualityFix) updateQualities()
                            if (removeControls && !controlsRemoved) {
                                log('removing P+ controls')
                                controlsRemoved = true
                                // remove the player elements
                                const playerEls = ['.controls-backplane', '.controls-manager', '.top-menu-backplane']
                                for (var i = 0; i < playerEls.length; i++) {
                                    var el = document.querySelector(playerEls[i])
                                    el.parentNode.removeChild(el)
                                }
                                // enable built-in video controls allowing scrubbing
                            }
                            if (controlsRemoved) videoEl.controls = true
                        }
                    }
                    attempts = 0
                    localStorage.setItem('bblf_video_monitor_attempts', 0)
                } else {
                    // missing video element, something else is wrong here
                    warn('unable to find an error or the video element, you might need to manually reload the page')
                }
            }
        }
    }

    function switchCam(num) {
        if (document.activeElement) document.activeElement.blur()
        const el = document.querySelector('.multi-cam-plugin-thumb-player-container .index-item[data-camid="' + num + '"]')
        if (el) {
            el.click()
            qualityFixed = false
        } else {
            warn('could not find camera element ' + num + ', unable to change')
        }
    }

    function addNode(node) {
        if (!domNodes.includes(node)) {
            domNodes.push(node);
            log('DOM node added to list');
            hookUpWebAudio(node);
			adjustChannel('none');
            log('hooked up web audio node');
        }
    }

    function hookUpWebAudio(node) {
        let audioNode = {};
        audioNode.source = audioCtx.createMediaElementSource(node);
		audioNode.merger = audioCtx.createChannelMerger(2);
        audioNode.splitter = audioCtx.createChannelSplitter(2);
        audioNode.source.connect(audioNode.splitter, 0, 0);
        audioNode.gainLeft = audioCtx.createGain();
        audioNode.gainRight = audioCtx.createGain();
		audioNode.source.connect(audioNode.splitter, 0, 0);
		audioNode.merger.connect(audioCtx.destination, 0, 0);
		audioNode.gainLeft.gain.value = 1;
		audioNode.gainRight.gain.value = 1;
        //audioNode.splitter.connect(audioNode.gainLeft, 0);
        //audioNode.splitter.connect(audioNode.gainRight, 1);
        //audioNode.gainLeft.connect(audioCtx.destination, 0);
        //audioNode.gainRight.connect(audioCtx.destination, 0);
        audioNodes.push(audioNode);
    }

    function adjustChannel(dir) {
        audioNodes.forEach((audioNode) => {
            if (dir === 'none') {
				audioNode.gainLeft.disconnect();
				audioNode.gainRight.disconnect();
				audioNode.splitter.disconnect();
				audioNode.gainLeft.connect(audioNode.merger, 0, 0);
				audioNode.gainRight.connect(audioNode.merger, 0, 1);
				audioNode.splitter.connect(audioNode.gainLeft, 0);
				audioNode.splitter.connect(audioNode.gainRight, 1);
				audioNode.gainLeft.gain.value = 1;
				audioNode.gainRight.gain.value = 1;
				log('audio balance reset');
            } else if (dir === 'left') {
				audioNode.gainLeft.disconnect();
				audioNode.gainRight.disconnect();
				audioNode.splitter.disconnect();
				audioNode.gainLeft.connect(audioNode.merger, 0, 0);
				audioNode.gainRight.connect(audioNode.merger, 0, 1);
				audioNode.splitter.connect(audioNode.gainLeft, 0);
				audioNode.splitter.connect(audioNode.gainRight, 0);
				audioNode.gainLeft.gain.value = 1;
				audioNode.gainRight.gain.value = 1;
                log('audio balance left');
            } else {
				audioNode.gainLeft.disconnect();
				audioNode.gainRight.disconnect();
				audioNode.splitter.disconnect();
				audioNode.gainLeft.connect(audioNode.merger, 0, 0);
				audioNode.gainRight.connect(audioNode.merger, 0, 1);
				audioNode.splitter.connect(audioNode.gainLeft, 1);
				audioNode.splitter.connect(audioNode.gainRight, 1);
				audioNode.gainLeft.gain.value = 1;
				audioNode.gainRight.gain.value = 1;
                log('audio balance right');
            }
        });
    }

    function log(msg) { console.log('BBLF Enhancer: (' + attempts + ') ' + msg) }
    function warn(msg) { console.warn('BBLF Enhancer: (' + attempts + ') ' + msg) }
    function error(msg) { console.error('BBLF Enhancer: (' + attempts + ') ' + msg) }
    function info(msg) { console.info('BBLF Enhancer: (' + attempts + ') ' + msg) }
})();