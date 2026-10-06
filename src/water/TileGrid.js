const DEGREE_METERS = 6378137 * Math.PI / 180;

/** Deterministic geographic grid; no ArcGIS or dataset identifiers. */
export class TileGrid {
  constructor(scenario) {
    this.scenarioId = scenario.id;
    this.options = scenario.tiles;
    this.origin = scenario.coordinates.origin;
    if (!scenario.id || this.origin?.length!==2 || !this.origin.every(Number.isFinite) ||
        !Number.isFinite(this.options.sizeMeters) || this.options.sizeMeters<=0 ||
        !Number.isInteger(this.options.meshCells) || this.options.meshCells<1 || this.options.meshCells>254 ||
        !['velocitySize','footprintSize','velocityBorder','footprintBorder'].every(k=>
          Number.isInteger(this.options[k]) && this.options[k]>0)) {
      throw new Error('Invalid tile grid: finite origin/size, positive texture dimensions and meshCells 1–254 required');
    }
    this.metersPerDegree = [DEGREE_METERS * Math.cos(this.origin[1] * Math.PI / 180), DEGREE_METERS];
    this.step = this.metersPerDegree.map(m => this.options.sizeMeters / m);
    const lon = this.origin[0] * Math.PI / 180, lat = this.origin[1] * Math.PI / 180;
    this.basis = [[-Math.sin(lon), Math.cos(lon), 0],
      [-Math.sin(lat)*Math.cos(lon), -Math.sin(lat)*Math.sin(lon), Math.cos(lat)],
      [Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat)]];
  }
  coordinate(x, y) { return [this.origin[0] + x*this.step[0], this.origin[1] + y*this.step[1]]; }
  index(lon, lat) { return [Math.floor((lon-this.origin[0])/this.step[0]), Math.floor((lat-this.origin[1])/this.step[1])]; }
  tile(x, y) {
    const [xmin,ymin] = this.coordinate(x,y), [xmax,ymax] = this.coordinate(x+1,y+1);
    return { id: `${this.scenarioId}/${this.options.scheme}/${this.options.level}/${x}/${y}`,
      x, y, level: this.options.level, extent: { xmin,ymin,xmax,ymax },
      worldOffset: [x*this.options.sizeMeters,y*this.options.sizeMeters],
      sizeMeters: [this.options.sizeMeters,this.options.sizeMeters] };
  }
  sampling(tile, count, border) {
    const [xmin,ymin] = this.coordinate(tile.x-border/count,tile.y-border/count);
    const [xmax,ymax] = this.coordinate(tile.x+1+border/count,tile.y+1+border/count);
    const width = count+2*border;
    return { extent: {xmin,ymin,xmax,ymax}, width, height: width,
      uv: [border/width,border/width,count/width,count/width] };
  }
}

export function intersects(a,b) {
  return a.xmax>=b.xmin && a.xmin<=b.xmax && a.ymax>=b.ymin && a.ymin<=b.ymax;
}
