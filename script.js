// script.js

let audioContext;
let oscillator;
let noiseNode;
let gainNode;
let waveShaperNode;
let currentMode = null;

// Array to keep track of active sweep oscillators
let activeSweepOscillators = [];

// DOM Elements
const toneButton = document.getElementById('toneButton');
const noiseButton = document.getElementById('noiseButton');
const sweepButton = document.getElementById('sweepButton');
const startFreqInput = document.getElementById('startFreq');
const endFreqInput = document.getElementById('endFreq');
const sweepDurationInput = document.getElementById('sweepDuration');
const loopSweepCheckbox = document.getElementById('loopSweep');
const sweepDurationLabel = document.getElementById('sweepDurationLabel');
const statusMessage = document.getElementById('statusMessage');

// Initialize Audio Context
function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    waveShaperNode = audioContext.createWaveShaper();
    waveShaperNode.curve = makeDistortionCurve(1);
    gainNode.connect(waveShaperNode);
    waveShaperNode.connect(audioContext.destination);

    setVolume();
}

// Create Distortion Curve to Prevent Clipping
function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

// Toggle Audio Functionality
function toggleAudio(mode) {
    if (!audioContext) {
        initAudio();
    }

    if (currentMode === mode) {
        stopAudio();
    } else {
        stopAudio();
        setTimeout(() => {
            if (mode === 'tone') {
                startTone();
            } else if (mode === 'noise') {
                startPinkNoise();
            } else if (mode === 'sweep') {
                startSweep();
            }
        }, 100); // Short delay to ensure clean transition
    }
}

// Start 30 Hz Tone
function startTone() {
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(30, audioContext.currentTime);

    // Add a compressor to prevent distortion
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
    compressor.knee.setValueAtTime(30, audioContext.currentTime);
    compressor.ratio.setValueAtTime(12, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
    compressor.release.setValueAtTime(0.25, audioContext.currentTime);

    oscillator.connect(compressor);
    compressor.connect(gainNode);

    currentMode = 'tone';
    setVolume();
    fadeIn();

    oscillator.start();
    toneButton.textContent = 'Stop 30 Hz Tone';
    noiseButton.textContent = 'Play Pink Noise';
    sweepButton.textContent = 'Start Sweep';

    statusMessage.textContent = 'Playing 30 Hz Tone.';
}

// Start Pink Noise
function startPinkNoise() {
    const bufferSize = 4096;
    noiseNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;

    noiseNode.onaudioprocess = function(e) {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11;
            b6 = white * 0.115926;
        }
    };
    noiseNode.connect(gainNode);

    currentMode = 'noise';
    setVolume();
    fadeIn();

    noiseButton.textContent = 'Stop Pink Noise';
    toneButton.textContent = 'Play 30 Hz Tone';
    sweepButton.textContent = 'Start Sweep';

    statusMessage.textContent = 'Playing Pink Noise.';
}

// Start Frequency Sweep
function startSweep() {
    const startFreq = parseFloat(startFreqInput.value);
    const endFreq = parseFloat(endFreqInput.value);
    const duration = parseFloat(sweepDurationInput.value);

    // Validate inputs
    if (isNaN(startFreq) || isNaN(endFreq) || isNaN(duration)) {
        alert('Please enter valid frequency and duration values.');
        return;
    }

    currentMode = 'sweep';
    setVolume();
    fadeIn();

    performSweep(true, startFreq, endFreq, duration);

    sweepButton.textContent = 'Stop Sweep';
    toneButton.textContent = 'Play 30 Hz Tone';
    noiseButton.textContent = 'Play Pink Noise';

    statusMessage.textContent = 'Performing Frequency Sweep.';
}

// Perform Sweep Function with Looping Capability
function performSweep(ascending, startFreq, endFreq, duration) {
    if (currentMode !== 'sweep') return;

    // Create a new oscillator for each sweep
    const sweepOsc = audioContext.createOscillator();
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(ascending ? startFreq : endFreq, audioContext.currentTime);
    sweepOsc.connect(gainNode);
    sweepOsc.start();

    // Add to active sweep oscillators array
    activeSweepOscillators.push(sweepOsc);

    const sweepEndTime = audioContext.currentTime + duration;

    // Schedule the frequency ramp
    sweepOsc.frequency.exponentialRampToValueAtTime(ascending ? endFreq : startFreq, sweepEndTime);

    // Stop the oscillator slightly after the sweep to ensure ramp completion
    sweepOsc.stop(sweepEndTime + 0.1);

    // Handle the end of the sweep
    sweepOsc.onended = () => {
        // Remove the oscillator from the active array
        activeSweepOscillators = activeSweepOscillators.filter(osc => osc !== sweepOsc);

        if (currentMode !== 'sweep') return;

        if (loopSweepCheckbox.checked) {
            // Perform the next sweep in the opposite direction
            performSweep(!ascending, startFreq, endFreq, duration);
        } else {
            stopAudio();
        }
    };
}

// Stop All Audio Functions
function stopAudio() {
    fadeOut().then(() => {
        // Stop and disconnect the tone oscillator
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }

        // Stop and disconnect the noise node
        if (noiseNode) {
            noiseNode.disconnect();
            noiseNode = null;
        }

        // Stop and disconnect all active sweep oscillators
        activeSweepOscillators.forEach(sweepOsc => {
            sweepOsc.stop();
            sweepOsc.disconnect();
        });
        activeSweepOscillators = [];

        currentMode = null;
        toneButton.textContent = 'Play 30 Hz Tone';
        noiseButton.textContent = 'Play Pink Noise';
        sweepButton.textContent = 'Start Sweep';

        statusMessage.textContent = 'No audio playing.';
    });
}

// Fade In Function
function fadeIn() {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(getCurrentVolume(), audioContext.currentTime + 0.1);
}

// Fade Out Function
function fadeOut() {
    return new Promise(resolve => {
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
        setTimeout(resolve, 100);
    });
}

// Get Current Volume Based on Mode
function getCurrentVolume() {
    const minValue = 0.0001;
    let maxValue;

    if (currentMode === 'tone') {
        maxValue = 10; // Increased to make the 30 Hz tone louder by default
    } else {
        maxValue = 1;
    }

    return minValue + (maxValue - minValue) * Math.pow(50 / 100, 2); // Default volume set to 50
}

// Set Volume Function
function setVolume() {
    if (gainNode) {
        let scaledVolume = getCurrentVolume();

        if (currentMode === 'tone') {
            scaledVolume = Math.pow(scaledVolume, 0.7) * 2.5; // Increased scaling factor for louder tone
        }

        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.setTargetAtTime(scaledVolume, audioContext.currentTime, 0.1);
    }
}

// Event Listeners
toneButton.addEventListener('click', () => toggleAudio('tone'));
noiseButton.addEventListener('click', () => toggleAudio('noise'));
sweepButton.addEventListener('click', () => toggleAudio('sweep'));
sweepDurationInput.addEventListener('input', () => {
    if (sweepDurationLabel) {
        sweepDurationLabel.textContent = `Duration: ${sweepDurationInput.value}s`;
    }
});
