import {webMercatorToGeographic} from '@arcgis/core/geometry/support/webMercatorUtils.js';
import {FloodWaterError} from '../public/errors.js';
export function geographicExtent(extent) {
  if(extent?.spatialReference.isGeographic)return extent;
  if(extent?.spatialReference.isWebMercator)return webMercatorToGeographic(extent);
  throw new FloodWaterError('UNSUPPORTED_SPATIAL_REFERENCE','Coverage/view must use WGS84 or Web Mercator');
}
