/**
 * Client-side "WhatsApp-style" brochure compression: rasterizes each PDF page
 * to a canvas (via pdfjs-dist) at a bounded max dimension, re-encodes it as a
 * JPEG, then rebuilds a new PDF from those JPEGs (via pdf-lib). Runs entirely
 * in the browser before the file ever reaches the upload form, so slow
 * connections benefit too, not just server storage.
 *
 * Rasterizing (rather than trying to surgically recompress the images
 * embedded inside the original PDF in place) is deliberate: pdfjs-dist's
 * renderer already handles arbitrary fonts, vector art and color spaces
 * correctly, so every brochure comes out as a predictable, valid PDF
 * regardless of how it was originally produced. The tradeoff -- any
 * selectable text becomes a flattened image -- matches real estate
 * brochures, which are near-universally photo/layout-heavy PDFs exported
 * from a design tool, not text documents.
 *
 * Never blocks an upload: any failure (corrupt PDF, canvas/memory limits,
 * worker load failure) falls back to the original file untouched.
 */

const MIN_BYTES_TO_COMPRESS = 1.5 * 1024 * 1024; // don't bother below this -- matches BrochureUploader's own size sense
const DEFAULT_MAX_DIMENSION_PX = 1600; // long-edge cap, similar in spirit to WhatsApp's image downscale
const DEFAULT_JPEG_QUALITY = 0.72;

export interface CompressPdfResult {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  /** false whenever `file` is still the original -- too small to bother, compression didn't help, or it failed. */
  compressed: boolean;
}

function skip(file: File): CompressPdfResult {
  return { file, originalBytes: file.size, compressedBytes: file.size, compressed: false };
}

export async function compressPdfFile(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {}
): Promise<CompressPdfResult> {
  if (file.size < MIN_BYTES_TO_COMPRESS) return skip(file);

  try {
    // Dynamically imported so the ~1-2MB pdfjs/pdf-lib bundle only loads for
    // admins who actually pick a large PDF, never as part of the page's
    // initial JS.
    const [{ getDocument, GlobalWorkerOptions }, { PDFDocument }] = await Promise.all([
      import("pdfjs-dist"),
      import("pdf-lib"),
    ]);
    // Served from /public (same origin) rather than resolved via a bundler
    // asset import -- keeps this working under the site's CSP (script-src
    // 'self') without depending on Turbopack's asset-URL handling.
    GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION_PX;
    const quality = opts.quality ?? DEFAULT_JPEG_QUALITY;

    const sourceBytes = await file.arrayBuffer();
    const pdf = await getDocument({ data: sourceBytes }).promise;
    const outDoc = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1, maxDimension / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))), "image/jpeg", quality);
      });
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const jpegImage = await outDoc.embedJpg(jpegBytes);

      const outPage = outDoc.addPage([baseViewport.width, baseViewport.height]);
      outPage.drawImage(jpegImage, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height });

      // Free the canvas's backing store immediately -- a 20+ page brochure
      // otherwise keeps every page's full-resolution bitmap alive at once.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }

    const outBytes = await outDoc.save({ useObjectStreams: true });
    if (outBytes.byteLength >= file.size) return skip(file);

    return {
      file: new File([outBytes as BlobPart], file.name, { type: "application/pdf", lastModified: Date.now() }),
      originalBytes: file.size,
      compressedBytes: outBytes.byteLength,
      compressed: true,
    };
  } catch (error) {
    console.error("[pdf-compress] failed, uploading original file instead:", error);
    return skip(file);
  }
}
