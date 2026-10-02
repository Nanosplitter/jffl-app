import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderEmail } from '../src/history/emailCopy.ts';

test('an email copy keeps the question, formatting, chart picture, and table', () => {
  const image = 'data:image/png;base64,aaaa';
  const { html, plain } = renderEmail({
    question: 'Who scored the lowest?',
    answer: 'Jeff did it **most** often.\n\n- Week 3\n- Week 9\n\n<script>alert(1)</script>',
    pieces: [
      { title: 'Weekly lows', subtitle: 'Regular season', image, imageWidth: 800, caveats: ['Ties count.'] },
      { title: 'Counts', table: { columns: ['Team', 'Weeks'], rows: [['A&B', 3], ['<c>', null], ...Array.from({ length: 40 }, () => ['X', 1])] } },
    ],
  });
  assert.match(html, /<b>Who scored the lowest\?<\/b>/);
  assert.match(html, /<b>most<\/b>/);
  assert.match(html, /<li style="background-color:transparent;color:#151719;">Week 3<\/li>/);
  assert.match(html, /src="data:image\/png;base64,aaaa"/);
  assert.match(html, /width="800"/);
  assert.match(html, /Ties count\./);
  assert.match(html, /A&amp;B/);
  assert.match(html, /&lt;c&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /background(?:-color)?:(?!transparent)/);
  assert.match(html, /Showing 40 of 42 rows/);
  assert.match(plain, /^Who scored the lowest\?/);
  assert.match(plain, /- Week 3/);
  assert.match(plain, /Weekly lows/);
  assert.match(plain, /Team\tWeeks/);
  assert.doesNotMatch(plain, /<b>/);
});

test('a chart with no picture says so in the email', () => {
  const { plain } = renderEmail({ answer: 'See the chart.', pieces: [{ title: 'Missing', image: null }] });
  assert.match(plain, /The chart could not be copied/);
});
