/*
 * The Cholo mark, as data.
 *
 * It is the same drawing as `fontend/public/icons/icon.svg` — the bus in a rounded green
 * square — reduced to the shapes a canvas, an SVG export and the verification script can
 * all reproduce identically. Nothing here loads a file: the sticker maker has to work by
 * double-clicking `index.html`, where `fetch` and external images are not available.
 *
 * Geometry is in the icon's own 512-unit space, so the two files can be compared by eye:
 * every number below appears in icon.svg.
 *
 * The ratios are the part that matters for scanning. A logo covers real modules, so:
 *   - the code is generated at error correction level H (about 30% recoverable) whenever
 *     a logo is drawn, and M when it is not;
 *   - the white plate is 27% of the code's width and the mark 20.5% of it — a little over
 *     4% of the code's area, well inside what H can rebuild.
 * `scripts/verify-qr.mjs` rasterises exactly this geometry and decodes it with jsQR at
 * the sizes the tool prints, so the safe margin is measured, not assumed.
 */
(function (root) {
  const LOGO = {
    source: "fontend/public/icons/icon.svg",
    viewBox: 512,
    /** Half the code's width taken by the white plate under the mark. */
    padRatio: 0.27,
    /** …and by the mark itself. */
    boxRatio: 0.205,
    /** Corner rounding of the white plate, as a share of its own size. */
    padRadius: 0.2,
    /** Error correction used while a logo is drawn. */
    level: "H",
    shapes: [
      { rect: [0, 0, 512, 512], radius: 97, fill: "#195a45" },
      { rect: [67, 123, 378, 256], radius: 46, fill: "#ffffff" },
      { rect: [101, 157, 310, 116], radius: 26, fill: "#d6e9dd" },
      { rect: [157, 131, 198, 20], radius: 8, fill: "#104833" },
      { rect: [89, 323, 334, 38], radius: 14, fill: "#195a45" },
      { rect: [107, 333, 44, 20], radius: 9, fill: "#e9865c" },
      { rect: [361, 333, 44, 20], radius: 9, fill: "#e9865c" },
      { rect: [111, 373, 60, 44], radius: 14, fill: "#104833" },
      { rect: [341, 373, 60, 44], radius: 14, fill: "#104833" },
      { circle: [424, 89, 15], fill: "#e9865c" },
    ],
  };

  root.CHOLO_LOGO = LOGO;
})(typeof window !== "undefined" ? window : globalThis);
