// ==UserScript==
// @name         BBLF Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Monitor for issues on Big Brother Live Feed streams, reloading or starting video when necessary. Can autoload quad cam, add hotkeys, show video scrubber, and remap fullscreen button to only show video.
// @author       liquid8d
// @match        https://www.paramountplus.com/live-tv/stream/big_brother/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=paramountplus.com
// @grant        GM_log

// ==/UserScript==
/*
v 1.41 (2026)
 - Added settings to automatically unmute and maximize the volume
v 1.4 (2026)
 - no more live feed page, so removed those fixes
 - match live tv streams (live-tv/stream/big_brother/*)
 - quality fix changes (must specify preferredQuality as stream index)
	- qualityFixAttempts was added to avoid situations where quality fix isn't working
v 1.35 (2025)
 - add quality switch delay to prevent 2103 error
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

    const LIVETV_CAMS = [
        'https://www.paramountplus.com/live-tv/stream/big_brother/410a1e4b-a190-4964-9d66-0432ccbe36c2/',
        'https://www.paramountplus.com/live-tv/stream/big_brother/39d39a39-184b-441c-abb6-62ea5e1e5adc/',
        'https://www.paramountplus.com/live-tv/stream/big_brother/81c3ed2c-f639-406e-990d-a121fa14d4b3/',
        'https://www.paramountplus.com/live-tv/stream/big_brother/6679e2a1-f9de-464f-ac1d-9cc9dc31e27d/',
        'https://www.paramountplus.com/live-tv/stream/big_brother/524e313f-9fb2-484a-bb7a-e83b9d51d2f0/'
    ]

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
	// 0 = 270p, 1 = 360p, 2 = 540p
	// 3 = 720p, 4 = 1080p (low bitrate), 5 = 1080p (high bitrate)
    const preferredQuality = 4
	const qualityFixAttempts = 5
    // force switch to quad cam on page load
    const autoQuadCam = false
    // remove P+ video controls and show built-in video controls allowing scrubbing
    const removeControls = false
    // hide chat and video thumbs on fullscreen
    const fullscreenVideoOnly = false
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
    // if set to true, checks to see if audio is muted, and if so unmutes it automatically
    const enableMuteCheck = true
    // if set to true, will monitor changes in the volume and attempt to reset it to max volume
    const enableSetVolume = true

    // DO NOT MODIFY AFTER HERE

    // current camera (only modified to verify quad cam switch)
    var camNum = getCamera()
    // current attempts, will fail after retryMaxAttemps reached
    var attempts = 0
    // whether the P+ player controls have been removed
    var controlsRemoved = false
    // whether quality fix has been added
    var qualityFixed = false
	// count attempts at quality fix
	var qualityAttempts = 0

    // audio control variables
    const audioCtx = new (window.AudioContext)();
    let domNodes = [];
    let audioNodes = [];
    let dir = 'none';

    if (localStorage.getItem('bblf_video_monitor_attempts')) attempts = (resetScript) ? 0 : parseInt(localStorage.getItem('bblf_video_monitor_attempts'))

    startup()

	function startup() {
        log('starting bblf enhancer')
		log('starting on camera ' + camNum)

		if (autoQuadCam && camNum != 5) {
			log('switching to quad cam')
			switchCam(5)
		}

        // enable hotkeys
        if (enableHotkeys) {
            document.onkeydown = function(e) {
                for (var i = 0; i < hotkeys.length; i++) {
                    const hotkey = hotkeys[i].key.toString()
                    if (e.key === hotkey || e.code === hotkey) hotkeys[i].action()
                }
            }
            log('hotkeys enabled')
        }

        // start watching video
        setInterval(() => {
            checkVideo();
        }, monitorInterval);
    }

	function getCamera() {
		for (var i = 0; i < LIVETV_CAMS.length; i++) {
			if (window.location.href == LIVETV_CAMS[i]) return i + 1
		}
	}

    //This function simulates n button presses in rapid succession
    //Used by setVolumeToMax to quickly get the volume back to 100%
    async function dispatchWithDelay(event, n, delay) {
        for (let i = 0; i < n; i++) {
            document.dispatchEvent(event);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    const volumeUpEvent = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        keyCode: 38,
        which: 38,
        bubbles: true,
        cancelable: true,
    });

    function setVolumeToMax() {
        dispatchWithDelay(volumeUpEvent, 10, 0);
    }

    function checkAudio() {
        if (enableMuteCheck) {
            const volumeButton = document.querySelector('.btn-volume')
            if (volumeButton.getAttribute('aria-label') === 'Unmute audio') {
               volumeButton.click()
               log('volume enabled')
            }
        }
        if (enableSetVolume) {
            const volumeSlider = document.querySelector('.volume-slider-li-content-progress-content')
            if (volumeSlider.getAttribute('style') != 'height: 100% !important;') {
                log('raising volume to max')
                setVolumeToMax();
            }
        }
    }

    function updateQualities() {
		const video = document.querySelector('video')
        const player = video.player
		const playback = video.player.getAdapter('playback')
		if (player && playback && (player.bitrate != playback.qualities[preferredQuality].bitrate || !qualityFixed)) {
			if (qualityAttempts < qualityFixAttempts) {
				log('applying quality fix...')
				qualityAttempts += 1
				playback.maxBitrate = 8128372
				playback.maxHeight = 1080
				video.player.maxBitrate = 8128372
				video.player.autoQualitySwitching = false
				playback.qualities = video.player.qualities
				setTimeout(() => {
					video.player.bitrate = playback.qualities[preferredQuality].bitrate
					audioCtx.resume();
					qualityFixed = true
				}, 3000)
			} else {
				log('quality fix attempts maxed, quality fix not working for some reason.')
			}
		}
    }

    function checkVideo() {
        checkAudio()
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
                warn('start panel is showing, trying to click to start video (manual user intervention may be required)')
                var clickEl = document.querySelector('.start-panel-click-overlay')
                if (clickEl) clickEl.click()
            } else {
                var videoEl = document.querySelector('.aa-player-skin .player-wrapper video')
                if (videoEl) {
					addNode(videoEl)
					if (videoEl.paused) {
                        if (forcePlay) {
                            // attempt to unpause video
                            info('video is available and paused, trying to force play (manual user intervention may be required)')
                            const el = document.getElementById('mcplayer')
                            if (el) el.click()
                            attempts += 1
                            localStorage.setItem('bblf_video_monitor_attempts', attempts)
                        } else {
                            // video is ok, but user doesn't want to forcePlay it
                            info('video is available and paused, "forcePlay" is not enabled')
                        }
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
        const url = LIVETV_CAMS[num - 1]
        window.open(url, '_self')
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