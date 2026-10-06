# Adding a trip

1. Put the photos in `img/` (or a subfolder, then set `imageBase` to match).
2. Copy `huai-nam-yen.js` to `trips/<slug>.js`. Change the `slug`, the dates and the `url`, then write the chapters.
   The comment at the top of that file lists the available story blocks.
3. Copy `index.html` to `<slug>.html`. Change `data-trip="<slug>"` and the `trips/<slug>.js` script tag, and update the title and description.
4. Add `<script src="trips/<slug>.js" defer></script>` to `journeys.html`. The trip shows up there grouped by year.

The renderer (`assets/journal.js`) and styles (`assets/journal.css`) are shared, so a new trip needs no new code.
Pages can also be opened as `index.html?trip=<slug>` when that trip's script is included.
