/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env browser */

/* globals webtreemap Util */

/** @type {TreemapViewer} */
let treemapViewer;

class TreemapViewer {
  /**
   * @param {Treemap.Options} options
   * @param {HTMLElement} el
   */
  constructor(options, el) {
    const treemapDebugData = /** @type {LH.Audit.Details.DebugData} */ (
      options.lhr.audits['script-treemap-data'].details);
    if (!treemapDebugData || !treemapDebugData.treemapData) {
      throw new Error('missing script-treemap-data');
    }

    /** @type {import('../../../lighthouse-core/audits/script-treemap-data').TreemapData} */
    const scriptRootNodes = treemapDebugData.treemapData;

    /** @type {WeakMap<Treemap.Node, Treemap.RootNodeContainer>} */
    this.nodeToRootNodeMap = new WeakMap();

    /** @type {{[group: string]: Treemap.RootNodeContainer[]}} */
    this.rootNodesByGroup = {
      scripts: scriptRootNodes,
    };

    for (const rootNodes of Object.values(this.rootNodesByGroup)) {
      for (const rootNode of rootNodes) {
        Util.dfs(rootNode.node, node => this.nodeToRootNodeMap.set(node, rootNode));
      }
    }

    /** @type {Treemap.Node} */
    this.currentRootNode; // eslint-disable-line no-unused-expressions
    this.documentUrl = options.lhr.requestedUrl;
    this.el = el;
    this.getHue = Util.stableHasher(Util.COLOR_HUES);

    this.createHeader();
    this.show();
    this.initListeners();
  }

  createHeader() {
    Util.find('.lh-header--url').textContent = this.documentUrl;
    Util.find('.lh-header--size').textContent =
      Util.formatBytes(this.createRootNodeForGroup('scripts').resourceBytes);
  }

  initListeners() {
    window.addEventListener('resize', () => {
      this.render();
    });

    window.addEventListener('click', (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const nodeEl = e.target.closest('.webtreemap-node');
      if (!nodeEl) return;
      this.updateColors();
    });

    window.addEventListener('mouseover', (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const nodeEl = e.target.closest('.webtreemap-node');
      if (!nodeEl) return;
      nodeEl.classList.add('webtreemap-node--hover');
    });

    window.addEventListener('mouseout', (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const nodeEl = e.target.closest('.webtreemap-node');
      if (!nodeEl) return;
      nodeEl.classList.remove('webtreemap-node--hover');
    });
  }

  /**
   * @param {string} name
   */
  findRootNode(name) {
    for (const rootNodes of Object.values(this.rootNodesByGroup)) {
      for (const rootNode of rootNodes) {
        if (rootNode.name === name) return rootNode;
      }
    }
  }

  /**
   * Combines all the root nodes for a given group into a new root node.
   * @param {string} group
   */
  createRootNodeForGroup(group) {
    const rootNodes = this.rootNodesByGroup[group];

    const children = rootNodes.map(rootNode => {
      // TODO: keep?
      // Wrap with the name of the rootNode. Only for bundles.
      if (group === 'scripts' && rootNode.node.children) {
        return {
          name: rootNode.name,
          children: [rootNode.node],
          resourceBytes: rootNode.node.resourceBytes,
          unusedBytes: rootNode.node.unusedBytes,
        };
      }

      return rootNode.node;
    });

    return {
      name: this.documentUrl,
      resourceBytes: children.reduce((acc, cur) => cur.resourceBytes + acc, 0),
      unusedBytes: children.reduce((acc, cur) => (cur.unusedBytes || 0) + acc, 0),
      children,
    };
  }

  show() {
    const group = 'scripts';
    this.currentRootNode = this.createRootNodeForGroup(group);
    const rootNodes = this.rootNodesByGroup[group];
    renderViewModeOptions(rootNodes);

    Util.dfs(this.currentRootNode, node => {
      // @ts-ignore: webtreemap will store `dom` on the data to speed up operations.
      // However, when we change the underlying data representation, we need to delete
      // all the cached DOM elements. Otherwise, the rendering will be incorrect when,
      // for example, switching between "All JavaScript" and a specific bundle.
      delete node.dom;

      // @ts-ignore: webtreemap uses `size` to partition the treemap.
      node.size = node.resourceBytes || 0;
    });
    webtreemap.sort(this.currentRootNode);

    this.el.innerHTML = '';
    this.render();
  }

  render() {
    webtreemap.render(this.el, this.currentRootNode, {
      padding: [18, 3, 3, 3],
      spacing: 10,
      caption: node => this.makeCaption(node),
      // showChildren: node => node.children && node.children.some(c => c.resourceBytes > 1000 * 100),
      // showNode: node => node.resourceBytes > 100 * 100,
      // lowerBound: 0.2,
    });
    Util.find('.webtreemap-node').classList.add('webtreemap-node--root');
    this.updateColors();
  }

  /**
   * Creates the header text for each node in webtreemap.
   * @param {Treemap.Node} node
   */
  makeCaption(node) {
    const size = node.resourceBytes;
    const total = this.currentRootNode.resourceBytes;

    const parts = [
      Util.elide(node.name, 60),
      `${Util.formatBytes(size)} (${Math.round(size / total * 100)}%)`,
    ];

    // Only add label for bytes on the root node.
    if (node === this.currentRootNode) {
      parts[1] = `resource bytes: ${parts[1]}`;
    }

    return parts.join(' · ');
  }

  updateColors() {
    Util.dfs(this.currentRootNode, node => {
      // Color a root node and all children the same color.
      const rootNode = this.nodeToRootNodeMap.get(node);
      const hueKey = rootNode ? rootNode.name : node.name;
      const hue = this.getHue(hueKey);

      let backgroundColor = 'white';
      let color = 'black';

      if (hue !== undefined) {
        const sat = 60;
        const lum = 90;
        backgroundColor = Util.hsl(hue, sat, Math.round(lum));
        color = lum > 50 ? 'black' : 'white';
      } else {
        // Ran out of colors.
      }

      // @ts-ignore: webtreemap will add a dom node property to every node.
      const dom = /** @type {HTMLElement?} */ (node.dom);
      if (dom) {
        dom.style.backgroundColor = backgroundColor;
        dom.style.color = color;
      }
    });
  }
}

/**
 * @param {Treemap.RootNodeContainer[]} rootNodes
 */
function renderViewModeOptions(rootNodes) {
  const viewModesPanel = Util.find('.panel--modals');
  viewModesPanel.innerHTML = '';

  /**
   * @param {string} label
   * @param {number} bytes
   */
  function makeViewMode(label, bytes) {
    const viewModeEl = Util.createChildOf(viewModesPanel, 'div', 'view-mode');
    viewModeEl.classList.add('view-mode--active');

    Util.createChildOf(viewModeEl, 'span').textContent = label;
    Util.createChildOf(viewModeEl, 'span', 'lh-text-dim').textContent =
    ` (${Util.formatBytes(bytes)})`;

    viewModeEl.addEventListener('click', () => {
      treemapViewer.show();
    });
  }

  let bytes = 0;
  for (const rootNode of rootNodes) {
    Util.dfs(rootNode.node, node => {
      // Only consider leaf nodes.
      if (node.children) return;

      bytes += node.resourceBytes;
    });
  }
  makeViewMode('All', bytes);
}

/**
 * Allows for saving the document and loading with data intact.
 */
function injectOptions() {
  // @ts-expect-error
  if (!window.__injected) return;

  const scriptEl = document.createElement('script');
  scriptEl.innerHTML = `
    window.__TREEMAP_OPTIONS = ${JSON.stringify(window.__TREEMAP_OPTIONS)};
    window.__injected = true;
  `;
  document.head.append(scriptEl);
}

/**
 * @param {Treemap.Options} options
 */
function init(options) {
  treemapViewer = new TreemapViewer(options, Util.find('.panel--treemap'));

  window.__TREEMAP_OPTIONS = options;
  injectOptions();

  if (window.ga) {
    // TODO what are these?
    // window.ga('send', 'event', 'treemap', 'open in viewer');
    window.ga('send', 'event', 'report', 'open in viewer');
  }

  // eslint-disable-next-line no-console
  console.log('window.__TREEMAP_OPTIONS', window.__TREEMAP_OPTIONS);

  window.__treemapViewer = treemapViewer;
  // eslint-disable-next-line no-console
  console.log('window.__treemapViewer', window.__treemapViewer);
}

async function main() {
  if (window.__TREEMAP_OPTIONS) {
    init(window.__TREEMAP_OPTIONS);
  } else if (new URLSearchParams(window.location.search).has('debug')) {
    const response = await fetch('debug.json');
    init(await response.json());
  } else {
    window.addEventListener('message', e => {
      if (e.source !== self.opener) return;

      /** @type {Treemap.Options} */
      const options = e.data;
      const {lhr} = options;
      if (!lhr) return;
      const documentUrl = lhr.requestedUrl;
      if (!documentUrl) return;

      init(options);
    });
  }

  // If the page was opened as a popup, tell the opening window we're ready.
  if (self.opener && !self.opener.closed) {
    self.opener.postMessage({opened: true}, '*');
  }
}

document.addEventListener('DOMContentLoaded', main);
