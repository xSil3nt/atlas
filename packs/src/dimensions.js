// Depth includes bevels and printed faces. Pitch must exceed thickness.
export const D = Object.freeze({ width: 2.42, height: 3.7, cardWidth: 2.16,
 cardHeight: 2.16 * 523 / 375, cardRadius: .12, thickness: .009, pitch: .0105,
 foilHalfDepth: .088, seamY: 1.61, mouthDepth: .09, stackY: -.06,
 count: 12, extractionDistance: 3.5 });
export const stackEnvelope = (count = D.count) => (count - 1) * D.pitch + D.thickness;
export const stackFront = (count = D.count) => (count - 1) * D.pitch / 2;


// Two adjacent faces only. The edge seam samples their bordering pixels.
export const PACK_ATLAS = Object.freeze({ face: 1024, width: 2048, height: 1536 });
