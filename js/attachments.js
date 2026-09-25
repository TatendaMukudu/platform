/* ============================================================
   PLATFORM — ATTACHMENT HANDLER
   Processes uploaded files into Claude-ready format.
   Supports: images, PDF, Word, Excel, PowerPoint, plain text,
   CSV, Markdown — plus URL embeds for video.
   ============================================================ */

const AttachmentHandler = {

  // File type routing
  ACCEPTED: {
    'image/jpeg':      'image',
    'image/png':       'image',
    'image/gif':       'image',
    'image/webp':      'image',
    'image/svg+xml':   'image',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-powerpoint': 'pptx',
    'text/plain':      'text',
    'text/markdown':   'text',
    'text/csv':        'csv',
    'application/csv': 'csv',
  },

  // Short text labels instead of emoji — kept per the no-emoji rule (moods and
  // user-typed content are the only exceptions).
  ICONS: {
    image:  'IMG',
    pdf:    'PDF',
    docx:   'DOC',
    xlsx:   'XLS',
    pptx:   'PPT',
    text:   'TXT',
    csv:    'CSV',
    embed:  'LINK',
  },

  ACCEPT_ATTR: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv',

  /* ── MATERIAL — only what can actually be READ ─────────────
     TWO CAPABILITIES, TWO LISTS. The chat path sends a file to the model as a document or image
     block, so ACCEPT_ATTR above legitimately offers PDFs and pictures and must NOT be narrowed.
     The Material path sends TEXT to the server and the server never holds the file, so a format
     this handler cannot turn into words is not a Material however legitimate it is elsewhere.

     Advertising what will be refused is its own defect. A coach picks a scouting PDF, waits for
     it to read, and is then told nothing readable came out of it — an honest message about a
     file the picker should never have offered. `.doc` and `.ppt` are excluded for the same
     reason and a less obvious one: they route to the docx and pptx processors, which open a zip,
     and the legacy binary formats are not zips — they throw rather than returning empty.

     The kinds are named here, next to the processors, so a processor that stops returning
     `content` cannot leave an extension advertised for it. */
  MATERIAL_KINDS: ['docx', 'xlsx', 'pptx', 'text', 'csv'],

  MATERIAL_EXTENSIONS: {
    '.txt':  'text',
    '.md':   'text',
    '.csv':  'csv',
    '.docx': 'docx',
    '.xlsx': 'xlsx',
    '.pptx': 'pptx',
  },

  /* ── AND A LIST IS ONLY TRUE IF THE THING THAT READS IT LOADED ────────────────────────────
     THE HOLE THIS CLOSES. Three of the five kinds above are read by libraries that arrive from a
     CDN — `JSZip` for Word and PowerPoint, `XLSX` for spreadsheets — and this file assumed they
     were there. They are not always there. A phone on a stadium connection, a filtered network, a
     second visit with the app installed and no signal: the page still runs, the picker still
     offers .docx, and `_processDocx` reaches `JSZip.loadAsync` and throws `JSZip is not defined`
     at somebody who picked a file. That is the hollow-control shape this file already names two
     paragraphs up, arriving through the one gap the rule did not cover: what is ADVERTISED was
     hard-coded, while what is POSSIBLE depends on a network request nobody checked.

     So the lists are derived from what actually loaded. A kind whose reader is missing is not
     offered, and if one is picked anyway — a drag, a share sheet, an older cached page — the
     refusal says which thing is missing and what to do instead, rather than a library's
     ReferenceError. Nothing is narrowed when the libraries ARE present, which is the ordinary
     case; this only changes what somebody sees when they could not have been served anyway. */
  /* ── AND SINCE SEPTEMBER 2026 THE OFFICE FORMATS NEED NOTHING HERE ────────────────────────
     This list was the right answer to the wrong architecture. Word, PowerPoint and spreadsheets
     were read in this browser by JSZip and SheetJS, so what could be OFFERED genuinely depended
     on whether two CDN requests had landed — and narrowing the picker was the honest response.

     The founder's decision moved that reading to the server, where `lib/office.js` opens all three
     with Node's own zlib and no dependency. So those kinds no longer need anything in the browser
     and the picker offers them unconditionally again. The LAW is unchanged and is the reason this
     map still exists rather than being deleted: what is offered is exactly what can be read. What
     changed is who does the reading. */
  KIND_NEEDS: {},
  KIND_NEEDS_LABEL: { JSZip: 'the Word and PowerPoint reader', XLSX: 'the spreadsheet reader' },
  _readerFor(kind) { return this.KIND_NEEDS[kind] || null; },
  _readerPresent(kind) {
    const g = this._readerFor(kind);
    if (!g) return true;
    try { return typeof (typeof window !== 'undefined' ? window : globalThis)[g] !== 'undefined'; }
    catch (_) { return false; }
  },
  /* The kinds this browser can turn into words RIGHT NOW, which is not the same question as the
     kinds this handler knows how to read. */
  readableMaterialKinds() { return this.MATERIAL_KINDS.filter(k => this._readerPresent(k)); },
  materialExtensions() {
    const out = {};
    for (const [ext, kind] of Object.entries(this.MATERIAL_EXTENSIONS)) {
      if (this._readerPresent(kind)) out[ext] = kind;
    }
    return out;
  },

  /* Derived, never typed twice — the picker and the parser table cannot drift apart. */
  materialAcceptAttr() { return Object.keys(this.materialExtensions()).join(','); },

  /* The legacy Knowledge/Data Sources door sends TEXT to the evidence importer. It therefore
     offers only files this browser path can itself turn into text. Office files deliberately go
     whole to the canonical conversation/material server reader; PDFs are document bytes for the
     model, not extracted text. Neither a filename nor a parser receipt may stand in for content. */
  knowledgeExtensions() {
    const serverRead = new Set(Object.keys(this.SERVER_READ || {}));
    return Object.fromEntries(Object.entries(this.materialExtensions())
      .filter(([ext]) => !serverRead.has(ext)));
  },
  knowledgeAcceptAttr() { return Object.keys(this.knowledgeExtensions()).join(','); },

  async processKnowledge(file) {
    const match = String((file && file.name) || '').toLowerCase().match(/\.[a-z0-9]+$/);
    const ext = match && match[0];
    if (!ext || !this.knowledgeExtensions()[ext]) {
      throw new Error('That file type cannot be read as knowledge here. Attach it in a conversation instead.');
    }
    const parsed = await this.process(file);
    const content = String((parsed && parsed.content) || '').trim();
    if (!content) throw new Error('Could not read any text from that file. Nothing was added.');
    return { ...parsed, content };
  },

  /* ── WHAT THE COMPOSER'S PICKER MAY OFFER, NOW THAT A PICTURE GOES SOMEWHERE ──────────────
     The Material list above is what this handler can turn into WORDS in the browser. An image
     cannot be turned into words here and is read by the server through the vision gateway, so it
     belongs on the picker and not on that list -- two capabilities, two lists, which is the rule
     this file already states.

     ONLY THE TYPES THE SERVER WILL ACTUALLY READ. `image/*` would let a phone offer HEIC, which
     is what an iPhone produces by default and which nothing here can read; the picker would accept
     it and the upload would refuse it, which is the hollow-control shape this codebase keeps
     finding. Named explicitly so the file chooser itself does the refusing, before anybody waits. */
  READABLE_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  composerAcceptAttr() {
    return this.READABLE_IMAGE_TYPES.concat(Object.keys(this.materialExtensions())).join(',');
  },

  /* ── WHICH FORMATS THE SERVER READS, NOT THIS BROWSER ─────────────────────────────────────
     FOUNDER DECISION, September 2026: Office parsing belongs server-side. Word, PowerPoint and
     spreadsheets are opened by `lib/office.js`, which uses Node's own zlib and no dependency, so
     the capability no longer turns on whether two CDN script tags arrived. This browser selects
     the file and uploads it; it does not try to understand it.

     Named here, beside the processors, so the picker and the uploader cannot disagree about which
     formats take which road. */
  SERVER_READ: Object.freeze({ '.docx': 'docx', '.xlsx': 'xlsx', '.pptx': 'pptx' }),
  serverReadKind(file) {
    const m = String((file && file.name) || '').toLowerCase().match(/\.[a-z0-9]+$/);
    return (m && this.SERVER_READ[m[0]]) || null;
  },
  /* The bytes, base64, with the data: prefix removed — the shape `/api/assistant/attachments`
     takes for a picture, reused rather than invented again for a document. */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
      r.onerror = () => reject(new Error('That file could not be read from your device.'));
      r.readAsDataURL(file);
    });
  },

  /* ── Main entry point ─────────────────────────────────── */
  async process(file) {
    const kind = this.ACCEPTED[file.type];
    if (!kind) throw new Error(`Unsupported file type: ${file.type}`);
    /* ── THOSE THREE DO NOT COME THROUGH HERE ANY MORE ──────────────────────────────────────
       Word, PowerPoint and spreadsheets are read by the SERVER since September 2026, and the two
       CDN scripts that used to open them in this browser are gone from index.html. So the
       processors below would now reach an undefined `JSZip`/`XLSX` and throw a ReferenceError at
       whoever called them.

       The two pickers on the pilot journey never get here for those kinds — they check
       `serverReadKind` and upload the file whole. This is for every OTHER caller: the alert
       composer, the coach's card attachment, the knowledge import. They still browser-parse, and
       rather than letting them fail with a library's own error they are told plainly that this
       format goes up whole now, which is a true sentence about where the capability lives. */
    if (this.SERVER_READ['.' + kind]) {
      throw new Error('Word, PowerPoint and spreadsheet files are read by IntelliQ itself now — '
        + 'attach it in a conversation and it will be read there.');
    }
    /* THE PICKER SHOULD NOT HAVE OFFERED THIS, but a drag, a share sheet or a page cached before
       the connection went can all get here anyway. Say which thing is missing and what still
       works — never let a library's own ReferenceError be the message a person reads. */
    if (!this._readerPresent(kind)) {
      const need = this.KIND_NEEDS_LABEL[this._readerFor(kind)] || 'the reader for this format';
      const what = { docx: 'Word', pptx: 'PowerPoint', xlsx: 'Spreadsheet' }[kind] || 'These';
      throw new Error(`${what} files need ${need}, which did not load on this connection. `
        + 'Paste the text in instead, or try again when you are back online.');
    }

    switch (kind) {
      case 'image':  return this._processImage(file);
      case 'pdf':    return this._processPDF(file);
      case 'docx':   return this._processDocx(file);
      case 'xlsx':   return this._processXlsx(file);
      case 'pptx':   return this._processPptx(file);
      case 'text':   return this._processText(file);
      case 'csv':    return this._processCsv(file);
      default:       throw new Error(`No processor for kind: ${kind}`);
    }
  },

  /* ── Image ────────────────────────────────────────────── */
  async _processImage(file) {
    const { base64, mediaType } = await this._toBase64(file);
    return {
      name:      file.name,
      kind:      'image',
      mediaType,
      data:      base64,
      preview:   URL.createObjectURL(file),
      claudeMsg: null, // sent as image block — handled in API call
      summary:   `Image attached: ${file.name}`,
    };
  },

  /* ── PDF ──────────────────────────────────────────────── */
  async _processPDF(file) {
    const { base64 } = await this._toBase64(file);
    return {
      name:      file.name,
      kind:      'pdf',
      mediaType: 'application/pdf',
      data:      base64,
      preview:   null,
      claudeMsg: null, // sent as document block — handled in API call
      summary:   `PDF document attached: ${file.name}`,
    };
  },

  /* ── Word (.docx) ─────────────────────────────────────── */
  async _processDocx(file) {
    const buf     = await file.arrayBuffer();
    const zip     = await JSZip.loadAsync(buf);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) throw new Error('Invalid .docx file');

    const xml     = await xmlFile.async('string');
    const text    = this._stripXML(xml)
      .replace(/\s{2,}/g, ' ')
      .trim();

    return {
      name:      file.name,
      kind:      'docx',
      content:   text,
      preview:   null,
      claudeMsg: `[ATTACHED DOCUMENT — ${file.name}]\n${text}`,
      summary:   `Word document: ${file.name} (${this._wordCount(text)} words)`,
    };
  },

  /* ── Excel (.xlsx) ────────────────────────────────────── */
  async _processXlsx(file) {
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const parts = [];

    wb.SheetNames.forEach(name => {
      const ws  = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
      if (csv.trim()) parts.push(`Sheet: ${name}\n${csv}`);
    });

    const content = parts.join('\n\n');
    return {
      name:      file.name,
      kind:      'xlsx',
      content,
      preview:   null,
      claudeMsg: `[ATTACHED SPREADSHEET — ${file.name}]\n${content}`,
      summary:   `Spreadsheet: ${file.name} (${wb.SheetNames.length} sheet${wb.SheetNames.length !== 1 ? 's' : ''})`,
    };
  },

  /* ── PowerPoint (.pptx) ───────────────────────────────── */
  async _processPptx(file) {
    const buf  = await file.arrayBuffer();
    const zip  = await JSZip.loadAsync(buf);
    const slides = [];

    const slideFiles = Object.keys(zip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)[0]);
        const nb = parseInt(b.match(/\d+/)[0]);
        return na - nb;
      });

    for (const [i, path] of slideFiles.entries()) {
      const xml  = await zip.files[path].async('string');
      const text = this._stripXML(xml).replace(/\s{2,}/g, ' ').trim();
      if (text) slides.push(`Slide ${i + 1}: ${text}`);
    }

    const content = slides.join('\n\n');
    return {
      name:      file.name,
      kind:      'pptx',
      content,
      preview:   null,
      claudeMsg: `[ATTACHED PRESENTATION — ${file.name}]\n${content}`,
      summary:   `Presentation: ${file.name} (${slides.length} slides)`,
    };
  },

  /* ── Plain text / Markdown ────────────────────────────── */
  async _processText(file) {
    const text = await file.text();
    return {
      name:      file.name,
      kind:      'text',
      content:   text,
      preview:   null,
      claudeMsg: `[ATTACHED TEXT — ${file.name}]\n${text}`,
      summary:   `Text file: ${file.name} (${this._wordCount(text)} words)`,
    };
  },

  /* ── CSV ──────────────────────────────────────────────── */
  async _processCsv(file) {
    const text = await file.text();
    return {
      name:      file.name,
      kind:      'csv',
      content:   text,
      preview:   null,
      claudeMsg: `[ATTACHED CSV DATA — ${file.name}]\n${text}`,
      summary:   `CSV data: ${file.name}`,
    };
  },

  /* ── URL Embed ────────────────────────────────────────── */
  processEmbed(url) {
    if (!url) return null;
    const kind  = this._detectEmbedKind(url);
    const embed = this._buildEmbedHTML(url, kind);
    return {
      name:      url,
      kind:      'embed',
      embedUrl:  url,
      embedKind: kind,
      embedHTML: embed,
      claudeMsg: `[ATTACHED VIDEO/LINK — the member has been shown: ${url}]`,
      summary:   `Embedded: ${kind} link`,
    };
  },

  _detectEmbedKind(url) {
    if (/youtube\.com|youtu\.be/.test(url))   return 'youtube';
    if (/vimeo\.com/.test(url))               return 'vimeo';
    if (/hudl\.com/.test(url))                return 'hudl';
    if (/loom\.com/.test(url))                return 'loom';
    if (/drive\.google\.com/.test(url))       return 'gdrive';
    if (/docs\.google\.com/.test(url))        return 'gdocs';
    return 'link';
  },

  _buildEmbedHTML(url, kind) {
    // Convert watch URLs to embed URLs
    let embedSrc = url;
    if (kind === 'youtube') {
      const id = url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
      if (id) embedSrc = `https://www.youtube.com/embed/${id}`;
    } else if (kind === 'vimeo') {
      const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
      if (id) embedSrc = `https://player.vimeo.com/video/${id}`;
    }

    if (['youtube','vimeo','loom'].includes(kind)) {
      return `<iframe src="${embedSrc}" style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px" allowfullscreen></iframe>`;
    }

    // For Hudl, Google Drive, and generic links — show a clickable banner
    return `<a href="${url}" target="_blank" rel="noopener"
      style="display:flex;align-items:center;gap:0.7rem;padding:0.9rem 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;text-decoration:none;color:var(--text-primary)">
      <div>
        <div style="font-size:0.82rem;font-weight:600">${kind === 'hudl' ? 'Video clip' : kind === 'gdrive' ? 'Google Drive file' : kind === 'gdocs' ? 'Google Doc / Slides' : 'Attached link'}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">Click to open in new tab →</div>
      </div>
    </a>`;
  },

  /* ── Helpers ──────────────────────────────────────────── */
  _toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result; // data:mime;base64,xxx
        const [header, data] = result.split(',');
        const mediaType = header.match(/data:([^;]+)/)?.[1] || file.type;
        resolve({ base64: data, mediaType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  _stripXML(xml) {
    return xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x[0-9A-Fa-f]+;/g, ' ');
  },

  _wordCount(text) {
    return text.trim().split(/\s+/).length;
  },

  /* ── Build what to send to Claude API ────────────────── */
  buildClaudeContent(attachment, text) {
    if (!attachment) return text;

    if (attachment.kind === 'image') {
      return [
        { type: 'image', source: { type: 'base64', media_type: attachment.mediaType, data: attachment.data } },
        { type: 'text', text },
      ];
    }

    if (attachment.kind === 'pdf') {
      return [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: attachment.data } },
        { type: 'text', text },
      ];
    }

    // Text-extracted formats + embeds — prepend as context
    const prefix = attachment.claudeMsg || '';
    return prefix ? `${prefix}\n\n${text}` : text;
  },
};
