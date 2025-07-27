// =============================================
// Funciones de CRC y manejo de datos binarios
// =============================================

// Tabla CRC precalculada para mejor rendimiento
const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c;
    }
    return table;
})();

export function crc32(data) {
    if (!data || data.length === 0) return 0;
    
    let crc = 0 ^ (-1);
    const chunkSize = 32768; // 32KB chunks para móviles
    const chunks = Math.ceil(data.length / chunkSize);
    
    for (let chunk = 0; chunk < chunks; chunk++) {
        const start = chunk * chunkSize;
        const end = Math.min(start + chunkSize, data.length);
        
        for (let i = start; i < end; i++) {
            crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        }
    }
    
    return (crc ^ (-1)) >>> 0;
}

// =============================================
// Funciones de formato y visualización
// =============================================

export function formatSize(bytes) {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} bytes`;
}

export function formatRatio(ratio) {
    if (ratio > 100) return `${ratio.toFixed(0)}:1`;
    if (ratio > 10) return `${ratio.toFixed(1)}:1`;
    return `${ratio.toFixed(2)}:1`;
}

// =============================================
// Funciones de utilidad para archivos
// =============================================

export function getFileExtension(filename) {
    return filename.slice((Math.max(0, filename.lastIndexOf(".")) || Infinity) + 1).toLowerCase();
}

export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// =============================================
// Funciones especializadas para datos estructurados
// =============================================

export function detectStructuredData(data, sampleSize = 10000) {
    // Análisis optimizado para móviles
    const sample = data.slice(0, Math.min(data.length, sampleSize));
    const text = new TextDecoder().decode(sample);
    
    // Detección de formatos estructurados
    const features = {
        csv: detectCSV(text),
        json: detectJSON(text),
        log: detectLog(text),
        xml: detectXML(text)
    };
    
    return features;
}

function detectCSV(text) {
    const lines = text.split('\n');
    if (lines.length < 3) return null;
    
    // Contar delimitadores
    const delimiters = [',', ';', '\t', '|'];
    const firstLine = lines[0];
    
    const counts = delimiters.map(d => (firstLine.split(d).length - 1));
    const maxCount = Math.max(...counts);
    
    if (maxCount < 2) return null;
    
    const mainDelimiter = delimiters[counts.indexOf(maxCount)];
    
    // Verificar consistencia
    const colCount = firstLine.split(mainDelimiter).length;
    let consistentLines = 1;
    
    for (let i = 1; i < Math.min(10, lines.length); i++) {
        if (lines[i].split(mainDelimiter).length === colCount) {
            consistentLines++;
        }
    }
    
    return consistentLines > 5 ? {
        type: 'csv',
        delimiter: mainDelimiter,
        columns: colCount,
        rows: lines.length
    } : null;
}

function detectJSON(text) {
    try {
        const trimmed = text.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            JSON.parse(text);
            return { type: 'json', valid: true };
        }
    } catch (e) {
        // No es JSON válido
    }
    return null;
}

function detectLog(text) {
    // Patrones comunes en logs
    const logPatterns = [
        /^\d{4}-\d{2}-\d{2}/,    // Fechas YYYY-MM-DD
        /^\d{2}:\d{2}:\d{2}/,    // Horas HH:MM:SS
        /\[(DEBUG|INFO|WARN|ERROR|FATAL)\]/, // Niveles de log
        /error|exception|warning|fail/i
    ];
    
    const lines = text.split('\n');
    let logFeatures = 0;
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (logPatterns.some(pattern => pattern.test(line))) {
            logFeatures++;
        }
    }
    
    return logFeatures > 5 ? { type: 'log' } : null;
}

function detectXML(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        const tagPattern = /<(\w+)[^>]*>/;
        const closingTagPattern = /<\/\w+>/;
        
        if (tagPattern.test(trimmed) && closingTagPattern.test(trimmed)) {
            return { type: 'xml' };
        }
    }
    return null;
}

// =============================================
// Funciones de optimización para móviles
// =============================================

export function getOptimalChunkSize(fileSize) {
    if (isMobileDevice()) {
        if (fileSize > 100000000) return 1048576; // 1MB para archivos >100MB
        if (fileSize > 50000000) return 524288;   // 512KB para archivos >50MB
        return 262144; // 256KB para archivos pequeños
    }
    return 1048576; // 1MB para desktop
}

export function shouldCompressFile(filename, fileSize) {
    const ext = getFileExtension(filename);
    const nonCompressible = [
        '.mp4', '.jpg', '.jpeg', '.png', '.gif', 
        '.zip', '.rar', '.7z', '.xlsx', '.pdf'
    ];
    
    return !nonCompressible.includes(`.${ext}`);
}

// =============================================
// Funciones de rendimiento
// =============================================

export function startTimer() {
    return performance.now();
}

export function endTimer(startTime) {
    return (performance.now() - startTime).toFixed(0);
}
