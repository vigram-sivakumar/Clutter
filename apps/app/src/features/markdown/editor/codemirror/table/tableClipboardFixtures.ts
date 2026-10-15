/**
 * Clipboard payload shapes modelled on what real applications put on the clipboard, shared by the paste tests.
 * Kept structurally faithful (wrapper elements, fragment markers, style/meta noise, cell markup) rather than
 * reduced to `<table><tr><td>`; they are reconstructions from the documented formats, not captures — see the
 * "real clipboard" caveat in the paste investigation notes.
 */

/** Excel desktop ("HTML Format" fragment): full document, `<style>`, fragment markers, `<col>`, styled cells. */
export const EXCEL_HTML =
  '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
  '<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Excel.Sheet><style><!--table {mso-displayed-decimal-separator:"\\.";} td {padding-top:1px; color:black;}--></style></head>' +
  '<body link="#0563C1" vlink="#954F72"><!--StartFragment-->' +
  '<table border=0 cellpadding=0 cellspacing=0 width=192 style="border-collapse:collapse;width:144pt"><col width=64 span=3 style="width:48pt">' +
  '<tr height=20><td height=20 width=64 style="height:15.0pt;width:48pt">Name</td><td width=64 style="width:48pt">Role</td><td width=64 style="width:48pt">City</td></tr>' +
  '<tr height=20><td height=20>Sam</td><td>UX</td><td></td></tr>' +
  '</table><!--EndFragment--></body></html>';

/** Google Sheets: `<meta>` + custom origin element + `<style>` + table with `<colgroup>`/`<tbody>`. */
export const GOOGLE_SHEETS_HTML =
  "<meta charset='utf-8'><google-sheets-html-origin><style type=\"text/css\"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>" +
  '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt"><colgroup><col width="100"/><col width="100"/></colgroup><tbody>' +
  '<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px;">Name</td><td style="overflow:hidden;padding:2px 3px;">Role</td></tr>' +
  '<tr style="height:21px;"><td>Sam</td><td>UX</td></tr></tbody></table></google-sheets-html-origin>';

/** A table selected on a web page in Chrome: `<meta>` prefix, header cells, linked/emphasised cell content. */
export const BROWSER_TABLE_HTML =
  "<meta charset='utf-8'><table><thead><tr><th>Name</th><th>Link</th></tr></thead><tbody>" +
  '<tr><td><strong>Sam</strong></td><td><a href="https://example.com">site</a></td></tr></tbody></table>';

/** Word: the table followed by a `&nbsp;`-only paragraph. */
export const WORD_TABLE_HTML =
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset=utf-8><style><!-- p.MsoNormal {margin:0in;} --></style></head><body lang=EN-US>' +
  '<!--StartFragment--><table class=MsoTableGrid border=1 cellspacing=0><tr><td><p class=MsoNormal>Name<o:p></o:p></p></td><td><p class=MsoNormal>Role<o:p></o:p></p></td></tr>' +
  '<tr><td><p class=MsoNormal>Sam<o:p></o:p></p></td><td><p class=MsoNormal>UX<o:p></o:p></p></td></tr></table><p class=MsoNormal><o:p>&nbsp;</o:p></p><!--EndFragment--></body></html>';

/** Rendered Markdown document (browser / Notion / chat UI): headings, paragraphs, lists, two tables, trailing content. */
export const MIXED_DOCUMENT_HTML =
  "<meta charset='utf-8'><h1>Plan</h1><p>Intro paragraph.</p><ul><li>first</li><li>second</li></ul>" +
  '<table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Sam</td><td>UX</td></tr></tbody></table>' +
  '<p>Middle paragraph.</p>' +
  '<table><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody><tr><td>Pens</td><td>4</td></tr></tbody></table>' +
  '<h2>After</h2><p>Closing paragraph.</p>';

/** The plain-text flavour that accompanies {@link MIXED_DOCUMENT_HTML} when the source is Markdown-aware. */
export const MIXED_DOCUMENT_MARKDOWN =
  '# Plan\n\nIntro paragraph.\n\n- first\n- second\n\n| Name | Role |\n| --- | --- |\n| Sam | UX |\n\nMiddle paragraph.\n\n| Item | Qty |\n| --- | --- |\n| Pens | 4 |\n\n## After\n\nClosing paragraph.\n';

/** One table with prose before and after (the single-table variant of the same bug). */
export const TABLE_WITH_PROSE_HTML =
  "<meta charset='utf-8'><p>Before the table.</p><table><tr><td>Name</td><td>Role</td></tr><tr><td>Sam</td><td>UX</td></tr></table><p>After the table.</p>";

export const TABLE_WITH_PROSE_MARKDOWN = 'Before the table.\n\n| Name | Role |\n| --- | --- |\n| Sam | UX |\n\nAfter the table.\n';

/** Layout table wrapping rich, non-tabular content (Outlook/old Word HTML export). */
export const LAYOUT_TABLE_HTML =
  '<table><tr><td><h2>Heading</h2><p>Paragraph of an email.</p><ul><li>point</li></ul></td></tr></table>';
