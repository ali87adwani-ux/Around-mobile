export type Lang = 'ar' | 'en';
export type L10n = { ar: string; en: string };

export type Amenity = 'parking' | 'showers' | 'lights' | 'cafe' | 'changing' | 'balls' | 'wifi';
export type PitchSize = 5 | 7 | 11;
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Pitch {
  id: string;
  ownerId?: string;
  lat?: number;
  lng?: number;
  name: L10n;
  area: L10n;
  address: L10n;
  pricePerHour: number;
  sizes: PitchSize[];
  surface: 'artificial' | 'natural';
  indoor: boolean;
  rating: number;
  reviews: number;
  distanceKm: number;
  amenities: Amenity[];
  openFrom: number;
  openTo: number;
  tint: [string, string];
}

export interface Player {
  id: string;
  name: L10n;
  position: Position;
  level: Level;
  area: L10n;
  stats: { matches: number; goals: number; assists: number; mvp: number; wins: number; rating: number };
  color: string;
}

export interface Match {
  id: string;
  pitchId: string;
  dayOffset: number;
  hour: number;
  duration: number;
  format: 5 | 7 | 11;
  level: Level;
  pricePerPlayer: number;
  maxPlayers: number;
  playerIds: string[];
  organizerId: string;
  createdByMe?: boolean;
}

export interface TeamRow {
  id: string;
  name: L10n;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  color: string;
  captainId?: string;
}

export interface Fixture {
  id: string;
  homeId: string;
  awayId: string;
  dayOffset: number;
  hour: number;
  score?: [number, number];
}

export interface Tournament {
  id: string;
  name: L10n;
  pitchId: string;
  format: 5 | 7 | 11;
  status: 'open' | 'live' | 'finished';
  startOffset: number;
  maxTeams: number;
  entryFee: number;
  prize: number;
  teams: TeamRow[];
  fixtures: Fixture[];
  tint: [string, string];
}

export interface Booking {
  id: string;
  pitchId: string;
  dateISO: string;
  hour: number;
  duration: number;
  size: PitchSize;
  total: number;
  status: 'confirmed' | 'cancelled';
  createdAt: number;
}

export interface Profile {
  id: 'me';
  name: string;
  position: Position;
  level: Level;
  phone: string;
}
