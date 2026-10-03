// Draws every battery of the fleet on one canvas above a Leaflet map: one pass per risk
// level (so the dangerous ones end up on top), a distinct shape per level, and a ring
// around the selected pack. Far cheaper than 2,000 Leaflet markers, and it can be
// redrawn on every snapshot.
import L from 'leaflet';
import { CITY_BOX, type City } from '@/sim';
import { nearestIndex, SHAPE_OF_LEVEL } from './hitTest';

export interface LevelColors {
  levels: [string, string, string, string];
  ring: string;
  grid: string;
  label: string;
}

export interface PointsData {
  lat: Float32Array;
  lng: Float32Array;
  level: Uint8Array;
  /** 1 where the point should be drawn (passes the filters). */
  visible: Uint8Array;
  selected: number;
}

export class PointsLayer {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private data: PointsData | null = null;
  private colors: LevelColors;
  private offline = false;
  private cityLabels: Record<City, string> = { hcmc: '', hanoi: '' };
  private frame = 0;
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);

  constructor(
    private readonly map: L.Map,
    colors: LevelColors,
    private readonly onPick: (index: number) => void,
  ) {
    this.colors = colors;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', zIndex: '450', pointerEvents: 'none' });
    map.getContainer().appendChild(this.canvas);
    map.on('move zoom resize viewreset', this.schedule);
    map.on('click', this.handleClick);
    this.resize();
  }

  setColors(colors: LevelColors): void {
    this.colors = colors;
    this.schedule();
  }

  setOffline(offline: boolean, labels: Record<City, string>): void {
    this.offline = offline;
    this.cityLabels = labels;
    this.schedule();
  }

  update(data: PointsData): void {
    this.data = data;
    this.schedule();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.map.off('move zoom resize viewreset', this.schedule);
    this.map.off('click', this.handleClick);
    this.canvas.remove();
  }

  private readonly schedule = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  };

  private resize(): void {
    const { x, y } = this.map.getSize();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(x * dpr) || this.canvas.height !== Math.round(y * dpr)) {
      this.canvas.width = Math.round(x * dpr);
      this.canvas.height = Math.round(y * dpr);
      this.canvas.style.width = `${x}px`;
      this.canvas.style.height = `${y}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private project(): void {
    const d = this.data;
    if (!d) return;
    const n = d.lat.length;
    if (this.xs.length !== n) {
      this.xs = new Float32Array(n);
      this.ys = new Float32Array(n);
    }
    for (let i = 0; i < n; i++) {
      const p = this.map.latLngToContainerPoint([d.lat[i], d.lng[i]]);
      this.xs[i] = p.x;
      this.ys[i] = p.y;
    }
  }

  private drawOfflineBase(): void {
    const { ctx } = this;
    const size = this.map.getSize();
    ctx.save();
    ctx.fillStyle = this.colors.grid;
    ctx.globalAlpha = 0.07;
    ctx.fillRect(0, 0, size.x, size.y);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = this.colors.grid;
    ctx.lineWidth = 1;
    const step = 0.025;
    const bounds = this.map.getBounds();
    for (let lat = Math.floor(bounds.getSouth() / step) * step; lat <= bounds.getNorth(); lat += step) {
      const y = this.map.latLngToContainerPoint([lat, bounds.getWest()]).y;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size.x, y);
      ctx.stroke();
    }
    for (let lng = Math.floor(bounds.getWest() / step) * step; lng <= bounds.getEast(); lng += step) {
      const x = this.map.latLngToContainerPoint([bounds.getSouth(), lng]).x;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.fillStyle = this.colors.label;
    ctx.font = '600 13px system-ui, sans-serif';
    for (const city of ['hcmc', 'hanoi'] as const) {
      const b = CITY_BOX[city];
      const a = this.map.latLngToContainerPoint([b.latMax, b.lngMin]);
      const c = this.map.latLngToContainerPoint([b.latMin, b.lngMax]);
      ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
      ctx.fillText(this.cityLabels[city], a.x + 8, a.y + 18);
    }
    ctx.restore();
  }

  private draw(): void {
    this.resize();
    const { ctx } = this;
    const size = this.map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
    if (this.offline) this.drawOfflineBase();
    const d = this.data;
    if (!d) return;
    this.project();

    for (let level = 0; level < 4; level++) {
      const shape = SHAPE_OF_LEVEL[level];
      const color = this.colors.levels[level];
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      for (let i = 0; i < d.lat.length; i++) {
        if (!d.visible[i] || d.level[i] !== level) continue;
        const x = this.xs[i];
        const y = this.ys[i];
        if (x < -20 || y < -20 || x > size.x + 20 || y > size.y + 20) continue;
        this.shape(shape, x, y, level);
      }
    }

    if (d.selected >= 0 && d.visible[d.selected]) {
      ctx.strokeStyle = this.colors.ring;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.xs[d.selected], this.ys[d.selected], 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private shape(kind: (typeof SHAPE_OF_LEVEL)[number], x: number, y: number, level: number): void {
    const { ctx } = this;
    ctx.lineWidth = 1;
    switch (kind) {
      case 'dot':
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'triangle':
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 6.5, y + 5);
        ctx.lineTo(x - 6.5, y + 5);
        ctx.closePath();
        ctx.fill();
        break;
      case 'diamond':
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 8, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this.colors.ring;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.strokeStyle = this.colors.levels[level];
        break;
    }
    ctx.globalAlpha = 1;
  }

  private readonly handleClick = (e: L.LeafletMouseEvent): void => {
    const d = this.data;
    if (!d) return;
    this.project();
    const index = nearestIndex(this.xs, this.ys, d.visible, d.level, e.containerPoint.x, e.containerPoint.y, 14);
    this.onPick(index);
  };
}
