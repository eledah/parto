export type RelationType = 'support' | 'attack';

export interface Relation {
  target_node_id: string;
  relation_type: RelationType;
  reasoning: string;
}

export interface NodeScore {
  intensity: number;
  confidence: number;
}

export interface ArgumentMapNode {
  id: string;
  type: string;
  title: string;
  description: string;
  quote: string;
  speaker: string;
  relations: Relation[];
  score?: NodeScore;
}

export interface ArgumentMapData {
  new_nodes: ArgumentMapNode[];
}

export interface ArgumentMapColors {
  center: string;
  support: string;
  attack: string;
  border: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';

export type Direction = 'ltr' | 'rtl' | 'inherit';

export interface ArgumentMapLabels {
  center: string;
  support: string;
  attack: string;
  claim: string;
  unknownSpeaker: string;
  intensity: string;
  confidence: string;
  statusLoading: string;
  statusEmpty: string;
  statusError: string;
  /** Optional UI-overlay labels (English fallbacks when omitted). */
  zoomIn?: string;
  zoomOutLabel?: string;
  resetZoom?: string;
}

export interface NodeContext {
  id: string;
  title: string;
  type: string;
}

export interface WedgeMeta {
  /** Number of hidden arguments grouped into this wedge. */
  count: number;
  /** Preview titles for tooltips (first few hidden nodes). */
  titles: string[];
  /** Hidden subtrees, materialized when the wedge is focused. */
  hidden: TreeNode[];
}

export interface TreeNode extends ArgumentMapNode {
  children: TreeNode[];
  value: number;
  relationType?: RelationType;
  relationReasoning?: string;
  parentId?: string;
  /** Unique key for this visual occurrence (supports multi-parent nodes). */
  pathKey: string;
  /** Present on synthetic "+N more" wedges created by arc collapse. */
  wedgeMeta?: WedgeMeta;
}

export type TooltipRenderer = (
  node: TreeNode,
  labels: ArgumentMapLabels,
) => HTMLElement;

export type RingScaleMode = 'sliver-proof' | 'exponent';

export interface ArgumentMapLayoutOptions {
  /** Depth beyond which the chart auto-focuses into the heaviest branch (default 4). */
  maxVisibleDepth?: number;
  /** Angular span (radians) below which branches collapse into "+N" wedges. */
  minAngle?: number;
  /** 0 = equal sibling angles, 1 = pure leaf weighting (default 1). */
  angleWeight?: number;
  /** Radial allocation strategy (default 'sliver-proof'). */
  ringScale?: RingScaleMode;
  /** Enable "+N" collapse wedges (default true). */
  aggregation?: boolean;
}

export interface ArgumentMapOptions {
  theme?: ThemeMode;
  colors?: Partial<ArgumentMapColors>;
  tooltip?: boolean | TooltipRenderer;
  zoom?: boolean;
  /** Render truncated titles along arcs when there is room (default: false). */
  arcLabels?: boolean;
  /** Show a clickable breadcrumb trail of the current zoom path (default: true). */
  breadcrumb?: boolean;
  /** Show center/support/attack legend chips (default: true). */
  legend?: boolean;
  /** Layout engine tuning (angles, rings, collapse, auto-focus depth). */
  layout?: ArgumentMapLayoutOptions;
  /** Visual layout engine (default 'sunburst'). */
  layoutMode?: 'sunburst' | 'icicle';
  direction?: Direction;
  lang?: string;
  labels?: Partial<ArgumentMapLabels>;
  ariaLabel?: string;
  onNodeHover?: (node: TreeNode, event: MouseEvent | FocusEvent | PointerEvent) => void;
  onNodeLeave?: () => void;
  onNodeClick?: (node: TreeNode, depth: number, hasChildren: boolean) => void;
  onZoomChange?: (path: NodeContext[]) => void;
  onWarning?: (message: string) => void;
}

export interface ArgumentMapChart {
  setData(data: ArgumentMapData): void;
  setLoading(loading: boolean): void;
  showError(message?: string): void;
  setTheme(theme: ThemeMode): void;
  setColors(colors: Partial<ArgumentMapColors>): void;
  highlight(nodeId: string | null): void;
  zoomTo(nodeId: string): void;
  zoomToPath(nodeIds: string[]): void;
  zoomOut(): void;
  resetZoom(): void;
  resize(): void;
  destroy(): void;
  getZoomPath(): NodeContext[];
  /** The resolved per-instance configuration (colors, layout tuning, ...). */
  getConfig(): import('./config.js').ResolvedChartConfig;
  /** Standalone SVG markup of the current view (styles inlined). */
  toSVG(): string;
  /** PNG rasterization of toSVG() at the given scale (default 2x). */
  toPNG(scale?: number): Promise<Blob>;
}
