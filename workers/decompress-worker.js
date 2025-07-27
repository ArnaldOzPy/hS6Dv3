import { createBWTProcessor } from '../bwt-engine.js';
import { createHuffmanEncoder } from '../huffman-engine.js';
import { crc32 } from '../utils.js';

const bwtProcessor = createBWTProcessor();
const huffmanEncoder = createHuffmanEncoder();

function reportProgress(progress, stage) {
  self.postMessage({ type: 'progress', progress, stage });
}

self.onmessage = async (e) => {
  const { data, fileName, fileSize } = e.data;
  const startTime = performance.now();

  try {
    reportProgress(0.05, 'Validando archivo');

    // Validación básica
    if (data.length < 12) {
      throw new Error("Archivo inválido: tamaño mínimo 12 bytes");
    }

    // Leer cabecera
    const header = data.slice(0, 12);
    const view = new DataView(header.buffer);
    
    // Magic number
    if (view.getUint32(0) !== 0x48533644) {
      throw new Error("Formato de archivo inválido");
    }
    
    const originalSize = view.getUint32(4);
    const flags = view.getUint8(8);
    const checksum = view.getUint32(9);
    
    const usedBWT = (flags & 1) === 1;
    const isSpecialCase = (flags & 2) === 2;
    const isUncompressed = (flags & 4) === 4;

    reportProgress(0.2, 'Verificando integridad');

    // Extraer datos y verificar checksum
    const compressedData = data.slice(12);
    if (crc32(compressedData) !== checksum) {
      throw new Error("Checksum no coincide - archivo corrupto");
    }

    let originalData;

    if (isUncompressed) {
      reportProgress(0.8, 'Datos sin comprimir');
      originalData = compressedData;
    } else {
      reportProgress(0.4, 'Descomprimiendo Huffman');
      const huffmanData = huffmanEncoder.decode(compressedData);
      
      if (usedBWT) {
        reportProgress(0.7, 'Revirtiendo BWT');
        originalData = bwtProcessor.inverse(huffmanData);
      } else {
        originalData = huffmanData;
      }
    }

    // Manejar caso especial (bytes repetidos)
    if (isSpecialCase && originalData.length === 1 && originalSize > 1) {
      const repeated = new Uint8Array(originalSize);
      repeated.fill(originalData[0]);
      originalData = repeated;
    }

    // Verificar tamaño
    if (originalData.length !== originalSize) {
      console.warn(`Tamaño descomprimido (${originalData.length}) no coincide con tamaño original (${originalSize})`);
      if (originalData.length > originalSize) {
        originalData = originalData.slice(0, originalSize);
      }
    }

    reportProgress(1.0, 'Descompresión completada');

    self.postMessage({
      type: 'complete',
      decompressed: originalData,
      compressedSize: data.length,
      originalSize: originalData.length,
      fileName
    }, [originalData.buffer]);

  } catch (error) {
    self.postMessage({
      error: `Error en descompresión: ${error.message}`,
      fileName,
      details: error.stack
    });
  }
};
