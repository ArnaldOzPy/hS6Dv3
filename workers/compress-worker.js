import { createBWTProcessor } from '../bwt-engine.js';
import { createHuffmanEncoder } from '../huffman-engine.js';
import { crc32, isStructuredText } from '../utils.js';

const bwtProcessor = createBWTProcessor();
const huffmanEncoder = createHuffmanEncoder();
const CHUNK_SIZE = 524288; // 512KB para móviles (reducido de 5MB)

// Reportar progreso optimizado para móviles
function reportProgress(progress, stage) {
  self.postMessage({ type: 'progress', progress, stage });
}

// Función mejorada para detectar datos estructurados
function shouldUseBWT(data) {
  // Priorizar detección de texto estructurado (CSV, logs, etc.)
  if (isStructuredText(data)) {
    return true;
  }
  
  // Detección de binario simplificada
  const sampleSize = Math.min(data.length, 10000);
  let textChars = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const byte = data[i];
    // Caracteres de texto: ASCII imprimible + saltos de línea
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      textChars++;
    }
  }
  
  const textRatio = textChars / sampleSize;
  return textRatio > 0.85; // 85% de caracteres de texto
}

self.onmessage = async (e) => {
  const { data, fileName, fileSize } = e.data;
  const startTime = performance.now();
  
  // Limitar tamaño máximo para móviles
  const MAX_MOBILE_SIZE = 50 * 1024 * 1024; // 50MB
  if (fileSize > MAX_MOBILE_SIZE) {
    self.postMessage({ 
      error: `Archivo demasiado grande (${(fileSize/(1024*1024)).toFixed(1)}MB). Límite: 50MB`
    });
    return;
  }

  try {
    reportProgress(0.05, 'Analizando datos');
    
    const useBWT = shouldUseBWT(data);
    let compressedData;
    let isSpecialCase = false;
    let isUncompressed = false;

    if (useBWT) {
      reportProgress(0.2, 'Aplicando BWT (texto estructurado)');
      
      try {
        const bwtData = bwtProcessor.process(data);
        reportProgress(0.4, 'Comprimiendo con Huffman');
        compressedData = huffmanEncoder.encode(bwtData);
      } catch (error) {
        console.error("Error en compresión BWT+Huffman:", error);
        throw new Error("Fallo en compresión para texto estructurado");
      }
    } else {
      reportProgress(0.2, 'Comprimiendo binario');
      
      // Verificar si es un caso especial (bytes repetidos)
      if (isAllSame(data)) {
        reportProgress(0.3, 'Optimizando bytes repetidos');
        isSpecialCase = true;
        compressedData = huffmanEncoder.encode(data);
      } else {
        try {
          compressedData = huffmanEncoder.encode(data);
        } catch (error) {
          console.error("Error en compresión Huffman:", error);
          throw new Error("Fallo en compresión binaria");
        }
      }
    }

    // Verificar efectividad de compresión
    const compressionRatio = compressedData.length / data.length;
    if (compressionRatio > 0.95) {
      reportProgress(0.6, 'Compresión mínima, usando datos originales');
      compressedData = data;
      isUncompressed = true;
    }

    reportProgress(0.85, 'Empaquetando resultado');

    // Cabecera optimizada (12 bytes)
    const header = new Uint8Array(12);
    const view = new DataView(header.buffer);
    
    // Magic number (4 bytes)
    view.setUint32(0, 0x48533644); // 'HS6D'
    
    // Tamaño original (4 bytes)
    view.setUint32(4, data.length);
    
    // Flags (1 byte)
    let flags = 0;
    if (useBWT) flags |= 1;
    if (isSpecialCase) flags |= 2;
    if (isUncompressed) flags |= 4;
    view.setUint8(8, flags);
    
    // Checksum (4 bytes)
    const checksum = crc32(compressedData);
    view.setUint32(9, checksum);

    // Archivo final
    const finalOutput = new Uint8Array(header.length + compressedData.length);
    finalOutput.set(header);
    finalOutput.set(compressedData, header.length);

    reportProgress(1.0, 'Finalizado');

    self.postMessage({
      type: 'complete',
      compressed: finalOutput,
      originalSize: data.length,
      compressedSize: finalOutput.length,
      fileName,
      compressionRatio
    }, [finalOutput.buffer]);

  } catch (error) {
    self.postMessage({ 
      error: `Error en compresión: ${error.message}`,
      fileName,
      stack: error.stack
    });
  }
};

function isAllSame(data) {
  if (data.length < 100) return false;
  const first = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] !== first) return false;
  }
  return true;
}
