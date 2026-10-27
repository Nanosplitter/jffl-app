import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import satori from 'satori';
import sharp from 'sharp';
import type { BoutChart, PreviewBout, PreviewFact, PreviewLine, PreviewSide, SocialPreview } from '../../src/socialPreview.ts';

const require = createRequire(import.meta.url);

interface Node {
  type: string;
  props: Record<string, unknown>;
}

interface Font {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: 'normal' | 'italic';
}

let fonts: Font[] | null = null;

function fontFile(packageName: string, file: string) {
  return readFileSync(require.resolve(`${packageName}/files/${file}`));
}

function loadFonts(): Font[] {
  fonts ??= [
    { name: 'Inter', data: fontFile('@fontsource/inter', 'inter-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Inter', data: fontFile('@fontsource/inter', 'inter-latin-600-normal.woff'), weight: 600, style: 'normal' },
    { name: 'Inter', data: fontFile('@fontsource/inter', 'inter-latin-700-normal.woff'), weight: 700, style: 'normal' },
    { name: 'Barlow Condensed', data: fontFile('@fontsource/barlow-condensed', 'barlow-condensed-latin-700-normal.woff'), weight: 700, style: 'normal' },
    { name: 'Barlow Condensed', data: fontFile('@fontsource/barlow-condensed', 'barlow-condensed-latin-800-normal.woff'), weight: 800, style: 'normal' },
    { name: 'Barlow Condensed', data: fontFile('@fontsource/barlow-condensed', 'barlow-condensed-latin-800-italic.woff'), weight: 800, style: 'italic' },
  ];
  return fonts;
}

export async function logoDataUrl(bytes: Uint8Array): Promise<string | null> {
  try {
    const png = await sharp(bytes).resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    if (png.byteLength < 40) return null;
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderPreviewPng(preview: SocialPreview, logos: Record<string, string | null> = {}, shape: 'wide' | 'square' = 'wide') {
  const height = shape === 'square' ? 1200 : 630;
  const svg = await satori(cardNode(preview, logos, height) as never, { width: 1200, height, fonts: loadFonts() });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function cardNode(preview: SocialPreview, logos: Record<string, string | null>, height: number): Node {
  const square = height > 700;
  return node('div', { width: 1200, height, display: 'flex', background: '#050607', color: '#f5f7f8', fontFamily: 'Inter' }, [
    node('div', { width: 18, height, background: preview.accent || '#0076b6' }),
    node('div', { width: 1182, height, display: 'flex', flexDirection: 'column', padding: square ? '64px 72px 56px 64px' : '48px 64px 40px 56px' }, [
      header(preview),
      body(preview, logos, square),
      footer(preview),
    ]),
  ]);
}

function header(preview: SocialPreview) {
  return node('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }, [
    node('div', {
      fontFamily: 'Barlow Condensed', fontStyle: 'italic', fontWeight: 800, fontSize: 72, lineHeight: 0.86,
      letterSpacing: -3, color: '#f5f7f8', paddingRight: 8, paddingBottom: 4, borderBottom: '6px solid #0076b6',
    }, 'JFFL'),
    node('div', { fontSize: 22, lineHeight: 1.2, fontWeight: 700, letterSpacing: 1.4, color: preview.accent || '#b7bec4', textTransform: 'uppercase' }, preview.kicker),
  ]);
}

function body(preview: SocialPreview, logos: Record<string, string | null>, square: boolean) {
  if (preview.layout === 'slate' && preview.bouts.length) return slateBody(preview, logos, square);
  if (preview.layout === 'match' && preview.sides.length === 2) return matchBody(preview, logos, square);
  if (preview.layout === 'profile' && preview.sides[0]) return profileBody(preview, logos, square);
  if (preview.layout === 'board') return boardBody(preview, logos, square);
  if (preview.layout === 'story') return storyBody(preview, square);
  return brandBody(preview, logos);
}

function matchBody(preview: SocialPreview, logos: Record<string, string | null>, square: boolean) {
  const [away, home] = preview.sides;
  const identityWidth = square ? 300 : 318;
  const portraitSize = square ? 116 : 96;
  const scoreSize = square ? 92 : 84;
  const vsWidth = square ? 96 : 100;
  const board = node('div', { width: square ? 1040 : 1060, display: 'flex', flexGrow: preview.chart ? 0 : 1, alignItems: 'center', justifyContent: 'center' }, [
    sideIdentity(away, logos, 'flex-start', identityWidth, portraitSize),
    scoreMark(away, scoreSize, square ? 148 : 144),
    node('div', { width: vsWidth, display: 'flex', alignItems: 'center', justifyContent: 'center' }, [
      node('div', { fontFamily: 'Barlow Condensed', fontStyle: 'italic', fontWeight: 800, fontSize: square ? 72 : 68, letterSpacing: 1, color: '#d5dbe0' }, 'VS'),
    ]),
    scoreMark(home, scoreSize, square ? 148 : 144),
    sideIdentity(home, logos, 'flex-end', identityWidth, portraitSize),
  ]);
  if (!preview.chart) return board;
  return node('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
    board,
    chartRow(away.name, home.name, preview.chart, square ? 1040 : 1060, square, true),
  ]);
}

function slateBody(preview: SocialPreview, logos: Record<string, string | null>, square = false) {
  const graphed = preview.bouts.some(bout => bout.chart && (bout.chart.scoreLeft.length > 1 || bout.chart.chance.length > 1));
  return node('div', {
    display: 'flex', flexDirection: 'column', flexGrow: 1,
    justifyContent: graphed && !square ? 'flex-start' : 'space-between',
    paddingTop: square ? 36 : graphed ? 8 : 28, paddingBottom: square ? 24 : graphed ? 4 : 18,
  }, preview.bouts.map(bout => boutRow(bout, logos, square, graphed)));
}

function boutRow(bout: PreviewBout, logos: Record<string, string | null>, square: boolean, graphed: boolean) {
  const tight = graphed && !square;
  const children: Node[] = [
    node('div', { fontSize: tight ? 16 : square ? 24 : 18, fontWeight: 700, letterSpacing: 1.2, color: bout.accent, textTransform: 'uppercase' }, bout.label),
    node('div', { display: 'flex', alignItems: 'center', marginTop: tight ? 4 : square ? 18 : 12 }, [
      compactSide(bout.away, logos, false, square, tight),
      scoreMark(bout.away, tight ? 56 : square ? 100 : 92),
      node('div', { width: tight ? 56 : square ? 84 : 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }, [
        node('div', { fontFamily: 'Barlow Condensed', fontStyle: 'italic', fontWeight: 800, fontSize: tight ? 32 : square ? 52 : 42, color: '#d5dbe0' }, 'VS'),
      ]),
      scoreMark(bout.home, tight ? 56 : square ? 100 : 92),
      compactSide(bout.home, logos, true, square, tight),
    ]),
  ];
  if (bout.chart && (bout.chart.scoreLeft.length > 1 || bout.chart.chance.length > 1)) {
    children.push(chartRow(bout.away.name, bout.home.name, bout.chart, square ? 1040 : 1060, square));
  }
  return node('div', { display: 'flex', flexDirection: 'column', marginTop: graphed && !square ? 8 : 0 }, children);
}

function compactSide(side: PreviewSide, logos: Record<string, string | null>, end: boolean, square: boolean, tight = false) {
  const portraitSize = tight ? 48 : square ? 96 : 72;
  const width = tight ? 250 : square ? 300 : 320;
  const textWidth = width - portraitSize - 12;
  return node('div', { width, display: 'flex', alignItems: 'center', flexDirection: end ? 'row-reverse' : 'row', overflow: 'hidden' }, [
    portrait(side, logos, portraitSize),
    node('div', { display: 'flex', flexDirection: 'column', width: textWidth, marginLeft: end ? 0 : 12, marginRight: end ? 12 : 0, alignItems: end ? 'flex-end' : 'flex-start', overflow: 'hidden' }, [
      node('div', { width: textWidth, fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: tight ? 28 : square ? 42 : 36, lineHeight: 0.95, textTransform: 'uppercase', textAlign: end ? 'right' : 'left' }, side.name),
      node('div', { width: textWidth, marginTop: tight ? 2 : 4, fontSize: tight ? 14 : square ? 20 : 16, lineHeight: 1.15, color: '#b7bec4', textAlign: end ? 'right' : 'left' }, side.detail),
      oddsLine(side, tight ? 14 : square ? 22 : 16),
    ]),
  ]);
}

function scoreMark(side: PreviewSide, size = 92, width = size > 100 ? 180 : 150) {
  return node('div', { width, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, [
    node('div', { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: size, lineHeight: 0.9, color: side.score ? '#ffffff' : '#7d868d' }, side.score ?? '—'),
  ]);
}

function sideIdentity(side: PreviewSide, logos: Record<string, string | null>, align: 'flex-start' | 'flex-end', width = 470, portraitSize = 112) {
  const end = align === 'flex-end';
  const gap = 14;
  const textWidth = Math.max(88, width - portraitSize - gap);
  return node('div', { width, display: 'flex', alignItems: 'center', flexDirection: end ? 'row-reverse' : 'row', overflow: 'hidden' }, [
    portrait(side, logos, portraitSize),
    node('div', { display: 'flex', flexDirection: 'column', width: textWidth, marginLeft: end ? 0 : gap, marginRight: end ? gap : 0, alignItems: align, overflow: 'hidden' }, [
      node('div', { width: textWidth, fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: nameSize(side.name, textWidth), lineHeight: 0.92, textTransform: 'uppercase', textAlign: end ? 'right' : 'left' }, side.name),
      node('div', { width: textWidth, marginTop: 6, fontSize: 18, lineHeight: 1.15, color: '#b7bec4', textAlign: end ? 'right' : 'left' }, side.detail),
      oddsLine(side, 20),
    ]),
  ]);
}

function oddsLine(side: PreviewSide, size: number) {
  if (!side.odds) return node('div', { height: 0 });
  return node('div', { marginTop: 6, fontSize: size, fontWeight: 700, color: '#f0c48a' }, side.odds);
}

function sideScore(side: PreviewSide, align: 'flex-start' | 'flex-end') {
  return node('div', { width: 470, display: 'flex', justifyContent: align }, [
    node('div', { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 92, lineHeight: 0.9, color: side.score ? '#ffffff' : '#7d868d' }, side.score ?? '—'),
  ]);
}

function profileBody(preview: SocialPreview, logos: Record<string, string | null>, square: boolean) {
  const side = preview.sides[0];
  return node('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
    node('div', { display: 'flex', alignItems: 'center', marginTop: 28 }, [
      portrait(side, logos, square ? 220 : 148),
      node('div', { display: 'flex', flexDirection: 'column', marginLeft: 28, width: 820 }, [
        node('div', { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: headlineSize(preview.headline), lineHeight: 0.9, textTransform: 'uppercase' }, preview.headline),
        node('div', { marginTop: 14, fontSize: 28, lineHeight: 1.25, color: '#d5dbe0' }, preview.subline),
      ]),
    ]),
    factsRow(preview.facts, logos),
  ]);
}

function storyBody(preview: SocialPreview, square: boolean) {
  return node('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', marginTop: 20 }, [
    node('div', { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: square ? Math.max(headlineSize(preview.headline), 78) : headlineSize(preview.headline), lineHeight: 0.94, textTransform: 'uppercase', width: 1000 }, preview.headline),
    node('div', { marginTop: square ? 36 : 22, fontSize: square ? 42 : 30, lineHeight: 1.3, color: '#d5dbe0', width: 980 }, preview.subline),
  ]);
}

function brandBody(preview: SocialPreview, logos: Record<string, string | null>) {
  return node('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
    node('div', { marginTop: 30, fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: headlineSize(preview.headline), lineHeight: 0.92, textTransform: 'uppercase', width: 1020 }, preview.headline),
    node('div', { marginTop: 18, fontSize: 30, lineHeight: 1.28, color: '#d5dbe0', width: 980 }, preview.subline),
    factsRow(preview.facts, logos),
  ]);
}

function factsRow(facts: PreviewFact[], logos: Record<string, string | null> = {}) {
  if (!facts.length) return node('div', { height: 8 });
  const shown = facts.slice(0, 4);
  const width = shown.length > 3 ? 236 : 320;
  return node('div', { display: 'flex', marginTop: 28 }, shown.map((fact, index) => node('div', {
    display: 'flex', flexDirection: 'column', width, marginLeft: index === 0 ? 0 : 14, background: '#12181d', padding: '14px 16px', borderRadius: 10,
  }, [
    node('div', { fontSize: 16, fontWeight: 700, letterSpacing: 1.1, color: fact.accent || '#8b949e', textTransform: 'uppercase' }, fact.label),
    node('div', { display: 'flex', alignItems: 'center', marginTop: 6 }, [
      factLogo(fact, logos),
      node('div', { display: 'flex', flexDirection: 'column' }, [
        node('div', { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 34, lineHeight: 1 }, fact.value),
        fact.note ? node('div', { marginTop: 4, fontSize: 18, lineHeight: 1.2, color: '#b7bec4' }, fact.note) : node('div', { height: 0 }),
      ]),
    ]),
  ])));
}

function factLogo(fact: PreviewFact, logos: Record<string, string | null>) {
  const source = fact.logoUrl ? logos[fact.logoUrl] : null;
  if (!source) return node('div', { width: 0, height: 0 });
  return node('img', { width: 52, height: 52, marginRight: 12, objectFit: 'contain' }, undefined, { src: source, width: 52, height: 52 });
}

function boardBody(preview: SocialPreview, logos: Record<string, string | null>, square: boolean) {
  const groups = groupLines(preview.lines);
  const columns = groups.length > 1 && groups.every(group => group.name);
  const roomy = !columns && !preview.headline && preview.lines.length <= 4;
  const listHeight = square ? (preview.headline ? 860 : 940) : columns && groups.length === 2 && preview.headline ? 286 : roomy ? 390 : preview.headline ? 340 : 360;
  const columnWidth = groups.length === 2 ? (square ? 500 : 520) : 340;
  const scale = columns ? 'column' : roomy ? 'roomy' : 'stack';
  return node('div', { display: 'flex', flexDirection: 'column', marginTop: square ? 20 : 14 }, [
    preview.headline ? node('div', { fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: columns ? (square ? 64 : 48) : (square ? 84 : 56), lineHeight: 0.92, textTransform: 'uppercase' }, preview.headline) : node('div', { height: 0 }),
    preview.subline ? node('div', { marginTop: 8, fontSize: square ? 30 : 22, lineHeight: 1.3, color: '#d5dbe0' }, preview.subline) : node('div', { height: 0 }),
    columns
      ? node('div', { display: 'flex', height: listHeight, marginTop: square ? 18 : 10 }, groups.map((group, index) => node('div', { display: 'flex', flexDirection: 'column', width: columnWidth, justifyContent: 'space-between', marginLeft: index === 0 ? 0 : 28 }, [
        node('div', { fontSize: square ? 28 : 20, fontWeight: 700, letterSpacing: 1.2, color: group.accent, textTransform: 'uppercase' }, group.name),
        ...group.lines.map(line => lineRow(line, logos, scale, square, columnWidth - 20)),
      ])))
      : node('div', { display: 'flex', flexDirection: 'column', height: listHeight, justifyContent: 'space-between', marginTop: roomy ? 8 : 12 }, preview.lines.map(line => lineRow(line, logos, scale, square, 900))),
  ]);
}

function groupLines(lines: PreviewLine[]) {
  const groups: { name: string; accent: string; lines: PreviewLine[] }[] = [];
  for (const line of lines) {
    const last = groups.at(-1);
    if (!last || last.name !== line.group) groups.push({ name: line.group, accent: line.accent, lines: [line] });
    else last.lines.push(line);
  }
  return groups;
}

function lineRow(line: PreviewLine, logos: Record<string, string | null>, scale: 'column' | 'stack' | 'roomy', square: boolean, textWidth: number) {
  const source = line.logoUrl ? logos[line.logoUrl] : null;
  const column = scale === 'column';
  const roomy = scale === 'roomy';
  const size = square ? (column ? 88 : roomy ? 132 : 116) : roomy ? 64 : column ? 44 : 40;
  const name = square ? (column ? 46 : roomy ? 76 : 64) : roomy ? 46 : column ? 30 : 32;
  const detail = square ? (column ? 24 : 32) : column ? 16 : roomy ? 22 : 18;
  const width = Math.max(180, textWidth - size - (line.mark ? 56 : 8));
  return node('div', { display: 'flex', alignItems: 'center' }, [
    line.mark ? node('div', { width: column ? (square ? 48 : 32) : (square ? 64 : 44), fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: column ? (square ? 40 : 28) : (square ? 52 : 34), color: '#8b949e' }, line.mark) : node('div', { width: 0 }),
    source
      ? node('img', { width: size, height: size, marginRight: square ? 18 : 14, objectFit: 'contain' }, undefined, { src: source, width: size, height: size })
      : node('div', { width: line.logoUrl ? size : 0, marginRight: line.logoUrl ? 14 : 0 }),
    node('div', { display: 'flex', flexDirection: 'column', width }, [
      node('div', { fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: name, lineHeight: 1, textTransform: 'uppercase', color: line.group ? '#f5f7f8' : line.accent }, line.name),
      line.detail ? node('div', { marginTop: 4, width, fontSize: detail, lineHeight: 1.15, color: '#b7bec4' }, line.detail) : node('div', { height: 0 }),
    ]),
  ]);
}

function footer(preview: SocialPreview) {
  return node('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
    node('div', { fontSize: 22, fontWeight: 700, color: '#8b949e' }, 'jffl.org'),
    node('div', { fontSize: 22, fontWeight: 700, color: statusColor(preview.status), background: '#12181d', padding: '8px 14px', borderRadius: 999 }, preview.status),
  ]);
}

function portrait(side: PreviewSide, logos: Record<string, string | null>, size = 112) {
  const source = side.logoUrl ? logos[side.logoUrl] : null;
  if (source) {
    return node('img', {
      width: size, height: size, borderRadius: side.shape === 'round' ? size : 16, background: '#101418', objectFit: 'cover',
    }, undefined, { src: source, width: size, height: size });
  }
  return node('div', {
    width: size, height: size, borderRadius: side.shape === 'round' ? size : 16, background: '#102433', color: '#7ec4ea',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: Math.round(size * 0.38),
  }, side.mark || 'J');
}

function headlineSize(value: string) {
  if (value.length > 42) return 58;
  if (value.length > 28) return 68;
  return 84;
}

function nameSize(value: string, maxWidth = 280) {
  let size = value.length > 16 ? 40 : value.length > 11 ? 48 : 56;
  while (size > 32 && value.length * size * 0.56 > maxWidth) size -= 4;
  return size;
}

function statusColor(status: string) {
  if (status === 'Live') return '#7ec4ea';
  if (status === 'Final') return '#8fbf55';
  if (status === 'Level' || status === 'Upcoming' || status === 'Waiting') return '#f0c48a';
  return '#d5dbe0';
}

const LINE_LEFT = '#4aa8dd';
const LINE_RIGHT = '#f0a155';

function chartRow(leftName: string, rightName: string, chart: BoutChart, width: number, square: boolean, roomy = false): Node {
  const height = roomy ? (square ? 460 : 250) : (square ? 300 : 118);
  const gap = 18;
  const chance = chart.chance.length > 1;
  const scores = chart.scoreLeft.length > 1 || chart.scoreRight.length > 1;
  const panelWidth = chance && scores ? (width - gap) / 2 : width;
  const panels: Node[] = [];
  if (chance) panels.push(chancePanel(leftName, chart.chance, panelWidth, height));
  if (scores) panels.push(scorePanel(leftName, rightName, chart.scoreLeft, chart.scoreRight, panelWidth, height));
  return node('div', { display: 'flex', alignItems: 'flex-start', marginTop: square ? 18 : 6, width }, panels.length === 2 ? [panels[0], node('div', { width: gap, height: 1 }), panels[1]] : panels);
}

function chancePanel(name: string, values: (number | null)[], width: number, height: number): Node {
  const plotHeight = height - 36;
  const ending = lastDrawn(values);
  return node('div', { display: 'flex', flexDirection: 'column', width }, [
    node('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width }, [
      node('div', { fontSize: 13, fontWeight: 700, letterSpacing: 1.1, color: '#8b949e', textTransform: 'uppercase' }, 'Win chance'),
      node('div', { fontSize: 13, fontWeight: 700, color: LINE_LEFT }, ending == null ? '' : `${name} ${Math.round(ending)}%`),
    ]),
    svgFrame(width, plotHeight, [
      pathNode(guidePath(values.length, width, plotHeight, 50, 0, 100), '#3a4248', 1, '5 4'),
      pathNode(linePath(values, width, plotHeight, 0, 100), LINE_LEFT, 3),
    ]),
  ]);
}

function scorePanel(leftName: string, rightName: string, left: (number | null)[], right: (number | null)[], width: number, height: number): Node {
  const plotHeight = height - 36;
  const domain = scoreDomain(left, right);
  return node('div', { display: 'flex', flexDirection: 'column', width }, [
    node('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width }, [
      node('div', { fontSize: 13, fontWeight: 700, letterSpacing: 1.1, color: '#8b949e', textTransform: 'uppercase' }, 'Score'),
      node('div', { display: 'flex' }, [
        node('div', { fontSize: 13, fontWeight: 700, color: LINE_LEFT }, leftName),
        node('div', { fontSize: 13, fontWeight: 700, color: '#8b949e', marginLeft: 8, marginRight: 8 }, '·'),
        node('div', { fontSize: 13, fontWeight: 700, color: LINE_RIGHT }, rightName),
      ]),
    ]),
    svgFrame(width, plotHeight, domain ? [
      pathNode(linePath(right, width, plotHeight, domain.min, domain.max), LINE_RIGHT, 3),
      pathNode(linePath(left, width, plotHeight, domain.min, domain.max), LINE_LEFT, 3),
    ] : []),
  ]);
}

function svgFrame(width: number, height: number, children: Node[]): Node {
  return { type: 'svg', props: { width, height, viewBox: `0 0 ${width} ${height}`, children: children.filter(child => child.props.d) } };
}

function pathNode(d: string, stroke: string, width: number, dash = '', opacity = 1): Node {
  return {
    type: 'path',
    props: {
      d, fill: opacity < 1 ? stroke : 'none', stroke: opacity < 1 ? 'none' : stroke, strokeWidth: width,
      strokeLinejoin: 'round', strokeLinecap: 'round', strokeDasharray: dash, opacity,
    },
  };
}

function scoreDomain(left: (number | null)[], right: (number | null)[]) {
  const values = [...left, ...right].filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.08, 2);
  return { min: min - pad, max: max + pad };
}

function linePath(values: (number | null)[], width: number, height: number, min: number, max: number) {
  return segments(values, width, height, min, max).map(segment => segment.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')).join(' ');
}

function guidePath(count: number, width: number, height: number, value: number, min: number, max: number) {
  const y = yAt(value, height, min, max);
  if (!Number.isFinite(y) || count < 2) return '';
  return `M1 ${y.toFixed(1)} H${(width - 1).toFixed(1)}`;
}

function segments(values: (number | null)[], width: number, height: number, min: number, max: number) {
  const groups: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      if (current.length) groups.push(current);
      current = [];
      return;
    }
    const x = values.length <= 1 ? width / 2 : 1 + (index / (values.length - 1)) * (width - 2);
    current.push({ x, y: yAt(value, height, min, max) });
  });
  if (current.length) groups.push(current);
  return groups;
}

function yAt(value: number, height: number, min: number, max: number) {
  const span = max - min || 1;
  return 8 + (1 - (value - min) / span) * (height - 16);
}

function lastDrawn(values: (number | null)[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) if (values[index] != null) return values[index];
  return null;
}

function node(type: string, style: Record<string, string | number>, children?: Node['props']['children'], extra: Record<string, unknown> = {}): Node {
  return { type, props: { ...extra, style, ...(children === undefined ? {} : { children }) } };
}
