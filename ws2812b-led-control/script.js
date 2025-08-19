class LEDController {
    constructor() {
        this.port = null;
        this.writer = null;
        this.reader = null;
        this.ledCount = 8;
        this.arrangement = 'ring'; // Set ring as default
        this.ledStates = [];
        this.patterns = [];
        this.currentPattern = null;
        this.brightness = 128;
        this.isDisconnecting = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeLEDs();
        this.loadPatterns();
    }

    initializeElements() {
        this.connectionBtn = document.getElementById('connectionBtn');
        this.status = document.getElementById('status');
        this.arrangement = document.getElementById('arrangement');
        this.ledCountInput = document.getElementById('ledCount');
        this.updateLayoutBtn = document.getElementById('updateLayout');
        this.colorPicker = document.getElementById('colorPicker');
        this.fillAllBtn = document.getElementById('fillAll');
        this.clearAllBtn = document.getElementById('clearAll');
        this.randomColorsBtn = document.getElementById('randomColors');
        this.brightnessSlider = document.getElementById('brightness');
        this.brightnessValue = document.getElementById('brightnessValue');
        this.ledGrid = document.getElementById('ledGrid');
        this.patternsContainer = document.getElementById('patterns');
    }

    setupEventListeners() {
        this.connectionBtn.addEventListener('click', () => this.toggleConnection());
        this.updateLayoutBtn.addEventListener('click', () => this.updateLayout());
        this.fillAllBtn.addEventListener('click', () => this.fillAllLEDs());
        this.clearAllBtn.addEventListener('click', () => this.clearAllLEDs());
        this.randomColorsBtn.addEventListener('click', () => this.randomColors());
        this.brightnessSlider.addEventListener('input', (e) => this.updateBrightness(e.target.value));
    }

    async toggleConnection() {
        if (this.port && this.port.readable && !this.isDisconnecting) {
            // Currently connected, so disconnect
            await this.disconnect();
        } else {
            // Currently disconnected, so connect
            await this.connect();
        }
    }

    async connect() {
        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            
            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();
            
            this.writer = this.port.writable.getWriter();
            
            this.updateStatus(true);
            this.connectionBtn.textContent = 'Disconnect';
            
            // Send initial configuration to Arduino
            this.sendCommand(`led_count:${this.ledCount}`);
            this.sendCommand(`brightness:${this.brightness}`);
            
            // Start reading serial data from Arduino
            this.readSerialData();
            
            console.log('Connected to Arduino');
        } catch (error) {
            console.error('Connection failed:', error);
            alert('Failed to connect to Arduino. Make sure WebSerial is supported and the device is available.');
        }
    }

    async disconnect() {
        // Stop any running patterns
        if (this.currentPattern) {
            clearInterval(this.currentPattern);
            this.currentPattern = null;
        }
        
        // Set a flag to stop the reader loop
        this.isDisconnecting = true;
        
        try {
            // Release writer first
            if (this.writer) {
                this.writer.releaseLock();
                this.writer = null;
            }
            
            // Release reader if it exists
            if (this.reader) {
                try {
                    await this.reader.cancel();
                    // Give a small delay for the reader to properly close
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (e) {
                    // Reader might already be closed
                    console.log('Reader cancel error (expected):', e);
                }
                this.reader.releaseLock();
                this.reader = null;
            }
            
            // Close the port
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
        } catch (error) {
            console.error('Error during disconnect:', error);
        } finally {
            this.isDisconnecting = false;
            this.updateStatus(false);
            this.connectionBtn.textContent = 'Connect';
            console.log('Disconnected from Arduino');
        }
    }

    updateStatus(connected) {
        if (connected) {
            this.status.className = 'status connected';
            this.status.textContent = 'Connected to Arduino';
        } else {
            this.status.className = 'status disconnected';
            this.status.textContent = 'Disconnected - Click "Connect to Arduino" to start';
        }
    }

    async sendCommand(command) {
        if (this.writer) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(command + '\r\n');
                await this.writer.write(data);
                console.log('Sent:', command);
            } catch (error) {
                console.error('Failed to send command:', error);
            }
        }
    }

    async readSerialData() {
        if (!this.reader) return;
        
        try {
            while (true) {
                // Check if we're in the process of disconnecting
                if (this.isDisconnecting) {
                    break;
                }
                
                const { value, done } = await this.reader.read();
                if (done) break;
                
                // value is already a string when using TextDecoderStream
                const lines = value.split('\n');
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        console.log('Arduino:', trimmed);
                        this.updateStatusMessage(trimmed);
                    }
                }
            }
        } catch (error) {
            // Only log errors if we're not intentionally disconnecting
            if (!this.isDisconnecting) {
                console.error('Serial read error:', error);
            }
        } finally {
            // Clean up reader if it still exists and we're not disconnecting
            if (this.reader && !this.isDisconnecting) {
                try {
                    this.reader.releaseLock();
                    this.reader = null;
                } catch (e) {
                    console.log('Reader cleanup error:', e);
                }
            }
        }
    }

    updateStatusMessage(message) {
        // Update status with Arduino message
        if (this.status) {
            this.status.textContent = `Arduino: ${message}`;
        }
    }

    initializeLEDs() {
        this.ledStates = Array(this.ledCount).fill().map(() => ({r: 0, g: 0, b: 0}));
        this.arrangement = 'ring'; // Set ring as default
        this.updateLEDGrid();
    }

    updateLayout() {
        this.ledCount = parseInt(this.ledCountInput.value);
        this.arrangement = document.getElementById('arrangement').value;
        this.initializeLEDs();
        this.loadPatterns();
        // Send LED count update to Arduino
        this.sendCommand(`led_count:${this.ledCount}`);
    }

    updateLEDGrid() {
        this.ledGrid.innerHTML = '';
        
        if (this.arrangement === 'matrix') {
            const size = Math.ceil(Math.sqrt(this.ledCount));
            this.ledGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
            this.ledGrid.className = 'led-grid matrix-grid';
        } else if (this.arrangement === 'ring') {
            this.ledGrid.className = 'led-grid ring-grid';
            this.createRingLayout();
            this.updateLEDDisplay();
            return;
        } else {
            this.ledGrid.style.gridTemplateColumns = `repeat(${Math.min(this.ledCount, 16)}, 1fr)`;
            this.ledGrid.className = 'led-grid strip-grid';
        }

        for (let i = 0; i < this.ledCount; i++) {
            const led = document.createElement('div');
            led.className = 'led';
            led.dataset.index = i;
            led.addEventListener('click', () => this.setLEDColor(i));
            this.ledGrid.appendChild(led);
        }
        
        this.updateLEDDisplay();
    }

    createRingLayout() {
        const containerSize = window.innerWidth <= 768 ? 300 : 400;
        const centerX = containerSize / 2;
        const centerY = containerSize / 2;
        const radius = containerSize * 0.3; // 30% of container size
        
        for (let i = 0; i < this.ledCount; i++) {
            const led = document.createElement('div');
            led.className = 'led ring-led';
            led.dataset.index = i;
            led.addEventListener('click', () => this.setLEDColor(i));
            
            // Calculate position on circle
            const angle = (i / this.ledCount) * 2 * Math.PI - Math.PI / 2; // Start from top
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            led.style.position = 'absolute';
            led.style.left = `${x - 15}px`; // Center the LED (30px width / 2)
            led.style.top = `${y - 15}px`;  // Center the LED (30px height / 2)
            
            this.ledGrid.appendChild(led);
        }
    }

    setLEDColor(index) {
        const color = this.hexToRgb(this.colorPicker.value);
        this.ledStates[index] = color;
        this.updateLEDDisplay();
        this.sendLEDData();
    }

    updateLEDDisplay() {
        const leds = this.ledGrid.querySelectorAll('.led');
        leds.forEach((led, index) => {
            if (index < this.ledStates.length) {
                const state = this.ledStates[index];
                led.style.backgroundColor = `rgb(${state.r}, ${state.g}, ${state.b})`;
            }
        });
    }

    fillAllLEDs() {
        // Stop any running patterns
        if (this.currentPattern) {
            clearInterval(this.currentPattern);
            this.currentPattern = null;
        }
        
        const color = this.hexToRgb(this.colorPicker.value);
        this.ledStates.fill(color);
        this.updateLEDDisplay();
        this.sendLEDData();
    }

    clearAllLEDs() {
        // Stop any running patterns
        if (this.currentPattern) {
            clearInterval(this.currentPattern);
            this.currentPattern = null;
        }
        
        this.ledStates = Array(this.ledCount).fill().map(() => ({r: 0, g: 0, b: 0}));
        this.updateLEDDisplay();
        this.sendLEDData();
    }

    randomColors() {
        // Stop any running patterns
        if (this.currentPattern) {
            clearInterval(this.currentPattern);
            this.currentPattern = null;
        }
        
        this.ledStates = this.ledStates.map(() => ({
            r: Math.floor(Math.random() * 256),
            g: Math.floor(Math.random() * 256),
            b: Math.floor(Math.random() * 256)
        }));
        this.updateLEDDisplay();
        this.sendLEDData();
    }

    updateBrightness(value) {
        this.brightness = parseInt(value);
        this.brightnessValue.textContent = value;
        // Send brightness update to Arduino
        this.sendCommand(`brightness:${this.brightness}`);
        this.sendLEDData();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : {r: 0, g: 0, b: 0};
    }

    applyBrightness(color) {
        const factor = this.brightness / 255;
        return {
            r: Math.floor(color.r * factor),
            g: Math.floor(color.g * factor),
            b: Math.floor(color.b * factor)
        };
    }

    sendLEDData() {
        const commands = this.ledStates.map((color, index) => {
            const adjusted = this.applyBrightness(color);
            return `${index}:${adjusted.r},${adjusted.g},${adjusted.b}`;
        }).join(';');
        
        this.sendCommand(commands);
    }

    loadPatterns() {
        this.patterns = this.getPatterns(this.arrangement);
        this.renderPatterns();
    }

    renderPatterns() {
        this.patternsContainer.innerHTML = '';
        this.patterns.forEach((pattern, index) => {
            const btn = document.createElement('button');
            btn.className = 'pattern-btn';
            btn.textContent = pattern.name;
            btn.addEventListener('click', () => this.runPattern(pattern));
            this.patternsContainer.appendChild(btn);
        });
    }

    runPattern(pattern) {
        if (this.currentPattern) {
            clearInterval(this.currentPattern);
        }
        
        pattern.init(this.ledCount);
        let frame = 0;
        
        this.currentPattern = setInterval(() => {
            this.ledStates = pattern.update(frame, this.ledCount);
            this.updateLEDDisplay();
            this.sendLEDData();
            frame++;
        }, pattern.speed || 100);
    }

    getPatterns(arrangement) {
        const stripPatterns = [
            {
                name: "Rainbow Wave",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map((_, i) => {
                        const hue = (i * 360 / count + frame * 2) % 360;
                        return this.hslToRgb(hue, 100, 50);
                    });
                }
            },
            {
                name: "Fire Effect",
                speed: 80,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map((_, i) => {
                        const heat = Math.max(0, Math.sin((i + frame) * 0.3) * 255);
                        return {
                            r: Math.min(255, heat),
                            g: Math.floor(heat * 0.4),
                            b: 0
                        };
                    });
                }
            },
            {
                name: "Scanner",
                speed: 150,
                init: () => {},
                update: (frame, count) => {
                    const pos = Math.abs((frame % (count * 2)) - count);
                    return Array(count).fill().map((_, i) => {
                        const distance = Math.abs(i - pos);
                        const brightness = Math.max(0, 255 - distance * 50);
                        return {r: brightness, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Color Wipe",
                speed: 200,
                init: () => {},
                update: (frame, count) => {
                    const colors = [
                        {r: 255, g: 0, b: 0},
                        {r: 0, g: 255, b: 0},
                        {r: 0, g: 0, b: 255},
                        {r: 255, g: 255, b: 0}
                    ];
                    const colorIndex = Math.floor(frame / count) % colors.length;
                    const pos = frame % count;
                    
                    return Array(count).fill().map((_, i) => {
                        return i <= pos ? colors[colorIndex] : {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Breathing",
                speed: 50,
                init: () => {},
                update: (frame, count) => {
                    const brightness = Math.floor((Math.sin(frame * 0.1) + 1) * 127.5);
                    return Array(count).fill({r: 0, g: brightness, b: brightness});
                }
            },
            {
                name: "Chase",
                speed: 120,
                init: () => {},
                update: (frame, count) => {
                    const pos = frame % count;
                    return Array(count).fill().map((_, i) => {
                        const isOn = (i + frame) % 3 === 0;
                        return isOn ? {r: 255, g: 100, b: 0} : {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Twinkle",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map(() => {
                        const brightness = Math.random() > 0.7 ? Math.floor(Math.random() * 255) : 0;
                        return {r: brightness, g: brightness, b: brightness};
                    });
                }
            },
            {
                name: "Meteor",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    const pos = frame % (count + 10);
                    return Array(count).fill().map((_, i) => {
                        if (i === pos) return {r: 255, g: 255, b: 255};
                        if (i === pos - 1) return {r: 100, g: 100, b: 255};
                        if (i === pos - 2) return {r: 50, g: 50, b: 200};
                        if (i === pos - 3) return {r: 20, g: 20, b: 100};
                        return {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Fade Colors",
                speed: 80,
                init: () => {},
                update: (frame, count) => {
                    const hue = (frame * 2) % 360;
                    const color = this.hslToRgb(hue, 100, 50);
                    return Array(count).fill(color);
                }
            },
            {
                name: "Wave",
                speed: 60,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map((_, i) => {
                        const wave = Math.sin((i + frame * 0.2) * 0.5);
                        const brightness = Math.floor((wave + 1) * 127.5);
                        return {r: brightness, g: 0, b: 255 - brightness};
                    });
                }
            }
        ];

        const ringPatterns = [
            {
                name: "Rotate Rainbow",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map((_, i) => {
                        const hue = ((i + frame) * 360 / count) % 360;
                        return this.hslToRgb(hue, 100, 50);
                    });
                }
            },
            {
                name: "Pulse Ring",
                speed: 80,
                init: () => {},
                update: (frame, count) => {
                    const brightness = Math.floor((Math.sin(frame * 0.2) + 1) * 127.5);
                    return Array(count).fill({r: brightness, g: 0, b: brightness});
                }
            },
            {
                name: "Spinning Dot",
                speed: 150,
                init: () => {},
                update: (frame, count) => {
                    const pos = frame % count;
                    return Array(count).fill().map((_, i) => {
                        return i === pos ? {r: 255, g: 255, b: 255} : {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Clock",
                speed: 200,
                init: () => {},
                update: (frame, count) => {
                    const hourHand = Math.floor((frame / 12) % count);
                    const minuteHand = frame % count;
                    return Array(count).fill().map((_, i) => {
                        if (i === hourHand) return {r: 255, g: 0, b: 0};
                        if (i === minuteHand) return {r: 0, g: 255, b: 0};
                        return {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Opposite Spin",
                speed: 120,
                init: () => {},
                update: (frame, count) => {
                    const pos1 = frame % count;
                    const pos2 = (count - frame) % count;
                    return Array(count).fill().map((_, i) => {
                        if (i === pos1) return {r: 255, g: 0, b: 0};
                        if (i === pos2) return {r: 0, g: 0, b: 255};
                        return {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Ring Fill",
                speed: 200,
                init: () => {},
                update: (frame, count) => {
                    const fillAmount = (frame % (count * 2));
                    const filling = fillAmount <= count;
                    const currentCount = filling ? fillAmount : count * 2 - fillAmount;
                    
                    return Array(count).fill().map((_, i) => {
                        return i < currentCount ? {r: 0, g: 255, b: 255} : {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Compass",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    const north = 0;
                    const south = Math.floor(count / 2);
                    const east = Math.floor(count / 4);
                    const west = Math.floor(3 * count / 4);
                    
                    return Array(count).fill().map((_, i) => {
                        if (i === north) return {r: 255, g: 0, b: 0};
                        if (i === south) return {r: 0, g: 255, b: 0};
                        if (i === east) return {r: 0, g: 0, b: 255};
                        if (i === west) return {r: 255, g: 255, b: 0};
                        return {r: 10, g: 10, b: 10};
                    });
                }
            },
            {
                name: "Ring Wave",
                speed: 60,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map((_, i) => {
                        const angle = (i / count) * Math.PI * 2;
                        const wave = Math.sin(angle + frame * 0.2);
                        const brightness = Math.floor((wave + 1) * 127.5);
                        return {r: brightness, g: brightness / 2, b: 255 - brightness};
                    });
                }
            },
            {
                name: "Orbit",
                speed: 80,
                init: () => {},
                update: (frame, count) => {
                    const pos1 = frame % count;
                    const pos2 = (frame + count/3) % count;
                    const pos3 = (frame + 2*count/3) % count;
                    
                    return Array(count).fill().map((_, i) => {
                        if (Math.floor(i) === Math.floor(pos1)) return {r: 255, g: 0, b: 0};
                        if (Math.floor(i) === Math.floor(pos2)) return {r: 0, g: 255, b: 0};
                        if (Math.floor(i) === Math.floor(pos3)) return {r: 0, g: 0, b: 255};
                        return {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Ring Bounce",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    const pos = Math.abs((frame % (count * 2)) - count);
                    return Array(count).fill().map((_, i) => {
                        const distance = Math.min(Math.abs(i - pos), count - Math.abs(i - pos));
                        const brightness = Math.max(0, 255 - distance * 80);
                        return {r: brightness, g: brightness, b: 0};
                    });
                }
            }
        ];

        const matrixPatterns = [
            {
                name: "Matrix Rain",
                speed: 150,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const dropPos = (frame + x * 3) % (size + 5);
                        const brightness = y === dropPos ? 255 : (y === dropPos - 1 ? 128 : (y === dropPos - 2 ? 64 : 0));
                        return {r: 0, g: brightness, b: 0};
                    });
                }
            },
            {
                name: "Diagonal Sweep",
                speed: 120,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const diagonal = (x + y + frame) % (size * 2);
                        const brightness = diagonal < 3 ? 255 - diagonal * 80 : 0;
                        return {r: brightness, g: 0, b: brightness};
                    });
                }
            },
            {
                name: "Spiral",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    const center = Math.floor(size / 2);
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const dx = x - center;
                        const dy = y - center;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx);
                        const spiral = (distance + angle * 2 + frame) % (size * 2);
                        const brightness = spiral < 2 ? 255 : 0;
                        return {r: brightness, g: brightness, b: 0};
                    });
                }
            },
            {
                name: "Checkerboard",
                speed: 200,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const isEven = ((x + y + frame) % 2) === 0;
                        return isEven ? {r: 255, g: 255, b: 255} : {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Concentric Circles",
                speed: 80,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    const center = Math.floor(size / 2);
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const dx = x - center;
                        const dy = y - center;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const ring = Math.floor(distance + frame * 0.5) % (size / 2);
                        const brightness = ring < 1 ? 255 : 0;
                        return {r: 0, g: brightness, b: brightness};
                    });
                }
            },
            {
                name: "Matrix Pulse",
                speed: 60,
                init: () => {},
                update: (frame, count) => {
                    const brightness = Math.floor((Math.sin(frame * 0.1) + 1) * 127.5);
                    return Array(count).fill({r: 0, g: brightness, b: 0});
                }
            },
            {
                name: "Random Matrix",
                speed: 150,
                init: () => {},
                update: (frame, count) => {
                    return Array(count).fill().map(() => {
                        const r = Math.random() > 0.8 ? Math.floor(Math.random() * 255) : 0;
                        const g = Math.random() > 0.8 ? Math.floor(Math.random() * 255) : 0;
                        const b = Math.random() > 0.8 ? Math.floor(Math.random() * 255) : 0;
                        return {r, g, b};
                    });
                }
            },
            {
                name: "Matrix Wave",
                speed: 70,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const wave1 = Math.sin((x + frame * 0.2) * 0.5);
                        const wave2 = Math.sin((y + frame * 0.3) * 0.5);
                        const brightness = Math.floor(((wave1 + wave2) / 2 + 1) * 127.5);
                        return {r: brightness, g: 0, b: 255 - brightness};
                    });
                }
            },
            {
                name: "Matrix Explosion",
                speed: 100,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    const center = Math.floor(size / 2);
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const dx = x - center;
                        const dy = y - center;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const explosion = (frame - distance * 2) % (size * 2);
                        const brightness = explosion > 0 && explosion < 3 ? 255 - explosion * 80 : 0;
                        return {r: brightness, g: brightness / 2, b: 0};
                    });
                }
            },
            {
                name: "Matrix Clock",
                speed: 200,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    const center = Math.floor(size / 2);
                    const hourAngle = (frame / 12) * Math.PI / 6;
                    const minuteAngle = frame * Math.PI / 30;
                    
                    return Array(count).fill().map((_, i) => {
                        const x = i % size;
                        const y = Math.floor(i / size);
                        const dx = x - center;
                        const dy = y - center;
                        const angle = Math.atan2(dy, dx);
                        
                        const hourDist = Math.abs(angle - hourAngle);
                        const minuteDist = Math.abs(angle - minuteAngle);
                        
                        if (hourDist < 0.3) return {r: 255, g: 0, b: 0};
                        if (minuteDist < 0.3) return {r: 0, g: 255, b: 0};
                        return {r: 0, g: 0, b: 0};
                    });
                }
            },
            {
                name: "Matrix Snake",
                speed: 120,
                init: () => {},
                update: (frame, count) => {
                    const size = Math.ceil(Math.sqrt(count));
                    const snakeLength = Math.min(8, size);
                    const head = frame % count;
                    
                    return Array(count).fill().map((_, i) => {
                        const distance = (head - i + count) % count;
                        if (distance < snakeLength) {
                            const brightness = 255 - (distance * 255 / snakeLength);
                            return {r: 0, g: brightness, b: 0};
                        }
                        return {r: 0, g: 0, b: 0};
                    });
                }
            }
        ];

        switch (arrangement) {
            case 'ring':
                return ringPatterns;
            case 'matrix':
                return matrixPatterns;
            default:
                return stripPatterns;
        }
    }

    hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;

        if (0 <= h && h < 1/6) {
            r = c; g = x; b = 0;
        } else if (1/6 <= h && h < 1/3) {
            r = x; g = c; b = 0;
        } else if (1/3 <= h && h < 1/2) {
            r = 0; g = c; b = x;
        } else if (1/2 <= h && h < 2/3) {
            r = 0; g = x; b = c;
        } else if (2/3 <= h && h < 5/6) {
            r = x; g = 0; b = c;
        } else if (5/6 <= h && h <= 1) {
            r = c; g = 0; b = x;
        }

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }
}

// Initialize the controller when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new LEDController();
});
