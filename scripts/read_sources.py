"""Read the user-provided competition references. Never publish email headers."""
from email import policy
from email.parser import BytesParser
from pathlib import Path

from html.parser import HTMLParser
from pypdf import PdfReader
import pdfplumber


class EmailText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('style', 'script'):
            self.skip = True
        if tag in ('br', 'p', 'div', 'tr', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('style', 'script'):
            self.skip = False
        if tag in ('p', 'div', 'tr', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

output = Path('tmp/sources')
output.mkdir(parents=True, exist_ok=True)
mail = BytesParser(policy=policy.default).parsebytes(Path('C:/Users/colin/Downloads/JFFL Season #25-2026 _ Week 3 MNF.eml').read_bytes())
body = mail.get_body(preferencelist=('plain', 'html'))
text = body.get_content()
if body.get_content_type() == 'text/html':
    parser = EmailText()
    parser.feed(text)
    text = ''.join(parser.parts)
(output / 'email.txt').write_text(text, encoding='utf-8')
for i, part in enumerate(mail.walk()):
    if part.get_content_maintype() == 'image':
        suffix = 'png' if part.get_content_subtype() == 'png' else 'jpg'
        path = output / f'email-image-{i}.{suffix}'
        path.write_bytes(part.get_payload(decode=True))
        print(f'Inline image: {path.name}')
pdf_path = 'C:/Users/colin/Downloads/JFFL Summary (2026-wk2) (2).pdf'
reader = PdfReader(pdf_path)
(output / 'summary.txt').write_text('\n\n'.join(f'PAGE {i + 1}\n{page.extract_text()}' for i, page in enumerate(reader.pages)), encoding='utf-8')
with pdfplumber.open(pdf_path) as document:
    for i, page in enumerate(document.pages):
        page.to_image(resolution=110).save(output / f'page-{i+1}.png')
print(f'Extracted email and {len(reader.pages)} PDF pages for private local review.')
