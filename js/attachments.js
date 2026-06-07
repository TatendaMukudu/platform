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

  ICONS: {
    image:  '🖼️',
    pdf:    '📄',
    docx:   '📝',
    xlsx:   '📊',
    pptx:   '📽️',
    text:   '📃',
    csv:    '📊',
    embed:  '🎬',
  },

  ACCEPT_ATTR: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv',

  /* ── Main entry point ─────────────────────────────────── */
  async process(file) {
    const kind = this.ACCEPTED[file.type];
    if (!kind) throw new Error(`Unsupported file type: ${file.type}`);

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
      <span style="font-size:1.4rem">${kind === 'hudl' ? '🏈' : kind === 'gdrive' || kind === 'gdocs' ? '📁' : '🔗'}</span>
      <div>
        <div style="font-size:0.82rem;font-weight:600">${kind === 'hudl' ? 'Hudl Clip' : kind === 'gdrive' ? 'Google Drive File' : kind === 'gdocs' ? 'Google Doc/Slides' : 'Attached Link'}</div>
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
