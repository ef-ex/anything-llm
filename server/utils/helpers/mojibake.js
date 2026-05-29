/**
 * Repair UTF-8 text mis-decoded as Windows-1252 (e.g. Iâ€™m -> I'm).
 * Maps common mojibake code points back to bytes, then decodes as UTF-8.
 */
const CP1252_UNICODE_TO_BYTE = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

function repairMojibake(text) {
  if (!text || (!text.includes("â") && !text.includes("\u00e2"))) {
    return text;
  }

  try {
    const bytes = [];
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code <= 0xff) {
        bytes.push(code);
        continue;
      }
      const mapped = CP1252_UNICODE_TO_BYTE.get(code);
      if (mapped === undefined) return text;
      bytes.push(mapped);
    }
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return text;
  }
}

module.exports = { repairMojibake };
