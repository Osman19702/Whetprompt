/* The page's only script. It fills the download card (the Windows installer and the macOS images)
   and the release list from ./releases.json,
   which scripts/site-releases.mjs writes from the GitHub Releases API at deploy time. Everything
   here degrades: with no file, a broken file or no network the download button still points at
   the releases page on GitHub, and no field on the page is ever shown half filled. The release
   notes are markdown from GitHub, so they are escaped before any inline rule runs and are never
   inserted as raw HTML. */
(() => {
  'use strict';

  const REPO = 'Osman19702/PromptFixer';
  const REPO_URL = 'https://github.com/' + REPO;
  const RELEASES_URL = REPO_URL + '/releases';
  const LATEST_URL = RELEASES_URL + '/latest';
  const API_LATEST = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const MIB = 1048576;

  const byId = (id) => document.getElementById(id);

  // A value is used only when it is the string it is supposed to be, so that a field missing from
  // the file, or a null, can never turn into the word "undefined" on the page.
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
  const httpUrl = (value) => (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value) ? value : null);

  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function formatDate(iso) {
    if (typeof iso !== 'string') return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
  }

  // The space before the unit does not break, so a button label on a narrow phone never ends a
  // line on the number and starts the next on "MiB".
  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
    return (bytes / MIB).toFixed(1) + ' MiB';
  }

  /* --- markdown ----------------------------------------------------------- */

  // The NUL goes too: the code-span placeholder below is NUL-delimited, and a NUL in the body must
  // not be able to forge or alias one.
  function escapeHtml(source) {
    return source.replace(/[&<>"'\u0000]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\u0000': '' }[c]
    ));
  }

  // The inline rules run on text that has already been escaped, so the only tags that can come
  // out of them are the ones written here. Code spans are lifted out first so that a star or a
  // bracket inside one is left alone, and put back once the other rules have run.
  function inline(escaped) {
    const codes = [];
    let out = escaped.replace(/`([^`\n]+)`/g, (_, code) => {
      codes.push('<code>' + code + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // Both captures are bounded: unbounded, a body of many "[" makes this quadratic, and a release
    // body may be a hundred thousand characters long.
    out = out.replace(/\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)\u0000]{1,2000})\)/g, '<a href="$2" rel="noopener">$1</a>');
    return out.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)] ?? '');
  }

  // The subset of markdown the release bodies use: headings, paragraphs, "- " bullets whose text
  // wraps onto indented continuation lines, and "---" as a separator. Headings come out as h4 and
  // h5, whatever their level in the body, so the page's own outline (h1, h2, then an h3 per
  // release) stays in order.
  function renderMarkdown(markdown) {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let paragraph = [];
    let items = null;

    const flushParagraph = () => {
      if (paragraph.length > 0) {
        html.push('<p>' + inline(escapeHtml(paragraph.join(' '))) + '</p>');
        paragraph = [];
      }
    };
    const flushList = () => {
      if (items) {
        html.push('<ul>' + items.map((item) => '<li>' + inline(escapeHtml(item.join(' '))) + '</li>').join('') + '</ul>');
        items = null;
      }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line === '') {
        flushParagraph();
        flushList();
        continue;
      }
      if (/^\s*-{3,}\s*$/.test(line)) {
        flushParagraph();
        flushList();
        html.push('<hr>');
        continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length <= 3 ? 4 : 5;
        html.push('<h' + level + '>' + inline(escapeHtml(heading[2])) + '</h' + level + '>');
        continue;
      }
      const bullet = /^\s{0,3}[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        flushParagraph();
        if (!items) items = [];
        items.push([bullet[1]]);
        continue;
      }
      if (items) {
        // A line that follows a bullet without a blank line between them is the rest of that
        // bullet, whether or not it is indented.
        items[items.length - 1].push(line.trim());
        continue;
      }
      paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    return html.join('\n');
  }

  /* --- the download card -------------------------------------------------- */

  // One file as releases.json describes it, the Windows installer or a macOS image: each field is
  // used only when it is the string or number it is supposed to be.
  function fileOf(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const sha = typeof raw.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(raw.sha256)
      ? raw.sha256.toLowerCase()
      : null;
    return {
      name: text(raw.name),
      url: httpUrl(raw.url),
      size: formatBytes(raw.bytes),
      sha,
      sumsUrl: httpUrl(raw.sumsUrl),
    };
  }

  function installerOf(release) {
    return fileOf(release.installer);
  }

  // The two macOS images, in the order they are shown, with the name a visitor knows their Mac by.
  const MAC = [['arm64', 'Apple Silicon'], ['x64', 'Intel']];

  // The macOS images of a release by architecture; one that is not there, or has no link, is null,
  // so a release in the middle of an upload offers what it has.
  function macImagesOf(release) {
    const mac = release.mac && typeof release.mac === 'object' ? release.mac : {};
    const out = {};
    for (const [arch] of MAC) {
      const file = fileOf(mac[arch]);
      out[arch] = file && file.url ? file : null;
    }
    return out;
  }

  function versionOf(release) {
    const tag = text(release.tag);
    return text(release.version) || (tag ? tag.replace(/^v/, '') : null);
  }

  function setHidden(element, hidden) {
    if (element) element.hidden = hidden;
  }

  let copyTimer = 0;

  function wireCopy(sha) {
    const button = byId('dl-copy');
    const status = byId('dl-copied');
    const hash = byId('dl-sha');
    button.hidden = false;
    button.addEventListener('click', async () => {
      clearTimeout(copyTimer);
      status.classList.remove('is-error');
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
        await navigator.clipboard.writeText(sha);
        status.textContent = 'Copied';
      } catch {
        // Without a clipboard the hash is selected instead, which is one keystroke from copied.
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(hash);
          selection.addRange(range);
        }
        status.classList.add('is-error');
        status.textContent = 'Could not copy; the hash is selected, press Ctrl+C';
      }
      copyTimer = setTimeout(() => {
        status.textContent = '';
      }, 4000);
    });
  }

  function fillDownload(release) {
    const version = versionOf(release);
    const installer = installerOf(release);
    const pageUrl = httpUrl(release.url) || RELEASES_URL;
    // A release without an uploaded installer is still shown, but as what it is: a page to read,
    // not a file to download, so no label or command on the card names a file that is not there.
    const hasFile = !!(installer && installer.url);
    const target = hasFile ? installer.url : pageUrl;
    const fileName = hasFile ? installer.name : null;
    const size = hasFile ? installer.size : null;
    const date = formatDate(release.publishedAt);

    // The size goes on the requirements line under the button rather than into its label, so
    // the label fits on one line on a phone.
    const heroButton = byId('download-button');
    heroButton.href = target;
    heroButton.textContent = hasFile ? 'Download ' + version + ' for Windows' : 'Release ' + version + ' on GitHub';
    byId('dl-hero-size').textContent = size ? size + ' installer. ' : '';

    byId('dl-title').textContent = 'PromptFixer ' + version;

    const time = byId('dl-date');
    setHidden(time.parentElement, !date);
    if (date) {
      time.textContent = date;
      time.dateTime = release.publishedAt;
    }

    byId('dl-file').textContent = fileName || '';
    setHidden(byId('dl-file').closest('.fact'), !fileName);

    byId('dl-size').textContent = size || '';
    setHidden(byId('dl-size').closest('.fact'), !size);

    const sha = hasFile ? installer.sha : null;
    setHidden(byId('dl-sha-row'), !sha);
    // The sentence beside the verify command refers to the hash on the card; without one it
    // would point at an empty row.
    setHidden(byId('dl-sha-note'), !sha);
    if (sha) {
      byId('dl-sha').textContent = sha;
      wireCopy(sha);
    }

    const sums = byId('dl-sums');
    const sumsUrl = hasFile ? installer.sumsUrl : null;
    setHidden(sums, !sumsUrl);
    if (sumsUrl) sums.href = sumsUrl;

    // Without a file the command keeps the page's own placeholder, which names no file either.
    if (fileName) byId('dl-verify').textContent = '(Get-FileHash .\\' + fileName + ').Hash.ToLower()';

    // The file name is in the File row just under the button, and on a phone it would break
    // mid-word inside the label.
    const link = byId('dl-link');
    link.href = target;
    link.textContent = hasFile
      ? 'Download for Windows' + (size ? ' (' + size + ')' : '')
      : 'Open the release page on GitHub';

    fillMac(release);
    byId('download-card').dataset.state = 'ready';
  }

  // The macOS part of the card and the line under the hero button. A release without an image
  // (every one before 0.4.0) shows neither, and a single image is shown alone.
  function fillMac(release) {
    const images = macImagesOf(release);
    const present = MAC.filter(([arch]) => images[arch]);
    for (const [arch, label] of MAC) {
      const file = images[arch];
      setHidden(byId('dl-mac-' + arch), !file);
      if (!file) continue;
      const link = byId('dl-mac-' + arch + '-link');
      link.href = file.url;
      link.textContent = label + (file.size ? ' (' + file.size + ')' : '');
      const name = byId('dl-mac-' + arch + '-file');
      name.textContent = file.name || '';
      setHidden(name.closest('.fact'), !file.name);
      const sha = byId('dl-mac-' + arch + '-sha');
      sha.textContent = file.sha || '';
      setHidden(sha.closest('.fact'), !file.sha);
    }
    setHidden(byId('dl-mac'), present.length === 0);

    const hero = byId('dl-hero-mac');
    hero.textContent = '';
    if (present.length > 0) {
      hero.append('Also for macOS 13 or later: ');
      present.forEach(([arch, label], index) => {
        if (index > 0) hero.append(' \u00b7 ');
        const a = element('a', null, label + (images[arch].size ? ' (' + images[arch].size + ')' : ''));
        a.href = images[arch].url;
        hero.append(a);
      });
      hero.append('.');
    }
    setHidden(hero, present.length === 0);

    // The command names one image; for the other only the file name differs.
    const first = present.length > 0 ? images[present[0][0]] : null;
    if (first && first.name) byId('dl-verify-mac').textContent = 'shasum -a 256 ~/Downloads/' + first.name;
  }

  /* --- the release list --------------------------------------------------- */

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function releaseArticle(release, isLatest, open) {
    const version = versionOf(release);
    const tag = text(release.tag);
    const name = text(release.name) || ('PromptFixer ' + version);
    const date = formatDate(release.publishedAt);
    const installer = installerOf(release);
    const pageUrl = httpUrl(release.url);

    const article = element('article', 'release');
    if (tag) article.id = 'release-' + tag.replace(/[^\w.-]/g, '');

    const details = document.createElement('details');
    details.open = open;

    const summary = document.createElement('summary');
    const heading = element('h3', null, name);
    // The space keeps the name and the badge apart for a screen reader; the badge's own margin
    // does that for the eye.
    if (isLatest) heading.append(' ', element('span', 'badge', 'Latest'));
    if (release.prerelease === true) heading.append(' ', element('span', 'badge prerelease', 'Pre-release'));
    summary.append(heading);
    if (date) {
      const time = element('time', 'release-date', date);
      time.dateTime = release.publishedAt;
      summary.append(time);
    }
    details.append(summary);

    const body = element('div', 'release-body');
    const meta = element('p', 'release-meta');
    // The version is in each link's own text: three releases open at once are three "Download"
    // links otherwise, and a screen reader's list of links could not tell them apart.
    if (installer && installer.url) {
      const download = element('a', null, 'Download ' + version + ' for Windows' + (installer.size ? ' (' + installer.size + ')' : ''));
      download.href = installer.url;
      meta.append(download);
    }
    const images = macImagesOf(release);
    for (const [arch, label] of MAC) {
      const file = images[arch];
      if (!file) continue;
      const download = element('a', null, 'Download ' + version + ' for macOS, ' + label + (file.size ? ' (' + file.size + ')' : ''));
      download.href = file.url;
      meta.append(download);
    }
    if (pageUrl) {
      const page = element('a', null, 'Release ' + (tag || version) + ' on GitHub');
      page.href = pageUrl;
      meta.append(page);
    }
    if (meta.childElementCount > 0) body.append(meta);

    const notes = element('div', 'notes');
    const markdown = text(release.notes);
    if (markdown) {
      notes.innerHTML = renderMarkdown(markdown);
    } else {
      notes.append(element('p', 'muted', 'The notes for this release are on its GitHub page.'));
    }
    body.append(notes);
    details.append(body);
    article.append(details);
    return article;
  }

  function renderReleases(data) {
    const list = byId('releases');
    list.textContent = '';
    data.releases.forEach((release, index) => {
      list.append(releaseArticle(release, release.tag === data.latest, index === 0));
    });
    setHidden(byId('releases-fallback'), true);
  }

  /* --- loading ------------------------------------------------------------ */

  async function loadReleases() {
    const response = await fetch('./releases.json', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray(data.releases)) return null;
    const releases = data.releases.filter((release) => (
      release && typeof release === 'object' && versionOf(release) !== null
    ));
    if (releases.length === 0) return null;
    return { latest: text(data.latest), releases };
  }

  // The card describes the release the file names as latest, provided it has a file to offer;
  // failing that, the newest release that has one and is not a pre-release; failing that, the
  // latest, or the newest that is not a pre-release, or whatever comes first.
  function chooseRelease(data) {
    const hasFile = (release) => {
      const installer = installerOf(release);
      if (installer && installer.url) return true;
      const images = macImagesOf(release);
      return MAC.some(([arch]) => images[arch]);
    };
    const latest = data.releases.find((release) => release.tag === data.latest);
    if (latest && hasFile(latest)) return latest;
    return data.releases.find((release) => release.prerelease !== true && hasFile(release))
      || latest
      || data.releases.find((release) => release.prerelease !== true)
      || data.releases[0];
  }

  function showFallback() {
    const heroButton = byId('download-button');
    heroButton.href = LATEST_URL;
    heroButton.textContent = 'Download the latest release from GitHub';
    byId('dl-hero-size').textContent = '';
    setHidden(byId('dl-hero-mac'), true);
    setHidden(byId('dl-mac'), true);
    byId('download-card').dataset.state = 'fallback';
    byId('dl-title').textContent = 'Latest release';
    const link = byId('dl-link');
    link.href = LATEST_URL;
    link.textContent = 'Download the latest release from GitHub';
    setHidden(byId('releases-fallback'), false);
    byId('releases').textContent = '';
  }

  // releases.json is written at deploy time, so for a few minutes after a release is published
  // it can be behind GitHub. A courtesy check against the API says so; anything that goes wrong
  // with it, a rate limit included, changes nothing on the page.
  async function checkForNewer(shown) {
    const response = await fetch(API_LATEST, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return;
    const json = await response.json();
    const tag = text(json && json.tag_name);
    if (!tag || tag === shown.tag) return;
    // GitHub's "latest" is ordered by the date of the tagged commit, this list by the date of
    // publication, and the two can disagree without anything being new. Only a release
    // published after the one shown here is news; anything else would be a standing notice.
    const published = Date.parse(json.published_at || '');
    const listed = Date.parse(shown.publishedAt || '');
    if (!(published > 0) || !(listed > 0) || published <= listed) return;
    const notice = byId('newer-notice');
    notice.textContent = '';
    notice.append('A newer release, ');
    const link = element('a', null, tag);
    link.href = httpUrl(json.html_url) || LATEST_URL;
    notice.append(link);
    const date = formatDate(json.published_at);
    notice.append(', was published on GitHub' + (date ? ' on ' + date : '') + ' — this page will catch up shortly.');
    notice.hidden = false;
  }

  async function main() {
    let data = null;
    try {
      data = await loadReleases();
    } catch {
      data = null;
    }

    let shown = null;
    if (data) {
      try {
        shown = chooseRelease(data);
        fillDownload(shown);
        renderReleases(data);
      } catch {
        shown = null;
      }
    }
    if (!shown) showFallback();

    // The attribute tells a test, or anyone reading the DOM, that the script has had its say.
    document.documentElement.dataset.releases = shown ? 'ready' : 'fallback';

    if (shown) {
      try {
        await checkForNewer(shown);
      } catch {
        // Nothing to do: the page is complete without the live check.
      }
    }
  }

  main().catch(() => {
    try {
      showFallback();
      document.documentElement.dataset.releases = 'fallback';
    } catch {
      // The static markup already links to GitHub, so there is nothing left to repair.
    }
  });
})();
