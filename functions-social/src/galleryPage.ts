import { escapeHtml, type SocialPreview } from '../../src/socialPreview.ts';

export interface GalleryView {
  label: string;
  note: string;
  path: string;
  imageUrl: string;
  image: string;
  squareImage: string;
  preview: SocialPreview;
}

export function galleryPage(views: GalleryView[], sourceNote: string) {
  const cards = views.map(view => `<article class="card">
      <header><h2>${escapeHtml(view.label)}</h2><p>${escapeHtml(view.note)}</p></header>
      <img class="full" src="${view.image}" alt="${escapeHtml(view.preview.imageAlt)}" width="1200" height="630">
      <div class="crops" aria-label="How the picture may be cropped">
        <figure><img src="${view.image}" alt=""><figcaption>Wide</figcaption></figure>
        <figure class="square"><img src="${view.squareImage}" alt="" width="1200" height="1200"><figcaption>Square</figcaption></figure>
      </div>
      <div class="text-preview">
        <span>jffl.org</span>
        <strong>${escapeHtml(view.preview.title)}</strong>
        <p>${escapeHtml(view.preview.description)}</p>
      </div>
      <dl>
        <div><dt>Opens</dt><dd><a href="${escapeHtml(view.path)}">${escapeHtml(view.path)}</a></dd></div>
        <div><dt>Image address</dt><dd><a href="${escapeHtml(view.imageUrl)}">${escapeHtml(view.imageUrl)}</a></dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(view.preview.status)} · ${view.preview.dynamic ? 'Rendered for this link' : 'Static section card'} · ${view.preview.robots === 'noindex' ? 'noindex' : 'indexable'}</dd></div>
      </dl>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>JFFL link preview review</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #151719; background: #f3f4f5; }
    body { margin: 0 auto; max-width: 1100px; padding: 32px 20px 80px; }
    h1 { margin: 0 0 8px; font-size: 2.4rem; line-height: 1; letter-spacing: -.03em; text-transform: uppercase; }
    h2 { margin: 0; font-size: 1.3rem; }
    p { line-height: 1.5; }
    .intro { max-width: 46rem; color: #3d444a; }
    .card { margin-top: 28px; padding: 18px; background: white; border: 1px solid #d9dcdf; }
    .card header p, .text-preview p, dd { color: #3d444a; }
    .full, .crops img { display: block; width: 100%; height: auto; background: #050607; }
    .crops { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(180px, 0.72fr); gap: 12px; margin-top: 12px; align-items: start; }
    figure { margin: 0; min-width: 0; }
    figcaption, dt { font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #62686d; }
    .square img { max-width: 100%; }
    .text-preview { margin-top: 14px; max-width: 34rem; padding: 12px 14px; border-left: 4px solid #0076b6; background: #f7f8f8; }
    .text-preview span, .text-preview strong, .text-preview p { display: block; }
    .text-preview span { color: #62686d; font-size: .78rem; }
    .text-preview strong { margin: 3px 0; }
    .text-preview p { margin: 0; }
    dl { margin: 14px 0 0; }
    dl div { display: grid; grid-template-columns: 9rem 1fr; gap: 8px; padding: 6px 0; border-top: 1px solid #e4e7e9; }
    dd { margin: 0; overflow-wrap: anywhere; }
    a { color: #006398; }
    @media (max-width: 720px) {
      .crops, dl div { grid-template-columns: 1fr; }
      .square img { max-width: 420px; }
    }
  </style>
</head>
<body>
  <p>JFFL</p>
  <h1>Link preview review</h1>
  <p class="intro">Each block is the picture and text a shared link would show. The wide picture is the shared card. The square picture is drawn for a square frame, so the names and scores stay on the card. ${escapeHtml(sourceNote)}</p>
  ${cards}
</body>
</html>`;
}
