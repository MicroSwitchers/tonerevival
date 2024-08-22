let audioContext;
let oscillator;
let noiseNode;
let gainNode;
let waveShaperNode;
let currentMode = null;

const toneButton = document.getElementById('toneButton');
const noiseButton = document.getElementById('noiseButton');
const sweepButton = document.getElementById('sweepButton');
const volumeSlider = document.getElementById('volumeSlider');
const volumeIndicator = document.getElementById('volumeIndicator');
const volumeWarning = document.getElementById('volumeWarning');
const startFreqInput = document.getElementById('startFreq');
const endFreqInput = document.getElementById('endFreq');
const sweepDurationInput = document.getElementById('sweepDuration');
const loopSweepCheckbox = document.getElementById('loopSweep');
const sweepDurationLabel = document.getElementById('sweepDurationLabel');

function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    waveShaperNode = audioContext.createWaveShaper();
    waveShaperNode.curve = makeDistortionCurve(1);
    gainNode.connect(waveShaperNode);
    waveShaperNode.connect(audioContext.destination);

    setVolume(volumeSlider.value);
}

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
    setVolume(volumeSlider.value);
    fadeIn();
    
    oscillator.start();
    toneButton.textContent = 'Stop 30 Hz Tone';
    noiseButton.textContent = 'Play Pink Noise';
    sweepButton.textContent = 'Start Sweep';
}

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
    setVolume(volumeSlider.value);
    fadeIn();
    
    noiseButton.textContent = 'Stop Pink Noise';
    toneButton.textContent = 'Play 30 Hz Tone';
    sweepButton.textContent = 'Start Sweep';
}

function startSweep() {
    const startFreq = parseFloat(startFreqInput.value);
    const endFreq = parseFloat(endFreqInput.value);
    const duration = parseFloat(sweepDurationInput.value);

    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.connect(gainNode);

    currentMode = 'sweep';
    setVolume(volumeSlider.value);
    fadeIn();

    oscillator.start();
    sweepButton.textContent = 'Stop Sweep';
    toneButton.textContent = 'Play 30 Hz Tone';
    noiseButton.textContent = 'Play Pink Noise';

    function sweep(ascending = true) {
        const now = audioContext.currentTime;
        const sweepEndTime = now + duration;
        
        oscillator.frequency.setValueAtTime(ascending ? startFreq : endFreq, now);
        oscillator.frequency.exponentialRampToValueAtTime(ascending ? endFreq : startFreq, sweepEndTime);
        
        if (loopSweepCheckbox.checked) {
            oscillator.onended = null;
            setTimeout(() => {
                if (currentMode === 'sweep') {
                    sweep(!ascending);
                }
            }, duration * 1000);
        } else if (!ascending) {
            oscillator.onended = stopAudio;
            oscillator.stop(sweepEndTime);
        }
    }

    sweep();
}

function stopAudio() {
    fadeOut().then(() => {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
        }
        if (noiseNode) {
            noiseNode.disconnect();
        }
        currentMode = null;
        toneButton.textContent = 'Play 30 Hz Tone';
        noiseButton.textContent = 'Play Pink Noise';
        sweepButton.textContent = 'Start Sweep';
    });
}

function fadeIn() {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(getCurrentVolume(), audioContext.currentTime + 0.1);
}

function fadeOut() {
    return new Promise(resolve => {
        const stopTime = audioContext.currentTime + 0.1;
        gainNode.gain.linearRampToValueAtTime(0, stopTime);
        setTimeout(resolve, 100);
    });
}

function getCurrentVolume() {
    const minValue = 0.0001;
    let maxValue;
    
    if (currentMode === 'tone') {
        maxValue = 5; // Reduced from 20 to prevent instability
    } else {
        maxValue = 1;
    }
    
    // Adjusted curve for more control at lower volumes
    return minValue + (maxValue - minValue) * Math.pow(volumeSlider.value / 100, 2);
}

function setVolume(value) {
    if (gainNode) {
        let scaledVolume = getCurrentVolume();
        
        // Apply additional scaling for 30 Hz tone
        if (currentMode === 'tone') {
            // Boost the lower volume range
            scaledVolume = Math.pow(scaledVolume, 0.7) * 2;
        }
        
        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.setTargetAtTime(scaledVolume, audioContext.currentTime, 0.1);
        updateVolumeIndicator(value);
    }
}

function updateVolumeIndicator(value) {
    const hue = 120 - (value * 1.2);
    volumeIndicator.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
    volumeWarning.style.display = value > 75 ? 'block' : 'none'; // Adjusted threshold
}

toneButton.addEventListener('click', () => toggleAudio('tone'));
noiseButton.addEventListener('click', () => toggleAudio('noise'));
sweepButton.addEventListener('click', () => toggleAudio('sweep'));
volumeSlider.addEventListener('input', () => setVolume(volumeSlider.value));
sweepDurationInput.addEventListener('input', () => {
    if (sweepDurationLabel) {
        sweepDurationLabel.textContent = `Duration: ${sweepDurationInput.value}s`;
    }
});