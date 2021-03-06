// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

jt.AtariConsole = function() {
    var self = this;
    function init() {
        mainComponentsCreate();
        socketsCreate();
        setVideoStandardAuto();
    }

    this.powerOn = function(paused) {
        if (this.powerIsOn) this.powerOff();
        bus.powerOn();
        this.powerIsOn = true;
        controlsSocket.controlsStatesRedefined();
        videoStandardAutoDetectionStart();
        if (!paused) go();
    };

    this.powerOff = function() {
        pause();
        bus.powerOff();
        this.powerIsOn = false;
        controlsSocket.controlsStatesRedefined();
    };
    
    this.emu = function(id) {
      controlsSocket.controlStateChanged(id, true);
    };

    this.clockPulse = function() {
        if (videoStandardAutoDetectionInProgress)
            videoStandardAutoDetectionTry();
        frameActions = $.extend({}, Javatari.room.controls.getControlStateMap());        
        if(self.game!=null) {
          if(replay) {
            if(self.game.frame >= 1) {
              data = Javatari.room.screen.getMonitor().getScreenURL()
              saveFrame(data, self.rom)
              var tr = self.traj[self.game.frame]['keys_pressed'];
              for(var k in tr){
                //if(isNumeric(tr[k])) {
                //  controlsSocket.controlValueChanged(parseInt(k), tr[k]);
                //} else {
                controlsSocket.controlStateChanged(parseInt(k), tr[k]);
                //}
              }
            }
            self.game.step(self.ram);
            console.log(self.ram)
            controlsSocket.clockPulse();
            if(self.traj_max_frame == self.game.frame - 1) {
              alert('END OF REPLAY');              
            }
          } else {
            if (self.game.frame == 1) {
              self.init_state = self.saveState();
              if(rom == 'qbert' || rom == 'revenge') {
                self.started = true;
              }
            }
            if(!self.game.terminal) {
              self.game.step(self.ram);
              var frame_data = {};
              frame_data['action'] = atariControlsToALE(frameActions, ctrls);
              frame_data['keys_pressed'] = frameActions;
              frame_data['reward'] = self.game.reward;
              frame_data['terminal'] = self.game.terminal;
              frame_data['score'] = self.game.score;
              trajectory[self.game.frame-1] = frame_data;
              if(self.game.frame % 60 == 0) {
                var score = self.started ? self.game.score:0;
                update_score(score); 
              }
            } else {
              self.save_seq();
              sequence_sent = true;
            } 
            controlsSocket.clockPulse();
            if(isReset()) {
              self.resetEnv();
            }
          }
        }
        tia.frame();
        this.framesGenerated++;
    };

    this.resetEnv = function() {
      self.save_seq();
      self.game.reset();
      sequence_sent = false;
      trajectory = {};
      self.started = true;
    }

    var isReset = function() {
        return (frameActions[ctrls.RESET] || (self.game.terminal && self.started && frameActions[self.game.ADDITIONAL_RESET]));
    };

    this.getCartridgeSocket = function() {
        return cartridgeSocket;
    };

    this.getControlsSocket = function() {
        return controlsSocket;
    };

    this.getVideoOutput = function() {
        return tia.getVideoOutput();
    };

      this.getAudioOutput = function() {
        return tia.getAudioOutput();
    };

    this.getSavestateSocket = function() {
        return saveStateSocket;
    };

    this.showOSD = function(message, overlap) {
        this.getVideoOutput().showOSD(message, overlap);
    };

    var go = function() {
        mainClock.go();
    };

    var pause = function() {
        mainClock.pauseOnNextPulse();
    };

    var setCartridge = function(cartridge) {
        self.game = envForGame(cartridge.rom.info.l);
        self.init_state = 0; 
        Javatari.cartridge = cartridge;
        var removedCartridge = getCartridge();
        bus.setCartridge(cartridge);
        cartridgeSocket.cartridgeInserted(cartridge, removedCartridge);
    };

    var getCartridge = function() {
        return bus.getCartridge();
    };

    var setVideoStandard = function(pVideoStandard) {
        if (videoStandard !== pVideoStandard){
           videoStandard = pVideoStandard;
            tia.setVideoStandard(videoStandard);
            mainClockAdjustToNormal();
        }
        self.showOSD((videoStandardIsAuto ? "AUTO: " : "") + videoStandard.name, false);
    };

    var setVideoStandardAuto = function() {
        videoStandardIsAuto = true;
        if (self.powerIsOn) videoStandardAutoDetectionStart();
        else setVideoStandard(jt.VideoStandard.NTSC);
    };

    var videoStandardAutoDetectionStart = function() {
        if (!videoStandardIsAuto || videoStandardAutoDetectionInProgress) return;
        // If no Cartridge present, use NTSC
        if (!bus.getCartridge()) {
            setVideoStandard(jt.VideoStandard.NTSC);
            return;
        }
        // Otherwise use the VideoStandard detected by the monitor
        if (!tia.getVideoOutput().monitor) return;
        videoStandardAutoDetectionInProgress = true;
        videoStandardAutoDetectionTries = 0;
        tia.getVideoOutput().monitor.videoStandardDetectionStart();
    };

    var videoStandardAutoDetectionTry = function() {
        videoStandardAutoDetectionTries++;
        var standard = tia.getVideoOutput().monitor.getVideoStandardDetected();
        if (!standard && videoStandardAutoDetectionTries < VIDEO_STANDARD_AUTO_DETECTION_FRAMES)
            return;

        if (standard) setVideoStandard(standard);
        else self.showOSD("AUTO: FAILED", false);
        videoStandardAutoDetectionInProgress = false;
    };

    var setVideoStandardForced = function(forcedVideoStandard) {
        videoStandardIsAuto = false;
        setVideoStandard(forcedVideoStandard);
    };

    var powerFry = function() {
        self.ram.powerFry();
    };

    var cycleCartridgeFormat = function() {
    };

    this.saveState = function() {
        return {
            t: tia.saveState(),
            p: pia.saveState(),
            r: self.ram.saveState(),
            c: cpu.saveState(),
            ca: getCartridge() && getCartridge().saveState(),
            vs: videoStandard.name
        };
    };

    this.loadState = function(state) {
        if (!self.powerIsOn) self.powerOn();
        tia.loadState(state.t);
        pia.loadState(state.p);
        self.ram.loadState(state.r);
        cpu.loadState(state.c);
        setCartridge(state.ca && jt.CartridgeDatabase.createCartridgeFromSaveState(state.ca));
        setVideoStandard(jt.VideoStandard[state.vs]);
        controlsSocket.controlsStatesRedefined();
    };

    var mainClockAdjustToNormal = function() {
        var freq = videoStandard.fps;
        mainClock.setFrequency(freq);
        tia.getAudioOutput().setFps(freq);
    };

    var mainClockAdjustToFast    = function() {
        var freq = 600;     // About 10x faster
        mainClock.setFrequency(freq);
        tia.getAudioOutput().setFps(freq);
    };

    var mainComponentsCreate = function() {
        cpu = new jt.M6502();
        pia = new jt.Pia();
        tia = new jt.Tia(cpu, pia);
        self.ram = new jt.Ram();
        bus = new jt.Bus(cpu, tia, pia, self.ram);
        mainClock = new jt.Clock(self, jt.VideoStandard.NTSC.fps);
    };

    var socketsCreate = function() {
        controlsSocket = new ControlsSocket();
        controlsSocket.addForwardedInput(self);
        controlsSocket.addForwardedInput(tia);
        controlsSocket.addForwardedInput(pia);
        cartridgeSocket = new CartridgeSocket();
        cartridgeSocket.addInsertionListener(tia.getAudioOutput());
        cartridgeSocket.addInsertionListener(controlsSocket);
        saveStateSocket = new SaveStateSocket();
        cartridgeSocket.addInsertionListener(saveStateSocket);
    };


    this.powerIsOn = false;

    this.framesGenerated = 0;

    var cpu;
    var pia;
    var tia;
    this.ram = 0;
    this.test = 0;
    var sequence_sent = false;
    var bus;
    var mainClock;

    var videoStandard;
    var controlsSocket;
    var cartridgeSocket;
    var saveStateSocket;

    var videoStandardIsAuto = false;
    var videoStandardAutoDetectionInProgress = false;
    var videoStandardAutoDetectionTries = 0;

    var VIDEO_STANDARD_AUTO_DETECTION_FRAMES = 90;

    // Controls interface  --------------------------------------------

    var controls = jt.ConsoleControls;

    this.controlStateChanged = function (control, state) {
        // Normal state controls
        if (control == controls.FAST_SPEED) {
            if (state) {
                self.showOSD("FAST FORWARD", true);
                mainClockAdjustToFast();
            } else {
                self.showOSD(null, true);
                mainClockAdjustToNormal();
            }
            return;
        }
        /*
        // Toggles
        if (!state) return;
        switch (control) {
            case controls.POWER:
                if (self.powerIsOn) self.powerOff();
                else self.powerOn();
                break;
            case controls.POWER_OFF:
                if (self.powerIsOn) self.powerOff();
                break;
            case controls.POWER_FRY:
                powerFry();
                break;
            case controls.SAVE_STATE_0:
            case controls.SAVE_STATE_1:
            case controls.SAVE_STATE_2:
            case controls.SAVE_STATE_3:
            case controls.SAVE_STATE_4:
            case controls.SAVE_STATE_5:
            case controls.SAVE_STATE_6:
            case controls.SAVE_STATE_7:
            case controls.SAVE_STATE_8:
            case controls.SAVE_STATE_9:
            case controls.SAVE_STATE_10:
            case controls.SAVE_STATE_11:
            case controls.SAVE_STATE_12:
                saveStateSocket.saveState(control.to);
                break;
            case controls.SAVE_STATE_FILE:
                saveStateSocket.saveStateFile();
                break;
            case controls.LOAD_STATE_0:
            case controls.LOAD_STATE_1:
            case controls.LOAD_STATE_2:
            case controls.LOAD_STATE_3:
            case controls.LOAD_STATE_4:
            case controls.LOAD_STATE_5:
            case controls.LOAD_STATE_6:
            case controls.LOAD_STATE_7:
            case controls.LOAD_STATE_8:
            case controls.LOAD_STATE_9:
            case controls.LOAD_STATE_10:
            case controls.LOAD_STATE_11:
            case controls.LOAD_STATE_12:
                saveStateSocket.loadState(control.from);
                break;
            case controls.VIDEO_STANDARD:
                self.showOSD(null, true);	// Prepares for the upcoming "AUTO" OSD to always show
                if (videoStandardIsAuto) setVideoStandardForced(jt.VideoStandard.NTSC);
                else if (videoStandard == jt.VideoStandard.NTSC) setVideoStandardForced(jt.VideoStandard.PAL);
                else setVideoStandardAuto();
                break;
            case controls.CARTRIDGE_FORMAT:
                cycleCartridgeFormat();
                break;
            case controls.CARTRIDGE_REMOVE:
                if (Javatari.CARTRIDGE_CHANGE_DISABLED)
                    self.showOSD("Cartridge change is disabled", true);
                else
                    cartridgeSocket.insert(null, false);
        }
        */
    };

    this.controlValueChanged = function (control, position) {
        // No positional controls here
    };

    this.controlsStateReport = function (report) {
        //  Only Power Control is visible from outside
        report[controls.POWER] = self.powerIsOn;
    };


    // CartridgeSocket  -----------------------------------------

    function CartridgeSocket() {

        this.insert = function (cartridge, autoPower) {
            if (autoPower && self.powerIsOn) self.powerOff();
            setCartridge(cartridge);
            if (autoPower && !self.powerIsOn) self.powerOn();
        };

        this.inserted = function () {
            return getCartridge();
        };

        this.cartridgeInserted = function (cartridge, removedCartridge) {
            for (var i = 0; i < insertionListeners.length; i++)
                insertionListeners[i].cartridgeInserted(cartridge, removedCartridge);
        };

        this.addInsertionListener = function (listener) {
            if (insertionListeners.indexOf(listener) < 0) {
                insertionListeners.push(listener);
                listener.cartridgeInserted(this.inserted());		// Fire a insertion event
            }
        };

        this.removeInsertionListener = function (listener) {
            jt.Util.arrayRemove(insertionListeners, listener);
        };

        var insertionListeners = [];

    }

    // ControlsSocket  -----------------------------------------

    function ControlsSocket() {

        this.connectControls = function(pControls) {
            controls = pControls;
        };

        this.cartridgeInserted = function(cartridge, removedCartridge) {
            if (removedCartridge) controlsSocket.removeForwardedInput(removedCartridge);
            if (cartridge) controlsSocket.addForwardedInput(cartridge);
        };

        this.clockPulse = function() {
            controls.clockPulse();
        };

        this.controlStateChanged = function(control, state) {
            frameActions[control] = state;
            for (var i = 0; i < forwardedInputsCount; i++)
                forwardedInputs[i].controlStateChanged(control, state);
        };

        //check for player id as in Tia.js lines 957-965 and append to str
        this.controlValueChanged = function(control, position) {
            //frameActions[control] = position;
            for (var i = 0; i < forwardedInputsCount; i++)
                forwardedInputs[i].controlValueChanged(control, position);
        };

        this.controlsStateReport = function(report) {
            for (var i = 0; i < forwardedInputsCount; i++)
                forwardedInputs[i].controlsStateReport(report);
        };

        this.addForwardedInput = function(input) {
            forwardedInputs.push(input);
            forwardedInputsCount = forwardedInputs.length;
        };

        this.removeForwardedInput = function(input) {
            jt.Util.arrayRemove(forwardedInputs, input);
            forwardedInputsCount = forwardedInputs.length;
        };

        this.addRedefinitionListener = function(listener) {
            if (redefinitionListeners.indexOf(listener) < 0) {
                redefinitionListeners.push(listener);
                listener.controlsStatesRedefined();		// Fire a redefinition event
            }
        };

        this.controlsStatesRedefined = function() {
            for (var i = 0; i < redefinitionListeners.length; i++)
                redefinitionListeners[i].controlsStatesRedefined();
        };

        var controls;
        var forwardedInputs = [];
        var forwardedInputsCount = 0;
        var redefinitionListeners = [];

    }


    // SavestateSocket  -----------------------------------------

    function SaveStateSocket() {

        this.connectMedia = function(pMedia) {
            media = pMedia;
        };

        this.getMedia = function() {
            return media;
        };

        this.cartridgeInserted = function(cartridge) {
            if (cartridge) cartridge.connectSaveStateSocket(this);
        };

        this.externalStateChange = function() {
            // Nothing
        };

        this.saveState = function(slot) {
            if (!self.powerIsOn || !media) return;
            var state = self.saveState();
            state.v = VERSION;
            if (media.saveState(slot, state))
                self.showOSD("State " + slot + " saved", true);
            else
                self.showOSD("State " + slot + " save failed", true);
        };

        this.loadState = function(slot) {
            if (!media) return;
            var state = media.loadState(slot);
            if (!state) {
                self.showOSD("State " + slot + " not found", true);
                return;
            }
            if (state.v !== VERSION) {
                self.showOSD("State " + slot + " load failed, wrong version", true);
                return;
            }
            self.loadState(state);
            self.showOSD("State " + slot + " loaded", true);
        };

        this.saveStateFile = function() {
            if (!self.powerIsOn || !media) return;
            // Use Cartrige label as file name
            var fileName = cartridgeSocket.inserted() && cartridgeSocket.inserted().rom.info.l;
            var state = self.saveState();
            state.v = VERSION;
            if (media.saveStateFile(fileName, state))
                self.showOSD("State Cartridge saved", true);
            else
                self.showOSD("State Cartridge save failed", true);
        };

        this.loadStateFile = function(data) {       // Return true if data was indeed a SaveState
            if (!media) return;
            var state = media.loadStateFile(data);
            if (!state) return;
            if (state.v !== VERSION) {
                self.showOSD("State Cartridge load failed, wrong version", true);
                return true;
            }
            self.loadState(state);
            self.showOSD("State Cartridge loaded", true);
            return true;
        };


        var media;
        var VERSION = 1;

    }


    // Debug methods  ------------------------------------------------------

    this.startProfiling = function() {
        var lastFrameCount = this.framesGenerated;
        setInterval(function() {
            jt.Util.log(self.framesGenerated - lastFrameCount);
            lastFrameCount = self.framesGenerated;
        }, 1000);
    };

    this.runFramesAtTopSpeed = function(frames) {
        pause();
        var start = performance.now();
        for (var i = 0; i < frames; i++)
            self.clockPulse();
        var duration = performance.now() - start;
        jt.Util.log("Done running " + frames + " in " + duration + " ms");
        jt.Util.log(frames / (duration/1000) + "frames/sec");
        go();
    };


    init();

    var frameActions = {};
    var ctrls = jt.ConsoleControls;
    var trajectory = {};
    var LEN_SAVE_THRESHOLD = 60;
    this.started = false;
    this.save_seq = function() {
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
      if(Object.keys(trajectory).length > LEN_SAVE_THRESHOLD && !sequence_sent && self.started) {
        console.log("###############################")
          sequenceToServ(trajectory, self.init_state, self.game.id, self.game.score);
      }
    }
};
