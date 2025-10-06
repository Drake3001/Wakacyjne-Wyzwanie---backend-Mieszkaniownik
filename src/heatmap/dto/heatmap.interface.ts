export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
  weight?: number;
  title?: string;
  price?: number;
  address?: string;
  offerId: number;
}

export interface HeatmapData {
  points: HeatmapPoint[];
  maxViews: number;
  minViews: number;
  totalOffers: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  accuracy: 'high' | 'medium' | 'low';
  source: 'cache' | 'api';
}

export interface HeatmapQuery {
  city?: string;
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  minViews?: number;
  maxViews?: number;
  buildingType?: string;
  limit?: number;
}
