// import _Util2 = require('webtreemap-cdt'); // TODO: types.
import _Util = require('../app/src/util.js');
import {RootNodeContainer as _RootNodeContainer} from '../../lighthouse-core/audits/script-treemap-data';
import {Node as _Node} from '../../lighthouse-core/audits/script-treemap-data';
import '../../types/lhr';
import '../../types/audit-details';

declare global {
  module Treemap {
    interface Options {
      lhr: LH.Result;
    }

    type RootNodeContainer = _RootNodeContainer;
    type Node = _Node;
  }

  interface WebTreeMapOptions {
    padding: [number, number, number, number];
    spacing: number;
    caption(node: Treemap.Node): string;
    showNode?(node: Treemap.Node): boolean;
  }

  var webtreemap: {
    render(el: HTMLElement, data: any, options: WebTreeMapOptions): void;
    sort(data: any): void;
  };

  var Util: typeof _Util;

  interface Window {
    __treemapViewer: TreemapViewer;
    __TREEMAP_OPTIONS?: Treemap.Options;
  }
}

export {};
