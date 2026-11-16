// View-owned URLs. Core owns associations/bytes; these resources never save data.
export class MediaPanel {
  constructor({ client, spaceId, pageId, target, showPDF, urls = URL }) {
    Object.assign(this, { client, spaceId, pageId, target, showPDF, urls });
    this.live = [];
    this.generation = 0;
    this.closed = false;
  }
  clear() {
    for (const url of this.live) this.urls.revokeObjectURL(url);
    this.live = [];
    this.target.replaceChildren();
  }
  async refresh() {
    const generation = ++this.generation;
    const listed = await this.client.execute({
      apiVersion: 1,
      spaceId: this.spaceId,
      pageId: this.pageId,
      method: 'media.list',
    });
    if (!listed.ok) throw Error(listed.error.code);
    const nodes = [],
      created = [];
    try {
      for (const [attachmentId, meta] of Object.entries(listed.value.assets)) {
        const r = await this.client.execute({
          apiVersion: 1,
          spaceId: this.spaceId,
          pageId: this.pageId,
          method: 'media.read',
          attachmentId,
          atSequence: listed.value.sequence,
        });
        if (!r.ok) throw Error(r.error.code);
        if (r.value.head !== listed.value.head)
          throw Error('MEDIA_SNAPSHOT_MISMATCH');
        const data = Uint8Array.from(atob(r.value.payload), (c) =>
            c.charCodeAt(0)
          ),
          row = document.createElement('div');
        row.className = 'asset ' + meta.role;
        const label = document.createElement('span');
        label.textContent = meta.role + ': ' + meta.name;
        row.append(label);
        if (meta.mime === 'image/png') {
          const url = this.urls.createObjectURL(
            new Blob([data], { type: meta.mime })
          );
          created.push(url);
          const img = document.createElement('img');
          img.src = url;
          img.alt = meta.name;
          row.append(img);
        } else {
          const button = document.createElement('button');
          button.textContent = 'Open native PDF';
          button.onclick = () =>
            this.showPDF({ name: meta.name, payload: r.value.payload });
          row.append(button);
        }
        nodes.push(row);
      }
      if (this.closed || generation !== this.generation) {
        for (const url of created) this.urls.revokeObjectURL(url);
        return;
      }
      this.clear();
      this.live = created;
      this.target.append(...nodes);
    } catch (e) {
      for (const url of created) this.urls.revokeObjectURL(url);
      throw e;
    }
  }
  destroy() {
    this.closed = true;
    this.generation++;
    this.clear();
  }
}
