
// Only add event listener if the otbFile element exists (index.html page)
const otbFileInput = document.getElementById('otbFile');
if (otbFileInput) {
    otbFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                parseOTB(new Uint8Array(event.target.result), file.name);
            } catch (error) {
                showError('Error reading file: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function parseOTB(data, filename) {
    const output = document.getElementById('output');
    
    if (data.length <= 4) {
        showError('Invalid OTB file: File too small');
        return;
    }

    const width = data[1];
    const height = data[2];
    const colorDepth = data[3];
    const bitmapData = data.slice(4);

    // Validate dimensions
    if (width === 0 || height === 0) {
        showError('Invalid dimensions: Width and height must be greater than 0');
        return;
    }

    const expectedBits = width * height;
    const expectedBytes = Math.ceil(expectedBits / 8);
    
    if (bitmapData.length < expectedBytes) {
        showError(`Invalid OTB file: Expected ${expectedBytes} bytes for bitmap data, got ${bitmapData.length}`);
        return;
    }

    if (colorDepth !== 1) {
        showError('Unsupported color depth: Only 1-bit OTB files are supported');
        return;
    }

    // Create file info
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
        <h3>File Information</h3>
        <p><strong>Filename:</strong> ${filename} | <strong>Size:</strong> ${data.length} bytes | <strong>Dimensions:</strong> ${width} × ${height}</p>
    `;

    // Create container for BMP output
    const outputContainer = document.createElement('div');
    outputContainer.className = 'output-container';

    // Create BMP file and show as image
    const bmpData = createBMP(width, height, bitmapData);
    const bmpContainer = document.createElement('div');
    bmpContainer.style.marginTop = '20px';
    bmpContainer.style.textAlign = 'center';

    // Create and display BMP image
    const blob = new Blob([bmpData], { type: 'image/bmp' });
    const imageUrl = URL.createObjectURL(blob);
    
    const bmpImage = document.createElement('img');
    bmpImage.src = imageUrl;
    bmpImage.className = 'bmp-image';
    bmpImage.alt = 'Rendered OTB Bitmap';
    bmpImage.title = `${width}×${height} Nokia OTB Bitmap`;
    
    const imageContainer = document.createElement('div');
    imageContainer.innerHTML = '<h3 style="color: #4a5568; margin-bottom: 15px;">Rendered Image</h3>';
    imageContainer.appendChild(bmpImage);
    bmpContainer.appendChild(imageContainer);

    // Download link
    const downloadLink = document.createElement('a');
    downloadLink.href = imageUrl;
    // Ensure BMP filename matches OTB filename (e.g., 1.otb -> 1.bmp)
    const baseName = filename.replace(/\.[^/.]+$/, "");
    downloadLink.download = baseName + '.bmp';
    downloadLink.innerHTML = `
        <div style="
            display: inline-block;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 15px 30px;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s ease;
            box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
            margin-top: 20px;
        ">
            📥 Download BMP File
        </div>
    `;
    
    downloadLink.addEventListener('mouseenter', function() {
        this.firstElementChild.style.transform = 'translateY(-3px)';
        this.firstElementChild.style.boxShadow = '0 15px 30px rgba(16, 185, 129, 0.4)';
    });
    
    downloadLink.addEventListener('mouseleave', function() {
        this.firstElementChild.style.transform = 'translateY(0)';
        this.firstElementChild.style.boxShadow = '0 10px 20px rgba(16, 185, 129, 0.3)';
    });

    bmpContainer.appendChild(downloadLink);
    outputContainer.appendChild(bmpContainer);

    // Clear previous output and show new results
    output.innerHTML = '';
    output.appendChild(fileInfo);
    output.appendChild(outputContainer);
}

function createBMP(width, height, bitmapData) {
    // BMP header constants
    const fileHeaderSize = 14;
    const infoHeaderSize = 40;
    const bitsPerPixel = 1;
    const colors = 2; // Black and white
    const colorTableSize = colors * 4; // 4 bytes per color (BGRA)
    
    // Calculate row padding (BMP rows must be padded to 4-byte boundaries)
    const bytesPerRow = Math.ceil(width / 8);
    const paddedBytesPerRow = Math.ceil(bytesPerRow / 4) * 4;
    const imageSize = paddedBytesPerRow * height;
    
    const fileSize = fileHeaderSize + infoHeaderSize + colorTableSize + imageSize;
    const dataOffset = fileHeaderSize + infoHeaderSize + colorTableSize;
    
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);
    
    let offset = 0;
    
    // File Header (14 bytes)
    view.setUint16(offset, 0x4D42, true); offset += 2; // "BM" signature
    view.setUint32(offset, fileSize, true); offset += 4; // File size
    view.setUint32(offset, 0, true); offset += 4; // Reserved
    view.setUint32(offset, dataOffset, true); offset += 4; // Data offset
    
    // Info Header (40 bytes)
    view.setUint32(offset, infoHeaderSize, true); offset += 4; // Header size
    view.setInt32(offset, width, true); offset += 4; // Width
    view.setInt32(offset, -height, true); offset += 4; // Height (negative for top-down)
    view.setUint16(offset, 1, true); offset += 2; // Planes
    view.setUint16(offset, bitsPerPixel, true); offset += 2; // Bits per pixel
    view.setUint32(offset, 0, true); offset += 4; // Compression (none)
    view.setUint32(offset, imageSize, true); offset += 4; // Image size
    view.setInt32(offset, 2835, true); offset += 4; // X pixels per meter (~72 DPI)
    view.setInt32(offset, 2835, true); offset += 4; // Y pixels per meter (~72 DPI)
    view.setUint32(offset, colors, true); offset += 4; // Colors used
    view.setUint32(offset, colors, true); offset += 4; // Important colors
    
    // Color Table (8 bytes total: 4 bytes per color)
    // Color 0: White (BGRA format)
    uint8View[offset++] = 0; // Blue
    uint8View[offset++] = 0; // Green
    uint8View[offset++] = 0; // Red
    uint8View[offset++] = 0;   // Alpha
    
    // Color 1: Black (BGRA format)
    uint8View[offset++] = 255;   // Blue
    uint8View[offset++] = 255;   // Green
    uint8View[offset++] = 255;   // Red
    uint8View[offset++] = 0;   // Alpha
    
    // Image Data (top-down, left-to-right)
    let bitIndex = 0;
    for (let y = 0; y < height; y++) { // Top-down storage
        let rowOffset = offset + (y * paddedBytesPerRow);
        let currentByte = 0;
        let bitsInByte = 0;
        
        for (let x = 0; x < width; x++) {
            const srcBitIndex = y * width + x;
            const srcByteIndex = Math.floor(srcBitIndex / 8);
            const srcBitPosition = 7 - (srcBitIndex % 8);
            
            let pixelBit = 0;
            if (srcByteIndex < bitmapData.length) {
                pixelBit = (bitmapData[srcByteIndex] >> srcBitPosition) & 1;
                // Invert bit: OTB 1=black, BMP 0=black (due to color table)
                pixelBit = pixelBit ? 0 : 1;
            } else {
                pixelBit = 1; // Default to white for missing data
            }
            
            currentByte |= (pixelBit << (7 - bitsInByte));
            bitsInByte++;
            
            if (bitsInByte === 8 || x === width - 1) {
                uint8View[rowOffset + Math.floor(bitsInByte <= 8 ? x / 8 : (x - 1) / 8)] = currentByte;
                currentByte = 0;
                bitsInByte = 0;
            }
        }
    }
    
    return uint8View;
}

function showError(message) {
    const output = document.getElementById('output');
    output.innerHTML = `<div class="error"><strong>Error:</strong> ${message}</div>`;
}
