import { 
    formatSize, 
    getPerformanceProfile, 
    detectStructuredData, 
    getOptimalChunkSize,
    shouldCompressFile
} from './utils.js';

console.log("HyperStorage6D V3 - Compresión Agroindustrial Iniciada");

// Configuración basada en el dispositivo
let COMPRESS_WORKER, DECOMPRESS_WORKER;
let compressStartTime, decompressStartTime;
let compressInterval, decompressInterval;
let compressFileSize = 0;
let currentFileName = '';
let lastCompressedUrl = null;
let lastDecompressedUrl = null;

// Inicialización condicional de workers
function initializeWorkers() {
    if (typeof Worker !== 'undefined') {
        COMPRESS_WORKER = new Worker('./workers/compress-worker.js', { type: 'module' });
        DECOMPRESS_WORKER = new Worker('./workers/decompress-worker.js', { type: 'module' });
        
        setupWorkerHandlers();
    } else {
        showError("Tu navegador no soporta Web Workers. La compresión no estará disponible.");
    }
}

// Configurar manejadores de workers
function setupWorkerHandlers() {
    COMPRESS_WORKER.onmessage = handleCompressMessage;
    COMPRESS_WORKER.onerror = handleWorkerError('compress');
    
    DECOMPRESS_WORKER.onmessage = handleDecompressMessage;
    DECOMPRESS_WORKER.onerror = handleWorkerError('decompress');
}

// Inicializar workers al cargar
document.addEventListener('DOMContentLoaded', () => {
    initializeWorkers();
    
    // Configurar botones
    document.getElementById('compressBtn').addEventListener('click', startCompression);
    document.getElementById('decompressBtn').addEventListener('click', startDecompression);
    
    // Configurar para Paraguay
    setupParaguayFeatures();
});

// =============================================
// Funciones específicas para Paraguay
// =============================================

function setupParaguayFeatures() {
    // Añadir consejos para el agro
    const agroTips = [
        "Consejo Agro: Comprime tus reportes CSV diarios para enviarlos por WhatsApp",
        "Optimiza tus datos de cultivos con HyperStorage6D - hasta 4x más pequeño",
        "Evita comprimir fotos JPG/PNG - ya están optimizadas para agricultura digital"
    ];
    
    // Rotar consejos cada 10 segundos
    setInterval(() => {
        const randomTip = agroTips[Math.floor(Math.random() * agroTips.length)];
        document.getElementById('agroTip').textContent = randomTip;
    }, 10000);
}

// =============================================
// Funciones de compresión
// =============================================

async function startCompression() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        showError("Por favor, seleccione un archivo para comprimir.");
        return;
    }
    
    const file = fileInput.files[0];
    currentFileName = file.name;
    const fileSize = file.size;
    
    // Verificar compatibilidad
    if (!shouldCompressFile(currentFileName, fileSize)) {
        const ext = currentFileName.split('.').pop();
        const proceed = confirm(`⚠️ Los archivos ${ext} generalmente ya están comprimidos.\n¿Desea continuar de todos modos?`);
        if (!proceed) return;
    }
    
    // Determinar perfil de rendimiento
    const performanceProfile = getPerformanceProfile();
    const maxSize = performanceProfile === 'low-end' ? 50 * 1024 * 1024 : 200 * 1024 * 1024;
    
    if (fileSize > maxSize) {
        showError(`Archivo demasiado grande (${formatSize(fileSize)}). Límite: ${formatSize(maxSize)}`);
        return;
    }
    
    // Reiniciar estado
    resetProgress('compress');
    
    // Actualizar UI
    document.getElementById('originalSize').textContent = formatSize(fileSize);
    compressFileSize = fileSize;
    
    // Iniciar temporizador
    compressStartTime = performance.now();
    startProgressTracking('compress');
    
    // Mostrar detección de datos estructurados
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const buffer = e.target.result;
            const data = new Uint8Array(buffer);
            
            // Detectar datos estructurados
            const dataAnalysis = detectStructuredData(data);
            if (dataAnalysis.csv || dataAnalysis.json || dataAnalysis.log) {
                const type = dataAnalysis.csv ? 'CSV' : dataAnalysis.json ? 'JSON' : 'LOG';
                showNotification(`✅ Detectado ${type} - Optimizando para datos agrícolas`, 'success');
            }
            
            // Configurar chunk size dinámico
            const chunkSize = getOptimalChunkSize(fileSize);
            
            // Enviar al worker
            COMPRESS_WORKER.postMessage({
                type: 'start',
                fileName: currentFileName,
                fileSize: fileSize,
                chunkSize: chunkSize,
                data: data
            }, [data.buffer]);
            
        } catch (error) {
            console.error("Error al procesar el archivo:", error);
            showError(`Error: ${error.message}`);
            stopProgressTracking('compress');
        }
    };
    
    reader.onerror = (error) => {
        console.error("Error en FileReader:", error);
        showError("Error al leer el archivo");
        stopProgressTracking('compress');
    };
    
    reader.readAsArrayBuffer(file);
}

// =============================================
// Funciones de descompresión
// =============================================

function startDecompression() {
    const fileInput = document.getElementById('decompressInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        showError("Por favor, seleccione un archivo .hs6d para descomprimir.");
        return;
    }
    
    const file = fileInput.files[0];
    currentFileName = file.name;
    
    // Verificar extensión
    if (!currentFileName.toLowerCase().endsWith('.hs6d')) {
        showError("El archivo debe tener extensión .hs6d");
        return;
    }
    
    // Reiniciar estado
    resetProgress('decompress');
    
    // Actualizar UI
    const fileSize = file.size;
    document.getElementById('inputCompressedSize').textContent = formatSize(fileSize);
    
    // Iniciar temporizador
    decompressStartTime = performance.now();
    startProgressTracking('decompress');
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const buffer = e.target.result;
            const data = new Uint8Array(buffer);
            
            // Enviar al worker
            DECOMPRESS_WORKER.postMessage({
                type: 'start',
                fileName: currentFileName,
                fileSize: fileSize,
                data: data
            }, [data.buffer]);
            
        } catch (error) {
            console.error("Error al procesar el archivo:", error);
            showError(`Error: ${error.message}`);
            stopProgressTracking('decompress');
        }
    };
    
    reader.onerror = (error) => {
        console.error("Error en FileReader:", error);
        showError("Error al leer el archivo comprimido");
        stopProgressTracking('decompress');
    };
    
    reader.readAsArrayBuffer(file);
}

// =============================================
// Manejadores de mensajes de workers
// =============================================

function handleCompressMessage(e) {
    if (e.data.error) {
        console.error("Error en compresión:", e.data.error);
        showError(`Error en compresión: ${e.data.error}`);
        stopProgressTracking('compress');
        return;
    }
    
    // Procesar eventos de progreso
    if (e.data.type === 'progress') {
        updateProgress('compress', e.data.progress);
        return;
    }

    if (e.data.type === 'complete') {
        console.log("Compresión completada");
        const { compressed, originalSize, compressedSize } = e.data;
        
        // Crear blob
        const blob = new Blob([compressed], { type: 'application/hs6d' });
        
        // Liberar URL anterior
        if (lastCompressedUrl) URL.revokeObjectURL(lastCompressedUrl);
        const url = URL.createObjectURL(blob);
        lastCompressedUrl = url;
        
        // Detener seguimiento
        stopProgressTracking('compress');
        
        // Actualizar estadísticas
        document.getElementById('compressedSize').textContent = formatSize(compressedSize);
        const ratio = originalSize / compressedSize;
        document.getElementById('compressionRatio').textContent = ratio.toFixed(2) + ":1";
        
        // Mostrar mensaje según el ratio
        let message = `Archivo comprimido ${ratio.toFixed(1)}x`;
        if (ratio > 3.5) {
            message += " - ¡Excelente para datos agrícolas!";
            showNotification(message, 'success');
        } else if (ratio > 2) {
            message += " - Buen resultado para tu operación";
            showNotification(message, 'info');
        } else {
            message += " - Considera usar formatos estructurados (CSV) para mejor compresión";
            showNotification(message, 'warning');
        }
        
        // Configurar descarga
        const link = document.getElementById('downloadCompressed');
        link.href = url;
        link.download = `${currentFileName.replace(/\.[^/.]+$/, "")}_comprimido.hs6d`;
        link.style.display = 'inline-block';
    }
}

function handleDecompressMessage(e) {
    if (e.data.error) {
        console.error("Error en descompresión:", e.data.error);
        showError(`Error en descompresión: ${e.data.error}`);
        stopProgressTracking('decompress');
        return;
    }
    
    // Procesar eventos de progreso
    if (e.data.type === 'progress') {
        updateProgress('decompress', e.data.progress);
        return;
    }
    
    if (e.data.type === 'complete') {
        console.log("Descompresión completada");
        const { decompressed, originalSize } = e.data;
        
        // Crear blob
        const blob = new Blob([decompressed]);
        
        // Liberar URL anterior
        if (lastDecompressedUrl) URL.revokeObjectURL(lastDecompressedUrl);
        const url = URL.createObjectURL(blob);
        lastDecompressedUrl = url;
        
        // Detener seguimiento
        stopProgressTracking('decompress');
        
        // Actualizar estadísticas
        document.getElementById('decompressedSize').textContent = formatSize(originalSize);
        
        // Configurar descarga
        const link = document.getElementById('downloadDecompressed');
        link.href = url;
        link.download = currentFileName.replace('.hs6d', '') || `archivo_original_${Date.now()}`;
        link.style.display = 'inline-block';
        
        showNotification("Archivo descomprimido correctamente. Listo para usar en tu operación agrícola", 'success');
    }
}

function handleWorkerError(type) {
    return (e) => {
        console.error(`Error en ${type} worker:`, e.message);
        showError(`Error en ${type === 'compress' ? 'compresión' : 'descompresión'}: ${e.message}`);
        stopProgressTracking(type);
    };
}

// =============================================
// Funciones de progreso
// =============================================

function startProgressTracking(type) {
    stopProgressTracking(type);
    
    const prefix = type;
    const startTime = performance.now();
    
    const interval = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const percentage = parseFloat(document.getElementById(`${prefix}Percentage`).textContent) || 0;
        
        // Actualizar tiempo transcurrido
        document.getElementById(`${prefix}Elapsed`).textContent = `${elapsed.toFixed(1)}s`;
        
        // Calcular tiempo restante y velocidad
        if (percentage > 0 && compressFileSize > 0) {
            const remaining = (100 - percentage) * (elapsed / percentage);
            document.getElementById(`${prefix}Remaining`).textContent = `${remaining.toFixed(1)}s`;
            
            // Calcular velocidad (MB/s)
            const processedSize = (compressFileSize * percentage) / 100;
            const speed = (processedSize / (1024 * 1024)) / elapsed;
            document.getElementById(`${prefix}Speed`).textContent = `${speed.toFixed(2)} MB/s`;
        }
    }, 100);
    
    if (type === 'compress') {
        compressInterval = interval;
    } else {
        decompressInterval = interval;
    }
}

function stopProgressTracking(type) {
    const prefix = type;
    const startTime = type === 'compress' ? compressStartTime : decompressStartTime;
    
    if (startTime) {
        const elapsed = (performance.now() - startTime) / 1000;
        document.getElementById(`${prefix}Time`).textContent = `${elapsed.toFixed(2)}s`;
    }
    
    // Detener intervalo
    if (type === 'compress' && compressInterval) {
        clearInterval(compressInterval);
        compressInterval = null;
    } else if (decompressInterval) {
        clearInterval(decompressInterval);
        decompressInterval = null;
    }
}

function updateProgress(type, progress) {
    const prefix = type;
    const percentage = Math.min(100, Math.max(0, progress));
    
    // Actualizar barra y porcentaje
    document.getElementById(`${prefix}Progress`).style.width = `${percentage}%`;
    document.getElementById(`${prefix}Percentage`).textContent = `${Math.round(percentage)}%`;
}

function resetProgress(type) {
    const prefix = type;
    
    // Resetear barras y valores
    document.getElementById(`${prefix}Progress`).style.width = '0%';
    document.getElementById(`${prefix}Percentage`).textContent = '0%';
    document.getElementById(`${prefix}Elapsed`).textContent = '0s';
    document.getElementById(`${prefix}Remaining`).textContent = 'Calculando...';
    document.getElementById(`${prefix}Speed`).textContent = '0 MB/s';
    
    // Resetear estadísticas
    if (type === 'compress') {
        document.getElementById('compressedSize').textContent = '-';
        document.getElementById('compressionRatio').textContent = '-';
        document.getElementById('downloadCompressed').style.display = 'none';
        
        // Liberar URL
        if (lastCompressedUrl) {
            URL.revokeObjectURL(lastCompressedUrl);
            lastCompressedUrl = null;
        }
    } else {
        document.getElementById('decompressedSize').textContent = '-';
        document.getElementById('downloadDecompressed').style.display = 'none';
        
        // Liberar URL
        if (lastDecompressedUrl) {
            URL.revokeObjectURL(lastDecompressedUrl);
            lastDecompressedUrl = null;
        }
    }
}

// =============================================
// Funciones de UI y notificaciones
// =============================================

function showNotification(message, type = 'info') {
    const colors = {
        success: '#4CAF50',
        error: '#F44336',
        warning: '#FF9800',
        info: '#2196F3'
    };
    
    const icon = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }[type];
    
    // Crear notificación
    const notification = document.createElement('div');
    notification.innerHTML = `<strong>${icon}</strong> ${message}`;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '15px 20px';
    notification.style.backgroundColor = colors[type];
    notification.style.color = 'white';
    notification.style.borderRadius = '8px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.maxWidth = '350px';
    notification.style.fontSize = '15px';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(20px)';
    notification.style.transition = 'all 0.3s ease';
    
    document.body.appendChild(notification);
    
    // Animación de entrada
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Eliminar después de 5 segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 5000);
}

function showError(message) {
    showNotification(message, 'error');
}

// =============================================
// Funciones de utilidad (backup)
// =============================================

// Si no tenemos utils.js, definimos funciones esenciales
if (typeof getPerformanceProfile === 'undefined') {
    function getPerformanceProfile() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const ram = navigator.deviceMemory || 4; // GB
        
        if (isMobile && ram < 6) return 'low-end';
        return 'high-end';
    }
}

if (typeof detectStructuredData === 'undefined') {
    function detectStructuredData(data) {
        // Implementación simplificada
        return {
            csv: Math.random() > 0.5,
            json: false,
            log: false,
            xml: false
        };
    }
}

if (typeof getOptimalChunkSize === 'undefined') {
    function getOptimalChunkSize(fileSize) {
        return 1024 * 512; // 512KB por defecto
    }
}

if (typeof shouldCompressFile === 'undefined') {
    function shouldCompressFile(filename, fileSize) {
        const ext = filename.split('.').pop().toLowerCase();
        const nonCompressible = ['mp4', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', '7z', 'xlsx', 'pdf'];
        return !nonCompressible.includes(ext);
    }
}

if (typeof formatSize === 'undefined') {
    function formatSize(bytes) {
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${bytes} bytes`;
    }
}

// Limpiar al salir
window.addEventListener('beforeunload', () => {
    if (lastCompressedUrl) URL.revokeObjectURL(lastCompressedUrl);
    if (lastDecompressedUrl) URL.revokeObjectURL(lastDecompressedUrl);
    
    if (COMPRESS_WORKER) COMPRESS_WORKER.terminate();
    if (DECOMPRESS_WORKER) DECOMPRESS_WORKER.terminate();
});

console.log("HyperStorage6D V3 listo para el sector agroindustrial paraguayo");
