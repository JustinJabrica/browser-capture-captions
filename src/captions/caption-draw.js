// Draws a subtitle onto a picture: where its lines go, how big the letters
// are, and the box behind them. Shared by both ways of burning captions in
// (burn-in.js), so they come out the same. The layout is plain arithmetic
// with the text's width passed in, so it runs in Node, and the drawing takes
// any 2D canvas context.

// One fixed look: white letters on a dark box, centred near the bottom, in
// the page's own sans-serif. Sizes are shares of the picture's height, so a
// caption takes the same part of a small picture as of a large one.
export const CAPTION_STYLE = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  fontWeight: 600,
  fontShare: 1 / 18, // letter height, of the picture's height
  minFontPx: 12,
  lineHeight: 1.3,
  bottomShare: 0.06, // from the picture's bottom edge to the box's
  maxWidthShare: 0.92, // of the picture's width, box included
  padXEm: 0.45,
  padYEm: 0.12,
  color: "#ffffff",
  background: "rgba(0, 0, 0, 0.72)",
};

export const fontOf = (px, style = CAPTION_STYLE) => `${style.fontWeight} ${px}px ${style.fontFamily}`;

// Where a caption's lines go in a width × height picture.
// measure(text, fontPx) -> the text's width in pixels at that size.
// -> { fontPx, lines: [{ text, x, baseline, box: { x, y, width, height } }], band: { y, height } }
// x is where the text starts; band is the strip of the picture the caption
// covers, top to bottom. A line too wide for the picture shrinks the letters
// until the widest fits.
export function layoutCaption(lines, width, height, measure, style = CAPTION_STYLE) {
  let fontPx = Math.max(style.minFontPx, Math.round(height * style.fontShare));
  const widest = () => Math.max(0, ...lines.map((text) => measure(text, fontPx))) + 2 * style.padXEm * fontPx;
  const room = width * style.maxWidthShare;
  if (widest() > room) fontPx = Math.max(6, Math.floor((fontPx * room) / widest()));
  const lineBox = fontPx * style.lineHeight + 2 * style.padYEm * fontPx;
  const bottom = height - Math.round(height * style.bottomShare);
  const top = bottom - lineBox * lines.length;
  return {
    fontPx,
    lines: lines.map((text, i) => {
      const textWidth = measure(text, fontPx);
      const boxWidth = textWidth + 2 * style.padXEm * fontPx;
      const y = top + lineBox * i;
      return {
        text,
        x: (width - textWidth) / 2,
        // The letters sit in the middle of their line: the baseline is about 0.36 em under the middle of an x.
        baseline: y + lineBox / 2 + fontPx * 0.36,
        box: { x: (width - boxWidth) / 2, y, width: boxWidth, height: lineBox },
      };
    }),
    band: { y: top, height: lineBox * lines.length },
  };
}

// Draws a cue (toCues()'s: { lines }) over whatever the context already
// holds. -> the layout it drew, or null for a cue with no text.
export function drawCaption(ctx, cue, width, height, style = CAPTION_STYLE) {
  const lines = (cue?.lines ?? []).filter(Boolean);
  if (!lines.length) return null;
  const measure = (text, px) => {
    ctx.font = fontOf(px, style);
    return ctx.measureText(text).width;
  };
  const layout = layoutCaption(lines, width, height, measure, style);
  ctx.save();
  ctx.font = fontOf(layout.fontPx, style);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = style.background;
  // One pixel of overlap, so two lines' boxes leave no seam between them.
  for (const line of layout.lines) ctx.fillRect(Math.floor(line.box.x), Math.floor(line.box.y), Math.ceil(line.box.width), Math.ceil(line.box.height) + 1);
  ctx.fillStyle = style.color;
  for (const line of layout.lines) ctx.fillText(line.text, line.x, line.baseline);
  ctx.restore();
  return layout;
}
